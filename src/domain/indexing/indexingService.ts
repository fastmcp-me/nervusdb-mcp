import { randomUUID } from 'node:crypto';
import { mkdir, readFile, rename, rm, writeFile } from 'node:fs/promises';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

import { pack, type PackResult } from 'repomix';
import { NervusDB } from '@nervusdb/core';

import type { IndexMetadata, GitFingerprint } from '../types/indexMetadata.js';
import { computeGitFingerprint, formatFingerprint, projectHash } from '../shared/gitFingerprint.js';
import { createChildLogger } from '../../utils/logger.js';
import { createMultiLanguageParser, MultiLanguageParser } from '../parsing/multiLanguageParser.js';
import { makeNodeId } from '../types/codeGraph.js';

const CURRENT_DIR = path.dirname(fileURLToPath(import.meta.url));
const ROOT_DIR = path.resolve(CURRENT_DIR, '../../..');
const logger = createChildLogger({ service: 'IndexingService' });

export interface IndexingServiceOptions {
  dbRoot?: string;
  tempDir?: string;
}

interface IndexResult {
  projectDir: string;
  metadata: IndexMetadata;
  processedFiles: number;
}

interface IndexingDependencies {
  pack: typeof pack;
  openDatabase: typeof NervusDB.open;
  getGitFingerprint: (projectPath: string) => Promise<GitFingerprint>;
  uuid: () => string;
}

const DEFAULT_DB_ROOT =
  process.env.NERVUSDB_ROOT ??
  (() => {
    const home = process.env.HOME || process.env.USERPROFILE || '/tmp';
    return path.join(home, '.nervusdb');
  })();

export class IndexingService {
  private readonly dbRoot: string;
  private readonly tempRoot: string;
  private readonly deps: IndexingDependencies;

  constructor(options: IndexingServiceOptions = {}, deps?: Partial<IndexingDependencies>) {
    this.dbRoot = options.dbRoot ?? DEFAULT_DB_ROOT;
    this.tempRoot = options.tempDir ?? path.join(this.dbRoot, 'tmp');

    this.deps = {
      pack,
      openDatabase: NervusDB.open.bind(NervusDB),
      getGitFingerprint: computeGitFingerprint,
      uuid: randomUUID,
      ...deps,
    };
  }

  async index(projectPath: string): Promise<IndexResult> {
    const resolvedPath = path.resolve(projectPath);
    const hash = projectHash(resolvedPath);
    const projectDir = path.join(this.dbRoot, hash);
    const tmpDir = path.join(this.tempRoot, `${hash}-${this.deps.uuid()}`);
    const tmpDbPath = path.join(tmpDir, 'graph.sdb');
    const metadataPath = path.join(tmpDir, 'metadata.json');

    logger.info({ projectPath: resolvedPath, hash }, 'Starting project indexing');

    await mkdir(tmpDir, { recursive: true });

    logger.debug('Running repomix to collect project files');
    const repomixResult = await this.runRepomix(resolvedPath);

    // Validate repomix result
    if (!repomixResult.processedFiles || !Array.isArray(repomixResult.processedFiles)) {
      logger.error(
        {
          projectPath: resolvedPath,
          hasProcessedFiles: !!repomixResult.processedFiles,
          resultKeys: Object.keys(repomixResult),
        },
        'Repomix returned invalid result: processedFiles is missing or not an array',
      );
      throw new Error(
        `Repomix failed to process files in ${resolvedPath}. ` +
          'This usually happens when the directory is empty, inaccessible, or all files are ignored.',
      );
    }

    logger.info({ fileCount: repomixResult.processedFiles.length }, 'Repomix completed');

    logger.debug('Building knowledge graph');
    await this.buildKnowledgeGraph(resolvedPath, tmpDbPath, repomixResult);

    const fingerprint = await this.deps.getGitFingerprint(resolvedPath);
    const metadata = await this.writeMetadata({
      metadataPath,
      projectHash: hash, // use the computed hash value, not the function
      projectDir,
      projectPath: resolvedPath,
      fileCount: repomixResult.processedFiles.length,
      fingerprint,
    });

    await mkdir(this.dbRoot, { recursive: true });
    await mkdir(this.tempRoot, { recursive: true });
    await rm(projectDir, { recursive: true, force: true });
    await rename(tmpDir, projectDir);

    logger.info(
      {
        projectDir,
        fileCount: repomixResult.processedFiles.length,
        fingerprint: metadata.fingerprint.value,
      },
      'Project indexing completed successfully',
    );

    return {
      projectDir,
      metadata,
      processedFiles: repomixResult.processedFiles.length,
    };
  }

