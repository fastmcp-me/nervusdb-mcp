import { describe, expect, it, vi, beforeEach } from 'vitest';

import { getGitHubToken } from '../../src/tools/workflow.js';

// Save original environment variables
const originalEnv = { ...process.env };

describe('GitHub Token Authentication', () => {
  beforeEach(() => {
    // Restore environment variables
    process.env = { ...originalEnv };
    delete process.env.GITHUB_TOKEN;
    delete process.env.GH_TOKEN;
  });

  it('should use GITHUB_TOKEN environment variable first', () => {
    process.env.GITHUB_TOKEN = 'ghp_env_token';

    const mockExec = vi.fn();
    const token = getGitHubToken(mockExec as any);

    expect(token).toBe('ghp_env_token');
    // execSync should NOT be called when env var exists
    expect(mockExec).not.toHaveBeenCalled();
  });

  it('should use GH_TOKEN environment variable as fallback', () => {
    process.env.GH_TOKEN = 'ghp_gh_token';

    const mockExec = vi.fn();
    const token = getGitHubToken(mockExec as any);

    expect(token).toBe('ghp_gh_token');
    expect(mockExec).not.toHaveBeenCalled();
  });

  it('should prioritize GITHUB_TOKEN over GH_TOKEN', () => {
    process.env.GITHUB_TOKEN = 'ghp_primary_token';
    process.env.GH_TOKEN = 'ghp_secondary_token';

    const mockExec = vi.fn();
    const token = getGitHubToken(mockExec as any);

    expect(token).toBe('ghp_primary_token');
    expect(mockExec).not.toHaveBeenCalled();
  });

  it('should call gh CLI when no environment variable is set', () => {
    const mockExec = vi.fn().mockReturnValueOnce('ghp_gh_cli_token\n');

    const token = getGitHubToken(mockExec as any);

    expect(token).toBe('ghp_gh_cli_token');
    // execSync should be called with correct command
    expect(mockExec).toHaveBeenCalledWith('gh auth token', {
      encoding: 'utf8',
      stdio: ['pipe', 'pipe', 'pipe'],
    });
  });

  it('should throw error with instructions when no token available', () => {
    const mockExec = vi.fn().mockImplementationOnce(() => {
      throw new Error('gh not found');
    });

    // Should throw with helpful error message
    expect(() => getGitHubToken(mockExec as any)).toThrow('未找到 GitHub 认证 token');
    expect(() => getGitHubToken(mockExec as any)).toThrow('gh auth login');
    expect(() => getGitHubToken(mockExec as any)).toThrow('GITHUB_TOKEN');
    expect(() => getGitHubToken(mockExec as any)).toThrow('CI/CD');
  });

  it('should prioritize env var over gh CLI', () => {
    process.env.GITHUB_TOKEN = 'ghp_env_token';

    const mockExec = vi.fn().mockReturnValueOnce('ghp_gh_cli_token\n');

    const token = getGitHubToken(mockExec as any);

    expect(token).toBe('ghp_env_token');
    // execSync should NOT be called because env var has priority
    expect(mockExec).not.toHaveBeenCalled();
  });

  it('should handle empty gh CLI output gracefully', () => {
    const mockExec = vi.fn().mockReturnValueOnce('');

    // Should throw because empty token is invalid
    expect(() => getGitHubToken(mockExec as any)).toThrow('未找到 GitHub 认证 token');
  });

  it('should trim whitespace from gh CLI output', () => {
    const mockExec = vi.fn().mockReturnValueOnce(' ghp_gh_cli_token\n\n ');

    const token = getGitHubToken(mockExec as any);

    expect(token).toBe('ghp_gh_cli_token');
    // Ensure execSync was called correctly
    expect(mockExec).toHaveBeenCalledTimes(1);
  });
});
