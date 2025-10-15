import { mkdtemp, rm, writeFile } from 'node:fs/promises';
import path from 'node:path';
import { tmpdir } from 'node:os';
import { describe, expect, it, vi } from 'vitest';

import { registerWorkflowTools } from '../../src/tools/workflow.js';
import { registerProjectTools } from '../../src/tools/project.js';
import { registerCodeTools } from '../../src/tools/code.js';
import { registerDbTools } from '../../src/tools/db.js';
import type { IndexMetadata } from '../../src/domain/types/indexMetadata.js';
import type { WorkflowService } from '../../src/services/workflowService.js';
import type { ProjectService } from '../../src/services/projectService.js';

class StubServer {
  public handlers = new Map<string, (args: any) => any>();

  registerTool(name: string, _meta: unknown, handler: (args: any) => any) {
    this.handlers.set(name, handler);
  }
}

const createMetadata = (overrides: Partial<IndexMetadata> = {}): IndexMetadata => ({
  schemaVersion: 1,
  state: 'complete',
  projectPath: '/repo',
  projectHash: 'hash',
  indexedAt: new Date().toISOString(),
  fileCount: 3,
  fingerprint: { value: 'abc123', commit: 'abc123', dirty: false },
  versions: {},
  output: { dbFile: '/repo/.synapsedb/hash/graph.synapsedb' },
  ...overrides,
});

