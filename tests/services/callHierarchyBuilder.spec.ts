import { describe, it, expect, vi, beforeEach } from 'vitest';
import { CallHierarchyBuilder } from '../../src/services/callHierarchyBuilder.js';
import type { QueryService, CodeEntityInfo } from '../../src/domain/query/queryService.js';

describe('CallHierarchyBuilder', () => {
  let builder: CallHierarchyBuilder;
  let mockQueryService: QueryService;

  beforeEach(() => {
    mockQueryService = {
      getCallHierarchy: vi.fn(),
      findSymbolDefinition: vi.fn(),
    } as unknown as QueryService;

    builder = new CallHierarchyBuilder({ queryService: mockQueryService });
  });

  it('should build call hierarchy for callers direction', async () => {
    const mockEntity: CodeEntityInfo = {
      nodeId: '1',
      name: 'target',
      type: 'function',
      filePath: '/project/src/target.ts',
    };

    const mockHierarchyNode = {
      entity: mockEntity,
      callers: [],
      callees: [],
    };

    vi.mocked(mockQueryService.findSymbolDefinition).mockResolvedValue(mockEntity);
    vi.mocked(mockQueryService.getCallHierarchy).mockResolvedValue(mockHierarchyNode as any);

    const result = await builder.buildHierarchy({
      projectPath: '/project',
      symbolName: 'target',
      direction: 'callers',
      config: { direction: 'callers' },
    });

    expect(result).toBeDefined();
    expect(result.query.direction).toBe('callers');
  });

  it('should build call hierarchy for callees direction', async () => {
    const mockEntity: CodeEntityInfo = {
      nodeId: '1',
      name: 'target',
      type: 'function',
      filePath: '/project/src/target.ts',
    };

    const mockHierarchyNode = {
      entity: mockEntity,
      callers: [],
      callees: [],
    };

    vi.mocked(mockQueryService.findSymbolDefinition).mockResolvedValue(mockEntity);
    vi.mocked(mockQueryService.getCallHierarchy).mockResolvedValue(mockHierarchyNode as any);

    const result = await builder.buildHierarchy({
      projectPath: '/project',
      symbolName: 'target',
      direction: 'callees',
      config: { direction: 'callees' },
    });

    expect(result).toBeDefined();
    expect(result.query.direction).toBe('callees');
  });

  it('should handle both directions', async () => {
    const mockEntity: CodeEntityInfo = {
      nodeId: '1',
      name: 'target',
      type: 'function',
      filePath: '/project/src/target.ts',
    };

    const mockHierarchyNode = {
      entity: mockEntity,
      callers: [],
      callees: [],
    };

    vi.mocked(mockQueryService.findSymbolDefinition).mockResolvedValue(mockEntity);
    vi.mocked(mockQueryService.getCallHierarchy).mockResolvedValue(mockHierarchyNode as any);

    const result = await builder.buildHierarchy({
      projectPath: '/project',
      symbolName: 'target',
      direction: 'both',
      config: { direction: 'both' },
    });

    expect(result).toBeDefined();
    expect(result.query.direction).toBe('both');
  });
});
