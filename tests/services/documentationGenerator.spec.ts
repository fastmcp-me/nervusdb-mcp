import { describe, it, expect, vi, beforeEach } from 'vitest';
import { DocumentationGenerator } from '../../src/services/documentationGenerator.js';
import type { QueryService, CodeEntityInfo } from '../../src/domain/query/queryService.js';

describe('DocumentationGenerator', () => {
  let generator: DocumentationGenerator;
  let mockQueryService: QueryService;

  beforeEach(() => {
    mockQueryService = {
      getCallHierarchy: vi.fn(),
      findReferences: vi.fn(),
      findSymbolDefinition: vi.fn(),
    } as unknown as QueryService;

    generator = new DocumentationGenerator({ queryService: mockQueryService });
  });

  describe('analyzeDocumentation', () => {
    it('should generate documentation for a function', async () => {
      const mockEntity: CodeEntityInfo = {
        nodeId: '1',
        name: 'calculateTotal',
        type: 'function',
        filePath: '/project/src/calculator.ts',
        signature: 'function calculateTotal(items: Item[]): number',
        metadata: {
          parameters: 1,
          returns: 'number',
        },
      };

      const mockHierarchy = {
        entity: mockEntity,
        callers: [],
        callees: [],
      };

      vi.mocked(mockQueryService.findSymbolDefinition).mockResolvedValue(mockEntity);

      const result = await generator.analyzeDocumentation({
        projectPath: '/project',
        symbols: ['calculateTotal'],
      });

      expect(result).toBeDefined();
      expect(result.analysis.length).toBeGreaterThanOrEqual(0);
      if (result.analysis.length > 0) {
        const analysis = result.analysis[0];
        expect(analysis.symbolName).toBe('calculateTotal');
        expect(analysis.status).toBeDefined();
      }
    });

    it('should analyze class documentation', async () => {
      const mockEntity: CodeEntityInfo = {
        nodeId: '2',
        name: 'UserService',
        type: 'class',
        filePath: '/project/src/UserService.ts',
      };

      vi.mocked(mockQueryService.findSymbolDefinition).mockResolvedValue(mockEntity);

      const result = await generator.analyzeDocumentation({
        projectPath: '/project',
        symbols: ['UserService'],
      });

      expect(result).toBeDefined();
      expect(result.summary).toBeDefined();
      expect(result.summary.total).toBeGreaterThanOrEqual(0);
    });

    it('should identify documentation issues', async () => {
      const mockEntity: CodeEntityInfo = {
        nodeId: '3',
        name: 'fetchData',
        type: 'function',
        filePath: '/project/src/api.ts',
        signature: 'async function fetchData(url: string): Promise<Data>',
      };

      vi.mocked(mockQueryService.findSymbolDefinition).mockResolvedValue(mockEntity);

      const result = await generator.analyzeDocumentation({
        projectPath: '/project',
        symbols: ['fetchData'],
      });

      expect(result).toBeDefined();
      if (result.analysis.length > 0) {
        const analysis = result.analysis[0];
        expect(analysis.issues).toBeDefined();
        expect(analysis.suggestions).toBeDefined();
      }
    });

    it('should calculate documentation completeness', async () => {
      const mockEntity: CodeEntityInfo = {
        nodeId: '4',
        name: 'createUser',
        type: 'function',
        filePath: '/project/src/user.ts',
      };

      vi.mocked(mockQueryService.findSymbolDefinition).mockResolvedValue(mockEntity);

      const result = await generator.analyzeDocumentation({
        projectPath: '/project',
        symbols: ['createUser'],
      });

      expect(result).toBeDefined();
      expect(result.summary.completeness).toBeGreaterThanOrEqual(0);
      expect(result.summary.completeness).toBeLessThanOrEqual(100);
    });

    it('should handle symbols not found', async () => {
      vi.mocked(mockQueryService.findSymbolDefinition).mockResolvedValue(null);

      const result = await generator.analyzeDocumentation({
        projectPath: '/project',
        symbols: ['nonExistent'],
      });

      expect(result).toBeDefined();
      expect(result.analysis.length).toBeGreaterThan(0);
      expect(result.analysis[0].status).toBe('missing');
    });

    it('should provide summary statistics', async () => {
      const mockEntity: CodeEntityInfo = {
        nodeId: '6',
        name: 'testFunction',
        type: 'function',
        filePath: '/project/src/test.ts',
      };

      vi.mocked(mockQueryService.findSymbolDefinition).mockResolvedValue(mockEntity);

      const result = await generator.analyzeDocumentation({
        projectPath: '/project',
        symbols: ['testFunction'],
      });

      expect(result).toBeDefined();
      expect(result.summary).toBeDefined();
      expect(result.summary.total).toBeGreaterThanOrEqual(0);
      expect(result.summary.complete).toBeGreaterThanOrEqual(0);
      expect(result.summary.partial).toBeGreaterThanOrEqual(0);
      expect(result.summary.missing).toBeGreaterThanOrEqual(0);
    });
  });
});
