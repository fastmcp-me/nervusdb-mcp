import { mkdtemp, readFile, rm } from 'node:fs/promises';
import path from 'node:path';
import { tmpdir } from 'node:os';

import { describe, expect, it, vi } from 'vitest';

import { IndexingService } from '../../../src/domain/indexing/indexingService.js';
import type { PackResult } from 'repomix';

const createPackResult = (projectPath: string): PackResult => ({
  totalFiles: 1,
  totalCharacters: 12,
  totalTokens: 3,
  fileCharCounts: {},
  fileTokenCounts: {},
  gitDiffTokenCount: 0,
  gitLogTokenCount: 0,
  suspiciousFilesResults: [],
  suspiciousGitDiffResults: [],
  suspiciousGitLogResults: [],
  processedFiles: [
    {
      path: path.join(projectPath, 'src/index.ts'),
      content: 'console.log("hi")',
    },
  ],
  safeFilePaths: [],
  skippedFiles: [],
});

describe('IndexingService', () => {
  it('constructs shadow index and writes metadata atomically', async () => {
    const workspace = await mkdtemp(path.join(tmpdir(), 'synapse-architect-test-'));
    const projectPath = workspace;

    const packMock = vi.fn().mockResolvedValue(createPackResult(projectPath));
    const addFact = vi.fn();
    const flush = vi.fn().mockResolvedValue(undefined);
    const close = vi.fn().mockResolvedValue(undefined);
    const openDatabase = vi.fn().mockResolvedValue({ addFact, flush, close });
    const getGitFingerprint = vi
      .fn()
      .mockResolvedValue({ commit: 'abc123', branch: 'main', dirty: false });

    const service = new IndexingService(
      { dbRoot: path.join(workspace, '.synapsedb') },
      {
        pack: packMock,
        openDatabase,
        getGitFingerprint,
        uuid: () => 'uuid-test',
      },
    );

    const result = await service.index(projectPath);

    // projectHash is now based on directory basename, not SHA1
    const basename = path.basename(path.resolve(projectPath));
    const projectHash = basename
      .toLowerCase()
      .replace(/[^a-z0-9-_]/g, '-')
      .replace(/-+/g, '-')
      .replace(/^-|-$/g, '');
    const expectedDir = path.join(workspace, '.synapsedb', projectHash);

    expect(result.projectDir).toBe(expectedDir);
    expect(result.processedFiles).toBe(1);
    expect(addFact).toHaveBeenCalled();
    expect(flush).toHaveBeenCalled();
    expect(close).toHaveBeenCalled();

    const metadataRaw = await readFile(path.join(expectedDir, 'metadata.json'), 'utf8');
    const metadata = JSON.parse(metadataRaw) as { fingerprint: { value: string }; state: string };

    expect(metadata.state).toBe('complete');
    expect(metadata.fingerprint.value).toBe('abc123');

    await rm(workspace, { recursive: true, force: true });
  });
});
