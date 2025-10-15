import fs from 'node:fs/promises';
import path from 'node:path';

import type { McpServer } from '@modelcontextprotocol/sdk/server/mcp.js';
import { z } from 'zod';

import { ProjectService } from '../services/projectService.js';
import {
  DefinitionLocator,
  type DefinitionResult,
  type SymbolType,
  type SearchMode,
} from '../services/definitionLocator.js';
import { ReferencesFinder, type FindReferencesResult } from '../services/referencesFinder.js';
import {
  CallHierarchyBuilder,
  type CallHierarchyResult,
  type CallHierarchyDirection,
} from '../services/callHierarchyBuilder.js';
import {
  CodeSmellDetector,
  type CodeSmell,
  type SmellSeverity,
  type SmellType,
  type DetectSmellsResult,
} from '../services/codeSmellDetector.js';
import {
  RefactoringSuggester,
  type RefactoringPattern,
  type SuggestRefactoringsResult,
} from '../services/refactoringSuggester.js';
import {
  DocumentationGenerator,
  type DocAnalysisResult,
  type GenerateDocsResult,
} from '../services/documentationGenerator.js';
import type { QueryService } from '../domain/query/queryService.js';

export interface CodeToolDependencies {
  readFile: typeof fs.readFile;
  writeFile: typeof fs.writeFile;
  mkdir: typeof fs.mkdir;
  projectService?: ProjectService;
  definitionLocator?: DefinitionLocator;
  queryService?: QueryService;
  callHierarchyBuilder?: CallHierarchyBuilder;
  codeSmellDetector?: CodeSmellDetector;
  refactoringSuggester?: RefactoringSuggester;
  documentationGenerator?: DocumentationGenerator;
}

const defaultDeps: CodeToolDependencies = {
  readFile: fs.readFile,
  writeFile: fs.writeFile,
  mkdir: fs.mkdir,
};

function resolveSafePath(projectPath: string, file: string): string {
  const root = path.resolve(projectPath);
  const full = path.resolve(root, file);
  if (!full.startsWith(root)) {
    throw new Error('拒绝访问项目目录之外的文件');
  }
  return full;
}

