import { readFile, writeFile } from 'node:fs/promises';
import { execSync } from 'node:child_process';
import type { McpServer } from '@modelcontextprotocol/sdk/server/mcp.js';
import { Octokit } from '@octokit/rest';
import { z } from 'zod';
import simpleGitFactory from 'simple-git';

import {
  WorkflowService,
  type StartTaskInput,
  type SubmitForReviewInput,
  type WorkflowServiceDependencies,
} from '../services/workflowService.js';

/**
 * Get GitHub authentication token with multiple fallback strategies
 *
 * Priority order:
 * 1. GITHUB_TOKEN or GH_TOKEN environment variable (CI/CD friendly)
 * 2. gh CLI token (local development friendly)
 * 3. Throw error with clear instructions
 *
 * @param exec - Optional execSync function for dependency injection (testing)
 * @returns GitHub personal access token
 * @throws Error if no token found
 * @internal Exported for testing purposes
 */
export function getGitHubToken(exec: typeof execSync = execSync): string {
  // Priority 1: Environment variables (CI/CD friendly)
  const envToken = process.env.GITHUB_TOKEN || process.env.GH_TOKEN;
  if (envToken) {
    return envToken;
  }

  // Priority 2: gh CLI token (local development friendly)
  try {
    const token = exec('gh auth token', {
      encoding: 'utf8',
      stdio: ['pipe', 'pipe', 'pipe'], // Suppress stderr output
    }).trim();
    if (token && token.length > 0) {
      return token;
    }
  } catch {
    // gh CLI not installed or not authenticated, continue to error
  }

  // Priority 3: No token found, provide clear instructions
  throw new Error(
    '未找到 GitHub 认证 token。请选择以下任一方式：\n\n' +
      '方式1（推荐）：使用 gh CLI\n' +
      '  $ brew install gh          # macOS\n' +
      '  $ gh auth login           # 登录 GitHub\n\n' +
      '方式2：设置环境变量\n' +
      '  $ export GITHUB_TOKEN=ghp_xxx    # 临时\n' +
      '  或在 ~/.zshrc 中添加（永久）\n\n' +
      '方式3：CI/CD 环境\n' +
      '  在 GitHub Actions 中使用 secrets.GITHUB_TOKEN\n' +
      '  在 Docker 中传入 GITHUB_TOKEN 环境变量',
  );
}

const defaultServiceDeps: WorkflowServiceDependencies = {
  createGit: () => simpleGitFactory(),
  createOctokit: () => new Octokit({ auth: getGitHubToken() }),
  readFile: (path: string) => readFile(path, 'utf8'),
  writeFile: (path: string, content: string) => writeFile(path, content, 'utf8'),
  ledgerPath: 'docs/BRANCHES.md',
  now: () => new Date(),
};

export interface WorkflowToolDependencies {
  service?: WorkflowService;
  serviceDeps?: Partial<WorkflowServiceDependencies>;
}

const startTaskInputSchema = z
  .object({
    taskId: z.string().min(1).describe('Issue ID, e.g. B-42'),
    owner: z.string().min(1).describe('任务负责人'),
    designDoc: z.string().min(1).optional().describe('设计文档路径或链接'),
    baseBranch: z.string().default('main').describe('用于拉取新分支的基线分支'),
  })
  .strict();

const startTaskOutputSchema = z
  .object({
    branch: z.string(),
    ledgerEntry: z.object({
      branch: z.string(),
      task: z.string(),
      owner: z.string(),
      createdAt: z.string(),
      status: z.string(),
      designDoc: z.string(),
      pr: z.string(),
    }),
  })
  .strict();

const submitForReviewInputSchema = z
  .object({
    baseBranch: z.string().default('main'),
    remote: z.string().default('origin'),
    title: z.string().optional(),
    body: z.string().optional(),
    reviewers: z.array(z.string()).optional(),
    draft: z.boolean().default(false),
    confirm: z.boolean().default(false),
  })
  .strict();

const submitForReviewOutputSchema = z
  .object({
    branch: z.string(),
    remote: z.string(),
    baseBranch: z.string(),
    pushed: z.boolean(),
    prUrl: z.string().optional(),
    prNumber: z.number().optional(),
    message: z.string(),
  })
  .strict();

export function registerWorkflowTools(
  server: McpServer,
  deps: Partial<WorkflowToolDependencies> = {},
): void {
  const resolvedService =
    deps.service ??
    new WorkflowService({
      ...defaultServiceDeps,
      ...(deps.serviceDeps ?? {}),
    });

  server.registerTool(
    'workflow.startTask',
    {
      title: 'Start a New Task',
      description: '创建任务分支并登记分支台账。',
      inputSchema: startTaskInputSchema.shape,
      outputSchema: startTaskOutputSchema.shape,
    },
    async (rawInput) => {
      const input = startTaskInputSchema.parse(rawInput) as StartTaskInput;
      const result = await resolvedService.startTask(input);

      return {
        content: [
          {
            type: 'text',
            text: [
              `已基于 ${input.baseBranch ?? 'main'} 创建分支 ${result.branch}。`,
              'docs/BRANCHES.md 已记录任务元数据。',
            ].join('\n'),
          },
        ],
        structuredContent: {
          branch: result.branch,
          ledgerEntry: result.ledgerEntry,
        },
      };
    },
  );

  server.registerTool(
    'workflow.submitForReview',
    {
      title: 'Submit current branch for review',
      description: '推送当前分支、创建 PR，并更新分支台账状态。',
      inputSchema: submitForReviewInputSchema.shape,
      outputSchema: submitForReviewOutputSchema.shape,
    },
    async (rawInput) => {
      const input = submitForReviewInputSchema.parse(rawInput) as SubmitForReviewInput;
      const result = await resolvedService.submitForReview(input);
      const messages = [result.message];

      return {
        content: [
          {
            type: 'text',
            text: result.prUrl ? `${messages.join('\n')}` : messages.join('\n'),
          },
        ],
        structuredContent: result as unknown as { [x: string]: unknown },
      };
    },
  );
}