  private async runRepomix(projectPath: string): Promise<PackResult> {
    // Use minimal config - repomix will merge with defaults
    // Remove 'as const' to make properties mutable (repomix 1.7.0 requirement)
    const config = {
      cwd: projectPath, // required by RepomixConfigMerged
      input: {
        maxFileSize: 50 * 1024 * 1024,
      },
      output: {
        style: 'xml' as const,
        filePath: 'repomix-output.xml',
        parsableStyle: false,
        fileSummary: false,
        directoryStructure: false,
        files: true,
        copyToClipboard: false,
        compress: false,
        removeComments: false,
        removeEmptyLines: false,
        topFilesLength: 5,
        showLineNumbers: false,
        truncateBase64: false,
        includeEmptyDirectories: false,
        tokenCountTree: false,
        git: {
          sortByChanges: true,
          sortByChangesMaxCommits: 100,
          includeDiffs: false,
          includeLogs: false,
          includeLogsCount: 50,
        },
      },
      include: [] as string[],
      ignore: {
        useGitignore: true,
        useDefaultPatterns: true,
        customPatterns: [] as string[],
      },
      security: {
        enableSecurityCheck: false,
      },
      tokenCount: {
        encoding: 'o200k_base' as const,
      },
    };

    try {
      const result = await this.deps.pack([projectPath], config, () => {}, {
        writeOutputToDisk: async () => undefined,
        copyToClipboardIfEnabled: async () => undefined,
      });

      logger.debug(
        {
          hasProcessedFiles: !!result.processedFiles,
          processedFilesLength: result.processedFiles?.length,
          hasSafeFilePaths: !!result.safeFilePaths,
          safeFilePathsLength: result.safeFilePaths?.length,
        },
        'Repomix raw result',
      );

      return result;
    } catch (error) {
      logger.error({ err: error, projectPath }, 'Repomix failed to pack project files');
      throw new Error(
        `Failed to collect project files: ${error instanceof Error ? error.message : String(error)}`,
      );
    }
  }

  private async buildKnowledgeGraph(
    projectPath: string,
    dbPath: string,
    repomixResult: PackResult,
  ): Promise<void> {
    const db = await this.deps.openDatabase(dbPath, {
      enableLock: false,
      registerReader: false,
    });

    try {
      const projectNode = `project:${path.basename(projectPath)}`;
      db.addFact({ subject: projectNode, predicate: 'HAS_ROOT', object: projectPath }, {});

      // Initialize multi-language parser if available
      const parser = createMultiLanguageParser();

      if (parser) {
        logger.info('Multi-language parser available, extracting code entities');
        await this.buildCodeLevelGraph(db, projectNode, projectPath, repomixResult, parser);
      } else {
        logger.warn('Multi-language parser not available, falling back to file-level indexing');
        await this.buildFileLevelGraph(db, projectNode, projectPath, repomixResult);
      }

      await db.flush();
    } finally {
      await db.close();
    }
  }

