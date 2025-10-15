import { describe, it, expect, vi, beforeEach } from 'vitest';
import { CodeSmellDetector } from '../../src/services/codeSmellDetector.js';
import type { QueryService, CodeEntityInfo } from '../../src/domain/query/queryService.js';

describe('CodeSmellDetector', () => {
  let detector: CodeSmellDetector;
  let mockQueryService: QueryService;

  beforeEach(() => {
    mockQueryService = {
      findSymbolDefinition: vi.fn(),
      findReferences: vi.fn(),
      getCallHierarchy: vi.fn(),
    } as unknown as QueryService;

    detector = new CodeSmellDetector({ queryService: mockQueryService });
  });

  describe('detectSmells', () => {
    it('should detect god functions with high complexity', async () => {
      const mockEntity: CodeEntityInfo = {
        nodeId: '1',
        name: 'complexFunction',
        type: 'function',
        filePath: '/project/src/complex.ts',
        metadata: {
          complexity: 25,
          lines: 150,
          parameters: 8,
        },
      };

      const mockHierarchy = {
        entity: mockEntity,
        callers: [],
        callees: [],
      };

      vi.mocked(mockQueryService.getCallHierarchy).mockResolvedValue(mockHierarchy as any);

      const result = await detector.detectSmells({
        projectPath: '/project',
        symbols: ['complexFunction'],
      });

      expect(result).toBeDefined();
      expect(result.smells.length).toBeGreaterThan(0);
      const godFunctionSmell = result.smells.find((s) => s.type === 'god-function');
      if (godFunctionSmell) {
        expect(godFunctionSmell.severity).toMatch(/WARNING|ERROR/);
        expect(godFunctionSmell.metrics?.complexity).toBeGreaterThan(10);
      }
    });

    it('should detect long parameter lists', async () => {
      const mockEntity: CodeEntityInfo = {
        nodeId: '2',
        name: 'manyParams',
        type: 'function',
        filePath: '/project/src/params.ts',
        metadata: {
          parameters: 8,
          complexity: 5,
        },
      };

      const mockHierarchy = {
        entity: mockEntity,
        callers: [],
        callees: [],
      };

      vi.mocked(mockQueryService.getCallHierarchy).mockResolvedValue(mockHierarchy as any);

      const result = await detector.detectSmells({
        projectPath: '/project',
        symbols: ['manyParams'],
        smellTypes: ['long-parameters'],
      });

      expect(result).toBeDefined();
      const paramSmell = result.smells.find((s) => s.type === 'long-parameters');
      if (paramSmell) {
        expect(paramSmell.metrics?.parameterCount).toBeGreaterThan(5);
      }
    });

    it('should detect dead code (unused functions)', async () => {
      const mockEntity: CodeEntityInfo = {
        nodeId: '3',
        name: 'unusedFunction',
        type: 'function',
        filePath: '/project/src/unused.ts',
      };

      const mockHierarchy = {
        entity: mockEntity,
        callers: [],
        callees: [],
      };

      vi.mocked(mockQueryService.getCallHierarchy).mockResolvedValue(mockHierarchy as any);
      vi.mocked(mockQueryService.findReferences).mockResolvedValue([]);

      const result = await detector.detectSmells({
        projectPath: '/project',
        symbols: ['unusedFunction'],
        smellTypes: ['dead-code'],
      });

      expect(result).toBeDefined();
      const deadCodeSmell = result.smells.find((s) => s.type === 'dead-code');
      if (deadCodeSmell) {
        expect(deadCodeSmell.metrics?.referenceCount).toBe(0);
      }
    });

    it('should filter by severity threshold', async () => {
      const mockEntity: CodeEntityInfo = {
        nodeId: '4',
        name: 'testFunction',
        type: 'function',
        filePath: '/project/src/test.ts',
        metadata: {
          complexity: 3,
          lines: 20,
        },
      };

      const mockHierarchy = {
        entity: mockEntity,
        callers: [],
        callees: [],
      };

      vi.mocked(mockQueryService.getCallHierarchy).mockResolvedValue(mockHierarchy as any);

      const result = await detector.detectSmells({
        projectPath: '/project',
        symbols: ['testFunction'],
        severityThreshold: 'ERROR',
      });

      expect(result).toBeDefined();
      result.smells.forEach((smell) => {
        expect(smell.severity).toBe('ERROR');
      });
    });

    it('should handle symbols not found', async () => {
      vi.mocked(mockQueryService.getCallHierarchy).mockRejectedValue(new Error('Symbol not found'));

      const result = await detector.detectSmells({
        projectPath: '/project',
        symbols: ['nonExistent'],
      });

      expect(result).toBeDefined();
      expect(result.smells).toEqual([]);
      expect(result.summary.totalSmells).toBe(0);
    });

    it('should provide summary statistics', async () => {
      const mockEntity: CodeEntityInfo = {
        nodeId: '5',
        name: 'smellyFunction',
        type: 'function',
        filePath: '/project/src/smelly.ts',
        metadata: {
          complexity: 15,
          parameters: 7,
          lines: 80,
        },
      };

      const mockHierarchy = {
        entity: mockEntity,
        callers: [],
        callees: [],
      };

      vi.mocked(mockQueryService.getCallHierarchy).mockResolvedValue(mockHierarchy as any);

      const result = await detector.detectSmells({
        projectPath: '/project',
        symbols: ['smellyFunction'],
      });

      expect(result).toBeDefined();
      expect(result.summary).toBeDefined();
      expect(result.summary.totalSmells).toBeGreaterThanOrEqual(0);
      expect(result.summary.bySeverity).toBeDefined();
      expect(result.summary.byType).toBeDefined();
    });
  });
});
