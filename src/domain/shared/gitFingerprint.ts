import path from 'node:path';

import simpleGitFactory from 'simple-git';

export interface GitFingerprint {
  commit?: string;
  branch?: string;
  dirty: boolean;
}

export async function computeGitFingerprint(projectPath: string): Promise<GitFingerprint> {
  const git = simpleGitFactory({ baseDir: projectPath });

  try {
    const isRepo = await git.checkIsRepo();
    if (!isRepo) {
      return { dirty: false };
    }

    const [commit, branch, status] = await Promise.all([
      git.revparse(['HEAD']),
      git.revparse(['--abbrev-ref', 'HEAD']),
      git.status(),
    ]);

    return {
      commit,
      branch,
      dirty: status.files.length > 0,
    };
  } catch {
    return {
      dirty: false,
    };
  }
}

export function formatFingerprint(fingerprint: GitFingerprint): string {
  if (fingerprint.commit) {
    const dirtySuffix = fingerprint.dirty ? '+dirty' : '';
    return `${fingerprint.commit}${dirtySuffix}`;
  }

  return fingerprint.dirty ? 'filesystem+dirty' : 'filesystem';
}

/**
 * Get project directory name from path
 * Uses the project's basename for easy identification
 */
export function projectHash(projectPath: string): string {
  const resolved = path.resolve(projectPath);
  const basename = path.basename(resolved);

  // Sanitize the name: remove special chars, replace spaces with hyphens
  return basename
    .toLowerCase()
    .replace(/[^a-z0-9-_]/g, '-')
    .replace(/-+/g, '-')
    .replace(/^-|-$/g, '');
}