export function registerCodeTools(
  server: McpServer,
  deps: Partial<CodeToolDependencies> = {},
): void {
  const resolvedDeps = { ...defaultDeps, ...deps } satisfies CodeToolDependencies;

  // Auto-instantiate DefinitionLocator if QueryService is provided
  const definitionLocator =
    deps.definitionLocator ??
    (deps.queryService ? new DefinitionLocator({ queryService: deps.queryService }) : undefined);
  const referencesFinder = deps.queryService
    ? new ReferencesFinder({ queryService: deps.queryService })
    : undefined;
  const callHierarchyBuilder =
    deps.callHierarchyBuilder ??
    (deps.queryService ? new CallHierarchyBuilder({ queryService: deps.queryService }) : undefined);
  const codeSmellDetector =
    deps.codeSmellDetector ??
    (deps.queryService ? new CodeSmellDetector({ queryService: deps.queryService }) : undefined);
  const refactoringSuggester =
    deps.refactoringSuggester ??
    (deps.queryService ? new RefactoringSuggester({ queryService: deps.queryService }) : undefined);
  const documentationGenerator =
    deps.documentationGenerator ??
    (deps.queryService
      ? new DocumentationGenerator({ queryService: deps.queryService })
      : undefined);

  server.registerTool(
    'code.readFile',
    {
      title: 'Read a file from project',
      description: 'Read file content by project root and relative path',
      inputSchema: { projectPath: z.string(), file: z.string() },
      outputSchema: { content: z.string() },
    },
    async ({ projectPath, file }) => {
      const target = resolveSafePath(projectPath, file);
      const content = await resolvedDeps.readFile(target, 'utf8');
      return {
        content: [{ type: 'text', text: content }],
        structuredContent: { content } as unknown as { [x: string]: unknown },
      };
    },
  );

  server.registerTool(
    'code.writeFile',
    {
      title: 'Write a file (requires confirm)',
      description: 'Write content to a project file, confirm flag required.',
      inputSchema: {
        projectPath: z.string(),
        file: z.string(),
        content: z.string(),
        confirm: z.boolean(),
      },
      outputSchema: { ok: z.boolean() },
    },
    async ({ projectPath, file, content, confirm }) => {
      if (!confirm) {
        throw new Error('危险操作：需要 confirm=true 才能写入文件');
      }
      const target = resolveSafePath(projectPath, file);
      await resolvedDeps.mkdir(path.dirname(target), { recursive: true });
      await resolvedDeps.writeFile(target, content, 'utf8');
      return {
        content: [{ type: 'text', text: 'ok' }],
        structuredContent: { ok: true } as unknown as { [x: string]: unknown },
      };
    },
  );

  server.registerTool(
    'code.getDefinition',
    {
      title: 'Find symbol definition',
      description:
        'Find the definition location of a symbol (function/class/interface/variable). ' +
        'Supports exact/prefix/contains/fuzzy matching with confidence scoring. ' +
        'Returns file path, line number, and signature. Target: ≥95% accuracy.',
      inputSchema: {
        projectPath: z.string().describe('Project root path'),
        symbolName: z.string().describe('Symbol name to find'),
        symbolType: z
          .enum(['function', 'class', 'interface', 'variable', 'constant', 'type', 'enum', 'any'])
          .default('any')
          .optional()
          .describe('Filter by symbol type'),
        searchMode: z
          .enum(['exact', 'prefix', 'contains', 'fuzzy'])
          .default('exact')
          .optional()
          .describe('Search algorithm'),
        filePathHint: z.string().optional().describe('Prefer definitions in this file'),
        caseSensitive: z.boolean().default(true).optional().describe('Case-sensitive matching'),
        maxResults: z
          .number()
          .int()
          .min(1)
          .max(100)
          .default(10)
          .optional()
          .describe('Maximum results'),
        minConfidence: z
          .number()
          .min(0)
          .max(1)
          .default(0.5)
          .optional()
          .describe('Minimum confidence (0-1)'),
      },
      outputSchema: {},
    },
    async ({
      projectPath,
      symbolName,
      symbolType,
      searchMode,
      filePathHint,
      caseSensitive,
      maxResults,
      minConfidence,
    }) => {
      if (!definitionLocator) {
        throw new Error('code.getDefinition requires DefinitionLocator (QueryService)');
      }

      const result = await definitionLocator.findDefinition({
        projectPath,
        symbolName,
        config: {
          symbolType: symbolType as SymbolType,
          searchMode: searchMode as SearchMode,
          filePathHint,
          caseSensitive,
          maxResults,
          minConfidence,
        },
      });

      // Format output
      const formattedOutput = formatDefinitionResult(result);

      return {
        content: [{ type: 'text', text: formattedOutput }],
        structuredContent: result as unknown as { [x: string]: unknown },
      };
    },
  );

  server.registerTool(
    'code.findReferences',
    {
      title: 'Find all references to a symbol',
      description:
        'Finds all references to a symbol (function, class, etc.) across the project. High recall.',
      inputSchema: {
        projectPath: z.string().describe('Project root path'),
        symbolName: z.string().describe('Symbol name to find references for'),
        symbolType: z
          .enum(['function', 'class', 'interface', 'variable', 'any'])
          .default('any')
          .optional()
          .describe('Filter by symbol type'),
        // config options
        includeDeclaration: z
          .boolean()
          .default(true)
          .optional()
          .describe('Include definition location in results'),
        groupByFile: z.boolean().default(true).optional().describe('Group results by file'),
        maxReferences: z
          .number()
          .int()
          .min(1)
          .max(1000)
          .default(500)
          .optional()
          .describe('Maximum total references to return'),
      },
      outputSchema: {},
    },
    async ({
      projectPath,
      symbolName,
      symbolType,
      includeDeclaration,
      groupByFile,
      maxReferences,
    }) => {
      if (!referencesFinder) {
        throw new Error('code.findReferences requires ReferencesFinder (QueryService)');
      }

      const result = await referencesFinder.findReferences({
        projectPath,
        symbolName,
        symbolType,
        config: {
          includeDeclaration,
          groupByFile,
          maxReferences,
        },
      });

      const formattedOutput = formatReferencesResult(result);

      return {
        content: [{ type: 'text', text: formattedOutput }],
        structuredContent: result as unknown as { [x: string]: unknown },
      };
    },
  );

  server.registerTool(
    'code.getCallHierarchy',
    {
      title: 'Get call hierarchy visualization',
      description:
        'Visualize function call hierarchy (callers and callees) as an ASCII tree or Mermaid diagram. ' +
        'Shows who calls this function (upstream) and what this function calls (downstream).',
      inputSchema: {
        projectPath: z.string().describe('Project root path'),
        symbolName: z.string().describe('Function name to analyze'),
        symbolType: z
          .enum(['function', 'method', 'any'])
          .default('function')
          .optional()
          .describe('Filter by symbol type'),
        // Hierarchy config
        maxDepth: z
          .number()
          .int()
          .min(1)
          .max(10)
          .default(5)
          .optional()
          .describe('Maximum tree depth to traverse'),
        direction: z
          .enum(['callers', 'callees', 'both'])
          .default('both')
          .optional()
          .describe('Direction: callers (upstream), callees (downstream), or both'),
        pruneThreshold: z
          .number()
          .int()
          .min(5)
          .max(100)
          .default(20)
          .optional()
          .describe('Maximum children per node before pruning'),
        // Output config
        includeMetadata: z
          .boolean()
          .default(true)
          .optional()
          .describe('Include file paths and line numbers'),
        renderMermaid: z
          .boolean()
          .default(false)
          .optional()
          .describe('Generate Mermaid diagram (can be large)'),
      },
      outputSchema: {},
    },
    async ({
      projectPath,
      symbolName,
      symbolType,
      maxDepth,
      direction,
      pruneThreshold,
      includeMetadata,
      renderMermaid,
    }) => {
      if (!callHierarchyBuilder) {
        throw new Error('code.getCallHierarchy requires CallHierarchyBuilder (QueryService)');
      }

      const result = await callHierarchyBuilder.buildHierarchy({
        projectPath,
        symbolName,
        symbolType,
        config: {
          maxDepth,
          direction: direction as CallHierarchyDirection,
          pruneThreshold,
          includeMetadata,
          renderAsciiTree: true,
          renderMermaidDiagram: renderMermaid,
        },
      });

      const formattedOutput = formatCallHierarchyResult(result);

      return {
        content: [{ type: 'text', text: formattedOutput }],
        structuredContent: result as unknown as { [x: string]: unknown },
      };
    },
  );

  server.registerTool(
    'code.detectSmells',
    {
      title: 'Detect code smells',
      description:
        'Detect common code smells and anti-patterns in functions. ' +
        'Provides severity levels, explanations, and refactoring suggestions.',
      inputSchema: {
        projectPath: z.string().describe('Project root path'),
        symbols: z.array(z.string()).describe('Function names to analyze'),
        severityThreshold: z
          .enum(['INFO', 'WARNING', 'ERROR'])
          .default('INFO')
          .optional()
          .describe('Minimum severity to report'),
        smellTypes: z
          .array(
            z.enum([
              'god-function',
              'deep-nesting',
              'long-parameters',
              'long-function',
              'dead-code',
              'magic-number',
              'duplicated-code',
            ]),
          )
          .optional()
          .describe('Specific smell types to check'),
        // Config
        maxComplexity: z
          .number()
          .int()
          .min(1)
          .max(50)
          .default(10)
          .optional()
          .describe('Max function complexity (callee count)'),
        maxParameters: z
          .number()
          .int()
          .min(1)
          .max(20)
          .default(5)
          .optional()
          .describe('Max parameter count'),
        maxFunctionLines: z
          .number()
          .int()
          .min(10)
          .max(500)
          .default(50)
          .optional()
          .describe('Max function length'),
      },
      outputSchema: {},
    },
    async ({
      projectPath,
      symbols,
      severityThreshold,
      smellTypes,
      maxComplexity,
      maxParameters,
      maxFunctionLines,
    }) => {
      if (!codeSmellDetector) {
        throw new Error('code.detectSmells requires CodeSmellDetector (QueryService)');
      }

      const result = await codeSmellDetector.detectSmells({
        projectPath,
        symbols,
        severityThreshold: severityThreshold as SmellSeverity,
        smellTypes: smellTypes as SmellType[],
        config: {
          maxComplexity,
          maxParameters,
          maxFunctionLines,
        },
      });

      const formattedOutput = formatSmellsResult(result);

      return {
        content: [{ type: 'text', text: formattedOutput }],
        structuredContent: result as unknown as { [x: string]: unknown },
      };
    },
  );

  server.registerTool(
    'code.suggestRefactorings',
    {
      title: 'Suggest refactorings for code smells',
      description:
        'Generate intelligent refactoring suggestions based on detected code smells. ' +
        'Provides priority scoring, impact analysis, and step-by-step instructions.',
      inputSchema: {
        projectPath: z.string().describe('Project root path'),
        smells: z.array(z.any()).describe('Detected code smells (from detectSmells)'),
        maxSuggestions: z
          .number()
          .int()
          .min(1)
          .max(20)
          .default(10)
          .optional()
          .describe('Maximum suggestions to return'),
      },
      outputSchema: {},
    },
    async ({ projectPath, smells, maxSuggestions }) => {
      if (!refactoringSuggester) {
        throw new Error('code.suggestRefactorings requires RefactoringSuggester (QueryService)');
      }

      const result = await refactoringSuggester.suggestRefactorings({
        projectPath,
        smells: smells as CodeSmell[],
        maxSuggestions,
      });

      const formattedOutput = formatRefactoringSuggestionsResult(result);

      return {
        content: [{ type: 'text', text: formattedOutput }],
        structuredContent: result as unknown as { [x: string]: unknown },
      };
    },
  );

  server.registerTool(
    'code.analyzeDocumentation',
    {
      title: 'Analyze documentation completeness',
      description:
        'Analyze the completeness of code documentation for specified symbols. ' +
        'Identifies missing, partial, or complete documentation with specific suggestions.',
      inputSchema: {
        projectPath: z.string().describe('Project root path'),
        symbols: z.array(z.string()).describe('Symbol names to analyze'),
      },
      outputSchema: {},
    },
    async ({ projectPath, symbols }) => {
      if (!documentationGenerator) {
        throw new Error('code.analyzeDocumentation requires DocumentationGenerator (QueryService)');
      }

      const result = await documentationGenerator.analyzeDocumentation({
        projectPath,
        symbols,
      });

      const formattedOutput = formatDocAnalysisResult(result);

      return {
        content: [{ type: 'text', text: formattedOutput }],
        structuredContent: result as unknown as { [x: string]: unknown },
      };
    },
  );

  server.registerTool(
    'code.generateDocumentation',
    {
      title: 'Generate documentation for code symbols',
      description:
        'Automatically generate documentation (JSDoc/TSDoc/docstring) for specified symbols. ' +
        'Uses context from code structure and naming patterns.',
      inputSchema: {
        projectPath: z.string().describe('Project root path'),
        symbols: z.array(z.string()).describe('Symbol names to document'),
        format: z
          .enum(['jsdoc', 'tsdoc', 'python-docstring', 'markdown'])
          .default('jsdoc')
          .optional()
          .describe('Documentation format'),
        includeExamples: z.boolean().default(true).optional().describe('Include usage examples'),
      },
      outputSchema: {},
    },
    async ({ projectPath, symbols, format, includeExamples }) => {
      if (!documentationGenerator) {
        throw new Error(
          'code.generateDocumentation requires DocumentationGenerator (QueryService)',
        );
      }

      const result = await documentationGenerator.generateDocumentation({
        projectPath,
        symbols,
        format,
        includeExamples,
      });

      const formattedOutput = formatGenerateDocsResult(result);

      return {
        content: [{ type: 'text', text: formattedOutput }],
        structuredContent: result as unknown as { [x: string]: unknown },
      };
    },
  );
}

