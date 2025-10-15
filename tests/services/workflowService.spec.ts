import { describe, expect, it, vi } from 'vitest';

import { WorkflowService } from '../../src/services/workflowService.js';

const LEDGER_HEADER = [
  '# Branch Ledger',
  '',
  '| Branch | Task | Owner | Created At | Status | Design Doc | PR |',
  '| ------ | ---- | ----- | ---------- | ------ | ---------- | -- |',
  '',
].join('\n');

const createLedgerWithEntry = (entry: string) => `${LEDGER_HEADER}${entry}\n`;

const createServiceContext = (
  options: {
    initialLedger?: string;
    now?: Date;
    remoteUrl?: string;
  } = {},
) => {
  const now = options.now ?? new Date('2025-01-01T00:00:00.000Z');
  let ledger = options.initialLedger ?? LEDGER_HEADER;
  const readFile = vi.fn().mockImplementation(async () => ledger);
  const writeFile = vi.fn().mockImplementation(async (_path: string, content: string) => {
    ledger = content;
  });

  const checkout = vi.fn().mockResolvedValue(undefined);
  const status = vi.fn().mockResolvedValue({ isClean: () => true });
  const revparse = vi.fn().mockResolvedValue('feature/test-branch');
  const push = vi.fn().mockResolvedValue(undefined);
  const remote = vi
    .fn()
    .mockResolvedValue(options.remoteUrl ?? 'https://github.com/example/repo.git');

  const createGit = () =>
    ({
      checkout,
      status,
      revparse,
      push,
      remote,
    }) as any;

  const pulls = {
    create: vi.fn().mockResolvedValue({
      data: { html_url: 'https://github.com/example/repo/pull/1', number: 1 },
    }),
    requestReviewers: vi.fn().mockResolvedValue(undefined),
  };

  const createOctokit = () =>
    ({
      pulls,
    }) as any;

  const deps = {
    createGit,
    createOctokit,
    readFile,
    writeFile,
    ledgerPath: 'docs/BRANCHES.md',
    now: () => now,
  };

  const service = new WorkflowService(deps);

  return {
    service,
    deps,
    checkout,
    status,
    revparse,
    push,
    remote,
    readFile,
    writeFile,
    getLedger: () => ledger,
    setLedger: (value: string) => {
      ledger = value;
    },
    pulls,
  };
};

describe('WorkflowService', () => {
  it('startTask 创建分支并更新分支台账', async () => {
    const context = createServiceContext();
    const result = await context.service.startTask({
      taskId: 'B-1',
      owner: 'alice',
      designDoc: 'docs/design.md',
    });

    expect(context.checkout).toHaveBeenNthCalledWith(1, 'main');
    expect(context.checkout).toHaveBeenNthCalledWith(2, ['-b', 'feature/B-1-2025-01-01']);
    expect(result.branch).toBe('feature/B-1-2025-01-01');
    expect(result.ledgerEntry.owner).toBe('alice');
    expect(context.getLedger()).toContain(
      '| feature/B-1-2025-01-01 | B-1 | alice | 2025-01-01T00:00:00.000Z | In Progress | docs/design.md | - |',
    );
  });

  it('startTask 在缺失台账文件时初始化表头', async () => {
    const context = createServiceContext();
    context.readFile.mockRejectedValueOnce(Object.assign(new Error('missing'), { code: 'ENOENT' }));

    await context.service.startTask({ taskId: 'B-2', owner: 'bob' });

    expect(context.writeFile).toHaveBeenCalled();
    expect(context.getLedger()).toContain('| feature/B-2-2025-01-01 | B-2 | bob |');
  });

  it('submitForReview 在 confirm=false 时仅返回预检信息', async () => {
    const context = createServiceContext();

    const result = await context.service.submitForReview({ confirm: false });

    expect(result.pushed).toBe(false);
    expect(result.message).toContain('准备推送');
    expect(context.push).not.toHaveBeenCalled();
  });

  it('submitForReview 推送分支并创建 PR，更新台账状态', async () => {
    const ledgerRow =
      '| feature/test-branch | TASK-7 | alice | 2025-01-01T00:00:00.000Z | In Progress | docs/design.md | - |';
    const context = createServiceContext({
      initialLedger: createLedgerWithEntry(ledgerRow),
    });

    const result = await context.service.submitForReview({
      confirm: true,
      reviewers: ['bob'],
    });

    expect(context.push).toHaveBeenCalledWith('origin', 'feature/test-branch');
    expect(result.pushed).toBe(true);
    expect(result.prUrl).toBe('https://github.com/example/repo/pull/1');
    expect(context.pulls.create).toHaveBeenCalledWith({
      owner: 'example',
      repo: 'repo',
      title: expect.stringContaining('TASK-7'),
      head: 'feature/test-branch',
      base: 'main',
      body: expect.stringContaining('TASK-7'),
      draft: false,
    });
    expect(context.pulls.requestReviewers).toHaveBeenCalledWith({
      owner: 'example',
      repo: 'repo',
      pull_number: 1,
      reviewers: ['bob'],
    });
    expect(context.getLedger()).toContain(
      '| feature/test-branch | TASK-7 | alice | 2025-01-01T00:00:00.000Z | Review | docs/design.md | https://github.com/example/repo/pull/1 |',
    );
  });

  it('submitForReview 在工作区脏时抛出异常', async () => {
    const context = createServiceContext();
    context.status.mockResolvedValueOnce({ isClean: () => false });

    await expect(context.service.submitForReview({ confirm: true })).rejects.toThrow(
      '工作区存在未提交的改动',
    );
  });

  it('submitForReview 在当前分支为基线时抛出异常', async () => {
    const context = createServiceContext();
    context.revparse.mockResolvedValueOnce('main');

    await expect(context.service.submitForReview({ confirm: true })).rejects.toThrow(
      '当前分支 main 不应直接提交审查',
    );
  });
});
