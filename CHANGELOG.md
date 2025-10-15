# Changelog

All notable changes to this project will be documented in this file.

The format is based on [Keep a Changelog](https://keepachangelog.com/en/1.0.0/),
and this project adheres to [Semantic Versioning](https://semver.org/spec/v2.0.0.html).

## [Unreleased]

## [0.1.18] - 2025-10-15

### Changed

- **Repository migration to nervusdb organization**: Moved repository from `luQingU/nervusdb-mcp` to `nervusdb/nervusdb-mcp`
  - Organization URL: https://github.com/nervusdb
  - Repository URL: https://github.com/nervusdb/nervusdb-mcp
  - Maintains brand consistency with `@nervusdb/core` and `@nervusdb/mcp` packages
- **Package registry migration to GitHub Packages**: Future versions will be published to GitHub Packages (private) instead of public npm
  - Registry: https://npm.pkg.github.com
  - Scope: `@nervusdb`
  - Reason: Privatization for security and access control
  - Cost: $0 (GitHub Packages free for private repositories)
- **v0.1.17 deprecation on public npm**: Previous version marked as deprecated with migration notice

### Migration Guide

**For users upgrading from public npm (v0.1.17)**:

1. Create `.npmrc` in your project root:

```
@nervusdb:registry=https://npm.pkg.github.com
```

2. Generate GitHub Personal Access Token:

- Visit: https://github.com/settings/tokens
- Scopes: `repo` + `write:packages`

3. Login to GitHub Packages:

```bash
npm login --scope=@nervusdb --registry=https://npm.pkg.github.com
# Username: your-github-username
# Password: your-github-token (ghp_xxx...)
# Email: your-github-email
```

4. Install from GitHub Packages:

```bash
npm install @nervusdb/mcp@0.1.18
```

### Note

This release migrates the package from public npm to GitHub Packages for better access control and security. No functional changes from v0.1.17. Public npm versions (≤0.1.17) remain available but deprecated.

## [0.1.17] - 2025-10-15

### Fixed

- **CRITICAL: Raw Cypher queries causing MCP client token limit errors**: Complete architecture refactor to adopt "summary + on-demand details" pattern
  - **Root cause (diagnosed with Gemini 2.0 Flash Thinking)**:
    - Incorrectly using `structuredContent` as a "heavyweight data warehouse" instead of "lightweight structured data"
    - Returning complete graph nodes (including AST, source code, 50KB+ per node) in query results
    - Claude Code client has 25,000 token limit for `structuredContent` (not MCP SDK limitation)
  - **Impact**:
    - Single node queries (`LIMIT 1`) returned 52,676 tokens → "response exceeds maximum tokens" error
    - Five node queries (`LIMIT 5`) returned 78,555 tokens → complete failure
  - **Solution (inspired by repomix architecture)**:
    - **`queryExecutor.ts` refactor**: Renamed `extractCompactProperties` → `extractNodeSummary` with enhanced logic
    - Now extracts only essential metadata: `id`, `name`, `type`, `filePath`, `language`, `label`, `kind`, `signature`
    - Filters out large nested objects (AST, source code) at the source
    - Unified handling for all query types (not just "other queries")
  - **Performance**:
    - Single node: 52,676 tokens → <500 tokens (99.0% reduction)
    - Five nodes: 78,555 tokens → <2,500 tokens (96.8% reduction)
    - Now safely within 25,000 token limit

### Added

- **`db.getNodeDetails` tool**: On-demand retrieval of complete node information
  - Usage: `db.getNodeDetails({projectPath, nodeId})`
  - Returns full node object including AST and source code
  - Designed for "drill-down" workflow: list summaries → select → get details
  - Safe for single node queries (never exceeds token limit)
- **Response size monitoring**: Server-side warnings when response exceeds 1MB threshold
  - Helps detect potential token limit issues before they reach client
  - Suggests mitigation strategies (LIMIT clause, db.getNodeDetails)

### Improved

- **Query result architecture**: Adopted industry best practice "summary + on-demand details" pattern
- **API clarity**: `db.query` returns lightweight summaries, `db.getNodeDetails` provides full data
- **Client stability**: Eliminated "response exceeds maximum tokens" errors
- **Developer experience**: Clear separation between list view and detail view data

### Technical Debt Cleaned

- Fixed fundamental misuse of MCP `structuredContent` field
- Aligned with proven architecture patterns (see: repomix MCP implementation)
- Established clear data structure design principles for future tools

### Breaking Changes

**None.** The QueryResult interface remains unchanged. Only the data density has been optimized (less data per record, more useful data).

### Migration Guide

**Before (v0.1.15)**:

```typescript
// Query returned everything, causing token limit errors
const result = await db.query({
  type: 'raw',
  cypher: 'MATCH (n:Function) RETURN n LIMIT 5',
});
// result.facts[0].properties contained full AST (50KB+)
```

**After (v0.1.17)**:

```typescript
// Query returns compact summaries (works perfectly)
const result = await db.query({
  type: 'raw',
  cypher: 'MATCH (n:Function) RETURN n LIMIT 5',
});
// result.facts[0].properties = {id, name, type, filePath, language} (<1KB)

// Get full details only when needed
const nodeId = result.facts[0].object; // Extract ID from summary
const details = await db.getNodeDetails({ projectPath, nodeId });
// details.node contains full AST and source code
```

### Note

This release resolves the architectural issue introduced in v0.1.14-0.1.15. Inspired by Gemini 2.0 Flash Thinking's analysis comparing nervusdb-mcp vs repomix architectures. If you experienced "response exceeds maximum tokens" errors, upgrade to v0.1.17 immediately.

## [0.1.15] - 2025-01-25

### Fixed

- **CRITICAL: Raw Cypher queries not working via MCP tools**: Fixed missing `experimental: { cypher: true }` configuration in MCP tools layer
  - Root cause: `src/tools/db.ts` Line 99 in `db.query` tool was opening database without experimental flag
  - Impact: Users received "Cypher 插件未启用" (Cypher plugin not enabled) error even after v0.1.14 upgrade and system restart
  - Fixed by adding `experimental: { cypher: true }` to database open call in MCP tools layer
  - Note: Domain layer (QueryService) was correctly configured, but MCP tools layer was missed during v0.1.14 implementation

### Note

This is a critical bugfix for v0.1.14. If you experienced "Cypher plugin not enabled" errors when trying to use Raw Cypher queries, please upgrade to v0.1.15 immediately. The issue was due to incomplete configuration propagation from domain layer to MCP tools layer.

## [0.1.14] - 2025-01-25

### Added

- **Raw Cypher query support**: Enabled experimental Cypher query language support for advanced graph queries
  - Implemented `executeRawQuery` in QueryExecutor to handle raw Cypher statements
  - Database now opens with `experimental: { cypher: true }` flag in QueryService
  - MCP `db.query` tool now accepts `{"type": "raw", "cypher": "MATCH ...", "params": {}}` format
  - Supports MATCH queries for flexible graph traversal (e.g., `MATCH (s)-[r:DEFINES]->(o) RETURN s, r, o`)
  - Automatic conversion of CypherResult to QueryResult format for MCP compatibility
  - Read-only mode enforced for safety (`readonly: true`)

### Improved

- Query flexibility: Users can now write custom Cypher queries for complex graph analysis
- Advanced queries: Support for pattern matching, relationship filtering, and property access
- Better aggregation support: Foundation for COUNT, SUM, and other aggregation queries (partial support)

### Note

This release enables experimental Cypher query support. Note that some advanced Cypher features (like aggregation functions `count()`) may have limited support in the current version. Basic MATCH/RETURN patterns are fully functional.

## [0.1.13] - 2025-01-25

### Fixed

- **CRITICAL: Native module loading failure in production**: Fixed runtime path resolution error causing multi-language parser to fall back to file-only indexing
  - Root cause: Incorrect relative path `../native/synapse_parser_napi.node` in multiLanguageParser.ts (line 25)
  - Correct path: `../../native/synapse_parser_napi.node` to reach `dist/native/` from `dist/domain/parsing/`
  - Impact: MCP indexing produced 0 relations (empty knowledge graph) → Now extracts all DEFINES/CALLS/EXTENDS/IMPLEMENTS relations correctly
  - Symptom: "⚠️ Multi-language parser not available" warning in MCP server logs despite native module file existing in npm package
  - Off-by-one directory level error: `../` resolved to `dist/domain/native/` ❌ instead of `dist/native/` ✅

### Note

This release fixes the critical runtime path resolution bug from v0.1.11-0.1.12. If you experienced empty knowledge graphs after MCP indexing despite successful installation, please upgrade to v0.1.13 and rebuild your index.

## [0.1.12] - 2025-01-25

### Fixed

- **CRITICAL: Java CALLS relation extraction completely broken**: Fixed tree-sitter query that captured only method names instead of complete method bodies
  - Root cause: `@definition.method` capture was applied to `name: (identifier)` child node instead of entire `(method_declaration)` node
  - Impact: 0 CALLS relations extracted → 3,602 CALLS relations now successfully extracted from Java codebase
  - Changed JAVA_QUERY from `(method_declaration name: (identifier) @definition.method)` to `(method_declaration) @definition.method`
  - Without method body content, `extractFunctionCalls()` regex had nothing to match against
- **Enhanced regex for OOP method calls**: Updated `extractFunctionCalls` regex to match Java typical patterns:
  - Now matches `obj.method()`, `Class.staticMethod()`, `this.method()` patterns
  - Changed from `/\b([a-zA-Z_]\w*)\s*\(/g` to `/(?:^|\s|\.|;|\{|\(|\[)([a-zA-Z_]\w*)\s*\(/g`
  - Added 'synchronized' to Java keyword filter list

### Improved

- DEFINES relations increased from 101 → 422 (321 more method definitions extracted)
- Knowledge graph now captures complete Java method call chains for impact analysis

### Note

This release fixes the critical Java CALLS extraction bug from v0.1.10-0.1.11. If you are using Java projects, please rebuild your index after upgrading to v0.1.12.

## [0.1.11] - 2025-01-25

### Fixed

- **CRITICAL: Native module publishing**: Fixed synapse_parser_napi.node missing from npm package, causing multi-language parser initialization failure
  - Added npm package path fallback in multiLanguageParser.ts (`dist/native/synapse_parser_napi.node`)
  - Updated build:rust script to copy native module to dist/native/ directory
  - Ensures 11MB native module is included in published package
- **MCP SDK v1.20.0 compatibility**: Fixed 17 TypeScript type errors in structuredContent fields
  - Applied double type assertion pattern: `as unknown as { [x: string]: unknown }`
  - Fixed Zod schema `.shape` property access for MCP tool registration
  - Removed `.refine()` validation from MCP schema (incompatible with JSON Schema)

### Documentation

- Added ADR-006: Product repositioning from code analysis to knowledge management system
- Clarified repomix integration architecture (SDK vs MCP server)

### Note

This release fixes the Java support issue from v0.1.10. If you experienced "Native module not found" errors, please upgrade to v0.1.11.

## [0.1.10] - 2025-01-24

### Added

- **Java annotation support**: Extract Spring Framework annotations (@RestController, @Service, @RequestMapping, etc.)
- **TypeScript decorator support**: Extract decorators from classes and methods
- `project.getStructure` filtering options to handle large codebases:
  - `maxDepth`: Limit directory tree traversal depth (e.g., 3 levels)
  - `limit`: Cap number of files returned (e.g., first 100 files)
  - `pathFilter`: Glob pattern filtering (e.g., "src/**", "**/\*.java")

### Fixed

- **Java code parsing (CRITICAL)**: Add Java-specific node type support (`method_declaration`, `import_declaration`) to fix DEFINES and IMPORTS extraction
- **Java method calls extraction**: Add `method_invocation` node support to fix CALLS relation extraction
- **Response size limit**: `project.getStructure` now supports filtering to stay under 25,000 token limit
- **Framework awareness**: Reduce false positives in dead code detection for Spring Boot REST endpoints
- **Prettier configuration**: Updated format check to use complete glob pattern `**/*.{ts,js,json,md}` instead of `{src,scripts,docs}/**/*`

### Removed

- **BREAKING: `code.runTests` tool**: Removed because each project should use its native test framework directly (mvn test, npm test, pytest, etc.) instead of wrapping test execution through MCP. This eliminates unnecessary abstraction and improves user experience by encouraging standard tooling.

## [0.1.9] - 2025-01-23

### Added

- Comprehensive unit tests for Phase 2 services (23 tests)
  - ImpactAnalyzer: 9 tests covering risk analysis and caller detection
  - DefinitionLocator: 5 tests covering symbol search and filtering
  - ReferencesFinder: 3 tests covering reference finding
  - CallHierarchyBuilder: 3 tests covering call hierarchy construction
  - RelatedFilesScorer: 3 tests covering file relationship scoring
- Comprehensive unit tests for Phase 3 AI services (18 tests)
  - CodeSmellDetector: 6 tests covering code smell detection
  - RefactoringSuggester: 6 tests covering refactoring suggestions
  - DocumentationGenerator: 6 tests covering documentation analysis

### Fixed

- All Phase 2 service tests now pass (100% coverage)
- QueryService mock alignment with actual interfaces
- Test result structure validation

### Changed

- Test coverage improved from 75% to 100% (23/23 test files passing)
- Total test count increased from 146 to 164 tests
- All tests now pass successfully

## [0.1.8] - 2025-10-14

### Added

- CLI support for `--version` and `--help` flags
- Improved bin file with usage documentation
- Startup message when launching server

### Changed

- Enhanced error messages with actionable suggestions
- Better user guidance for CLI usage

## [0.1.7] - 2025-10-14

### Added

- **Auto-rebuild index on fingerprint mismatch**: Automatically rebuilds stale indices instead of returning an error
- New `autoRebuild` option for `FingerprintService` (enabled by default in stdio and HTTP servers)
- `IndexRebuildCallback` interface for custom rebuild logic

### Changed

- Server now enables auto-rebuild by default, improving user experience
- Log message updated to indicate auto-rebuild is enabled

### Fixed

- Users no longer need to manually rebuild indices when code changes are detected
- Improved error handling during auto-rebuild with detailed error messages

## [0.1.6] - 2025-10-14

### Fixed

- Update test suite to match new projectHash implementation (basename instead of SHA1)
- Remove unused `createHash` import from tests

## [0.1.5] - 2025-10-14

### Changed

- Directory structure now uses project names instead of hash (easier to identify and clean up)
- File extension changed from `.synapsedb` to `.sdb` (more concise)
- Environment variable renamed: `SYNAPSE_DB_ROOT` → `NERVUSDB_ROOT`
- Default directory always uses HOME: `~/.nervusdb/` (not current working directory)

### Fixed

- Simplified directory resolution logic - always use HOME directory for consistency
- Fixed TypeScript type annotations (`as const` instead of explicit types)
- Updated .gitignore to exclude local data directories

### Migration

```bash
# Old: ~/.synapsedb/0e5d58796a76/graph.synapsedb
# New: ~/.nervusdb/my-project-name/graph.sdb

# Clean up old directory
rm -rf ~/.synapsedb/
```

## [0.1.4] - 2025-10-14 (yanked)

**Note**: v0.1.4 had incorrect default directory logic. Please use v0.1.5 instead.

## [0.1.3] - 2025-10-14

### Fixed

- Fix `ENOENT: no such file or directory, mkdir '/.synapsedb'` error
- Use HOME directory as fallback when `process.cwd()` is root directory `/`
- Improve directory resolution for Claude Desktop and other MCP clients

## [0.1.2] - 2025-10-14

### Fixed

- Remove `import assert { type: 'json' }` syntax causing runtime errors
- Use dynamic JSON loading with `readFile` for package.json

## [0.1.1] - 2025-10-14

### Fixed

- Move `vitest` from devDependencies to dependencies (required at runtime for `code.runTests` tool)

## [0.1.0] - 2025-10-14

### Added

- Initial release as `@nervusdb/mcp` (renamed from synapse-architect)
- 13 MCP tools across 4 categories:
  - Workflow: `startTask`, `submitForReview`
  - Project: `getStructure`, `analyzeImpact`, `findRelatedFiles`, `readFile`
  - Code: `readFile`, `writeFile`, `runTests`
  - Database: `getStats`, `query`, `rebuildIndex`, `getHealth`
- Integration with `@nervusdb/core` v1.1.2 for knowledge graph functionality
- Code knowledge graph using `repomix` for project indexing
- Shadow index strategy with fingerprint validation
- Thread-safe database operations
- Comprehensive test coverage

### Changed

- Project renamed from `synapse-architect` to `@nervusdb/mcp`
- CLI command: `synapse-architect` → `nervusdb-mcp`
- Simplified README and configuration (removed 20+ config files)
- Upgraded from local SynapseDB to npm package `@nervusdb/core@1.1.2`

### Fixed

- TypeScript type errors in MCP SDK 1.20.0 integration (17 errors → 0)
- repomix 1.7.0 API compatibility issues
- workflowService trim() type safety
- All Zod schema and structuredContent type issues

### Removed

- configs/ directory (21 configuration files)
- QUICKSTART.md (replaced with simplified README)
- mcp-config-example.json

## [Unreleased]

### Planned

- npm package publication
- Docker container support
- Additional query capabilities
- Performance optimizations

[0.1.0]: https://github.com/luQingU/nervusdb-mcp/releases/tag/v0.1.0