  /**
   * 构建文件级知识图谱（回退方案）
   */
  private async buildFileLevelGraph(
    db: NervusDB,
    projectNode: string,
    projectPath: string,
    repomixResult: PackResult,
  ): Promise<void> {
    for (const file of repomixResult.processedFiles) {
      const relativePath = path.relative(projectPath, file.path);
      const fileNode = `file:${relativePath}`;

      db.addFact(
        { subject: projectNode, predicate: 'CONTAINS', object: fileNode },
        {
          objectProperties: {
            path: relativePath,
            length: file.content.length,
          },
        },
      );
    }
  }

  /**
   * 构建代码级知识图谱（使用多语言解析器）
   */
  private async buildCodeLevelGraph(
    db: NervusDB,
    projectNode: string,
    projectPath: string,
    repomixResult: PackResult,
    parser: MultiLanguageParser,
  ): Promise<void> {
    let parsedFiles = 0;
    let extractedEntities = 0;
    let skippedFiles = 0;

    for (const file of repomixResult.processedFiles) {
      const relativePath = path.relative(projectPath, file.path);
      const fileNode = `file:${relativePath}`;

      // 添加项目包含文件关系
      db.addFact(
        { subject: projectNode, predicate: 'CONTAINS', object: fileNode },
        {
          objectProperties: {
            path: relativePath,
            length: file.content.length,
          },
        },
      );

      // 检测文件语言
      const language = parser.detectLanguage(file.path);
      if (!language) {
        skippedFiles++;
        continue;
      }

      try {
        // 解析文件提取代码实体
        const parseResult = await parser.parseFile(file.path, file.content);
        parsedFiles++;

        // 提取实体并构建关系
        for (const entity of parseResult.entities) {
          extractedEntities++;

          // 简单的实体类型推断（基于语法特征）
          const entityType = this.inferEntityType(entity);
          const entityName = this.extractEntityName(entity);

          if (!entityName) continue;

          // 创建实体节点
          const entityNode = makeNodeId({
            type: entityType,
            name: entityName,
            filePath: relativePath,
          });

          // 添加 DEFINES 关系（文件定义实体）
          db.addFact(
            { subject: fileNode, predicate: 'DEFINES', object: entityNode },
            {
              objectProperties: {
                name: entityName,
                type: entityType,
                language,
                signature: entity.substring(0, Math.min(200, entity.length)), // 前200个字符作为签名
              },
            },
          );

          // 提取函数调用关系
          if (entityType === 'function' || entityType === 'method') {
            const calls = this.extractFunctionCalls(entity);
            for (const callee of calls) {
              const calleeNode = makeNodeId({
                type: 'function',
                name: callee,
                filePath: relativePath,
              });

              db.addFact({ subject: entityNode, predicate: 'CALLS', object: calleeNode }, {});
            }
          }

          // 提取类继承关系
          if (entityType === 'class') {
            const extendsClass = this.extractExtendsClass(entity, language);
            if (extendsClass) {
              const baseClassNode = makeNodeId({
                type: 'class',
                name: extendsClass,
                filePath: relativePath,
              });

              db.addFact({ subject: entityNode, predicate: 'EXTENDS', object: baseClassNode }, {});
            }

            const implementsInterfaces = this.extractImplementsInterfaces(entity, language);
            for (const iface of implementsInterfaces) {
              const interfaceNode = makeNodeId({
                type: 'interface',
                name: iface,
                filePath: relativePath,
              });

              db.addFact(
                { subject: entityNode, predicate: 'IMPLEMENTS', object: interfaceNode },
                {},
              );
            }
          }
        }

        // 提取 import 关系
        if (parseResult.imports && Array.isArray(parseResult.imports)) {
          for (const imp of parseResult.imports) {
            if (typeof imp === 'string') {
              // 简单的字符串形式：import xxx from 'module'
              const importedModule = this.extractImportModule(imp);
              if (importedModule) {
                const importedFileNode = this.resolveImportPath(importedModule, relativePath);
                if (importedFileNode) {
                  db.addFact(
                    { subject: fileNode, predicate: 'IMPORTS', object: importedFileNode },
                    {},
                  );
                }
              }
            }
          }
        }
      } catch (error) {
        logger.warn(
          { filePath: file.path, error: error instanceof Error ? error.message : String(error) },
          'Failed to parse file, skipping code-level extraction',
        );
        skippedFiles++;
      }
    }

    logger.info(
      {
        parsedFiles,
        extractedEntities,
        skippedFiles,
        totalFiles: repomixResult.processedFiles.length,
      },
      'Code-level graph construction completed',
    );
  }

