import { mkdir, mkdtemp, rm, writeFile } from 'node:fs/promises';
import path from 'node:path';
import { tmpdir } from 'node:os';

import { describe, expect, it, vi } from 'vitest';

import { FingerprintService } from '../../../src/domain/fingerprint/fingerprintService.js';
import {
  FingerprintMismatchError,
  IndexNotFoundError,
} from '../../../src/domain/fingerprint/errors.js';
import type { IndexMetadata } from '../../../src/domain/types/indexMetadata.js';
import { projectHash } from '../../../src/domain/shared/gitFingerprint.js';

const createMetadata = (overrides: Partial<IndexMetadata> = {}): IndexMetadata => ({
  schemaVersion: 1,
  state: 'complete',
  projectPath: '/repo',
  projectHash: 'hash',
  indexedAt: new Date().toISOString(),
  fileCount: 1,
  fingerprint: {
    value: 'abc123',
    commit: 'abc123',
    branch: 'main',
    dirty: false,
  },
  versions: {},
  output: {
    dbFile: '/repo/.synapsedb/hash/graph.synapsedb',
  },
  ...overrides,
});

describe('FingerprintService', () => {
  it('passes when fingerprint matches', async () => {
    const workspace = await mkdtemp(path.join(tmpdir(), 'fingerprint-pass-'));
    const dbRoot = path.join(workspace, '.synapsedb');
    const projectPath = path.join(workspace, 'project');
    const hash = projectHash(projectPath);
    const metadata = createMetadata({ projectHash: hash, projectPath });
    const metadataPath = path.join(dbRoot, hash, 'metadata.json');

    await mkdir(path.dirname(metadataPath), { recursive: true });
    await writeFile(metadataPath, JSON.stringify(metadata), 'utf8');

    const readFileMock = vi.fn().mockResolvedValue(JSON.stringify(metadata));
    const fingerprintMock = vi.fn().mockResolvedValue({ commit: 'abc123', dirty: false });

    const service = new FingerprintService(
      { dbRoot },
      {
        readFile: readFileMock,
        computeFingerprint: fingerprintMock,
      },
    );

    await expect(service.validate(projectPath)).resolves.toEqual(metadata);

    await rm(workspace, { recursive: true, force: true });
  });

  it('throws mismatch error when fingerprint differs', async () => {
    const workspace = await mkdtemp(path.join(tmpdir(), 'fingerprint-mismatch-'));
    const dbRoot = path.join(workspace, '.synapsedb');
    const projectPath = '/repo';
    const hash = projectHash(projectPath);
    const metadata = createMetadata({
      projectHash: hash,
      projectPath,
      fingerprint: { value: 'abc123', commit: 'abc123', branch: 'main', dirty: false },
    });
    const metadataPath = path.join(dbRoot, hash, 'metadata.json');
    await mkdir(path.dirname(metadataPath), { recursive: true });
    await writeFile(metadataPath, JSON.stringify(metadata), 'utf8');

    const service = new FingerprintService(
      { dbRoot },
      {
        readFile: async () => JSON.stringify(metadata),
        computeFingerprint: async () => ({ commit: 'zzz999', dirty: false }),
      },
    );

    await expect(service.validate(projectPath)).rejects.toBeInstanceOf(FingerprintMismatchError);

    await rm(workspace, { recursive: true, force: true });
  });

  it('auto-rebuilds when fingerprint mismatch and auto-rebuild enabled', async () => {
    const workspace = await mkdtemp(path.join(tmpdir(), 'fingerprint-auto-rebuild-'));
    const dbRoot = path.join(workspace, '.nervusdb');
    const projectPath = '/repo';
    const hash = projectHash(projectPath);
    const oldMetadata = createMetadata({
      projectHash: hash,
      projectPath,
      fingerprint: { value: 'abc123', commit: 'abc123', branch: 'main', dirty: false },
    });
    const newMetadata = createMetadata({
      projectHash: hash,
      projectPath,
      fingerprint: { value: 'zzz999', commit: 'zzz999', branch: 'main', dirty: false },
    });
    const metadataPath = path.join(dbRoot, hash, 'metadata.json');
    await mkdir(path.dirname(metadataPath), { recursive: true });
    await writeFile(metadataPath, JSON.stringify(oldMetadata), 'utf8');

    const rebuildCallback = vi.fn().mockResolvedValue(newMetadata);
    const service = new FingerprintService(
      { dbRoot, autoRebuild: true, rebuildCallback },
      {
        readFile: async () => JSON.stringify(oldMetadata),
        computeFingerprint: async () => ({ commit: 'zzz999', dirty: false }),
      },
    );

    const result = await service.validate(projectPath);

    expect(rebuildCallback).toHaveBeenCalledWith(projectPath);
    expect(result).toEqual(newMetadata);

    await rm(workspace, { recursive: true, force: true });
  });

  it('throws when metadata missing', async () => {
    const service = new FingerprintService(
      { dbRoot: '/non/existent' },
      {
        readFile: async () => {
          const error = new Error('no file') as NodeJS.ErrnoException;
          error.code = 'ENOENT';
          throw error;
        },
        computeFingerprint: async () => ({ dirty: false }),
      },
    );

    await expect(service.validate('/repo')).rejects.toBeInstanceOf(IndexNotFoundError);
  });
});