/**
 * Format documentation analysis result
 */
function formatDocAnalysisResult(result: DocAnalysisResult): string {
  const lines: string[] = [];

  // Header
  lines.push('# Documentation Analysis');
  lines.push('');
  lines.push(`**Project**: ${result.projectPath}`);
  lines.push(`**Symbols Analyzed**: ${result.summary.total}`);
  lines.push('');

  // Summary
  lines.push('## 📊 Summary');
  lines.push('');
  lines.push(
    `- ✅ **Complete**: ${result.summary.complete} (${Math.round((result.summary.complete / result.summary.total) * 100)}%)`,
  );
  lines.push(
    `- ⚠️ **Partial**: ${result.summary.partial} (${Math.round((result.summary.partial / result.summary.total) * 100)}%)`,
  );
  lines.push(
    `- ❌ **Missing**: ${result.summary.missing} (${Math.round((result.summary.missing / result.summary.total) * 100)}%)`,
  );
  lines.push('');
  lines.push(`**Overall Completeness**: ${result.summary.completeness.toFixed(1)}%`);
  lines.push('');

  // Details by status
  if (result.analysis.length > 0) {
    lines.push('---');
    lines.push('## 📝 Detailed Analysis');
    lines.push('');

    // Group by status
    const byStatus = {
      missing: result.analysis.filter((a) => a.status === 'missing'),
      partial: result.analysis.filter((a) => a.status === 'partial'),
      complete: result.analysis.filter((a) => a.status === 'complete'),
    };

    for (const [status, items] of Object.entries(byStatus)) {
      if (items.length === 0) continue;

      const icon = status === 'missing' ? '❌' : status === 'partial' ? '⚠️' : '✅';
      const label = status.toUpperCase();

      lines.push(`### ${icon} ${label} (${items.length})`);
      lines.push('');

      for (const item of items) {
        lines.push(`#### \`${item.symbolName}\``);
        lines.push('');
        lines.push(`**File**: \`${item.filePath}\``);
        lines.push('');

        if (item.issues.length > 0) {
          lines.push('**Issues**:');
          for (const issue of item.issues) {
            lines.push(`- ${issue}`);
          }
          lines.push('');
        }

        if (item.suggestions.length > 0) {
          lines.push('**Suggestions**:');
          for (const suggestion of item.suggestions) {
            lines.push(`- ${suggestion}`);
          }
          lines.push('');
        }

        lines.push('---');
        lines.push('');
      }
    }
  }

  // Statistics
  lines.push('## ⏱️ Statistics');
  lines.push('');
  lines.push(`- Analysis Time: ${result.stats.analysisTimeMs}ms`);
  lines.push('');

  return lines.join('\n');
}

