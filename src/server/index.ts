import { mkdir } from 'node:fs/promises';
import { join } from 'node:path';
import express from 'express';
import { McpServer } from '@modelcontextprotocol/sdk/server/mcp.js';
import { StreamableHTTPServerTransport } from '@modelcontextprotocol/sdk/server/streamableHttp.js';
import { FingerprintService } from '../domain/fingerprint/fingerprintService.js';
import { IndexMaintenanceService } from '../services/indexMaintenanceService.js';
import { registerTools } from '../tools/index.js';
import { logger } from '../utils/logger.js';

/**
 * Ensure required directories exist
 */
async function ensureDirectories() {
  const dbRoot = process.env.NERVUSDB_ROOT ?? join(process.cwd(), '.nervusdb');

  try {
    await mkdir(dbRoot, { recursive: true });
    logger.debug({ dbRoot }, 'Database directory ensured');
  } catch (error) {
    logger.error({ err: error, dbRoot }, 'Failed to create database directory');
    throw error;
  }
}

async function bootstrap() {
  // Ensure required directories exist before initializing services
  await ensureDirectories();

  // Create the MCP server once (reused across requests)
  const server = new McpServer({
    name: 'nervusdb-mcp',
    version: '0.1.0',
  });

  // 创建索引维护服务
  const indexMaintenance = new IndexMaintenanceService();

  // 创建指纹服务，启用自动重建
  const fingerprint = new FingerprintService({
    autoRebuild: true,
    rebuildCallback: async (projectPath: string) => {
      logger.info({ projectPath }, 'Auto-rebuilding index for outdated fingerprint');
      const result = await indexMaintenance.rebuildIndex(projectPath);
      return result.metadata;
    },
  });

  registerTools(server, {
    db: { fingerprint },
  });
  const port = Number(process.env.SYNAPSE_PORT ?? 4000);
  const host = process.env.SYNAPSE_HOST ?? '0.0.0.0';

  const app = express();
  app.use(express.json());

  // Health check endpoint
  app.get('/health', (_req, res) => {
    res.json({ status: 'ok', service: 'nervusdb-mcp', version: '0.1.0' });
  });

  // Stateless HTTP MCP endpoint (recommended for remote servers)
  app.post('/mcp', async (req, res) => {
    try {
      // Create a new transport for each request to prevent request ID collisions
      // Different clients may use the same JSON-RPC request IDs
      const transport = new StreamableHTTPServerTransport({
        sessionIdGenerator: undefined, // Stateless mode
        enableJsonResponse: true,
      });

      res.on('close', () => {
        void transport.close();
      });

      await server.connect(transport);
      await transport.handleRequest(req, res, req.body);
    } catch (error) {
      logger.error({ err: error }, 'Error handling MCP request');
      if (!res.headersSent) {
        res.status(500).json({
          jsonrpc: '2.0',
          error: {
            code: -32603,
            message: 'Internal server error',
          },
          id: null,
        });
      }
    }
  });

  app.listen(port, host, () => {
    logger.info({ host, port, version: '0.1.0' }, 'NervusDB MCP MCP server started');
  });
}

process.on('unhandledRejection', (reason, promise) => {
  logger.error({ reason, promise }, 'Unhandled rejection detected');
});

process.on('uncaughtException', (error) => {
  logger.fatal({ err: error }, 'Uncaught exception, shutting down');
  process.exit(1);
});

void bootstrap();
