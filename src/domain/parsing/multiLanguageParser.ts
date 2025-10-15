/**
 * 多语言解析器（基于 ADR-005）
 *
 * 支持语言：
 * - TypeScript/JavaScript
 * - Python
 * - Go
 * - Rust
 * - Java
 * - C/C++ (基础支持)
 */

import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { createRequire } from 'node:module';

// 加载 native module（支持从 src 和 dist 运行）
function loadNativeModule() {
  const require = createRequire(import.meta.url);
  const currentDir = path.dirname(fileURLToPath(import.meta.url));

  // 尝试不同的相对路径
  const possiblePaths = [
    path.resolve(currentDir, '../../../target/release/synapse_parser_napi.node'), // 本地开发 (src/ 或 dist/)
    path.resolve(currentDir, '../../native/synapse_parser_napi.node'), // npm 发布后 (dist/domain/parsing/ → dist/native/)
  ];

  const errors: string[] = [];
  for (const nativePath of possiblePaths) {
    try {
      return require(nativePath);
    } catch (err) {
      errors.push(`${nativePath}: ${err instanceof Error ? err.message : String(err)}`);
      // 继续尝试下一个路径
    }
  }

  throw new Error(`Native module not found. Tried paths:\n${errors.join('\n')}`);
}

interface ImportExportItem {
  name: string;
  path?: string;
  [key: string]: unknown;
}

interface ParseError {
  message: string;
  line?: number;
  [key: string]: unknown;
}

export interface ParseResult {
  filePath: string;
  language: string;
  entities: string[];
  imports: ImportExportItem[];
  exports: ImportExportItem[];
  errors: ParseError[];
}

export interface ParseStats {
  functions: number;
  classes: number;
  interfaces: number;
  imports: number;
  exports: number;
  errors: number;
}

export type SupportedLanguage =
  | 'TypeScript'
  | 'JavaScript'
  | 'Python'
  | 'Go'
  | 'Rust'
  | 'Java'
  | 'C'
  | 'C++';

/**
 * 多语言解析器
 */
interface NativeLanguageManager {
  parseFile(filePath: string, content: string): string;
  parseFilesBatch(files: Array<[string, string]>): string[];
  guessLanguage(filePath: string): string | null;
}

export class MultiLanguageParser {
  private manager: NativeLanguageManager; // NAPI LanguageManager

  constructor() {
    try {
      // 动态加载 Rust native module
      // 路径解析：支持从 src 和 dist 目录运行
      const nativeModule = loadNativeModule();
      this.manager = new nativeModule.LanguageManager();
    } catch (error) {
      throw new Error(
        `Failed to load multi-language parser: ${error}\n` +
          'Please run "pnpm build:rust" first.\n' +
          'Or check if the native module was built successfully.',
      );
    }
  }

  /**
   * 根据文件路径自动检测语言并解析
   *
   * @param filePath - 文件路径
   * @param content - 文件内容
   * @returns 解析结果
   */
  async parseFile(filePath: string, content: string): Promise<ParseResult> {
    try {
      const jsonResult = this.manager.parseFile(filePath, content);
      return JSON.parse(jsonResult) as ParseResult;
    } catch (error) {
      throw new Error(`Failed to parse ${filePath}: ${error}`);
    }
  }

  /**
   * 批量解析文件（性能优化版本）
   *
   * 内部会按语言分组处理，提升性能约 30%
   *
   * @param files - 文件列表 [filePath, content][]
   * @returns 解析结果数组
   */
  async parseFilesInBatch(files: Array<[string, string]>): Promise<ParseResult[]> {
    try {
      // 转换为 NAPI 期望的格式
      const filesArray = files.map(([path, content]) => [path, content] as [string, string]);
      const jsonResults = this.manager.parseFilesBatch(filesArray);
      return jsonResults.map((json: string) => JSON.parse(json) as ParseResult);
    } catch (error) {
      throw new Error(`Batch parsing failed: ${error}`);
    }
  }

  /**
   * 检测文件语言
   *
   * @param filePath - 文件路径
   * @returns 语言名称或 null（不支持的文件类型）
   */
  detectLanguage(filePath: string): SupportedLanguage | null {
    try {
      return this.manager.guessLanguage(filePath) as SupportedLanguage | null;
    } catch {
      return null;
    }
  }

  /**
   * 获取支持的语言列表
   *
   * @returns 语言名称数组
   */
  getSupportedLanguages(): SupportedLanguage[] {
    const nativeModule = loadNativeModule();
    return nativeModule.LanguageManager.getSupportedLanguages() as SupportedLanguage[];
  }

  /**
   * 检查多语言解析器是否可用
   */
  static isAvailable(): boolean {
    try {
      loadNativeModule();
      return true;
    } catch {
      return false;
    }
  }

  /**
   * 性能基准测试
   *
   * @param sourceCode - 源代码
   * @param language - 语言类型
   * @param iterations - 迭代次数
   * @returns 平均每次解析耗时（毫秒）
   */
  static async benchmark(
    sourceCode: string,
    language: SupportedLanguage,
    iterations: number = 100,
  ): Promise<number> {
    const parser = new MultiLanguageParser();
    const filePath = `test.${getExtension(language)}`;

    const start = Date.now();
    for (let i = 0; i < iterations; i++) {
      await parser.parseFile(filePath, sourceCode);
    }
    const duration = Date.now() - start;

    return duration / iterations;
  }
}

/**
 * 创建多语言解析器（工厂函数）
 *
 * @returns 解析器实例或 null（不可用）
 */
export function createMultiLanguageParser(): MultiLanguageParser | null {
  if (!MultiLanguageParser.isAvailable()) {
    console.warn(
      '⚠️  Multi-language parser not available.\n' +
        '   Please run "pnpm build:rust" to build the native module.\n' +
        '   Falling back to legacy parser (TypeScript only).',
    );
    return null;
  }

  return new MultiLanguageParser();
}

/**
 * 获取语言对应的文件扩展名
 */
function getExtension(language: SupportedLanguage): string {
  const map: Record<SupportedLanguage, string> = {
    TypeScript: 'ts',
    JavaScript: 'js',
    Python: 'py',
    Go: 'go',
    Rust: 'rs',
    Java: 'java',
    C: 'c',
    'C++': 'cpp',
  };
  return map[language] || 'txt';
}