/**
 * Format documentation generation result
 */
function formatGenerateDocsResult(result: GenerateDocsResult): string {
  const lines: string[] = [];

  // Header
  lines.push('# Generated Documentation');
  lines.push('');
  lines.push(`**Project**: ${result.projectPath}`);
  lines.push(`**Symbols**: ${result.summary.total}`);
  lines.push('');

  // Summary
  lines.push('## 📊 Summary');
  lines.push('');
  lines.push(`- ✅ **Successful**: ${result.summary.successful}`);
  lines.push(`- ❌ **Failed**: ${result.summary.failed}`);
  lines.push(`- 🎯 **Avg Confidence**: ${(result.summary.avgConfidence * 100).toFixed(1)}%`);
  lines.push('');

  if (result.generated.length === 0) {
    lines.push('---');
    lines.push('No documentation generated.');
    return lines.join('\n');
  }

  // Generated docs
  lines.push('---');
  lines.push('## 📝 Generated Documentation');
  lines.push('');

  for (const doc of result.generated) {
    lines.push(`### \`${doc.symbolName}\``);
    lines.push('');
    lines.push(`**File**: \`${doc.filePath}\``);
    lines.push(`**Format**: ${doc.format}`);
    lines.push(`**Status**: ${doc.status}`);
    lines.push(`**Confidence**: ${(doc.confidence * 100).toFixed(1)}%`);
    lines.push('');

    if (doc.reasoning) {
      lines.push(`**Reasoning**: ${doc.reasoning}`);
      lines.push('');
    }

    lines.push('**Generated Documentation**:');
    lines.push('');
    lines.push('```');
    lines.push(doc.generatedDoc);
    lines.push('```');
    lines.push('');

    if (doc.existingDoc) {
      lines.push('**Existing Documentation**:');
      lines.push('');
      lines.push('```');
      lines.push(doc.existingDoc);
      lines.push('```');
      lines.push('');
    }

    lines.push('---');
    lines.push('');
  }

  // Statistics
  lines.push('## ⏱️ Statistics');
  lines.push('');
  lines.push(`- Generation Time: ${result.stats.generationTimeMs}ms`);
  lines.push('');

  return lines.join('\n');
}

