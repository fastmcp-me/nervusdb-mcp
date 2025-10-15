import path from 'node:path';
import { readFile as nodeReadFile } from 'node:fs/promises';

import { minimatch } from 'minimatch';
import { pack, type PackResult } from 'repomix';

import type { QueryService, GraphFact } from '../domain/query/queryService.js';
import { ImpactAnalyzer, type EnhancedImpactAnalysis } from './impactAnalyzer.js';
import { RelatedFilesScorer, type ScoredFile } from './relatedFilesScorer.js';

// Base config without cwd (will be added per call)
const BASE_REPOMIX_CONFIG = {
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

export interface ProjectServiceDependencies {
  pack: typeof pack;
  readFile: typeof nodeReadFile;
  query: QueryService;
  impactAnalyzer?: ImpactAnalyzer;
  relatedFilesScorer?: RelatedFilesScorer;
}

export interface GetStructureInput {
  projectPath: string;
  withComments?: boolean;
  maxDepth?: number; // Limit tree depth (e.g., 3 = only show 3 levels)
  limit?: number; // Limit number of files returned (e.g., 100 = first 100 files)
  pathFilter?: string; // Glob pattern to filter paths (e.g., "src/**")
}

export interface ProjectStructureNode {
  name: string;
  path: string;
  type: 'directory' | 'file';
  size: number;
  tokens: number;
  children?: ProjectStructureNode[];
  commentsPreview?: string[];
}

export interface ProjectFileMetadata {
  path: string;
  size: number;
  tokens: number;
  commentsPreview?: string[];
}

export interface ProjectStructureResult {
  summary: {
    totalFiles: number;
    totalCharacters: number;
    totalTokens: number;
    commentsIncluded: boolean;
  };
  files: ProjectFileMetadata[];
  tree: ProjectStructureNode[];
}

export interface AnalyzeImpactInput {
  projectPath: string;
  filePath?: string;
  functionName?: string;
  symbol?: string;
  type?: 'function' | 'class' | 'interface';
  maxDepth?: number;
  limit: number;
}

export interface GraphFactOutput {
  subject: string;
  predicate: string;
  object: string;
  properties?: Record<string, unknown>;
}

export interface AnalyzeImpactResult {
  callers: GraphFactOutput[];
  fileMembership: GraphFactOutput[];
  relations: GraphFactOutput[];
}

export interface RelatedFile {
  file: string;
  score: number;
  reasons: GraphFactOutput[];
}

// Enhanced related file format (from RelatedFilesScorer)
export interface EnhancedRelatedFile extends ScoredFile {
  // Inherits all fields from ScoredFile
}

export interface FindRelatedFilesInput {
  projectPath: string;
  filePath: string;
  limit: number;
  // Enhanced mode options
  enhanced?: boolean; // Use intelligent scoring algorithm
  includeSharedDependencies?: boolean;
  minScoreThreshold?: number;
}

export interface FindRelatedFilesResult {
  related: RelatedFile[] | EnhancedRelatedFile[];
  // Enhanced mode metadata
  enhanced?: boolean;
  maxScore?: number;
  totalFilesAnalyzed?: number;
}

const DEFAULT_PROJECT_SERVICE_DEPS: Pick<ProjectServiceDependencies, 'pack' | 'readFile'> = {
  pack,
  readFile: nodeReadFile,
};

export class ProjectService {
  private readonly deps: ProjectServiceDependencies;
  private readonly impactAnalyzer: ImpactAnalyzer;
  private readonly relatedFilesScorer: RelatedFilesScorer;

  constructor(deps: Partial<ProjectServiceDependencies> & { query: QueryService }) {
    this.deps = {
      ...DEFAULT_PROJECT_SERVICE_DEPS,
      ...deps,
      query: deps.query,
    } as ProjectServiceDependencies;

    this.impactAnalyzer =
      deps.impactAnalyzer ??
      new ImpactAnalyzer({
        queryService: deps.query,
      });

    this.relatedFilesScorer =
      deps.relatedFilesScorer ??
      new RelatedFilesScorer({
        queryService: deps.query,
      });
  }

  async getStructure(input: GetStructureInput): Promise<ProjectStructureResult> {
    const withComments = input.withComments ?? false;

    let repomixResult: PackResult;
    try {
      const config = {
        ...BASE_REPOMIX_CONFIG,
        cwd: input.projectPath, // required by RepomixConfigMerged
        output: {
          ...BASE_REPOMIX_CONFIG.output,
          removeComments: !withComments, // override for comment handling
        },
      } as const;

      repomixResult = await this.deps.pack([input.projectPath], config, () => {}, {
        writeOutputToDisk: async () => undefined,
        copyToClipboardIfEnabled: async () => undefined,
      });
    } catch (error) {
      throw new Error(
        `Failed to collect project files in ${input.projectPath}: ${
          error instanceof Error ? error.message : String(error)
        }`,
      );
    }

    // Validate repomix result
    if (!repomixResult.processedFiles && !repomixResult.safeFilePaths) {
      throw new Error(
        `Repomix returned empty result for ${input.projectPath}. ` +
          'The directory may be empty or all files are ignored by .gitignore.',
      );
    }

    const fileContentMap = new Map<string, string>();
    for (const file of repomixResult.processedFiles ?? []) {
      const relative = toRelativePath(input.projectPath, file.path);
      fileContentMap.set(relative, file.content);
    }

    // Apply pathFilter if provided
    let filePaths = repomixResult.safeFilePaths ?? [];
    if (input.pathFilter) {
      filePaths = filePaths.filter((filePath) => {
        const relative = toRelativePath(input.projectPath, filePath);
        return minimatch(relative, input.pathFilter!, { dot: true });
      });
    }

    // Apply limit if provided
    if (input.limit && input.limit > 0) {
      filePaths = filePaths.slice(0, input.limit);
    }

    const files: ProjectFileMetadata[] = [];
    const root: ProjectStructureNode = {
      name: '.',
      path: '.',
      type: 'directory',
      size: 0,
      tokens: 0,
      children: [],
    };

    for (const filePath of filePaths) {
      const relative = toRelativePath(input.projectPath, filePath);
      const metrics = extractFileMetrics(repomixResult, filePath, relative, fileContentMap);
      const commentsPreview =
        withComments && metrics.content ? extractComments(metrics.content) : undefined;

      files.push({
        path: relative,
        size: metrics.size,
        tokens: metrics.tokens,
        commentsPreview:
          commentsPreview && commentsPreview.length > 0 ? commentsPreview : undefined,
      });

      insertIntoTree(root, relative, metrics.size, metrics.tokens, commentsPreview, input.maxDepth);
    }

    aggregateDirectoryMetrics(root);

    return {
      summary: {
        totalFiles: repomixResult.totalFiles ?? files.length,
        totalCharacters: repomixResult.totalCharacters ?? files.reduce((sum, f) => sum + f.size, 0),
        totalTokens: repomixResult.totalTokens ?? files.reduce((sum, f) => sum + f.tokens, 0),
        commentsIncluded: withComments,
      },
      files,
      tree: root.children ?? [],
    };
  }

  async readFile(filePath: string): Promise<string> {
    return this.deps.readFile(filePath, 'utf8');
  }

  async analyzeImpact(
    input: AnalyzeImpactInput,
  ): Promise<AnalyzeImpactResult | EnhancedImpactAnalysis> {
    // 新的增强模式：使用 symbol + type
    if (input.symbol && input.type) {
      return this.impactAnalyzer.analyze({
        projectPath: input.projectPath,
        symbol: input.symbol,
        type: input.type,
        maxDepth: input.maxDepth,
      });
    }

    // 向后兼容：旧的 filePath/functionName 模式
    const callers = input.functionName
      ? await this.deps.query.findCallers(input.projectPath, input.functionName, {
          limit: input.limit,
        })
      : [];

    const membership = input.filePath
      ? await this.deps.query.findFacts(
          input.projectPath,
          { predicate: 'CONTAINS', object: formatFileNode(input.filePath) },
          { limit: input.limit },
        )
      : [];

    const relations = input.filePath
      ? await collectFileRelations(this.deps.query, input.projectPath, input.filePath, input.limit)
      : [];

    return {
      callers: callers.map(mapFact),
      fileMembership: membership.map(mapFact),
      relations: relations.map(mapFact),
    };
  }

  async findRelatedFiles(input: FindRelatedFilesInput): Promise<FindRelatedFilesResult> {
    // Enhanced mode: use intelligent scoring algorithm
    if (input.enhanced) {
      const result = await this.relatedFilesScorer.scoreRelatedFiles({
        projectPath: input.projectPath,
        filePath: input.filePath,
        limit: input.limit,
        config: {
          includeSharedDependencies: input.includeSharedDependencies ?? true,
          minScoreThreshold: input.minScoreThreshold ?? 0.1,
        },
      });

      return {
        related: result.scoredFiles as EnhancedRelatedFile[],
        enhanced: true,
        maxScore: result.maxScore,
        totalFilesAnalyzed: result.totalFilesAnalyzed,
      };
    }

    // Legacy mode: simple counting algorithm (backward compatibility)
    const relations = await collectFileRelations(
      this.deps.query,
      input.projectPath,
      input.filePath,
      input.limit,
    );

    const scoreMap = new Map<string, { score: number; reasons: GraphFactOutput[] }>();
    for (const fact of relations.map(mapFact)) {
      const neighbour = pickRelatedFile(fact, formatFileNode(input.filePath));
      if (!neighbour) continue;

      const current = scoreMap.get(neighbour) ?? { score: 0, reasons: [] };
      current.score += 1;
      current.reasons.push(fact);
      scoreMap.set(neighbour, current);
    }

    const related: RelatedFile[] = Array.from(scoreMap.entries())
      .map(([file, info]) => ({ file, score: info.score, reasons: info.reasons }))
      .sort((a, b) => b.score - a.score)
      .slice(0, input.limit);

    return { related, enhanced: false };
  }
}

function toRelativePath(projectPath: string, target: string): string {
  const relative = path.relative(projectPath, target);
  return relative.split(path.sep).join('/');
}

function extractFileMetrics(
  result: PackResult,
  absolutePath: string,
  relativePath: string,
  contents: Map<string, string>,
): { size: number; tokens: number; content?: string } {
  const normalizedRelative = relativePath.replace(/\\/g, '/');
  const normalizedAbsolute = absolutePath.replace(/\\/g, '/');
  const candidates = [absolutePath, normalizedAbsolute, relativePath, normalizedRelative];
  const size =
    pickMetric(result.fileCharCounts, candidates) ?? contents.get(relativePath)?.length ?? 0;
  const tokens = pickMetric(result.fileTokenCounts, candidates) ?? 0;
  return { size, tokens, content: contents.get(relativePath) };
}

function pickMetric(
  dict: Record<string, number> | undefined,
  candidates: string[],
): number | undefined {
  if (!dict) return undefined;
  for (const key of candidates) {
    if (key in dict) return dict[key];
  }
  return undefined;
}

function insertIntoTree(
  root: ProjectStructureNode,
  relativePath: string,
  size: number,
  tokens: number,
  commentsPreview?: string[],
  maxDepth?: number,
): void {
  const segments = relativePath.split('/').filter(Boolean);
  let current = root;
  let currentPath = '';
  let currentDepth = 0;

  for (let index = 0; index < segments.length; index += 1) {
    const segment = segments[index];
    currentPath = currentPath ? `${currentPath}/${segment}` : segment;
    const isFile = index === segments.length - 1;

    // Stop inserting if maxDepth is reached and this is not a file
    if (maxDepth !== undefined && currentDepth >= maxDepth && !isFile) {
      return;
    }

    if (!current.children) {
      current.children = [];
    }

    let child = current.children.find((node) => node.name === segment);
    if (!child) {
      child = {
        name: segment,
        path: currentPath,
        type: isFile ? 'file' : 'directory',
        size: 0,
        tokens: 0,
        children: isFile ? undefined : [],
      };
      current.children.push(child);
    }
    if (isFile) {
      child.size = size;
      child.tokens = tokens;
      if (commentsPreview && commentsPreview.length > 0) {
        child.commentsPreview = commentsPreview;
      }
    }
    current = child;
    currentDepth += 1;
  }
}

function aggregateDirectoryMetrics(node: ProjectStructureNode): { size: number; tokens: number } {
  if (node.type === 'file' || !node.children) {
    return { size: node.size, tokens: node.tokens };
  }

  let size = 0;
  let tokens = 0;
  node.children.sort((a, b) => a.name.localeCompare(b.name));

  for (const child of node.children) {
    const childMetrics = aggregateDirectoryMetrics(child);
    size += childMetrics.size;
    tokens += childMetrics.tokens;
  }

  node.size = size;
  node.tokens = tokens;
  return { size, tokens };
}

function extractComments(content: string): string[] {
  const lines = content.split('\n');
  const comments: string[] = [];
  const commentPattern = /^\s*(?:\/\/|#|\/\*|\*)/;
  for (const line of lines) {
    if (commentPattern.test(line)) {
      comments.push(line.trim());
      if (comments.length >= 5) break;
    }
  }
  return comments;
}

async function collectFileRelations(
  query: QueryService,
  projectPath: string,
  filePath: string,
  limit: number,
): Promise<GraphFact[]> {
  const fileNode = formatFileNode(filePath);
  const outgoing = await query.findFacts(projectPath, { subject: fileNode }, { limit });
  const incoming = await query.findFacts(projectPath, { object: fileNode }, { limit });
  return [...outgoing, ...incoming];
}

function mapFact(fact: GraphFact): GraphFactOutput {
  const output: GraphFactOutput = {
    subject: fact.subject,
    predicate: fact.predicate,
    object: fact.object,
  };
  if (fact.properties && Object.keys(fact.properties).length > 0) {
    output.properties = fact.properties;
  }
  return output;
}

function formatFileNode(filePath: string): string {
  return filePath.startsWith('file:') ? filePath : `file:${filePath}`;
}

function pickRelatedFile(fact: GraphFactOutput, origin: string): string | undefined {
  const candidates = [fact.subject, fact.object].filter((node) => node.startsWith('file:'));
  return candidates.find((node) => node !== origin);
}
