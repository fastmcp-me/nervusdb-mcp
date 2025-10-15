import { describe, it, expect, vi, beforeEach } from 'vitest';
import { DefinitionLocator } from '../../src/services/definitionLocator.js';
import type { QueryService, CodeEntityInfo } from '../../src/domain/query/queryService.js';

describe('DefinitionLocator', () => {
  let locator: DefinitionLocator;
  let mockQueryService: QueryService;

  beforeEach(() => {
    mockQueryService = {
      findDefinitions: vi.fn(),
    } as unknown as QueryService;

    locator = new DefinitionLocator({ queryService: mockQueryService });
  });

  describe('findDefinition', () => {
    it('should find exact match definition', async () => {
      const mockEntity: CodeEntityInfo = {
        nodeId: '1',
        name: 'getUserData',
        type: 'function',
        filePath: '/project/src/user.ts',
        signature: 'function getUserData(id: string): Promise<User>',
      };

      vi.mocked(mockQueryService.findDefinitions).mockResolvedValue([mockEntity]);

      const result = await locator.findDefinition({
        projectPath: '/project',
        symbolName: 'getUserData',
        config: { searchMode: 'exact' },
      });

      expect(result.definitions.length).toBeGreaterThan(0);
      expect(result.definitions[0].name).toBe('getUserData');
      expect(result.definitions[0].confidence).toBeGreaterThan(0.8);
    });

    it('should handle symbol not found', async () => {
      vi.mocked(mockQueryService.findDefinitions).mockResolvedValue([]);

      const result = await locator.findDefinition({
        projectPath: '/project',
        symbolName: 'nonExistent',
      });

      expect(result.definitions).toEqual([]);
      expect(result.totalFound).toBe(0);
    });

    it('should filter by symbol type', async () => {
      const mockEntity: CodeEntityInfo = {
        nodeId: '1',
        name: 'UserService',
        type: 'class',
        filePath: '/project/src/user.ts',
      };

      vi.mocked(mockQueryService.findDefinitions).mockResolvedValue([mockEntity]);

      const result = await locator.findDefinition({
        projectPath: '/project',
        symbolName: 'UserService',
        config: { symbolType: 'class' },
      });

      expect(result.definitions[0].type).toBe('class');
    });

    it('should limit results when maxResults is set', async () => {
      const mockEntity: CodeEntityInfo = {
        nodeId: '1',
        name: 'test',
        type: 'function',
        filePath: '/project/src/test.ts',
      };

      vi.mocked(mockQueryService.findDefinitions).mockResolvedValue([mockEntity]);

      const result = await locator.findDefinition({
        projectPath: '/project',
        symbolName: 'test',
        config: { maxResults: 1 },
      });

      expect(result.definitions.length).toBeLessThanOrEqual(1);
    });

    it('should filter by confidence threshold', async () => {
      const mockEntity: CodeEntityInfo = {
        nodeId: '1',
        name: 'partialMatch',
        type: 'function',
        filePath: '/project/src/file.ts',
      };

      vi.mocked(mockQueryService.findDefinitions).mockResolvedValue([mockEntity]);

      const result = await locator.findDefinition({
        projectPath: '/project',
        symbolName: 'partialMatch',
        config: { minConfidence: 0.9 },
      });

      // Results should only include high-confidence matches
      result.definitions.forEach((def) => {
        expect(def.confidence).toBeGreaterThanOrEqual(0.9);
      });
    });
  });
});
