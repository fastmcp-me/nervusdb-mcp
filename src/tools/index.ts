import type { McpServer } from '@modelcontextprotocol/sdk/server/mcp.js';

import { registerWorkflowTools, type WorkflowToolDependencies } from './workflow.js';
import { registerProjectTools, type ProjectToolDependencies } from './project.js';
import { registerCodeTools, type CodeToolDependencies } from './code.js';
import { registerDbTools, type DbToolDependencies } from './db.js';
import { QueryService } from '../domain/query/queryService.js';
import { ProjectService } from '../services/projectService.js';

export interface RegisterToolsOptions {
  workflow?: Partial<WorkflowToolDependencies>;
  project?: Partial<ProjectToolDependencies>;
  code?: Partial<CodeToolDependencies>;
  db: DbToolDependencies;
}

export function registerTools(server: McpServer, options: RegisterToolsOptions): void {
  registerWorkflowTools(server, options.workflow);

  const queryService =
    options.project?.serviceDeps?.query ??
    new QueryService({ fingerprint: options.db.fingerprint });

  const projectService =
    options.project?.service ??
    new ProjectService({
      ...options.project?.serviceDeps,
      query: queryService,
    });

  registerProjectTools(server, { service: projectService });
  registerCodeTools(server, { ...options.code, projectService, queryService });
  registerDbTools(server, options.db);
}
