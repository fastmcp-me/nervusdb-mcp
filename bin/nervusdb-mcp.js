#!/usr/bin/env node
/**
 * @nervusdb/mcp - Official NervusDB MCP Server - Global executable
 *
 * This is the main entry point when installed globally via npm/pnpm.
 * It runs the stdio server for local MCP clients.
 *
 * Usage:
 *   npm install -g @nervusdb/mcp
 *   nervusdb-mcp                    # Start the MCP server
 *   nervusdb-mcp --version          # Show version information
 *   nervusdb-mcp --help             # Show help
 */

import { readFile } from 'node:fs/promises';
import { fileURLToPath } from 'node:url';
import { dirname, join } from 'node:path';

const __filename = fileURLToPath(import.meta.url);
const __dirname = dirname(__filename);

// Parse command line arguments
const args = process.argv.slice(2);

// Handle --version flag
if (args.includes('--version') || args.includes('-v')) {
  try {
    const packageJsonPath = join(__dirname, '..', 'package.json');
    const packageJson = JSON.parse(await readFile(packageJsonPath, 'utf8'));
    console.log(`${packageJson.name} v${packageJson.version}`);
    console.log(`Official MCP server for NervusDB - Code knowledge graph with AI integration`);
    process.exit(0);
  } catch (error) {
    console.error('Failed to read version information:', error.message);
    process.exit(1);
  }
}

// Handle --help flag
if (args.includes('--help') || args.includes('-h')) {
  console.log(`
NervusDB MCP Server - Code Knowledge Graph for AI\n`);
  console.log(`Usage:`);
  console.log(`  nervusdb-mcp              Start the MCP server in stdio mode`);
  console.log(`  nervusdb-mcp --version    Show version information`);
  console.log(`  nervusdb-mcp --help       Show this help message\n`);
  console.log(`Description:`);
  console.log(`  The NervusDB MCP server provides AI assistants with powerful code`);
  console.log(`  understanding capabilities through knowledge graph analysis.\n`);
  console.log(`Environment Variables:`);
  console.log(`  NERVUSDB_ROOT            Custom database root directory (default: ~/.nervusdb)`);
  console.log(`  MCP_TRANSPORT           Transport mode (stdio|http, default: stdio)\n`);
  console.log(`For more information, visit: https://github.com/luQingU/nervusdb-mcp`);
  process.exit(0);
}

// Default: Start the MCP server
const serverPath = join(__dirname, '..', 'dist', 'server', 'stdio.js');

// Set MCP_TRANSPORT environment variable for stdio mode
process.env.MCP_TRANSPORT = 'stdio';

console.log('Starting NervusDB MCP server...');

// Dynamically import the server module
import(serverPath).catch((error) => {
  console.error('Failed to start NervusDB MCP server:', error.message);
  console.error('Make sure the package is built properly with: pnpm build');
  process.exit(1);
});
