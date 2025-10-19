[![Add to Cursor](https://fastmcp.me/badges/cursor_dark.svg)](https://fastmcp.me/MCP/Details/1323/nervusdb)
[![Add to VS Code](https://fastmcp.me/badges/vscode_dark.svg)](https://fastmcp.me/MCP/Details/1323/nervusdb)
[![Add to Claude](https://fastmcp.me/badges/claude_dark.svg)](https://fastmcp.me/MCP/Details/1323/nervusdb)
[![Add to ChatGPT](https://fastmcp.me/badges/chatgpt_dark.svg)](https://fastmcp.me/MCP/Details/1323/nervusdb)
[![Add to Codex](https://fastmcp.me/badges/codex_dark.svg)](https://fastmcp.me/MCP/Details/1323/nervusdb)
[![Add to Gemini](https://fastmcp.me/badges/gemini_dark.svg)](https://fastmcp.me/MCP/Details/1323/nervusdb)

# @nervusdb/mcp

> Official MCP server for NervusDB - Code knowledge graph with repomix integration

[![npm version](https://badge.fury.io/js/%40nervusdb%2Fmcp.svg)](https://www.npmjs.com/package/@nervusdb/mcp)
[![License: MIT](https://img.shields.io/badge/License-MIT-yellow.svg)](https://opensource.org/licenses/MIT)

## Features

- **Code Knowledge Graph**: Build cross-language code knowledge graphs using `@nervusdb/core` and `repomix`
- **Project Insights**: Analyze code impact, find related files, and explore project structure
- **Workflow Automation**: Task management with branch creation and PR submission
- **Code Operations**: Read, write files, and run tests with safety checks
- **Database Tools**: Query and maintain the knowledge graph index
- **Shadow Index Strategy**: Ensures reliable indexing with fingerprint validation

## Prerequisites

- Node.js 20.0.0 or higher
- pnpm 8.0.0 or higher

## Quick Start

**Install Dependencies**

```bash
pnpm install
```

**Run the Server**

```bash
# For development
pnpm start:stdio

# Build for production
pnpm build
```

**Index a Project**

```bash
pnpm synapse:index -p /path/to/your/project
```

## Claude Desktop Integration

Add to your Claude Desktop configuration (`~/Library/Application Support/Claude/claude_desktop_config.json` on macOS):

```json
{
  "mcpServers": {
    "nervusdb-mcp": {
      "command": "npx",
      "args": ["-y", "@nervusdb/mcp"]
    }
  }
}
```

Alternatively, if you've installed the package globally:

```json
{
  "mcpServers": {
    "nervusdb-mcp": {
      "command": "nervusdb-mcp"
    }
  }
}
```

**Installation Options:**

```bash
# Option 1: Use npx (recommended, no installation needed)
# Just add the config above, Claude will run it automatically

# Option 2: Install globally for faster startup
npm install -g @nervusdb/mcp
```

## Configuration

### GitHub Authentication (for Workflow Tools)

Workflow tools (`workflow.submitForReview`) require GitHub authentication to create pull requests. The server supports **3 authentication methods** with automatic fallback:

**Method 1: Environment Variables (Recommended for CI/CD)**

```bash
# Set GITHUB_TOKEN or GH_TOKEN
export GITHUB_TOKEN=ghp_your_personal_access_token

# Or in your shell profile (~/.zshrc or ~/.bashrc)
echo 'export GITHUB_TOKEN=ghp_xxx' >> ~/.zshrc
```

**Method 2: GitHub CLI (Recommended for Local Development)**

```bash
# Install gh CLI
brew install gh # macOS
# Or see https://cli.github.com/ for other platforms

# Authenticate
gh auth login
```

**Method 3: Claude Desktop Configuration**

Add environment variables to Claude Desktop config:

```json
{
  "mcpServers": {
    "nervusdb-mcp": {
      "command": "npx",
      "args": ["-y", "@nervusdb/mcp"],
      "env": {
        "GITHUB_TOKEN": "ghp_your_personal_access_token"
      }
    }
  }
}
```

**Authentication Priority:**

1. `GITHUB_TOKEN` environment variable (highest priority)
2. `GH_TOKEN` environment variable
3. `gh auth token` command (if gh CLI is authenticated)

If no authentication is available, workflow tools will provide clear error messages with setup instructions.

## Available Tools

The NervusDB MCP server provides 13 tools across 4 categories:

### 1. Workflow Tools ⚙️

- `workflow.startTask` - Create task branch and update ledger
- `workflow.submitForReview` - Push branch and create pull request **(requires GitHub authentication)**

### 2. Project Tools

- `project.getStructure` - Get project file structure with statistics
- `project.analyzeImpact` - Analyze code impact based on knowledge graph
- `project.findRelatedFiles` - Find files related to a target file
- `project.readFile` - Read arbitrary file content

### 3. Code Tools

- `code.readFile` - Read project file content
- `code.writeFile` - Write content to project file (requires confirmation)
- `code.runTests` - Run tests using Vitest and return results

### 4. Database Tools

- `db.getStats` - Get index metadata and statistics
- `db.query` - Execute typed or raw queries against knowledge graph
- `db.rebuildIndex` - Rebuild project index with telemetry
- `db.getHealth` - Check index health with fingerprint validation

## Usage Example

```typescript
// 1. Start a new task
workflow.startTask({
  taskId: '42',
  owner: 'alice',
  designDoc: 'docs/design/feature-42.md',
});

// 2. Analyze code impact
project.analyzeImpact({
  projectPath: '/workspace/my-project',
  functionName: 'calculateTotal',
  limit: 20,
});

// 3. Read a file
code.readFile({
  projectPath: '/workspace/my-project',
  file: 'src/services/orderService.ts',
});

// 4. Run tests
code.runTests({
  projectPath: '/workspace/my-project',
  filter: 'orderService',
});

// 5. Query the knowledge graph
db.query({
  projectPath: '/workspace/my-project',
  query: {
    type: 'typed',
    filter: { predicate: 'CONTAINS' },
    options: { limit: 100 },
  },
});

// 6. Submit for review
workflow.submitForReview({
  confirm: true,
  title: 'feat: optimize order calculation',
  reviewers: ['bob'],
});
```

## How It Works

1. **Indexing**: Uses `repomix` to collect project files and `@nervusdb/core` to build a knowledge graph
2. **Storage**: Maintains shadow indices with fingerprint validation for data integrity
3. **Query**: Provides typed and raw query interfaces to explore code relationships
4. **Workflow**: Integrates with Git workflows for task management

## Project Structure

```
nervusdb-mcp/
├── src/
│   ├── server/           # MCP server implementation
│   ├── tools/            # Tool implementations (workflow, project, code, db)
│   ├── services/         # Business logic services
│   ├── domain/           # Core domain logic (indexing, query)
│   └── utils/            # Shared utilities
├── bin/                  # CLI executables
├── docs/                 # Documentation
└── tests/                # Test suites
```

## Development

```bash
# Install dependencies
pnpm install

# Run tests
pnpm test

# Check code quality
pnpm check

# Build for production
pnpm build
```

## Documentation

- [Tools Overview](docs/tools/overview.md) - Detailed documentation for all 13 tools
- [Architecture Design](docs/architecture/ADR-002-Architecture-Design.md)
- [Quality Guidelines](docs/quality-guidelines.md)
- [Build and Release](docs/build-and-release.md)

## Contributing

See [CONTRIBUTING.md](CONTRIBUTING.md) for development guidelines.

## License

MIT
