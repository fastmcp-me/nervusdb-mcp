/**
 * AST Parser 测试
 */

import { describe, it, expect, beforeAll } from 'vitest';
import { RustASTParser, createASTParser } from '../../../src/domain/parsing/astParser.js';

describe('AST Parser', () => {
  describe('RustASTParser availability', () => {
    it('should check if Rust parser is available', () => {
      const isAvailable = RustASTParser.isAvailable();
      console.log(`Rust parser available: ${isAvailable}`);

      if (!isAvailable) {
        console.warn('⚠️  Rust parser not available. Run "pnpm build:rust" first.');
      }
    });
  });

  describe('createASTParser factory', () => {
    it('should create a parser instance', () => {
      const parser = createASTParser(false); // Use fallback for now
      expect(parser).toBeDefined();
      expect(parser.getSupportedExtensions()).toContain('.ts');
    });
  });

  // Only run Rust-specific tests if Rust parser is available
  if (RustASTParser.isAvailable()) {
    describe('RustASTParser parsing', () => {
      let parser: RustASTParser;

      beforeAll(() => {
        parser = new RustASTParser();
      });

      it('should parse a simple function', async () => {
        const code = `
export function processData(input: string): number {
    const result = validateInput(input);
    return result.length;
}
        `;

        const result = await parser.parseFile('test.ts', code);

        expect(result.entities).toHaveLength(1);
        expect(result.entities[0].kind).toBe('function');
        if (result.entities[0].kind === 'function') {
          expect(result.entities[0].name).toBe('processData');
          expect(result.entities[0].isExported).toBe(true);
          expect(result.entities[0].calls).toContain('validateInput');
        }
        expect(result.errors).toHaveLength(0);
      });

      it('should parse a class', async () => {
        const code = `
export class UserService implements IUserService {
    private repository: Repository;

    async getUser(id: string): Promise<User> {
        return await this.repository.findById(id);
    }
}
        `;

        const result = await parser.parseFile('test.ts', code);

        expect(result.entities).toHaveLength(1);
        expect(result.entities[0].kind).toBe('class');
        if (result.entities[0].kind === 'class') {
          expect(result.entities[0].name).toBe('UserService');
          expect(result.entities[0].isExported).toBe(true);
          expect(result.entities[0].methods).toHaveLength(1);
          expect(result.entities[0].methods[0].name).toBe('getUser');
        }
      });

      it('should parse imports', async () => {
        const code = `
import { config } from './config';
import type { User } from '../types';
        `;

        const result = await parser.parseFile('test.ts', code);

        expect(result.imports).toHaveLength(2);
        expect(result.imports[0].source).toBe('./config');
      });

      it('should handle syntax errors gracefully', async () => {
        const code = `
function broken(
        `;

        const result = await parser.parseFile('test.ts', code);

        expect(result.errors).not.toHaveLength(0);
      });

      it('should parse files in batch', async () => {
        const files: Array<[string, string]> = [
          ['file1.ts', 'function foo() {}'],
          ['file2.ts', 'function bar() {}'],
          ['file3.ts', 'function baz() {}'],
        ];

        const results = await parser.parseFilesInBatch(files);

        expect(results).toHaveLength(3);
        results.forEach((result) => {
          expect(result.entities).toHaveLength(1);
        });
      });
    });

    describe('Performance benchmark', () => {
      it('should complete benchmark test', async () => {
        const code = `
export function processData(input: string): number {
    const result = validateInput(input);
    const transformed = transformData(result);
    return transformed.length;
}

export class DataProcessor {
    process(data: any) {
        return this.validate(data);
    }
    
    private validate(data: any) {
        return data !== null;
    }
}
        `;

        const avgTime = await RustASTParser.benchmark(code, 100);
        console.log(`Average parse time: ${avgTime.toFixed(2)}ms`);

        // 性能目标：单文件 < 30ms
        expect(avgTime).toBeLessThan(30);
      }, 10000); // 10秒超时
    });
  }
});
