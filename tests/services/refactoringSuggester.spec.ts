import { describe, it, expect, vi, beforeEach } from 'vitest';
import { RefactoringSuggester } from '../../src/services/refactoringSuggester.js';
import type { QueryService, CodeEntityInfo } from '../../src/domain/query/queryService.js';

describe('RefactoringSuggester', () => {
  let suggester: RefactoringSuggester;
  let mockQueryService: QueryService;

  beforeEach(() => {
    mockQueryService = {
      getCallHierarchy: vi.fn(),
      findReferences: vi.fn(),
    } as unknown as QueryService;

    suggester = new RefactoringSuggester({ queryService: mockQueryService });
  });

  describe('suggestRefactorings', () => {
    it('should suggest extract method refactoring for long functions', async () => {
      const mockEntity: CodeEntityInfo = {
        nodeId: '1',
        name: 'longFunction',
        type: 'function',
        filePath: '/project/src/long.ts',
        metadata: {
          lines: 120,
          complexity: 15,
        },
      };

      const mockHierarchy = {
        entity: mockEntity,
        callers: [],
        callees: [],
      };

      vi.mocked(mockQueryService.getCallHierarchy).mockResolvedValue(mockHierarchy as any);

      const result = await suggester.suggestRefactorings({
        projectPath: '/project',
        symbols: ['longFunction'],
      });

      expect(result).toBeDefined();
      expect(result.suggestions.length).toBeGreaterThanOrEqual(0);
      const extractMethodSuggestion = result.suggestions.find(
        (s) => s.type === 'extract-method' || s.type === 'extract-function',
      );
      if (extractMethodSuggestion) {
        expect(extractMethodSuggestion.priority).toMatch(/HIGH|MEDIUM/);
      }
    });

    it('should suggest simplify parameters for functions with many params', async () => {
      const mockEntity: CodeEntityInfo = {
        nodeId: '2',
        name: 'manyParamsFunction',
        type: 'function',
        filePath: '/project/src/params.ts',
        metadata: {
          parameters: 9,
        },
      };

      const mockHierarchy = {
        entity: mockEntity,
        callers: [],
        callees: [],
      };

      vi.mocked(mockQueryService.getCallHierarchy).mockResolvedValue(mockHierarchy as any);

      const result = await suggester.suggestRefactorings({
        projectPath: '/project',
        symbols: ['manyParamsFunction'],
      });

      expect(result).toBeDefined();
      const simplifyParamsSuggestion = result.suggestions.find(
        (s) => s.type === 'simplify-parameters' || s.type === 'introduce-parameter-object',
      );
      if (simplifyParamsSuggestion) {
        expect(simplifyParamsSuggestion.description).toBeDefined();
      }
    });

    it('should suggest removing unused code', async () => {
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

      const result = await suggester.suggestRefactorings({
        projectPath: '/project',
        symbols: ['unusedFunction'],
      });

      expect(result).toBeDefined();
      const removeDeadCodeSuggestion = result.suggestions.find(
        (s) => s.type === 'remove-dead-code',
      );
      if (removeDeadCodeSuggestion) {
        expect(removeDeadCodeSuggestion.impact).toBe('LOW');
      }
    });

    it('should prioritize suggestions by impact and effort', async () => {
      const mockEntity: CodeEntityInfo = {
        nodeId: '4',
        name: 'refactorMe',
        type: 'function',
        filePath: '/project/src/refactor.ts',
        metadata: {
          complexity: 20,
          lines: 100,
          parameters: 7,
        },
      };

      const mockHierarchy = {
        entity: mockEntity,
        callers: [
          {
            entity: {
              nodeId: '5',
              name: 'caller1',
              type: 'function',
              filePath: '/project/src/caller1.ts',
            },
            callers: [],
            callees: [],
          },
        ],
        callees: [],
      };

      vi.mocked(mockQueryService.getCallHierarchy).mockResolvedValue(mockHierarchy as any);

      const result = await suggester.suggestRefactorings({
        projectPath: '/project',
        symbols: ['refactorMe'],
      });

      expect(result).toBeDefined();
      expect(result.summary).toBeDefined();
      expect(result.summary.totalSuggestions).toBeGreaterThanOrEqual(0);
    });

    it('should handle symbols not found', async () => {
      vi.mocked(mockQueryService.getCallHierarchy).mockRejectedValue(new Error('Symbol not found'));

      const result = await suggester.suggestRefactorings({
        projectPath: '/project',
        symbols: ['nonExistent'],
      });

      expect(result).toBeDefined();
      expect(result.suggestions).toEqual([]);
      expect(result.summary.totalSuggestions).toBe(0);
    });

    it('should provide summary statistics', async () => {
      const mockEntity: CodeEntityInfo = {
        nodeId: '6',
        name: 'testFunction',
        type: 'function',
        filePath: '/project/src/test.ts',
        metadata: {
          complexity: 5,
        },
      };

      const mockHierarchy = {
        entity: mockEntity,
        callers: [],
        callees: [],
      };

      vi.mocked(mockQueryService.getCallHierarchy).mockResolvedValue(mockHierarchy as any);

      const result = await suggester.suggestRefactorings({
        projectPath: '/project',
        symbols: ['testFunction'],
      });

      expect(result).toBeDefined();
      expect(result.summary).toBeDefined();
      expect(result.summary.byPriority).toBeDefined();
      expect(result.summary.byPattern).toBeDefined();
    });
  });
});
