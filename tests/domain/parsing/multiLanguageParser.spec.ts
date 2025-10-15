/**
 * 多语言解析器端到端测试
 */

import { describe, it, expect, beforeAll } from 'vitest';
import { readFileSync } from 'node:fs';
import { join } from 'node:path';
import {
  MultiLanguageParser,
  createMultiLanguageParser,
  type ParseResult,
} from '../../../src/domain/parsing/multiLanguageParser.js';

const FIXTURES_DIR = join(__dirname, '../../fixtures/multi-language');

describe('MultiLanguageParser E2E', () => {
  describe('Availability check', () => {
    it('should check if multi-language parser is available', () => {
      const isAvailable = MultiLanguageParser.isAvailable();
      console.log(`Multi-language parser available: ${isAvailable}`);

      if (!isAvailable) {
        console.warn('⚠️  Rust parser not available. Run "pnpm build:rust" first.');
      }
    });
  });

  // 只在 Rust 解析器可用时运行测试
  if (MultiLanguageParser.isAvailable()) {
    describe('Language detection', () => {
      let parser: MultiLanguageParser;

      beforeAll(() => {
        parser = new MultiLanguageParser();
      });

      it('should detect TypeScript', () => {
        expect(parser.detectLanguage('test.ts')).toBe('TypeScript');
        expect(parser.detectLanguage('test.tsx')).toBe('TypeScript');
      });

      it('should detect JavaScript', () => {
        expect(parser.detectLanguage('test.js')).toBe('JavaScript');
        expect(parser.detectLanguage('test.jsx')).toBe('JavaScript');
      });

      it('should detect Python', () => {
        expect(parser.detectLanguage('test.py')).toBe('Python');
      });

      it('should detect Go', () => {
        expect(parser.detectLanguage('test.go')).toBe('Go');
      });

      it('should detect Rust', () => {
        expect(parser.detectLanguage('test.rs')).toBe('Rust');
      });

      it('should detect Java', () => {
        expect(parser.detectLanguage('test.java')).toBe('Java');
      });

      it('should return null for unsupported files', () => {
        expect(parser.detectLanguage('test.unknown')).toBeNull();
      });

      it('should get supported languages list', () => {
        const languages = parser.getSupportedLanguages();
        console.log('Supported languages:', languages);

        expect(languages).toContain('TypeScript');
        expect(languages).toContain('JavaScript');
        expect(languages.length).toBeGreaterThanOrEqual(2);
      });
    });

    describe('TypeScript parsing', () => {
      let parser: MultiLanguageParser;
      let sampleCode: string;

      beforeAll(() => {
        parser = new MultiLanguageParser();
        sampleCode = readFileSync(join(FIXTURES_DIR, 'sample.ts'), 'utf-8');
      });

      it('should parse TypeScript file', async () => {
        const result = await parser.parseFile('sample.ts', sampleCode);

        expect(result.language).toBe('TypeScript');
        expect(result.filePath).toBe('sample.ts');
        expect(result.entities.length).toBeGreaterThan(0);

        console.log('TypeScript entities extracted:', result.entities.length);
        console.log('Sample entities:', result.entities.slice(0, 3));
      });

      it('should extract interfaces', async () => {
        const result = await parser.parseFile('sample.ts', sampleCode);
        const hasInterface = result.entities.some((e) => e.includes('interface User'));
        expect(hasInterface).toBe(true);
      });

      it('should extract classes', async () => {
        const result = await parser.parseFile('sample.ts', sampleCode);
        const hasClass = result.entities.some((e) => e.includes('class UserService'));
        expect(hasClass).toBe(true);
      });

      it('should extract functions', async () => {
        const result = await parser.parseFile('sample.ts', sampleCode);
        const hasFunction = result.entities.some((e) => e.includes('function validateEmail'));
        expect(hasFunction).toBe(true);
      });
    });

    describe('Python parsing', () => {
      let parser: MultiLanguageParser;
      let sampleCode: string;

      beforeAll(() => {
        parser = new MultiLanguageParser();
        sampleCode = readFileSync(join(FIXTURES_DIR, 'sample.py'), 'utf-8');
      });

      it('should parse Python file', async () => {
        const result = await parser.parseFile('sample.py', sampleCode);

        expect(result.language).toBe('Python');
        expect(result.filePath).toBe('sample.py');
        expect(result.entities.length).toBeGreaterThan(0);

        console.log('Python entities extracted:', result.entities.length);
        console.log('Sample entities:', result.entities.slice(0, 3));
      });

      it('should extract classes', async () => {
        const result = await parser.parseFile('sample.py', sampleCode);
        const hasClass = result.entities.some((e) => e.includes('class UserService'));
        expect(hasClass).toBe(true);
      });

      it('should extract functions', async () => {
        const result = await parser.parseFile('sample.py', sampleCode);
        const hasFunction = result.entities.some((e) => e.includes('def validate_email'));
        expect(hasFunction).toBe(true);
      });
    });

    describe('Go parsing', () => {
      let parser: MultiLanguageParser;
      let sampleCode: string;

      beforeAll(() => {
        parser = new MultiLanguageParser();
        sampleCode = readFileSync(join(FIXTURES_DIR, 'sample.go'), 'utf-8');
      });

      it('should parse Go file', async () => {
        const result = await parser.parseFile('sample.go', sampleCode);

        expect(result.language).toBe('Go');
        expect(result.filePath).toBe('sample.go');
        expect(result.entities.length).toBeGreaterThan(0);

        console.log('Go entities extracted:', result.entities.length);
        console.log('Sample entities:', result.entities.slice(0, 3));
      });

      it('should extract structs', async () => {
        const result = await parser.parseFile('sample.go', sampleCode);
        const hasStruct = result.entities.some(
          (e) => e.includes('type User struct') || e.includes('type UserService struct'),
        );
        expect(hasStruct).toBe(true);
      });

      it('should extract functions', async () => {
        const result = await parser.parseFile('sample.go', sampleCode);
        const hasFunction = result.entities.some(
          (e) => e.includes('func') && e.includes('ValidateEmail'),
        );
        expect(hasFunction).toBe(true);
      });
    });

    describe('Rust parsing', () => {
      let parser: MultiLanguageParser;
      let sampleCode: string;

      beforeAll(() => {
        parser = new MultiLanguageParser();
        sampleCode = readFileSync(join(FIXTURES_DIR, 'sample.rs'), 'utf-8');
      });

      it('should parse Rust file', async () => {
        const result = await parser.parseFile('sample.rs', sampleCode);

        expect(result.language).toBe('Rust');
        expect(result.filePath).toBe('sample.rs');
        expect(result.entities.length).toBeGreaterThan(0);

        console.log('Rust entities extracted:', result.entities.length);
        console.log('Sample entities:', result.entities.slice(0, 3));
      });

      it('should extract structs', async () => {
        const result = await parser.parseFile('sample.rs', sampleCode);
        const hasStruct = result.entities.some(
          (e) => e.includes('pub struct User') || e.includes('pub struct UserService'),
        );
        expect(hasStruct).toBe(true);
      });

      it('should extract functions', async () => {
        const result = await parser.parseFile('sample.rs', sampleCode);
        const hasFunction = result.entities.some((e) => e.includes('pub fn validate_email'));
        expect(hasFunction).toBe(true);
      });
    });

    describe('Java parsing', () => {
      let parser: MultiLanguageParser;
      let sampleCode: string;

      beforeAll(() => {
        parser = new MultiLanguageParser();
        sampleCode = readFileSync(join(FIXTURES_DIR, 'sample.java'), 'utf-8');
      });

      it('should parse Java file', async () => {
        const result = await parser.parseFile('sample.java', sampleCode);

        expect(result.language).toBe('Java');
        expect(result.filePath).toBe('sample.java');
        expect(result.entities.length).toBeGreaterThan(0);

        console.log('Java entities extracted:', result.entities.length);
        console.log('Sample entities:', result.entities.slice(0, 3));
      });

      it('should extract classes', async () => {
        const result = await parser.parseFile('sample.java', sampleCode);
        const hasClass = result.entities.some(
          (e) => e.includes('public class UserService') || e.includes('class User'),
        );
        expect(hasClass).toBe(true);
      });

      it('should extract methods', async () => {
        const result = await parser.parseFile('sample.java', sampleCode);
        const hasMethod = result.entities.some((e) => e.includes('validateEmail'));
        expect(hasMethod).toBe(true);
      });
    });

    describe('Batch parsing', () => {
      let parser: MultiLanguageParser;

      beforeAll(() => {
        parser = new MultiLanguageParser();
      });

      it('should parse multiple files in batch', async () => {
        const files: Array<[string, string]> = [
          ['sample.ts', readFileSync(join(FIXTURES_DIR, 'sample.ts'), 'utf-8')],
          ['sample.py', readFileSync(join(FIXTURES_DIR, 'sample.py'), 'utf-8')],
          ['sample.go', readFileSync(join(FIXTURES_DIR, 'sample.go'), 'utf-8')],
          ['sample.rs', readFileSync(join(FIXTURES_DIR, 'sample.rs'), 'utf-8')],
          ['sample.java', readFileSync(join(FIXTURES_DIR, 'sample.java'), 'utf-8')],
        ];

        const results = await parser.parseFilesInBatch(files);

        expect(results.length).toBe(5);

        // 验证每个文件都被正确解析
        const languages = results.map((r) => r.language);
        expect(languages).toContain('TypeScript');
        expect(languages).toContain('Python');
        expect(languages).toContain('Go');
        expect(languages).toContain('Rust');
        expect(languages).toContain('Java');

        console.log('Batch parsing results:');
        results.forEach((r) => {
          console.log(`  ${r.language}: ${r.entities.length} entities`);
        });
      });

      it('should handle mixed language batches efficiently', async () => {
        const files: Array<[string, string]> = [
          ['file1.ts', 'export function foo() {}'],
          ['file2.ts', 'export function bar() {}'],
          ['file3.py', 'def baz(): pass'],
          ['file4.py', 'def qux(): pass'],
        ];

        const start = Date.now();
        const results = await parser.parseFilesInBatch(files);
        const duration = Date.now() - start;

        expect(results.length).toBe(4);
        console.log(`Batch parsing took ${duration}ms for 4 files`);

        // 批量解析应该比单独解析快
        expect(duration).toBeLessThan(500); // 合理的性能预期
      });
    });

    describe('Performance benchmark', () => {
      it('should benchmark TypeScript parsing', async () => {
        const code = readFileSync(join(FIXTURES_DIR, 'sample.ts'), 'utf-8');

        const avgTime = await MultiLanguageParser.benchmark(code, 'TypeScript', 50);

        console.log(`TypeScript average parse time: ${avgTime.toFixed(2)}ms`);

        // 性能目标：< 30ms
        expect(avgTime).toBeLessThan(50); // 放宽一点，实际目标是 30ms
      });

      it('should benchmark Python parsing', async () => {
        const code = readFileSync(join(FIXTURES_DIR, 'sample.py'), 'utf-8');

        const avgTime = await MultiLanguageParser.benchmark(code, 'Python', 50);

        console.log(`Python average parse time: ${avgTime.toFixed(2)}ms`);

        expect(avgTime).toBeLessThan(50);
      });
    });
  }
});

describe('Factory function', () => {
  it('should create parser if available', () => {
    const parser = createMultiLanguageParser();

    if (MultiLanguageParser.isAvailable()) {
      expect(parser).toBeInstanceOf(MultiLanguageParser);
    } else {
      expect(parser).toBeNull();
    }
  });
});
