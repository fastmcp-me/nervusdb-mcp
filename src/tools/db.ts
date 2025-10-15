import path from 'node:path';
import { stat } from 'node:fs/promises';

import type { McpServer } from '@modelcontextprotocol/sdk/server/mcp.js';
import { z } from 'zod';
import { NervusDB } from '@nervusdb/core';

import { FingerprintService } from '../domain/fingerprint/fingerprintService.js';
import { IndexMaintenanceService } from '../services/indexMaintenanceService.js';
import type { IndexMetadata } from '../domain/types/indexMetadata.js';
import { QueryExecutor } from '../domain/query/queryExecutor.js';
import { QueryRequestSchema } from '../domain/query/queryBuilder.js';

export interface DbToolDependencies {
  fingerprint: FingerprintService;
  openDatabase?: typeof NervusDB.open;
  indexMaintenance?: IndexMaintenanceService;
  queryExecutor?: QueryExecutor;
}

async function requireValidIndex(
  fingerprint: FingerprintService,
  projectPath: string,
  schema?: 'complete',
) {
  const meta = await fingerprint.validate(projectPath);
  if (schema && meta.state !== schema) {
    throw new Error(`索引状态异常：${meta.state}`);
  }
  return meta;
}

export function registerDbTools(server: McpServer, deps: DbToolDependencies): void {
  const openDatabase = deps.openDatabase ?? NervusDB.open.bind(NervusDB);
  const indexMaintenanceService = deps.indexMaintenance ?? new IndexMaintenanceService();
  const queryExecutor = deps.queryExecutor ?? new QueryExecutor();

  server.registerTool(
    'db.getStats',
    {
      title: 'Get graph index stats',
      description: 'Read metadata for indexed project',
      inputSchema: { projectPath: z.string() },
      outputSchema: {
        fileCount: z.number(),
        fingerprint: z.string(),
        projectHash: z.string(),
        indexedAt: z.string(),
        versions: z.record(z.string()).optional(),
        dbFile: z.string(),
        dbSizeBytes: z.number().optional(),
      },
    },
    async ({ projectPath }) => {
      const meta = await requireValidIndex(deps.fingerprint, projectPath, 'complete');
      const dbPath = path.resolve(meta.output.dbFile);
      const size = await safeStat(dbPath);
      const output = {
        fileCount: meta.fileCount,
        fingerprint: meta.fingerprint.value,
        projectHash: meta.projectHash,
        indexedAt: meta.indexedAt,
        versions: meta.versions,
        dbFile: dbPath,
        dbSizeBytes: size?.size,
      };
      return {
        content: [{ type: 'text', text: JSON.stringify(output) }],
        structuredContent: output as unknown as { [x: string]: unknown },
      };
    },
  );

  server.registerTool(
    'db.query',
    {
      title: 'Run graph query',
      description: 'Execute typed or raw queries against the knowledge graph',
      inputSchema: {
        projectPath: z.string(),
        query: QueryRequestSchema,
      },
      outputSchema: {
        facts: z.array(
          z.object({
            subject: z.string(),
            predicate: z.string(),
            object: z.string(),
            properties: z.record(z.unknown()).optional(),
          }),
        ),
        count: z.number(),
        hasMore: z.boolean(),
      },
    },
    async ({ projectPath, query }) => {
      const meta = await requireValidIndex(deps.fingerprint, projectPath, 'complete');
      const dbPath = path.resolve(meta.output.dbFile);
      const db = await openDatabase(dbPath, {
        enableLock: false,
        registerReader: false,
        experimental: { cypher: true },
      });
      try {
        const result = await queryExecutor.execute(db, query);

        // Monitor response size to detect potential token limit issues
        const resultJson = JSON.stringify(result);
        const responseSizeBytes = resultJson.length;
        const SIZE_WARNING_THRESHOLD = 1024 * 1024; // 1MB

        if (responseSizeBytes > SIZE_WARNING_THRESHOLD) {
          const sizeMB = (responseSizeBytes / (1024 * 1024)).toFixed(2);
          console.warn(
            `[db.query] Response size (${sizeMB}MB) exceeds 1MB threshold. ` +
              `This may cause MCP client token limit errors. Consider using LIMIT clause or db.getNodeDetails for large result sets.`,
          );
        }

        return {
          content: [{ type: 'text', text: JSON.stringify(result, null, 2) }],
          structuredContent: result as unknown as { [x: string]: unknown },
        };
      } finally {
        await db.close();
      }
    },
  );

  server.registerTool(
    'db.rebuildIndex',
    {
      title: 'Rebuild project index',
      description:
        'Trigger indexing service to rebuild shadow index for the project with telemetry.',
      inputSchema: { projectPath: z.string() },
      outputSchema: {
        processedFiles: z.number(),
        metadata: z.object({
          projectHash: z.string(),
          indexedAt: z.string(),
          fingerprint: z.object({
            value: z.string(),
            commit: z.string().optional(),
            branch: z.string().optional(),
            dirty: z.boolean().optional(),
          }),
        }),
        telemetry: z.object({
          duration: z.number(),
          startTime: z.string(),
          endTime: z.string(),
          success: z.boolean(),
        }),
      },
    },
    async ({ projectPath }) => {
      const result = await indexMaintenanceService.rebuildIndex(projectPath);
      const output = {
        processedFiles: result.processedFiles,
        metadata: {
          projectHash: result.metadata.projectHash,
          indexedAt: result.metadata.indexedAt,
          fingerprint: result.metadata.fingerprint,
        },
        telemetry: {
          duration: result.telemetry.duration,
          startTime: result.telemetry.startTime.toISOString(),
          endTime: result.telemetry.endTime.toISOString(),
          success: result.telemetry.success,
        },
      };
      return {
        content: [{ type: 'text', text: JSON.stringify(output) }],
        structuredContent: output as unknown as { [x: string]: unknown },
      };
    },
  );

  server.registerTool(
    'db.getNodeDetails',
    {
      title: 'Get complete node details',
      description:
        'Retrieve complete information for a specific node by ID. Use this after db.query to get full node details (AST, source code, etc.) that are omitted from query result summaries.',
      inputSchema: {
        projectPath: z.string().describe('Project root path'),
        nodeId: z.string().describe('Node ID from query results'),
      },
      outputSchema: {
        found: z.boolean().describe('Whether the node was found'),
        node: z.record(z.unknown()).optional().describe('Complete node object if found'),
      },
    },
    async ({ projectPath, nodeId }) => {
      const meta = await requireValidIndex(deps.fingerprint, projectPath, 'complete');
      const dbPath = path.resolve(meta.output.dbFile);
      const db = await openDatabase(dbPath, {
        enableLock: false,
        registerReader: false,
        experimental: { cypher: true },
      });
      try {
        // Execute Cypher query to find node by ID
        const cypherResult = await db.cypher(
          'MATCH (n) WHERE n.id = $nodeId RETURN n',
          { nodeId },
          { readonly: true },
        );

        if (cypherResult.records.length === 0) {
          const output = { found: false };
          return {
            content: [{ type: 'text', text: JSON.stringify(output, null, 2) }],
            structuredContent: output as unknown as { [x: string]: unknown },
          };
        }

        // Extract the node from the first record
        const record = cypherResult.records[0];
        const node = record.n as Record<string, unknown>;

        const output = {
          found: true,
          node,
        };

        return {
          content: [{ type: 'text', text: JSON.stringify(output, null, 2) }],
          structuredContent: output as unknown as { [x: string]: unknown },
        };
      } finally {
        await db.close();
      }
    },
  );

  server.registerTool(
    'db.getHealth',
    {
      title: 'Check index health',
      description: 'Validate index presence, fingerprint freshness, and WAL size limits.',
      inputSchema: {
        projectPath: z.string(),
        walSizeWarningBytes: z
          .number()
          .int()
          .default(50 * 1024 * 1024),
      },
      outputSchema: {
        status: z.enum(['healthy', 'warning', 'error']),
        checks: z.array(
          z.object({
            name: z.string(),
            status: z.enum(['pass', 'warn', 'fail']),
            message: z.string(),
            details: z.record(z.unknown()).optional(),
          }),
        ),
        metadata: z.any().optional(),
      },
    },
    async ({ projectPath, walSizeWarningBytes }) => {
      const checks: Array<{
        name: string;
        status: 'pass' | 'warn' | 'fail';
        message: string;
        details?: Record<string, unknown>;
      }> = [];
      let metadata: IndexMetadata | undefined;

      try {
        metadata = await deps.fingerprint.validate(projectPath);
        checks.push({
          name: 'fingerprint',
          status: 'pass',
          message: 'Fingerprint matches current working tree.',
        });
      } catch (error) {
        const err = error as Error;
        checks.push({ name: 'fingerprint', status: 'fail', message: err.message });
        return buildHealthResponse(checks, metadata);
      }

      const dbPath = path.resolve(metadata.output.dbFile);
      const dbStats = await safeStat(dbPath);
      if (!dbStats) {
        checks.push({ name: 'dbFile', status: 'fail', message: 'Index database file is missing.' });
      } else {
        checks.push({
          name: 'dbFile',
          status: 'pass',
          message: 'Index database file exists.',
          details: { sizeBytes: dbStats.size },
        });
      }

      const walPath = `${dbPath}-wal`;
      const walStats = await safeStat(walPath);
      if (walStats) {
        const status = walStats.size > walSizeWarningBytes ? 'warn' : 'pass';
        checks.push({
          name: 'walSize',
          status,
          message:
            status === 'warn'
              ? 'WAL size exceeds configured warning threshold.'
              : 'WAL size within acceptable range.',
          details: { sizeBytes: walStats.size, thresholdBytes: walSizeWarningBytes },
        });
      } else {
        checks.push({ name: 'walSize', status: 'pass', message: 'No WAL file detected.' });
      }

      return buildHealthResponse(checks, metadata);
    },
  );
}

async function safeStat(targetPath: string): Promise<{ size: number } | undefined> {
  try {
    const stats = await stat(targetPath);
    return { size: stats.size };
  } catch (error) {
    if ((error as NodeJS.ErrnoException).code === 'ENOENT') {
      return undefined;
    }
    throw error;
  }
}

function buildHealthResponse(
  checks: Array<{
    name: string;
    status: 'pass' | 'warn' | 'fail';
    message: string;
    details?: Record<string, unknown>;
  }>,
  metadata?: IndexMetadata,
) {
  const worstStatus = checks.some((check) => check.status === 'fail')
    ? 'error'
    : checks.some((check) => check.status === 'warn')
      ? 'warning'
      : 'healthy';

  const output = {
    status: worstStatus,
    checks,
    metadata,
  } as const;

  return {
    content: [{ type: 'text' as const, text: JSON.stringify(output, null, 2) }],
    structuredContent: output as unknown as { [x: string]: unknown },
  };
}
