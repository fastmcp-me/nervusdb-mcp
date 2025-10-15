import { readFile } from 'node:fs/promises';
import path from 'node:path';

import type { IndexMetadata } from '../types/indexMetadata.js';
import {
  computeGitFingerprint,
  formatFingerprint,
  projectHash,
  type GitFingerprint,
} from '../shared/gitFingerprint.js';
import { FingerprintMismatchError, IndexNotFoundError } from './errors.js';
import { createChildLogger } from '../../utils/logger.js';

const logger = createChildLogger({ service: 'FingerprintService' });

export interface IndexRebuildCallback {
  (projectPath: string): Promise<IndexMetadata>;
}

interface FingerprintServiceOptions {
  dbRoot?: string;
  autoRebuild?: boolean; // 是否自动重建索引
  rebuildCallback?: IndexRebuildCallback; // 重建索引的回调
}

interface FingerprintDependencies {
  readFile: typeof readFile;
  computeFingerprint: (projectPath: string) => Promise<GitFingerprint>;
}

export class FingerprintService {
  private readonly dbRoot: string;
  private readonly deps: FingerprintDependencies;
  private readonly autoRebuild: boolean;
  private readonly rebuildCallback?: IndexRebuildCallback;

  constructor(options: FingerprintServiceOptions = {}, deps?: Partial<FingerprintDependencies>) {
    const home = process.env.HOME || process.env.USERPROFILE || '/tmp';
    this.dbRoot = options.dbRoot ?? process.env.NERVUSDB_ROOT ?? path.join(home, '.nervusdb');
    this.autoRebuild = options.autoRebuild ?? false;
    this.rebuildCallback = options.rebuildCallback;
    this.deps = {
      readFile,
      computeFingerprint: computeGitFingerprint,
      ...deps,
    };
  }

  async validate(projectPath: string): Promise<IndexMetadata> {
    const resolved = path.resolve(projectPath);
    const hash = projectHash(resolved);
    const metadataPath = path.join(this.dbRoot, hash, 'metadata.json');

    logger.debug({ projectPath: resolved, hash }, 'Validating project fingerprint');

    let metadata: IndexMetadata;
    try {
      const raw = await this.deps.readFile(metadataPath, 'utf8');
      metadata = JSON.parse(raw) as IndexMetadata;
    } catch (error) {
      if ((error as NodeJS.ErrnoException).code === 'ENOENT') {
        logger.warn({ projectPath: resolved }, 'Index not found');
        throw new IndexNotFoundError();
      }
      logger.error({ err: error, projectPath: resolved }, 'Failed to read metadata');
      throw error;
    }

    if (metadata.state !== 'complete') {
      logger.warn({ projectPath: resolved, state: metadata.state }, 'Index incomplete');
      throw new IndexNotFoundError('索引未完成，无法提供知识图谱查询');
    }

    const fingerprint = await this.deps.computeFingerprint(resolved);
    const expected = formatFingerprint(fingerprint);

    if (metadata.fingerprint.value !== expected) {
      logger.warn(
        { projectPath: resolved, expected, actual: metadata.fingerprint.value },
        'Fingerprint mismatch detected',
      );

      // 如果启用自动重建且提供了回调，尝试自动重建索引
      if (this.autoRebuild && this.rebuildCallback) {
        logger.info({ projectPath: resolved }, 'Auto-rebuilding index due to fingerprint mismatch');
        try {
          const newMetadata = await this.rebuildCallback(resolved);
          logger.info(
            { projectPath: resolved, newFingerprint: newMetadata.fingerprint.value },
            'Index auto-rebuild completed successfully',
          );
          return newMetadata;
        } catch (rebuildError) {
          logger.error(
            { err: rebuildError, projectPath: resolved },
            'Auto-rebuild failed, falling back to error',
          );
          throw new FingerprintMismatchError(
            `检测到索引版本过期（当前：${expected}，索引：${metadata.fingerprint.value}）。自动重建失败：${rebuildError instanceof Error ? rebuildError.message : String(rebuildError)}`,
          );
        }
      }

      throw new FingerprintMismatchError(
        `检测到索引版本过期（当前：${expected}，索引：${metadata.fingerprint.value}）`,
      );
    }

    logger.debug({ projectPath: resolved, fingerprint: expected }, 'Fingerprint validation passed');
    return metadata;
  }
}