  /**
   * 推断实体类型（基于语法关键字）
   */
  private inferEntityType(
    entity: string,
  ): 'function' | 'class' | 'interface' | 'method' | 'variable' {
    const trimmed = entity.trim();

    if (trimmed.includes('interface ')) return 'interface';
    if (trimmed.includes('class ')) return 'class';
    if (
      trimmed.includes('function ') ||
      trimmed.includes('def ') ||
      trimmed.includes('func ') ||
      trimmed.includes('fn ')
    ) {
      return 'function';
    }
    if (trimmed.includes('const ') || trimmed.includes('let ') || trimmed.includes('var ')) {
      return 'variable';
    }

    // 默认为方法
    return 'method';
  }

  /**
   * 提取实体名称
   */
  private extractEntityName(entity: string): string | null {
    // TypeScript/JavaScript: function foo(), class Bar, interface Baz
    let match = entity.match(/(?:function|class|interface|const|let|var)\s+(\w+)/);
    if (match) return match[1];

    // Python: def foo(), class Bar
    match = entity.match(/(?:def|class)\s+(\w+)/);
    if (match) return match[1];

    // Go: func foo(), type Bar struct
    match = entity.match(/(?:func|type)\s+(\w+)/);
    if (match) return match[1];

    // Rust: fn foo(), struct Bar, impl Bar
    match = entity.match(/(?:fn|struct|enum|trait|impl)\s+(\w+)/);
    if (match) return match[1];

    // Java: public class Foo, public void bar()
    match = entity.match(/(?:class|interface|enum|void|int|String)\s+(\w+)/);
    if (match) return match[1];

    return null;
  }