/**
 * Format definition search result for human-readable output
 */
function formatDefinitionResult(result: {
  query: { symbolName: string; searchMode: SearchMode; symbolType?: SymbolType };
  definitions: DefinitionResult[];
  totalFound: number;
  searchTimeMs: number;
}): string {
  const lines: string[] = [];

  // Header
  lines.push(`# Definition Search: "${result.query.symbolName}"`);
  lines.push('');
  lines.push(`**Search Mode**: ${result.query.searchMode}`);
  if (result.query.symbolType) {
    lines.push(`**Symbol Type**: ${result.query.symbolType}`);
  }
  lines.push(`**Results**: ${result.definitions.length} of ${result.totalFound} found`);
  lines.push(`**Search Time**: ${result.searchTimeMs}ms`);
  lines.push('');

  if (result.definitions.length === 0) {
    lines.push('---');
    lines.push('');
    lines.push('❌ **No definitions found**');
    lines.push('');
    lines.push('**Suggestions**:');
    lines.push('- Try `searchMode: "contains"` or `"fuzzy"` for partial matching');
    lines.push('- Check if the symbol name is correct');
    lines.push('- Try with `caseSensitive: false`');
    lines.push('- Remove `symbolType` filter to widen search');
    return lines.join('\n');
  }

  lines.push('---');
  lines.push('');

  // Definitions list
  for (let i = 0; i < result.definitions.length; i++) {
    const def = result.definitions[i];
    const rank = i + 1;

    // Confidence bar
    const confidencePct = Math.round(def.confidence * 100);
    const barLength = Math.min(Math.floor(confidencePct / 5), 20);
    const bar = '█'.repeat(barLength) + '░'.repeat(20 - barLength);

    // Confidence color indicator
    let indicator = '🟢';
    if (def.confidence < 0.7) indicator = '🟡';
    if (def.confidence < 0.5) indicator = '🟠';

    lines.push(`## ${rank}. ${indicator} \`${def.name}\` (${def.type})`);
    lines.push('');
    lines.push(`**Confidence**: ${confidencePct}%`);
    lines.push('');
    lines.push(`\`${bar}\` ${confidencePct}%`);
    lines.push('');

    // Location
    lines.push('**Location**:');
    lines.push(`- File: \`${def.filePath}\``);
    if (def.startLine !== undefined) {
      lines.push(`- Line: ${def.startLine}${def.endLine ? `-${def.endLine}` : ''}`);
    }
    if (def.language) {
      lines.push(`- Language: ${def.language}`);
    }
    lines.push('');

    // Signature
    if (def.signature) {
      lines.push('**Signature**:');
      lines.push('```' + (def.language || ''));
      lines.push(def.signature);
      lines.push('```');
      lines.push('');
    }

    // Match reason
    lines.push('**Why Matched**:');
    lines.push(`- ${def.matchReason}`);
    lines.push('');

    if (i < result.definitions.length - 1) {
      lines.push('---');
      lines.push('');
    }
  }

  // JSON output
  lines.push('');
  lines.push('---');
  lines.push('');
  lines.push('<details>');
  lines.push('<summary>Full JSON Output (click to expand)</summary>');
  lines.push('');
  lines.push('```json');
  lines.push(JSON.stringify(result, null, 2));
  lines.push('```');
  lines.push('</details>');

  return lines.join('\n');
}

/**
 * Format references search result for human-readable output
 */
