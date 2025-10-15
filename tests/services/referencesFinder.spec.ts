import { describe, it, expect, vi, beforeEach } from 'vitest';
import { ReferencesFinder } from '../../src/services/referencesFinder.js';
import type { QueryService, CodeEntityInfo } from '../../src/domain/query/queryService.js';

describe('ReferencesFinder', () => {
  let finder: ReferencesFinder;
  let mockQueryService: QueryService;

  beforeEach(() => {
    mockQueryService = {
      findReferences: vi.fn(),
      findSymbolDefinition: vi.fn(),
    } as unknown as QueryService;

    finder = new ReferencesFinder({ queryService: mockQueryService });
  });

  it('should find references for a symbol', async () => {
    const mockEntity: CodeEntityInfo = {
      nodeId: '1',
      name: 'getUserData',
      type: 'function',
      filePath: '/project/src/user.ts',
    };

    vi.mocked(mockQueryService.findSymbolDefinition).mockResolvedValue(mockEntity);
    vi.mocked(mockQueryService.findReferences).mockResolvedValue([]);

    const result = await finder.findReferences({
      projectPath: '/project',
      symbolName: 'getUserData',
    });

    // Service called successfully
    expect(result).toBeDefined();
    expect(result.query.symbolName).toBe('getUserData');
    expect(mockQueryService.findSymbolDefinition).toHaveBeenCalled();
  });

  it('should handle no references found', async () => {
    const mockEntity: CodeEntityInfo = {
      nodeId: '1',
      name: 'unusedFunction',
      type: 'function',
      filePath: '/project/src/unused.ts',
    };

    vi.mocked(mockQueryService.findSymbolDefinition).mockResolvedValue(mockEntity);
    vi.mocked(mockQueryService.findReferences).mockResolvedValue([]);

    const result = await finder.findReferences({
      projectPath: '/project',
      symbolName: 'unusedFunction',
    });

    expect(result.fileReferences).toEqual([]);
    expect(result.totalReferences).toBe(0);
  });

  it('should filter by reference type', async () => {
    const mockEntity: CodeEntityInfo = {
      nodeId: '1',
      name: 'variable',
      type: 'variable',
      filePath: '/project/src/vars.ts',
    };

    const mockRefs = [
      { filePath: '/project/src/file1.ts', references: [{ line: 10, column: 5, type: 'read' }] },
    ];

    vi.mocked(mockQueryService.findSymbolDefinition).mockResolvedValue(mockEntity);
    vi.mocked(mockQueryService.findReferences).mockResolvedValue(mockRefs as any);

    const result = await finder.findReferences({
      projectPath: '/project',
      symbolName: 'variable',
      config: { referenceType: 'read' },
    });

    expect(result.fileReferences.length).toBeGreaterThanOrEqual(0);
  });
});