  /**
   * 提取函数调用（简单的正则匹配）
   * 支持：foo()、obj.method()、Class.staticMethod()、this.method()
   */
  private extractFunctionCalls(entity: string): string[] {
    const calls = new Set<string>();

    // 匹配函数调用模式: functionName( 或 obj.methodName(
    // (?:^|\s|\.|;|\{|\(|\[) - 匹配函数调用前的边界（行首、空格、点号、分号、括号等）
    // ([a-zA-Z_]\w*) - 捕获函数名
    // \s*\( - 匹配左括号（允许空格）
    const regex = /(?:^|\s|\.|;|\{|\(|\[)([a-zA-Z_]\w*)\s*\(/g;
    let match;

    while ((match = regex.exec(entity)) !== null) {
      const funcName = match[1];
      // 过滤掉常见的关键字和构造函数
      if (
        !['if', 'for', 'while', 'switch', 'catch', 'return', 'new', 'synchronized'].includes(
          funcName,
        )
      ) {
        calls.add(funcName);
      }
    }

    return Array.from(calls);
  }

  /**
   * 提取类继承（extends）
   */
  private extractExtendsClass(entity: string, language: string): string | null {
    // TypeScript/JavaScript: class Foo extends Bar
    let match = entity.match(/class\s+\w+\s+extends\s+(\w+)/);
    if (match) return match[1];

    // Python: class Foo(Bar)
    if (language === 'Python') {
      match = entity.match(/class\s+\w+\((\w+)\)/);
      if (match) return match[1];
    }

    // Java: class Foo extends Bar
    if (language === 'Java') {
      match = entity.match(/class\s+\w+\s+extends\s+(\w+)/);
      if (match) return match[1];
    }

    return null;
  }

  /**
   * 提取接口实现（implements）
   */
  private extractImplementsInterfaces(entity: string, _language: string): string[] {
    const interfaces: string[] = [];

    // TypeScript/JavaScript/Java: class Foo implements Bar, Baz
    const match = entity.match(/implements\s+([\w\s,]+)/);
    if (match) {
      const interfaceList = match[1].split(',').map((s) => s.trim());
      interfaces.push(...interfaceList);
    }

    return interfaces;
  }

  /**
   * 提取 import 的模块路径
   */
  private extractImportModule(importStatement: string): string | null {
    // import xxx from 'module'
    let match = importStatement.match(/from\s+['"]([^'"]+)['"]/);
    if (match) return match[1];

    // import 'module'
    match = importStatement.match(/import\s+['"]([^'"]+)['"]/);
    if (match) return match[1];

    return null;
  }

  /**
   * 解析 import 路径为文件节点 ID
   */
  private resolveImportPath(importPath: string, currentFile: string): string | null {
    // 只处理相对路径导入
    if (importPath.startsWith('./') || importPath.startsWith('../')) {
      const currentDir = path.dirname(currentFile);
      const resolvedPath = path.normalize(path.join(currentDir, importPath));

      // 尝试常见的文件扩展名
      const extensions = ['.ts', '.tsx', '.js', '.jsx', '.py', '.go', '.rs', '.java'];
      for (const ext of extensions) {
        const withExt = resolvedPath.endsWith(ext) ? resolvedPath : `${resolvedPath}${ext}`;
        return `file:${withExt}`;
      }

      return `file:${resolvedPath}`;
    }

    // 第三方包导入，创建包节点
    if (!importPath.startsWith('.') && !importPath.startsWith('/')) {
      return `package:${importPath}`;
    }

    return null;
  }

  private async getPackageVersion(): Promise<string> {
    try {
      const packageJsonPath = path.join(
        path.dirname(new URL(import.meta.url).pathname),
        '../../../package.json',
      );
      const content = await readFile(packageJsonPath, 'utf-8');
      const pkg = JSON.parse(content) as { version: string };
      return pkg.version;
    } catch {
      return '0.0.0';
    }
  }

  private async writeMetadata(params: {
    metadataPath: string;
    projectPath: string;
    projectHash: string;
    projectDir: string;
    fileCount: number;
    fingerprint: GitFingerprint;
  }): Promise<IndexMetadata> {
    const versions = await collectPackageVersions();

    const metadata: IndexMetadata = {
      schemaVersion: 1,
      state: 'complete',
      projectPath: params.projectPath,
      projectHash: params.projectHash,
      indexedAt: new Date().toISOString(),
      fileCount: params.fileCount,
      fingerprint: {
        ...params.fingerprint,
        value: formatFingerprint(params.fingerprint),
      },
      versions: {
        synapseArchitect: await this.getPackageVersion(),
        synapsedb: versions.synapsedb,
        repomix: versions.repomix,
      },
      output: {
        dbFile: path.join(params.projectDir, 'graph.sdb'),
      },
    };

    await writeFile(params.metadataPath, JSON.stringify(metadata, null, 2), 'utf8');
    return metadata;
  }
}

let cachedVersions: { synapsedb?: string; repomix?: string } | undefined;

async function collectPackageVersions(): Promise<{ synapsedb?: string; repomix?: string }> {
  if (cachedVersions) return cachedVersions;

  const [synapsedb, repomixVersion] = await Promise.all([
    readPackageVersion(path.join(ROOT_DIR, 'SynapseDB', 'package.json')),
    readPackageVersion(path.join(ROOT_DIR, 'node_modules', 'repomix', 'package.json')),
  ]);

  cachedVersions = {
    synapsedb,
    repomix: repomixVersion,
  };

  return cachedVersions;
}

async function readPackageVersion(packageJsonPath: string): Promise<string | undefined> {
  try {
    const raw = await readFile(packageJsonPath, 'utf8');
    const parsed = JSON.parse(raw) as { version?: string };
    return parsed.version;
  } catch {
    return undefined;
  }
}
