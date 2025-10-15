import { Octokit } from '@octokit/rest';
import type { SimpleGit } from 'simple-git';

export interface WorkflowServiceDependencies {
  createGit: () => SimpleGit;
  createOctokit: () => Octokit;
  readFile: (path: string) => Promise<string>;
  writeFile: (path: string, content: string) => Promise<void>;
  ledgerPath: string;
  now: () => Date;
}

export interface StartTaskInput {
  taskId: string;
  owner: string;
  designDoc?: string;
  baseBranch?: string;
}

export interface BranchEntry {
  branch: string;
  task: string;
  owner: string;
  createdAt: string;
  status: string;
  designDoc: string;
  pr: string;
}

export interface StartTaskResult {
  branch: string;
  ledgerEntry: BranchEntry;
}

export interface SubmitForReviewInput {
  baseBranch?: string;
  remote?: string;
  title?: string;
  body?: string;
  reviewers?: string[];
  draft?: boolean;
  confirm?: boolean;
}

export interface SubmitForReviewResult {
  branch: string;
  remote: string;
  baseBranch: string;
  pushed: boolean;
  prUrl?: string;
  prNumber?: number;
  message: string;
}

const LEDGER_HEADER_LINES = [
  '# Branch Ledger',
  '',
  '| Branch | Task | Owner | Created At | Status | Design Doc | PR |',
  '| ------ | ---- | ----- | ---------- | ------ | ---------- | -- |',
];

const LEDGER_HEADER = `${LEDGER_HEADER_LINES.join('\n')}\n`;

const DEFAULT_STATUS_IN_PROGRESS = 'In Progress';
const DEFAULT_STATUS_REVIEW = 'Review';

const sanitizeCell = (value: string | undefined | null): string =>
  value && value.trim().length > 0 ? value.trim().replace(/\|/g, '\\|') : '-';

const trimPipes = (value: string): string[] =>
  value
    .split('|')
    .map((part) => part.trim())
    .filter((part) => part.length > 0);

const sanitizeTaskId = (taskId: string): string =>
  taskId
    .trim()
    .replace(/\s+/g, '-')
    .replace(/[^a-zA-Z0-9\-_]/g, '-');

export class WorkflowService {
  private readonly deps: WorkflowServiceDependencies;

  constructor(deps: WorkflowServiceDependencies) {
    this.deps = deps;
  }

  async startTask(input: StartTaskInput): Promise<StartTaskResult> {
    const now = this.deps.now();
    const baseBranch = input.baseBranch ?? 'main';
    const branchName = this.buildBranchName(input.taskId, now);

    const git = this.deps.createGit();
    await git.checkout(baseBranch);
    await git.checkout(['-b', branchName]);

    const ledgerEntries = await this.readLedgerEntries();
    const updatedEntry = this.upsertEntry(ledgerEntries, branchName, {
      task: input.taskId,
      owner: input.owner,
      createdAt: now.toISOString(),
      status: DEFAULT_STATUS_IN_PROGRESS,
      designDoc: input.designDoc ?? '-',
      pr: '-',
    });
    await this.writeLedgerEntries(ledgerEntries);

    return { branch: branchName, ledgerEntry: updatedEntry };
  }

  async submitForReview(input: SubmitForReviewInput = {}): Promise<SubmitForReviewResult> {
    const baseBranch = input.baseBranch ?? 'main';
    const remote = input.remote ?? 'origin';
    const confirm = input.confirm ?? false;
    const draft = input.draft ?? false;

    const git = this.deps.createGit();
    const status = await git.status();
    const isClean =
      typeof status.isClean === 'function' ? status.isClean() : status.files.length === 0;
    if (!isClean) {
      throw new Error('工作区存在未提交的改动，请先提交或暂存后再提交审查。');
    }

    const branch = await git.revparse(['--abbrev-ref', 'HEAD']);
    if (branch === baseBranch) {
      throw new Error(`当前分支 ${branch} 不应直接提交审查，请先切换到 feature 分支。`);
    }

    const previewMessage = [
      `准备推送 ${branch} 到 ${remote} 并向 ${baseBranch} 创建 PR。`,
      '若确认无误，请再次调用并设置 confirm=true。',
    ].join('\n');

    if (!confirm) {
      return {
        branch,
        remote,
        baseBranch,
        pushed: false,
        message: previewMessage,
      };
    }

    await git.push(remote, branch);
    const { owner, repo } = await this.resolveRemote(git, remote);
    const octokit = this.deps.createOctokit();
    const ledgerEntries = await this.readLedgerEntries();
    const ledgerEntry = ledgerEntries.find((entry) => entry.branch === branch);

    const title = input.title ?? this.buildDefaultPrTitle(ledgerEntry);
    const body = input.body ?? this.buildDefaultPrBody(ledgerEntry);

    const response = await octokit.pulls.create({
      owner,
      repo,
      title,
      head: branch,
      base: baseBranch,
      body,
      draft,
    });

    this.upsertEntry(ledgerEntries, branch, {
      status: DEFAULT_STATUS_REVIEW,
      pr: response.data.html_url,
    });
    await this.writeLedgerEntries(ledgerEntries);

    if (input.reviewers && input.reviewers.length > 0) {
      await octokit.pulls.requestReviewers({
        owner,
        repo,
        pull_number: response.data.number,
        reviewers: input.reviewers,
      });
    }

    return {
      branch,
      remote,
      baseBranch,
      pushed: true,
      prUrl: response.data.html_url,
      prNumber: response.data.number,
      message: `分支已推送并创建 PR：${response.data.html_url}`,
    };
  }

