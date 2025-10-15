import type { GitFingerprint } from '../shared/gitFingerprint.js';

export type { GitFingerprint };

export interface IndexMetadata {
  schemaVersion: number;
  state: 'complete';
  projectPath: string;
  projectHash: string;
  indexedAt: string;
  fileCount: number;
  fingerprint: GitFingerprint & { value: string };
  versions: {
    synapseArchitect?: string;
    synapsedb?: string;
    repomix?: string;
  };
  output: {
    dbFile: string;
  };
}