function formatReferencesResult(result: FindReferencesResult): string {
  const lines: string[] = [];

  // Header
  lines.push(`# References Search: "${result.query.symbolName}"`);
  lines.push('');
  lines.push(`**Total References Found**: ${result.totalReferences}`);
  lines.push(`**Search Time**: ${result.searchTimeMs}ms`);
  lines.push('');

  if (result.totalReferences === 0) {
    lines.push('---');
    lines.push('❌ **No references found**');
    return lines.join('\n');
  }

  // Definition
  if (result.definition) {
    lines.push('---');
    lines.push('## 📌 Definition');
    lines.push('');
    lines.push(`- **Symbol**: \`${result.definition.name}\` (${result.definition.type})`);
    lines.push(`- **File**: \`${result.definition.filePath}\``);
    lines.push(`- **Line**: ${result.definition.startLine}`);
    if (result.definition.signature) {
      lines.push('- **Signature**:');
      lines.push('```' + (result.definition.language || ''));
      lines.push(result.definition.signature);
      lines.push('```');
    }
    lines.push('');
  }

  // References
  lines.push('---');
  lines.push('## 🔗 References');
  lines.push('');

  if (result.fileReferences) {
    for (const fileGroup of result.fileReferences) {
      lines.push(`### 📄 \`${fileGroup.file}\` (${fileGroup.referenceCount} references)`);
      lines.push('');
      for (const ref of fileGroup.references) {
        lines.push(`- **L${ref.location.line}**: [${ref.type}] \`${ref.referrer.name}\``);
        if (ref.location.context) {
          lines.push('  ```' + (ref.referrer.language || ''));
          lines.push(`  ${ref.location.context.trim()}`);
          lines.push('  ```');
        }
      }
      lines.push('');
    }
  } else {
    for (const ref of result.references) {
      lines.push(`- \`${ref.location.file}:${ref.location.line}\` [${ref.type}]`);
    }
  }

  // JSON output
  lines.push('');
  lines.push('---');
  lines.push('<details>');
  lines.push('<summary>Full JSON Output (click to expand)</summary>');
  lines.push('');
  lines.push('```json');
  lines.push(JSON.stringify(result, null, 2));
  lines.push('```');
  lines.push('</details>');

  return lines.join('\n');
}

/**
 * Format call hierarchy result for human-readable output
 */
function formatCallHierarchyResult(result: CallHierarchyResult): string {
  const lines: string[] = [];

  // Header
  lines.push(`# Call Hierarchy: "${result.query.symbolName}"`);
  lines.push('');
  lines.push(`**Direction**: ${result.query.direction}`);
  lines.push(`**Max Depth**: ${result.query.maxDepth}`);
  lines.push('');

  // Root entity info
  if (result.rootEntity) {
    lines.push('## 🎯 Root Function');
    lines.push('');
    lines.push(`- **Name**: \`${result.rootEntity.name}\``);
    lines.push(`- **Type**: ${result.rootEntity.type}`);
    if (result.rootEntity.filePath) {
      lines.push(
        `- **Location**: \`${result.rootEntity.filePath}:${result.rootEntity.startLine}\``,
      );
    }
    if (result.rootEntity.signature) {
      lines.push('- **Signature**:');
      lines.push('```' + (result.rootEntity.language || ''));
      lines.push(result.rootEntity.signature);
      lines.push('```');
    }
    lines.push('');
  }

  // ASCII Tree Visualization
  if (result.visualizations.asciiTree) {
    lines.push('---');
    lines.push('## 📊 Call Hierarchy Tree');
    lines.push('');
    lines.push('```');
    lines.push(result.visualizations.asciiTree);
    lines.push('```');
    lines.push('');
  }

  // Mermaid Diagram
  if (result.visualizations.mermaidDiagram) {
    lines.push('---');
    lines.push('## 🔷 Mermaid Diagram');
    lines.push('');
    lines.push(result.visualizations.mermaidDiagram);
    lines.push('');
  }

  // Statistics
  lines.push('---');
  lines.push('## 📈 Statistics');
  lines.push('');
  lines.push(`- **Total Nodes**: ${result.stats.totalNodes}`);
  lines.push(`- **Max Depth Reached**: ${result.stats.maxDepthReached}`);
  lines.push(`- **Tree Pruned**: ${result.stats.pruned ? 'Yes' : 'No'}`);
  lines.push(`- **Build Time**: ${result.stats.buildTimeMs}ms`);
  lines.push('');

  if (result.stats.pruned) {
    lines.push(
      '> ⚠️ **Note**: Tree was pruned to limit output size. Some branches may be truncated.',
    );
    lines.push('');
  }

  // JSON output
  lines.push('---');
  lines.push('<details>');
  lines.push('<summary>Full JSON Output (click to expand)</summary>');
  lines.push('');
  lines.push('```json');
  lines.push(JSON.stringify(result, null, 2));
  lines.push('```');
  lines.push('</details>');

  return lines.join('\n');
}

/**
 * Format code smells detection result
 */
