import { describe, it, expect, vi, beforeEach } from 'vitest';
import { RelatedFilesScorer } from '../../src/services/relatedFilesScorer.js';
import type { QueryService } from '../../src/domain/query/queryService.js';

describe('RelatedFilesScorer', () => {
  let scorer: RelatedFilesScorer;
  let mockQueryService: QueryService;

  beforeEach(() => {
    mockQueryService = {
      findRelatedFiles: vi.fn(),
      findFacts: vi.fn(),
    } as unknown as QueryService;

    scorer = new RelatedFilesScorer({ queryService: mockQueryService });
  });

  it('should find and score related files', async () => {
    vi.mocked(mockQueryService.findFacts).mockResolvedValue([]);

    const result = await scorer.scoreRelatedFiles({
      projectPath: '/project',
      filePath: '/project/src/target.ts',
    });

    expect(result).toBeDefined();
    expect(result.targetFile).toBe('/project/src/target.ts');
    expect(mockQueryService.findFacts).toHaveBeenCalled();
  });

  it('should handle no related files', async () => {
    vi.mocked(mockQueryService.findFacts).mockResolvedValue([]);

    const result = await scorer.scoreRelatedFiles({
      projectPath: '/project',
      filePath: '/project/src/isolated.ts',
    });

    expect(result.scoredFiles).toEqual([]);
  });

  it('should sort files by score', async () => {
    vi.mocked(mockQueryService.findFacts).mockResolvedValue([]);

    const result = await scorer.scoreRelatedFiles({
      projectPath: '/project',
      filePath: '/project/src/target.ts',
    });

    // Check if sorted in descending order
    for (let i = 0; i < result.scoredFiles.length - 1; i++) {
      expect(result.scoredFiles[i].score).toBeGreaterThanOrEqual(result.scoredFiles[i + 1].score);
    }
  });
});