describe('MCP tool registration', () => {
  it('workflow.startTask delegates to WorkflowService 并返回台账信息', async () => {
    const server = new StubServer();
    const serviceStub = {
      startTask: vi.fn().mockResolvedValue({
        branch: 'feature/B-1-2025-01-01',
        ledgerEntry: {
          branch: 'feature/B-1-2025-01-01',
          task: 'B-1',
          owner: 'alice',
          createdAt: '2025-01-01T00:00:00.000Z',
          status: 'In Progress',
          designDoc: 'docs/design.md',
          pr: '-',
        },
      }),
      submitForReview: vi.fn(),
    } as unknown as WorkflowService;

    registerWorkflowTools(server as any, { service: serviceStub });

    const handler = server.handlers.get('workflow.startTask');
    expect(handler).toBeDefined();
    const result = await handler?.({ taskId: 'B-1', owner: 'alice', designDoc: 'docs/design.md' });

    expect(serviceStub.startTask).toHaveBeenCalledWith({
      taskId: 'B-1',
      owner: 'alice',
      designDoc: 'docs/design.md',
      baseBranch: 'main',
    });
    expect(result?.structuredContent.branch).toBe('feature/B-1-2025-01-01');
    expect(result?.structuredContent.ledgerEntry.owner).toBe('alice');
  });

  it('workflow.submitForReview 在确认后推送并返回 PR 信息', async () => {
    const server = new StubServer();
    const submitForReview = vi
      .fn()
      .mockResolvedValueOnce({
        branch: 'feature/test',
        remote: 'origin',
        baseBranch: 'main',
        pushed: false,
        message: '预检',
      })
      .mockResolvedValueOnce({
        branch: 'feature/test',
        remote: 'origin',
        baseBranch: 'main',
        pushed: true,
        prUrl: 'https://example.com/pr/1',
        prNumber: 1,
        message: '分支已推送并创建 PR：https://example.com/pr/1',
      });

    const serviceStub = {
      startTask: vi.fn(),
      submitForReview,
    } as unknown as WorkflowService;

    registerWorkflowTools(server as any, { service: serviceStub });

    const handler = server.handlers.get('workflow.submitForReview');
    expect(handler).toBeDefined();

    const preview = await handler?.({ confirm: false });
    expect(submitForReview).toHaveBeenCalledWith({
      baseBranch: 'main',
      remote: 'origin',
      draft: false,
      confirm: false,
    });
    expect(preview?.structuredContent.pushed).toBe(false);

    const final = await handler?.({ confirm: true, reviewers: ['bob'] });
    expect(submitForReview).toHaveBeenLastCalledWith({
      baseBranch: 'main',
      remote: 'origin',
      draft: false,
      confirm: true,
      reviewers: ['bob'],
    });
    expect(final?.structuredContent.pushed).toBe(true);
    expect(final?.structuredContent.prUrl).toBe('https://example.com/pr/1');
  });

  it('project.getStructure 委派 ProjectService 并返回结构化结果', async () => {
    const server = new StubServer();
    const serviceStub = {
      getStructure: vi.fn().mockResolvedValue({
        summary: {
          totalFiles: 2,
          totalCharacters: 42,
          totalTokens: 10,
          commentsIncluded: true,
        },
        files: [
          { path: 'src/index.ts', size: 20, tokens: 5, commentsPreview: ['// foo'] },
          { path: 'src/utils.ts', size: 22, tokens: 5 },
        ],
        tree: [
          {
            name: 'src',
            path: 'src',
            type: 'directory',
            size: 42,
            tokens: 10,
            children: [
              {
                name: 'index.ts',
                path: 'src/index.ts',
                type: 'file',
                size: 20,
                tokens: 5,
                commentsPreview: ['// foo'],
              },
            ],
          },
        ],
      }),
      readFile: vi.fn(),
      analyzeImpact: vi.fn(),
      findRelatedFiles: vi.fn(),
    } as unknown as ProjectService;

    registerProjectTools(server as any, { service: serviceStub });

    const handler = server.handlers.get('project.getStructure');
    const response = await handler?.({ projectPath: '/repo', withComments: true });

    expect(serviceStub.getStructure).toHaveBeenCalledWith({
      projectPath: '/repo',
      withComments: true,
    });
    expect(response?.structuredContent.summary.totalFiles).toBe(2);
    expect(response?.structuredContent.files[0].path).toBe('src/index.ts');
  });

  it('project.readFile 使用 ProjectService 读取文件', async () => {
    const server = new StubServer();
    const serviceStub = {
      getStructure: vi.fn(),
      readFile: vi.fn().mockResolvedValue('content'),
      analyzeImpact: vi.fn(),
      findRelatedFiles: vi.fn(),
    } as unknown as ProjectService;

    registerProjectTools(server as any, { service: serviceStub });

    const handler = server.handlers.get('project.readFile');
    const response = await handler?.({ filePath: '/tmp/file.txt' });

    expect(serviceStub.readFile).toHaveBeenCalledWith('/tmp/file.txt');
    expect(response?.structuredContent.content).toBe('content');
  });

  it('project.analyzeImpact 调用 ProjectService 返回查询结果', async () => {
    const server = new StubServer();
    const serviceStub = {
      getStructure: vi.fn(),
      readFile: vi.fn(),
      analyzeImpact: vi.fn().mockResolvedValue({
        callers: [{ subject: 'function:caller', predicate: 'CALLS', object: 'function:target' }],
        fileMembership: [],
        relations: [],
      }),
      findRelatedFiles: vi.fn(),
    } as unknown as ProjectService;

    registerProjectTools(server as any, { service: serviceStub });

    const handler = server.handlers.get('project.analyzeImpact');
    const response = await handler?.({
      projectPath: '/repo',
      functionName: 'target',
      limit: 5,
    });

    expect(serviceStub.analyzeImpact).toHaveBeenCalledWith({
      projectPath: '/repo',
      functionName: 'target',
      filePath: undefined,
      limit: 5,
    });
    expect(response?.structuredContent.callers[0].object).toBe('function:target');
  });

  it('project.findRelatedFiles 调用 ProjectService 计算评分', async () => {
    const server = new StubServer();
    const serviceStub = {
      getStructure: vi.fn(),
      readFile: vi.fn(),
      analyzeImpact: vi.fn(),
      findRelatedFiles: vi.fn().mockResolvedValue({
        related: [{ file: 'file:src/utils.ts', score: 2, reasons: [] }],
      }),
    } as unknown as ProjectService;

    registerProjectTools(server as any, { service: serviceStub });

    const handler = server.handlers.get('project.findRelatedFiles');
    const response = await handler?.({
      projectPath: '/repo',
      filePath: 'src/index.ts',
      limit: 10,
    });

    expect(serviceStub.findRelatedFiles).toHaveBeenCalledWith({
      projectPath: '/repo',
      filePath: 'src/index.ts',
      limit: 10,
      enhanced: false,
      includeSharedDependencies: undefined,
      minScoreThreshold: undefined,
    });
    expect(response?.structuredContent.related[0].file).toBe('file:src/utils.ts');
  });

  it('code.writeFile enforces confirm and uses fs stubs', async () => {
    const server = new StubServer();
    const mkdir = vi.fn();
    const writeFile = vi.fn();
    const readFile = vi.fn().mockResolvedValue('hello');

    registerCodeTools(server as any, { mkdir, writeFile, readFile });

    const readHandler = server.handlers.get('code.readFile');
    const read = await readHandler?.({ projectPath: '/repo', file: 'a.txt' });
    expect(read?.structuredContent.content).toBe('hello');

    const writeHandler = server.handlers.get('code.writeFile');
    await expect(
      writeHandler?.({ projectPath: '/repo', file: 'a.txt', content: 'hi', confirm: false }),
    ).rejects.toThrow();

    const writeResult = await writeHandler?.({
      projectPath: '/repo',
      file: 'a.txt',
      content: 'hi',
      confirm: true,
    });
    expect(mkdir).toHaveBeenCalled();
    expect(writeFile).toHaveBeenCalledWith('/repo/a.txt', 'hi', 'utf8');
    expect(writeResult?.structuredContent.ok).toBe(true);
  });

  it('db.getStats returns metadata from fingerprint service', async () => {
    const server = new StubServer();
    const workspace = await mkdtemp(path.join(tmpdir(), 'db-stats-'));
    const dbFile = path.join(workspace, 'graph.synapsedb');
    await writeFile(dbFile, '');
    const metadata = createMetadata({
      output: { dbFile },
      versions: { synapseArchitect: '0.1.0' },
    });
    const fingerprint = { validate: vi.fn().mockResolvedValue(metadata) } as any;

    registerDbTools(server as any, { fingerprint });

    const statsHandler = server.handlers.get('db.getStats');
    const response = await statsHandler?.({ projectPath: '/repo' });

    expect(fingerprint.validate).toHaveBeenCalledWith('/repo');
    expect(response?.structuredContent.fingerprint).toBe('abc123');
    expect(response?.structuredContent.dbFile).toBe(dbFile);
    expect(response?.structuredContent.dbSizeBytes).toBe(0);

    await rm(workspace, { recursive: true, force: true });
  });

  it('db.query returns facts from graph', async () => {
    const server = new StubServer();
    const metadata = createMetadata({ output: { dbFile: '/tmp/db.synapsedb' } });
    const fingerprint = { validate: vi.fn().mockResolvedValue(metadata) } as any;
    const dbClose = vi.fn();
    const all = vi
      .fn()
      .mockResolvedValue([
        { subject: 'project:repo', predicate: 'CONTAINS', object: 'file:src/index.ts' },
      ]);
    const dbFind = vi.fn().mockReturnValue({ all });
    const openDatabase = vi.fn().mockResolvedValue({ find: dbFind, close: dbClose });

    registerDbTools(server as any, { fingerprint, openDatabase });

    const queryHandler = server.handlers.get('db.query');
    const response = await queryHandler?.({
      projectPath: '/repo',
      query: {
        type: 'typed',
        filter: { predicate: 'CONTAINS' },
        options: { limit: 10 },
      },
    });

    expect(openDatabase).toHaveBeenCalled();
    expect(dbFind).toHaveBeenCalled();
    expect(all).toHaveBeenCalled();
    expect(response?.structuredContent.facts[0].object).toBe('file:src/index.ts');
    expect(dbClose).toHaveBeenCalled();
  });

  it('db.rebuildIndex triggers indexing service', async () => {
    const server = new StubServer();
    const fingerprint = { validate: vi.fn() } as any;
    const indexMaintenance = {
      rebuildIndex: vi.fn().mockResolvedValue({
        processedFiles: 42,
        metadata: createMetadata({
          projectHash: 'hash',
          fingerprint: { value: 'zzz', commit: 'zzz', branch: 'main', dirty: false },
        }),
        telemetry: {
          duration: 1000,
          startTime: new Date(),
          endTime: new Date(),
          success: true,
          processedFiles: 42,
          projectPath: '/repo',
          fingerprint: 'zzz',
        },
      }),
    } as any;

    registerDbTools(server as any, { fingerprint, indexMaintenance });

    const handler = server.handlers.get('db.rebuildIndex');
    const response = await handler?.({ projectPath: '/repo' });

    expect(indexMaintenance.rebuildIndex).toHaveBeenCalledWith('/repo');
    expect(response?.structuredContent.processedFiles).toBe(42);
    expect(response?.structuredContent.metadata.fingerprint.value).toBe('zzz');
    expect(response?.structuredContent.telemetry).toBeDefined();
  });

  it('db.getHealth reports warning for large WAL files', async () => {
    const server = new StubServer();
    const workspace = await mkdtemp(path.join(tmpdir(), 'db-health-'));
    const dbFile = path.join(workspace, 'graph.synapsedb');
    await writeFile(dbFile, 'db');
    await writeFile(`${dbFile}-wal`, 'x'.repeat(32));

    const metadata = createMetadata({ output: { dbFile } });
    const fingerprint = { validate: vi.fn().mockResolvedValue(metadata) } as any;

    registerDbTools(server as any, { fingerprint });

    const handler = server.handlers.get('db.getHealth');
    const response = await handler?.({ projectPath: '/repo', walSizeWarningBytes: 10 });

    expect(response?.structuredContent.status).toBe('warning');
    expect(response?.structuredContent.checks).toEqual(
      expect.arrayContaining([
        expect.objectContaining({ name: 'fingerprint', status: 'pass' }),
        expect.objectContaining({ name: 'dbFile', status: 'pass' }),
        expect.objectContaining({ name: 'walSize', status: 'warn' }),
      ]),
    );

    await rm(workspace, { recursive: true, force: true });
  });

  it('db.getNodeDetails returns full node information', async () => {
    const server = new StubServer();
    const metadata = createMetadata({ output: { dbFile: '/tmp/db.synapsedb' } });
    const fingerprint = { validate: vi.fn().mockResolvedValue(metadata) } as any;
    const dbClose = vi.fn();
    const dbCypher = vi.fn().mockResolvedValue({
      records: [
        {
          n: {
            id: 'function:src/index.ts#myFunction',
            name: 'myFunction',
            type: 'function',
            signature: 'function myFunction()',
            language: 'typescript',
            startLine: 10,
            endLine: 20,
          },
        },
      ],
    });
    const openDatabase = vi.fn().mockResolvedValue({ cypher: dbCypher, close: dbClose });

    registerDbTools(server as any, { fingerprint, openDatabase });

    const handler = server.handlers.get('db.getNodeDetails');
    const response = await handler?.({
      projectPath: '/repo',
      nodeId: 'function:src/index.ts#myFunction',
    });

    expect(openDatabase).toHaveBeenCalled();
    expect(dbCypher).toHaveBeenCalledWith(
      'MATCH (n) WHERE n.id = $nodeId RETURN n',
      { nodeId: 'function:src/index.ts#myFunction' },
      { readonly: true },
    );
    expect(response?.structuredContent.found).toBe(true);
    expect(response?.structuredContent.node).toBeDefined();
    expect((response?.structuredContent.node as any)?.id).toBe('function:src/index.ts#myFunction');
    expect((response?.structuredContent.node as any)?.name).toBe('myFunction');
    expect(dbClose).toHaveBeenCalled();
  });

  it('code.getDefinition uses DefinitionLocator to find symbols', async () => {
    const server = new StubServer();
    const definitionLocator = {
      findDefinition: vi.fn().mockResolvedValue({
        query: { symbolName: 'registerTools', searchMode: 'exact', symbolType: 'function' },
        definitions: [
          {
            nodeId: 'function:src/tools/index.ts#registerTools',
            name: 'registerTools',
            type: 'function',
            filePath: 'src/tools/index.ts',
            startLine: 10,
            signature: 'export function registerTools()',
            confidence: 1.0,
            matchReason: 'Exact name match, Type: function',
          },
        ],
        totalFound: 1,
        searchTimeMs: 50,
      }),
    } as any;

    registerCodeTools(server as any, {
      definitionLocator,
      readFile: vi.fn(),
      writeFile: vi.fn(),
      mkdir: vi.fn(),
    });

    const handler = server.handlers.get('code.getDefinition');
    const response = await handler?.({
      projectPath: '/repo',
      symbolName: 'registerTools',
      searchMode: 'exact',
      symbolType: 'function',
    });

    expect(definitionLocator.findDefinition).toHaveBeenCalledWith({
      projectPath: '/repo',
      symbolName: 'registerTools',
      config: {
        symbolType: 'function',
        searchMode: 'exact',
        filePathHint: undefined,
        caseSensitive: undefined,
        maxResults: undefined,
        minConfidence: undefined,
      },
    });
    expect(response?.structuredContent.definitions[0].name).toBe('registerTools');
  });

  it('code.findReferences uses ReferencesFinder to find all usages', async () => {
    const server = new StubServer();
    const metadata = createMetadata();
    const queryService = {
      findSymbolDefinition: vi.fn().mockResolvedValue({
        nodeId: 'function:src/tools/index.ts#registerTools',
        name: 'registerTools',
        type: 'function',
        filePath: 'src/tools/index.ts',
        startLine: 10,
      }),
      findCallers: vi.fn().mockResolvedValue([
        {
          subject: 'function:src/caller.ts#caller',
          predicate: 'CALLS',
          object: 'function:src/tools/index.ts#registerTools',
          properties: { name: 'caller', type: 'function', filePath: 'src/caller.ts' },
        },
      ]),
      findImplementations: vi.fn().mockResolvedValue([]),
      findSubclasses: vi.fn().mockResolvedValue([]),
      findFacts: vi.fn().mockResolvedValue([]),
    } as any;

    registerCodeTools(server as any, {
      queryService,
      readFile: vi.fn(),
      writeFile: vi.fn(),
      mkdir: vi.fn(),
    });

    const handler = server.handlers.get('code.findReferences');
    const response = await handler?.({
      projectPath: '/repo',
      symbolName: 'registerTools',
      symbolType: 'function',
    });

    expect(response?.structuredContent.query.symbolName).toBe('registerTools');
    expect(response?.structuredContent.totalReferences).toBeGreaterThanOrEqual(0);
  });

  it('code.getCallHierarchy uses CallHierarchyBuilder to visualize call tree', async () => {
    const server = new StubServer();
    const callHierarchyBuilder = {
      buildHierarchy: vi.fn().mockResolvedValue({
        query: { symbolName: 'myFunction', direction: 'both', maxDepth: 5 },
        rootEntity: {
          name: 'myFunction',
          type: 'function',
          filePath: 'src/index.ts',
          startLine: 10,
        },
        visualizations: {
          asciiTree: 'myFunction\n ├─ caller1\n └─ caller2',
        },
        stats: { totalNodes: 3, maxDepthReached: 1, pruned: false, buildTimeMs: 100 },
      }),
    } as any;

    registerCodeTools(server as any, {
      callHierarchyBuilder,
      readFile: vi.fn(),
      writeFile: vi.fn(),
      mkdir: vi.fn(),
    });

    const handler = server.handlers.get('code.getCallHierarchy');
    const response = await handler?.({
      projectPath: '/repo',
      symbolName: 'myFunction',
      direction: 'both',
    });

    expect(callHierarchyBuilder.buildHierarchy).toHaveBeenCalledWith({
      projectPath: '/repo',
      symbolName: 'myFunction',
      symbolType: undefined,
      config: {
        maxDepth: undefined,
        direction: 'both',
        pruneThreshold: undefined,
        includeMetadata: undefined,
        renderAsciiTree: true,
        renderMermaidDiagram: undefined,
      },
    });
    expect(response?.structuredContent.rootEntity.name).toBe('myFunction');
  });

  it('code.detectSmells uses CodeSmellDetector to find anti-patterns', async () => {
    const server = new StubServer();
    const codeSmellDetector = {
      detectSmells: vi.fn().mockResolvedValue({
        projectPath: '/repo',
        summary: {
          totalSmells: 2,
          bySeverity: { ERROR: 1, WARNING: 1, INFO: 0 },
          byType: { 'god-function': 1, 'long-parameters': 1 },
        },
        smells: [
          {
            type: 'god-function',
            severity: 'ERROR',
            message: 'Function has too many responsibilities',
            location: { file: 'src/utils.ts', line: 10 },
            explanation: 'This function is too complex',
            suggestion: 'Break it into smaller functions',
          },
        ],
        stats: { entitiesAnalyzed: 5, detectionTimeMs: 200 },
      }),
    } as any;

    registerCodeTools(server as any, {
      codeSmellDetector,
      readFile: vi.fn(),
      writeFile: vi.fn(),
      mkdir: vi.fn(),
    });

    const handler = server.handlers.get('code.detectSmells');
    const response = await handler?.({
      projectPath: '/repo',
      symbols: ['myFunction', 'anotherFunction'],
    });

    expect(codeSmellDetector.detectSmells).toHaveBeenCalledWith({
      projectPath: '/repo',
      symbols: ['myFunction', 'anotherFunction'],
      severityThreshold: undefined,
      smellTypes: undefined,
      config: {
        maxComplexity: undefined,
        maxParameters: undefined,
        maxFunctionLines: undefined,
      },
    });
    expect(response?.structuredContent.summary.totalSmells).toBe(2);
  });

  it('code.suggestRefactorings uses RefactoringSuggester to generate recommendations', async () => {
    const server = new StubServer();
    const refactoringSuggester = {
      suggestRefactorings: vi.fn().mockResolvedValue({
        summary: {
          totalSuggestions: 1,
          byPriority: { high: 1, medium: 0, low: 0 },
          byPattern: { 'extract-method': 1 },
        },
        suggestions: [
          {
            id: 'ref-1',
            pattern: 'extract-method',
            priority: 'high',
            title: 'Extract method from god function',
            description: 'Split complex function',
            reasoning: 'Function has multiple responsibilities',
            targetEntity: { name: 'myFunction', filePath: 'src/utils.ts' },
            score: { benefit: 8, risk: 3, effort: 5, impact: 7, overall: 7.5 },
            benefits: ['Improved readability'],
            risks: ['May require refactoring tests'],
            steps: ['1. Identify code to extract', '2. Create new function'],
          },
        ],
        stats: { analysisTimeMs: 150 },
      }),
    } as any;

    registerCodeTools(server as any, {
      refactoringSuggester,
      readFile: vi.fn(),
      writeFile: vi.fn(),
      mkdir: vi.fn(),
    });

    const handler = server.handlers.get('code.suggestRefactorings');
    const response = await handler?.({
      projectPath: '/repo',
      smells: [{ type: 'god-function' }],
      maxSuggestions: 10,
    });

    expect(refactoringSuggester.suggestRefactorings).toHaveBeenCalledWith({
      projectPath: '/repo',
      smells: [{ type: 'god-function' }],
      maxSuggestions: 10,
    });
    expect(response?.structuredContent.summary.totalSuggestions).toBe(1);
  });

  it('code.analyzeDocumentation uses DocumentationGenerator to assess completeness', async () => {
    const server = new StubServer();
    const documentationGenerator = {
      analyzeDocumentation: vi.fn().mockResolvedValue({
        projectPath: '/repo',
        summary: {
          total: 2,
          complete: 1,
          partial: 1,
          missing: 0,
          completeness: 75.0,
        },
        analysis: [
          {
            symbolName: 'myFunction',
            status: 'complete',
            filePath: 'src/index.ts',
            issues: [],
            suggestions: [],
          },
          {
            symbolName: 'anotherFunction',
            status: 'partial',
            filePath: 'src/utils.ts',
            issues: ['Missing return type description'],
            suggestions: ['Add @returns tag'],
          },
        ],
        stats: { analysisTimeMs: 100 },
      }),
      generateDocumentation: vi.fn(),
    } as any;

    registerCodeTools(server as any, {
      documentationGenerator,
      readFile: vi.fn(),
      writeFile: vi.fn(),
      mkdir: vi.fn(),
    });

    const handler = server.handlers.get('code.analyzeDocumentation');
    const response = await handler?.({
      projectPath: '/repo',
      symbols: ['myFunction', 'anotherFunction'],
    });

    expect(documentationGenerator.analyzeDocumentation).toHaveBeenCalledWith({
      projectPath: '/repo',
      symbols: ['myFunction', 'anotherFunction'],
    });
    expect(response?.structuredContent.summary.completeness).toBe(75.0);
  });

  it('code.generateDocumentation uses DocumentationGenerator to create docs', async () => {
    const server = new StubServer();
    const documentationGenerator = {
      analyzeDocumentation: vi.fn(),
      generateDocumentation: vi.fn().mockResolvedValue({
        projectPath: '/repo',
        summary: {
          total: 1,
          successful: 1,
          failed: 0,
          avgConfidence: 0.85,
        },
        generated: [
          {
            symbolName: 'myFunction',
            filePath: 'src/index.ts',
            format: 'jsdoc',
            status: 'success',
            confidence: 0.85,
            generatedDoc: '/**\n * My function does X\n */',
            reasoning: 'Generated based on function signature',
          },
        ],
        stats: { generationTimeMs: 200 },
      }),
    } as any;

    registerCodeTools(server as any, {
      documentationGenerator,
      readFile: vi.fn(),
      writeFile: vi.fn(),
      mkdir: vi.fn(),
    });

    const handler = server.handlers.get('code.generateDocumentation');
    const response = await handler?.({
      projectPath: '/repo',
      symbols: ['myFunction'],
      format: 'jsdoc',
      includeExamples: true,
    });

    expect(documentationGenerator.generateDocumentation).toHaveBeenCalledWith({
      projectPath: '/repo',
      symbols: ['myFunction'],
      format: 'jsdoc',
      includeExamples: true,
    });
    expect(response?.structuredContent.summary.successful).toBe(1);
  });
});
