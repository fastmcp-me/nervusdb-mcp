#!/usr/bin/env node
/**
 * NervusDB MCP MCP Server - stdio mode
 * For local clients like Cursor, Claude Desktop, Cline, etc.
 */

// CRITICAL: Set this BEFORE importing logger to ensure stderr output
process.env.MCP_TRANSPORT = 'stdio';

import { mkdir } from 'node:fs/promises';
import { join } from 'node:path';
import { McpServer } from '@modelcontextprotocol/sdk/server/mcp.js';
import { StdioServerTransport } from '@modelcontextprotocol/sdk/server/stdio.js';
import { FingerprintService } from '../domain/fingerprint/fingerprintService.js';
import { IndexMaintenanceService } from '../services/indexMaintenanceService.js';
import { registerTools } from '../tools/index.js';
import { logger } from '../utils/logger.js';

/**
 * Ensure required directories exist
 */
async function ensureDirectories() {
  const home = process.env.HOME || process.env.USERPROFILE || '/tmp';
  const dbRoot = process.env.NERVUSDB_ROOT ?? join(home, '.nervusdb');

  try {
    await mkdir(dbRoot, { recursive: true });
    logger.debug({ dbRoot, home }, 'Database directory ensured');
  } catch (error) {
    logger.error({ err: error, dbRoot, home }, 'Failed to create database directory');
    throw error;
  }
}

async function main() {
  // Ensure required directories exist before initializing services
  await ensureDirectories();

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

  const transport = new StdioServerTransport();
  await server.connect(transport);

  logger.info('NervusDB MCP MCP server started in stdio mode with auto-rebuild enabled');
}

process.on('SIGINT', () => {
  logger.info('Received SIGINT, shutting down');
  process.exit(0);
});

process.on('SIGTERM', () => {
  logger.info('Received SIGTERM, shutting down');
  process.exit(0);
});

main().catch((error) => {
  logger.fatal({ err: error }, 'Failed to start MCP server');
  process.exit(1);
});