function formatSmellsResult(result: DetectSmellsResult): string {
  const lines: string[] = [];

  // Header
  lines.push(`# Code Smell Detection: "${result.projectPath}"`);
  lines.push('');
  lines.push(`**Total Smells Found**: ${result.summary.totalSmells}`);
  lines.push(`**Entities Analyzed**: ${result.stats.entitiesAnalyzed}`);
  lines.push(`**Detection Time**: ${result.stats.detectionTimeMs}ms`);
  lines.push('');

  if (result.summary.totalSmells === 0) {
    lines.push('---');
    lines.push('✅ **No code smells detected!**');
    lines.push('');
    lines.push('Your code looks clean. Great job!');
    return lines.join('\n');
  }

  // Summary by severity
  lines.push('## 📊 Summary by Severity');
  lines.push('');
  const { bySeverity } = result.summary;
  if (bySeverity.ERROR > 0) {
    lines.push(`- 🔴 **ERROR**: ${bySeverity.ERROR} smells`);
  }
  if (bySeverity.WARNING > 0) {
    lines.push(`- 🟡 **WARNING**: ${bySeverity.WARNING} smells`);
  }
  if (bySeverity.INFO > 0) {
    lines.push(`- 🔵 **INFO**: ${bySeverity.INFO} smells`);
  }
  lines.push('');

  // Summary by type
  lines.push('## 📈 Summary by Type');
  lines.push('');
  const { byType } = result.summary;
  for (const [type, count] of Object.entries(byType)) {
    if (count > 0) {
      const icon = getSmellIcon(type as SmellType);
      lines.push(`- ${icon} **${formatSmellType(type as SmellType)}**: ${count}`);
    }
  }
  lines.push('');

  // Detailed smells
  lines.push('---');
  lines.push('## 🔍 Detected Smells');
  lines.push('');

  // Group by severity
  const smellsBySeverity = {
    ERROR: result.smells.filter((s) => s.severity === 'ERROR'),
    WARNING: result.smells.filter((s) => s.severity === 'WARNING'),
    INFO: result.smells.filter((s) => s.severity === 'INFO'),
  };

  for (const [severity, smells] of Object.entries(smellsBySeverity)) {
    if (smells.length === 0) continue;

    const icon = severity === 'ERROR' ? '🔴' : severity === 'WARNING' ? '🟡' : '🔵';
    lines.push(`### ${icon} ${severity} (${smells.length})`);
    lines.push('');

    for (const smell of smells) {
      lines.push(`#### ${getSmellIcon(smell.type)} ${smell.message}`);
      lines.push('');
      lines.push(`**Location**: \`${smell.location.file}:${smell.location.line}\``);
      lines.push(`**Type**: ${formatSmellType(smell.type)}`);

      if (smell.metrics) {
        lines.push('**Metrics**:');
        if (smell.metrics.complexity !== undefined) {
          lines.push(`  - Complexity: ${smell.metrics.complexity}`);
        }
        if (smell.metrics.lineCount !== undefined) {
          lines.push(`  - Line Count: ${smell.metrics.lineCount}`);
        }
        if (smell.metrics.parameterCount !== undefined) {
          lines.push(`  - Parameter Count: ${smell.metrics.parameterCount}`);
        }
        if (smell.metrics.nestingDepth !== undefined) {
          lines.push(`  - Nesting Depth: ${smell.metrics.nestingDepth}`);
        }
      }

      lines.push('');
      lines.push(`**Explanation**: ${smell.explanation}`);
      lines.push('');
      lines.push(`💡 **Suggestion**: ${smell.suggestion}`);
      lines.push('');
      lines.push('---');
      lines.push('');
    }
  }

  // JSON output
  lines.push('## 📄 Full JSON Output');
  lines.push('');
  lines.push('<details>');
  lines.push('<summary>Click to expand</summary>');
  lines.push('');
  lines.push('```json');
  lines.push(JSON.stringify(result, null, 2));
  lines.push('```');
  lines.push('</details>');

  return lines.join('\n');
}

/**
 * Get icon for smell type
 */
function getSmellIcon(type: SmellType): string {
  const icons: Record<SmellType, string> = {
    'god-function': '🏛️',
    'deep-nesting': '🪆',
    'long-parameters': '📝',
    'long-function': '📏',
    'dead-code': '💀',
    'magic-number': '🔮',
    'duplicated-code': '🔁',
  };
  return icons[type] || '⚠️';
}

/**
 * Format smell type for display
 */
function formatSmellType(type: SmellType): string {
  const names: Record<SmellType, string> = {
    'god-function': 'God Function',
    'deep-nesting': 'Deep Nesting',
    'long-parameters': 'Long Parameter List',
    'long-function': 'Long Function',
    'dead-code': 'Dead Code',
    'magic-number': 'Magic Number',
    'duplicated-code': 'Duplicated Code',
  };
  return names[type] || type;
}

/**
 * Format refactoring suggestions result
 */