  private buildBranchName(taskId: string, now: Date): string {
    const dateSegment = now.toISOString().slice(0, 10);
    const sanitized = sanitizeTaskId(taskId);
    return `feature/${sanitized}-${dateSegment}`;
  }

  private async readLedgerEntries(): Promise<BranchEntry[]> {
    let raw: string;
    try {
      raw = await this.deps.readFile(this.deps.ledgerPath);
    } catch (error: unknown) {
      if (
        typeof error === 'object' &&
        error !== null &&
        'code' in error &&
        (error as { code?: string }).code === 'ENOENT'
      ) {
        await this.deps.writeFile(this.deps.ledgerPath, LEDGER_HEADER);
        return [];
      }
      throw error;
    }

    const lines = raw.split('\n');
    const entries: BranchEntry[] = [];
    for (const line of lines) {
      const trimmed = line.trim();
      if (!trimmed.startsWith('|')) {
        continue;
      }
      if (trimmed.startsWith('| Branch') || trimmed.startsWith('| ------')) {
        continue;
      }

      const cells = trimPipes(trimmed);
      if (cells.length !== 7) {
        continue;
      }

      entries.push({
        branch: cells[0],
        task: cells[1],
        owner: cells[2],
        createdAt: cells[3],
        status: cells[4],
        designDoc: cells[5],
        pr: cells[6],
      });
    }
    return entries;
  }

  private async writeLedgerEntries(entries: BranchEntry[]): Promise<void> {
    const rows = entries.map((entry) =>
      [
        entry.branch,
        entry.task,
        entry.owner,
        entry.createdAt,
        entry.status,
        entry.designDoc,
        entry.pr,
      ].map(sanitizeCell),
    );

    const body =
      rows.length === 0 ? '' : `${rows.map((cells) => `| ${cells.join(' | ')} |`).join('\n')}\n`;

    await this.deps.writeFile(this.deps.ledgerPath, `${LEDGER_HEADER}${body}`);
  }

  private upsertEntry(
    entries: BranchEntry[],
    branch: string,
    updates: Partial<BranchEntry> & { task?: string; createdAt?: string },
  ): BranchEntry {
    const index = entries.findIndex((entry) => entry.branch === branch);
    if (index === -1) {
      const newEntry: BranchEntry = {
        branch,
        task: updates.task ?? '-',
        owner: updates.owner ?? '-',
        createdAt: updates.createdAt ?? this.deps.now().toISOString(),
        status: updates.status ?? DEFAULT_STATUS_IN_PROGRESS,
        designDoc: updates.designDoc ?? '-',
        pr: updates.pr ?? '-',
      };
      entries.push(newEntry);
      return newEntry;
    }

    const existing = entries[index];
    const merged: BranchEntry = {
      branch: existing.branch,
      task: updates.task ?? existing.task,
      owner: updates.owner ?? existing.owner,
      createdAt: updates.createdAt ?? existing.createdAt,
      status: updates.status ?? existing.status,
      designDoc: updates.designDoc ?? existing.designDoc,
      pr: updates.pr ?? existing.pr,
    };
    entries[index] = merged;
    return merged;
  }

  private async resolveRemote(
    git: SimpleGit,
    remote: string,
  ): Promise<{ owner: string; repo: string }> {
    const rawUrl = await git.remote(['get-url', remote]);
    const url = (rawUrl || '').trim();
    const sanitized = url.endsWith('.git') ? url.slice(0, -4) : url;

    if (sanitized.startsWith('git@')) {
      const [, pathPart] = sanitized.split(':');
      const [owner, repo] = pathPart.split('/');
      if (!owner || !repo) {
        throw new Error(`无法从远端地址解析仓库信息：${url}`);
      }
      return { owner, repo };
    }

    try {
      const parsed = new URL(sanitized);
      const segments = parsed.pathname.replace(/^\/+/, '').split('/');
      const [owner, repo] = segments;
      if (!owner || !repo) {
        throw new Error(`无法从远端地址解析仓库信息：${url}`);
      }
      return { owner, repo };
    } catch {
      throw new Error(`无法识别的远端地址：${url}`);
    }
  }

  private buildDefaultPrTitle(entry: BranchEntry | undefined): string {
    if (!entry) {
      return 'Ready for review';
    }
    return `[${entry.task}] ${entry.status === DEFAULT_STATUS_REVIEW ? 'Follow-up' : 'Ready for review'}`;
  }

  private buildDefaultPrBody(entry: BranchEntry | undefined): string {
    if (!entry) {
      return '## Summary\n- 请补充任务背景与变更说明。\n';
    }

    return [
      '## Summary',
      `- 任务：${entry.task}`,
      `- 设计文档：${entry.designDoc}`,
      '',
      '## Checklist',
      '- [ ] 自检通过',
      '- [ ] 单元测试通过',
    ].join('\n');
  }
}
