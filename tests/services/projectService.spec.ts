import { describe, expect, it, vi } from 'vitest';

import { ProjectService } from '../../src/services/projectService.js';

const createPackResult = () => ({
  totalFiles: 2,
  totalCharacters: 42,
  totalTokens: 12,
  fileCharCounts: {
    '/repo/src/index.ts': 20,
    '/repo/src/utils.ts': 22,
  },
  fileTokenCounts: {
    '/repo/src/index.ts': 5,
    '/repo/src/utils.ts': 7,
  },
  gitDiffTokenCount: 0,
  gitLogTokenCount: 0,
  suspiciousFilesResults: [],
  suspiciousGitDiffResults: [],
  suspiciousGitLogResults: [],
  processedFiles: [
    { path: '/repo/src/index.ts', content: '// comment\nexport const a = 1;\n' },
    { path: '/repo/src/utils.ts', content: 'export const b = 2;\n' },
  ],
  safeFilePaths: ['/repo/src/index.ts', '/repo/src/utils.ts'],
  skippedFiles: [],
});

describe('ProjectService', () => {
  it('getStructure 构建目录树并生成注释摘要', async () => {
    const pack = vi.fn().mockResolvedValue(createPackResult());
    const query = {
      findCallers: vi.fn(),
      findFacts: vi.fn(),
    } as any;

    const service = new ProjectService({
      pack,
      readFile: vi.fn(),
      query,
    });

    const result = await service.getStructure({ projectPath: '/repo', withComments: true });

    expect(pack).toHaveBeenCalled();
    expect(result.summary.totalFiles).toBe(2);
    expect(result.summary.commentsIncluded).toBe(true);
    expect(result.files[0].commentsPreview?.[0]).toContain('// comment');
    expect(result.tree[0].children?.[0].path).toBe('src/index.ts');
  });

  it('findRelatedFiles 根据事实评分', async () => {
    const query = {
      findCallers: vi.fn(),
      findFacts: vi
        .fn()
        .mockResolvedValueOnce([
          { subject: 'file:src/index.ts', predicate: 'IMPORTS', object: 'file:src/utils.ts' },
        ])
        .mockResolvedValueOnce([
          { subject: 'file:src/utils.ts', predicate: 'IMPORTED_BY', object: 'file:src/index.ts' },
        ]),
    } as any;

    const service = new ProjectService({
      pack: vi.fn(),
      readFile: vi.fn(),
      query,
    });

    const result = await service.findRelatedFiles({
      projectPath: '/repo',
      filePath: 'src/index.ts',
      limit: 5,
    });

    expect(query.findFacts).toHaveBeenCalledTimes(2);
    expect(result.related[0].file).toBe('file:src/utils.ts');
    expect(result.related[0].score).toBeGreaterThan(0);
  });
});