function formatRefactoringSuggestionsResult(result: SuggestRefactoringsResult): string {
  const lines: string[] = [];

  // Header
  lines.push(`# Refactoring Suggestions`);
  lines.push('');
  lines.push(`**Total Suggestions**: ${result.summary.totalSuggestions}`);
  lines.push(`**Analysis Time**: ${result.stats.analysisTimeMs}ms`);
  lines.push('');

  if (result.summary.totalSuggestions === 0) {
    lines.push('---');
    lines.push('✅ **No refactorings suggested**');
    lines.push('');
    lines.push('Your code looks good!');
    return lines.join('\n');
  }

  // Summary by priority
  lines.push('## 📊 Summary by Priority');
  lines.push('');
  const { byPriority } = result.summary;
  if (byPriority.high > 0) {
    lines.push(`- 🔴 **High Priority**: ${byPriority.high} suggestions`);
  }
  if (byPriority.medium > 0) {
    lines.push(`- 🟡 **Medium Priority**: ${byPriority.medium} suggestions`);
  }
  if (byPriority.low > 0) {
    lines.push(`- 🔵 **Low Priority**: ${byPriority.low} suggestions`);
  }
  lines.push('');

  // Summary by pattern
  lines.push('## 🔧 Summary by Pattern');
  lines.push('');
  const { byPattern } = result.summary;
  for (const [pattern, count] of Object.entries(byPattern)) {
    if (count > 0) {
      const icon = getRefactoringIcon(pattern as RefactoringPattern);
      lines.push(
        `- ${icon} **${formatRefactoringPattern(pattern as RefactoringPattern)}**: ${count}`,
      );
    }
  }
  lines.push('');

  // Detailed suggestions
  lines.push('---');
  lines.push('## 💡 Recommended Refactorings');
  lines.push('');

  // Group by priority
  const suggestionsByPriority = {
    high: result.suggestions.filter((s) => s.priority === 'high'),
    medium: result.suggestions.filter((s) => s.priority === 'medium'),
    low: result.suggestions.filter((s) => s.priority === 'low'),
  };

  for (const [priority, suggestions] of Object.entries(suggestionsByPriority)) {
    if (suggestions.length === 0) continue;

    const icon = priority === 'high' ? '🔴' : priority === 'medium' ? '🟡' : '🔵';
    lines.push(`### ${icon} ${priority.toUpperCase()} Priority (${suggestions.length})`);
    lines.push('');

    for (const suggestion of suggestions) {
      lines.push(`#### ${getRefactoringIcon(suggestion.pattern)} ${suggestion.title}`);
      lines.push('');
      lines.push(`**ID**: \`${suggestion.id}\``);
      lines.push(`**Pattern**: ${formatRefactoringPattern(suggestion.pattern)}`);
      lines.push(
        `**Target**: \`${suggestion.targetEntity.name}\` in \`${suggestion.targetEntity.filePath}\``,
      );
      lines.push('');
      lines.push(`**Description**: ${suggestion.description}`);
      lines.push('');
      lines.push(`**Reasoning**: ${suggestion.reasoning}`);
      lines.push('');

      // Score card
      lines.push('**Score Card**:');
      lines.push('```');
      lines.push(
        `Benefit:  ${'█'.repeat(suggestion.score.benefit)}${'░'.repeat(10 - suggestion.score.benefit)} ${suggestion.score.benefit}/10`,
      );
      lines.push(
        `Risk:     ${'█'.repeat(suggestion.score.risk)}${'░'.repeat(10 - suggestion.score.risk)} ${suggestion.score.risk}/10`,
      );
      lines.push(
        `Effort:   ${'█'.repeat(suggestion.score.effort)}${'░'.repeat(10 - suggestion.score.effort)} ${suggestion.score.effort}/10`,
      );
      lines.push(
        `Impact:   ${'█'.repeat(suggestion.score.impact)}${'░'.repeat(10 - suggestion.score.impact)} ${suggestion.score.impact}/10`,
      );
      lines.push(`Overall:  ${suggestion.score.overall}/10`);
      lines.push('```');
      lines.push('');

      // Benefits
      lines.push('**✅ Benefits**:');
      for (const benefit of suggestion.benefits) {
        lines.push(`- ${benefit}`);
      }
      lines.push('');

      // Risks
      lines.push('**⚠️ Risks**:');
      for (const risk of suggestion.risks) {
        lines.push(`- ${risk}`);
      }
      lines.push('');

      // Steps
      lines.push('**📋 Step-by-Step Instructions**:');
      for (const step of suggestion.steps) {
        lines.push(step);
      }
      lines.push('');

      if (suggestion.estimatedTime) {
        lines.push(`**⏱️ Estimated Time**: ${suggestion.estimatedTime}`);
        lines.push('');
      }

      if (suggestion.affectedFiles && suggestion.affectedFiles.length > 0) {
        lines.push(`**📁 Affected Files**: ${suggestion.affectedFiles.length} file(s)`);
        for (const file of suggestion.affectedFiles) {
          lines.push(`  - \`${file}\``);
        }
        lines.push('');
      }

      lines.push('---');
      lines.push('');
    }
  }

  // Next steps
  lines.push('## 🚀 Next Steps');
  lines.push('');
  lines.push('1. Review suggestions by priority (start with 🔴 High)');
  lines.push('2. For each suggestion, assess benefit vs risk');
  lines.push('3. Use `code.previewRefactoring` to see before/after (coming soon)');
  lines.push('4. Apply refactorings incrementally');
  lines.push('5. Run tests after each refactoring');
  lines.push('');

  return lines.join('\n');
}

/**
 * Get icon for refactoring pattern
 */
function getRefactoringIcon(pattern: RefactoringPattern): string {
  const icons: Record<RefactoringPattern, string> = {
    'extract-method': '✂️',
    'introduce-parameter-object': '📦',
    'remove-dead-code': '🗑️',
    'inline-function': '➡️',
    'rename-symbol': '✏️',
    'split-function': '🔀',
  };
  return icons[pattern] || '🔧';
}

/**
 * Format refactoring pattern for display
 */
function formatRefactoringPattern(pattern: RefactoringPattern): string {
  const names: Record<RefactoringPattern, string> = {
    'extract-method': 'Extract Method',
    'introduce-parameter-object': 'Introduce Parameter Object',
    'remove-dead-code': 'Remove Dead Code',
    'inline-function': 'Inline Function',
    'rename-symbol': 'Rename Symbol',
    'split-function': 'Split Function',
  };
  return names[pattern] || pattern;
}
