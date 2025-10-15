/**
 * AST Parser 接口层
 *
 * 提供统一的 AST 解析接口，支持 Rust 和 TypeScript 两种实现
 */

import type { ParseResult } from '../types/codeEntity.js';

/**
 * Rust Native Parser 接口（最小化类型定义）
 */
interface NativeParser {
  parseFile(filePath: string, content: string): string;
  parseFilesBatch(files: string[][]): string[];
}

/**
 * AST 解析器接口
 */
export interface ASTParser {
  /**
   * 解析文件内容
   * @param filePath - 文件路径
   * @param content - 文件内容
   * @returns 解析结果
   */
  parseFile(filePath: string, content: string): Promise<ParseResult>;

  /**
   * 批量解析文件（性能优化）
   * @param files - 文件列表 [filePath, content][]
   * @returns 解析结果数组
   */
  parseFilesInBatch(files: Array<[string, string]>): Promise<ParseResult[]>;

  /**
   * 获取支持的文件扩展名
   * @returns 扩展名列表
   */
  getSupportedExtensions(): string[];
}

/**
 * Rust 实现的 AST 解析器（高性能）
 */
export class RustASTParser implements ASTParser {
  private parser: NativeParser;

  constructor() {
    try {
      // 动态加载 Rust native module
      // eslint-disable-next-line @typescript-eslint/no-var-requires
      const nativeModule = require('../../../target/release/synapse_parser_napi.node');
      this.parser = new nativeModule.ASTParser();
    } catch (error) {
      throw new Error(
        `Failed to load Rust parser: ${error}\n` +
          'Please run "pnpm build:rust" first.\n' +
          'Fallback: use RustASTParser.isAvailable() to check availability.',
      );
    }
  }

  async parseFile(filePath: string, content: string): Promise<ParseResult> {
    try {
      const jsonResult = this.parser.parseFile(filePath, content);
      return JSON.parse(jsonResult) as ParseResult;
    } catch (error) {
      throw new Error(`Failed to parse ${filePath}: ${error}`);
    }
  }

  async parseFilesInBatch(files: Array<[string, string]>): Promise<ParseResult[]> {
    try {
      // 转换为 NAPI 期望的格式 [[path, content], ...]
      const filesArray = files.map(([path, content]) => [path, content]);
      const jsonResults = this.parser.parseFilesBatch(filesArray);
      return jsonResults.map((json: string) => JSON.parse(json) as ParseResult);
    } catch (error) {
      throw new Error(`Batch parsing failed: ${error}`);
    }
  }

  getSupportedExtensions(): string[] {
    // eslint-disable-next-line @typescript-eslint/no-var-requires
    const nativeModule = require('../../../target/release/synapse_parser_napi.node');
    return nativeModule.ASTParser.getSupportedExtensions();
  }

  /**
   * 检查 Rust 解析器是否可用
   */
  static isAvailable(): boolean {
    try {
      // eslint-disable-next-line @typescript-eslint/no-var-requires
      require('../../../target/release/synapse_parser_napi.node');
      return true;
    } catch {
      return false;
    }
  }

  /**
   * 性能基准测试
   * @param sourceCode - 源代码
   * @param iterations - 迭代次数
   * @returns 平均每次解析耗时（毫秒）
   */
  static async benchmark(sourceCode: string, iterations: number): Promise<number> {
    // eslint-disable-next-line @typescript-eslint/no-var-requires
    const nativeModule = require('../../../target/release/synapse_parser_napi.node');
    const seconds = nativeModule.benchmarkParse(sourceCode, iterations);
    return seconds * 1000; // 转换为毫秒
  }
}

/**
 * TypeScript 实现的 AST 解析器（Fallback）
 *
 * 使用 ts-morph 实现，性能较低但无需编译 Rust
 */
export class TypeScriptASTParser implements ASTParser {
  async parseFile(_filePath: string, _content: string): Promise<ParseResult> {
    // TODO: 使用 ts-morph 实现
    throw new Error('TypeScript parser not implemented yet. Please use RustASTParser.');
  }

  async parseFilesInBatch(files: Array<[string, string]>): Promise<ParseResult[]> {
    // 简单的串行实现
    const results: ParseResult[] = [];
    for (const [filePath, content] of files) {
      results.push(await this.parseFile(filePath, content));
    }
    return results;
  }

  getSupportedExtensions(): string[] {
    return ['.ts', '.tsx', '.js', '.jsx'];
  }
}

/**
 * 创建 AST 解析器（智能选择）
 *
 * @param preferRust - 优先使用 Rust 实现（默认 true）
 * @returns AST 解析器实例
 */
export function createASTParser(preferRust = true): ASTParser {
  if (preferRust && RustASTParser.isAvailable()) {
    return new RustASTParser();
  }

  console.warn(
    '⚠️  Rust parser not available, falling back to TypeScript implementation.\n' +
      '   Performance will be significantly slower.\n' +
      '   Run "pnpm build:rust" to enable Rust parser.',
  );

  return new TypeScriptASTParser();
}
