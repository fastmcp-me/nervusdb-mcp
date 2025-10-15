import type { McpServer } from '@modelcontextprotocol/sdk/server/mcp.js';
import { z } from 'zod';

import {
  ProjectService,
  type ProjectServiceDependencies,
  type FindRelatedFilesResult,
  type EnhancedRelatedFile,
} from '../services/projectService.js';
import type { EnhancedImpactAnalysis } from '../services/impactAnalyzer.js';

const factSchema = () =>
  z
    .object({
      subject: z.string(),
      predicate: z.string(),
      object: z.string(),
      properties: z.record(z.unknown()).optional(),
    })
    .strict();

const structureNodeSchema = z.lazy(() =>
  z
    .object({
      name: z.string(),
      path: z.string(),
      type: z.enum(['directory', 'file']),
      size: z.number(),
      tokens: z.number(),
      children: z.array(structureNodeSchema).optional(),
      commentsPreview: z.array(z.string()).optional(),
    })
    .strict(),
);

const structureOutputSchema = z
  .object({
    summary: z
      .object({
        totalFiles: z.number(),
        totalCharacters: z.number(),
        totalTokens: z.number(),
        commentsIncluded: z.boolean(),
      })
      .strict(),
    files: z.array(
      z
        .object({
          path: z.string(),
          size: z.number(),
          tokens: z.number(),
          commentsPreview: z.array(z.string()).optional(),
        })
        .strict(),
    ),
    tree: z.array(structureNodeSchema),
  })
  .strict();

const relatedFilesOutputSchema = z
  .object({
    related: z.array(
      z
        .object({
          file: z.string(),
          score: z.number(),
          reasons: z.array(factSchema()),
        })
        .strict(),
    ),
  })
  .strict();

export interface ProjectToolDependencies {
  service?: ProjectService;
  serviceDeps?: Partial<ProjectServiceDependencies>;
}

/**
 * Format enhanced impact analysis for human-readable output
 */
function formatEnhancedImpactAnalysis(analysis: EnhancedImpactAnalysis): string {
  const lines: string[] = [];

  // Header
  lines.push(`# Impact Analysis: ${analysis.symbol} (${analysis.type})`);
  lines.push('');

  // Risk Assessment
  const riskEmoji = {
    low: '🟢',
    medium: '🟡',
    high: '🟠',
    critical: '🔴',
  }[analysis.riskLevel];

  lines.push(`## Risk Level: ${riskEmoji} ${analysis.riskLevel.toUpperCase()}`);
  lines.push('');

  // Risk Factors
  if (analysis.riskFactors.length > 0) {
    lines.push('### Risk Factors:');
    for (const factor of analysis.riskFactors) {
      lines.push(`- ${factor}`);
    }
    lines.push('');
  }

  // Impact Summary
  lines.push('## Impact Summary');
  lines.push('');
  lines.push(`- **Direct Callers**: ${analysis.directCallers.length}`);
  lines.push(`- **Indirect Callers**: ${analysis.indirectCallers.length}`);
  lines.push(`- **Total Callers**: ${analysis.totalCallers}`);
  lines.push(`- **Affected Files**: ${analysis.affectedFiles.length}`);
  lines.push(`- **Test Files Found**: ${analysis.testFiles.length}`);
  lines.push(`- **Test Coverage**: ${Math.round(analysis.testCoverage * 100)}%`);
  lines.push(`- **Analysis Depth**: ${analysis.analysisDepth} levels`);
  lines.push('');

  // Direct Callers
  if (analysis.directCallers.length > 0) {
    lines.push('## Direct Callers');
    lines.push('');
    for (const caller of analysis.directCallers.slice(0, 10)) {
      lines.push(`- **${caller.name}** (${caller.type})`);
      lines.push(`  - File: \`${caller.filePath}\``);
      if (caller.signature) {
        lines.push(
          `  - Signature: \`${caller.signature.substring(0, 100)}${caller.signature.length > 100 ? '...' : ''}\``,
        );
      }
    }
    if (analysis.directCallers.length > 10) {
      lines.push(`- ... and ${analysis.directCallers.length - 10} more`);
    }
    lines.push('');
  }

  // Indirect Callers (top 5)
  if (analysis.indirectCallers.length > 0) {
    lines.push('## Indirect Callers (Sample)');
    lines.push('');
    for (const caller of analysis.indirectCallers.slice(0, 5)) {
      lines.push(`- **${caller.name}** in \`${caller.filePath}\``);
    }
    if (analysis.indirectCallers.length > 5) {
      lines.push(`- ... and ${analysis.indirectCallers.length - 5} more`);
    }
    lines.push('');
  }

  // Affected Files
  if (analysis.affectedFiles.length > 0) {
    lines.push('## Affected Files');
    lines.push('');
    for (const file of analysis.affectedFiles.slice(0, 10)) {
      lines.push(`- \`${file}\``);
    }
    if (analysis.affectedFiles.length > 10) {
      lines.push(`- ... and ${analysis.affectedFiles.length - 10} more`);
    }
    lines.push('');
  }

  // Test Files
  if (analysis.testFiles.length > 0) {
    lines.push('## Related Test Files');
    lines.push('');
    for (const testFile of analysis.testFiles) {
      lines.push(`- \`${testFile}\``);
    }
    lines.push('');
  }

  // Recommendations
  if (analysis.recommendations.length > 0) {
    lines.push('## Recommendations');
    lines.push('');
    for (let i = 0; i < analysis.recommendations.length; i++) {
      lines.push(`${i + 1}. ${analysis.recommendations[i]}`);
    }
    lines.push('');
  }

  // JSON for programmatic access
  lines.push('---');
  lines.push('');
  lines.push('<details>');
  lines.push('<summary>Full JSON Output (click to expand)</summary>');
  lines.push('');
  lines.push('```json');
  lines.push(JSON.stringify(analysis, null, 2));
  lines.push('```');
  lines.push('</details>');

  return lines.join('\n');
}

/**
 * Format enhanced related files for human-readable output
 */
function formatEnhancedRelatedFiles(result: FindRelatedFilesResult): string {
  if (!result.enhanced || !Array.isArray(result.related) || result.related.length === 0) {
    return JSON.stringify(result, null, 2);
  }

  const enhanced = result.related as EnhancedRelatedFile[];
  const lines: string[] = [];

  // Header
  lines.push(`# Related Files Analysis`);
  lines.push('');
  lines.push(`**Total Files Analyzed**: ${result.totalFilesAnalyzed ?? 'N/A'}`);
  lines.push(`**Max Score**: ${result.maxScore?.toFixed(2) ?? 'N/A'}`);
  lines.push(`**Results**: ${enhanced.length} files`);
  lines.push('');
  lines.push('---');
  lines.push('');

  // Top related files
  for (let i = 0; i < enhanced.length; i++) {
    const file = enhanced[i];
    const rank = i + 1;

    // Score bar visualization
    const normalizedPct = Math.round(file.normalizedScore * 100);
    const barLength = Math.min(Math.floor(normalizedPct / 5), 20); // Max 20 chars
    const bar = '█'.repeat(barLength) + '░'.repeat(20 - barLength);

    lines.push(`## ${rank}. \`${file.filePath}\``);
    lines.push('');
    lines.push(`**Score**: ${file.score.toFixed(2)} | **Normalized**: ${normalizedPct}%`);
    lines.push('');
    lines.push(`\`${bar}\` ${normalizedPct}%`);
    lines.push('');

    // Relationship breakdown
    if (Object.keys(file.relationshipCounts).length > 0) {
      lines.push('**Relationships**:');
      for (const [type, count] of Object.entries(file.relationshipCounts)) {
        lines.push(`- ${type}: ${count}×`);
      }
      lines.push('');
    }

    // Detailed reasons (top 5)
    if (file.reasons.length > 0) {
      lines.push('**Why Related**:');
      for (const reason of file.reasons.slice(0, 5)) {
        const weight = reason.weight.toFixed(1);
        lines.push(`- [+${weight}] ${reason.description}`);
      }
      if (file.reasons.length > 5) {
        lines.push(`- ... and ${file.reasons.length - 5} more reasons`);
      }
      lines.push('');
    }

    if (i < enhanced.length - 1) {
      lines.push('---');
      lines.push('');
    }
  }

  // JSON for programmatic access
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

const getStructureInputSchema = z
  .object({
    projectPath: z.string(),
    withComments: z.boolean().default(false),
    maxDepth: z
      .number()
      .int()
      .min(1)
      .max(20)
      .optional()
      .describe('Limit tree depth (e.g., 3 = only show 3 levels). Useful for large projects.'),
    limit: z
      .number()
      .int()
      .min(1)
      .max(1000)
      .optional()
      .describe(
        'Limit number of files returned (e.g., 100 = first 100 files). Reduces response size.',
      ),
    pathFilter: z
      .string()
      .optional()
      .describe(
        'Glob pattern to filter paths (e.g., "src/**", "**/*.java"). Only matching files will be included.',
      ),
  })
  .strict();

const analyzeImpactInputSchemaObject = z
  .object({
    projectPath: z.string().describe('Project root path'),
    // New enhanced mode
    symbol: z
      .string()
      .optional()
      .describe('Symbol name (function/class/interface) for enhanced analysis'),
    type: z
      .enum(['function', 'class', 'interface'])
      .optional()
      .describe('Symbol type for enhanced analysis'),
    maxDepth: z
      .number()
      .int()
      .min(1)
      .max(10)
      .default(3)
      .optional()
      .describe('Maximum analysis depth for call chains'),
    // Legacy mode (backward compatibility)
    filePath: z.string().optional().describe('(Legacy) File path to analyze'),
    functionName: z.string().optional().describe('(Legacy) Function name to find callers'),
    limit: z
      .number()
      .int()
      .min(1)
      .max(500)
      .default(100)
      .describe('(Legacy) Maximum number of results'),
  })
  .strict();

// Note: .refine() validation is not included here because MCP SDK's JSON Schema
// cannot express complex business logic validations. Validation should be handled
// in the service layer where it can return meaningful error messages.

const findRelatedFilesInputSchema = z
  .object({
    projectPath: z.string().describe('Project root path'),
    filePath: z.string().describe('File path to find related files for'),
    limit: z.number().int().min(1).max(200).default(50).describe('Maximum number of results'),
    // Enhanced mode
    enhanced: z
      .boolean()
      .default(false)
      .optional()
      .describe('Use intelligent multi-relationship scoring'),
    includeSharedDependencies: z
      .boolean()
      .default(true)
      .optional()
      .describe('Include files with shared dependencies'),
    minScoreThreshold: z
      .number()
      .min(0)
      .max(1)
      .default(0.1)
      .optional()
      .describe('Minimum normalized score (0-1)'),
  })
  .strict();

export function registerProjectTools(
  server: McpServer,
  deps: Partial<ProjectToolDependencies> = {},
): void {
  const resolvedService =
    deps.service ??
    (() => {
      if (!deps.serviceDeps?.query) {
        throw new Error('ProjectService 需要注入 QueryService 依赖');
      }
      return new ProjectService({
        ...deps.serviceDeps,
        query: deps.serviceDeps.query,
      });
    })();

  server.registerTool(
    'project.getStructure',
    {
      title: 'Get Project Structure',
      description:
        '返回项目文件结构及统计信息。' +
        ' 支持maxDepth限制树深度、limit限制文件数量、pathFilter过滤路径。' +
        ' 对于大型项目，建议使用这些参数减少响应大小。',
      inputSchema: getStructureInputSchema.shape,
      outputSchema: structureOutputSchema.shape,
    },
    async ({ projectPath, withComments = false, maxDepth, limit, pathFilter }) => {
      const result = await resolvedService.getStructure({
        projectPath,
        withComments,
        maxDepth,
        limit,
        pathFilter,
      });
      return {
        content: [{ type: 'text', text: JSON.stringify(result, null, 2) }],
        structuredContent: result as unknown as { [x: string]: unknown },
      };
    },
  );

  server.registerTool(
    'project.readFile',
    {
      title: 'Read arbitrary file',
      description: '读取绝对路径的文件（仅用于调试场景）。',
      inputSchema: { filePath: z.string() },
      outputSchema: { content: z.string() },
    },
    async ({ filePath }) => {
      const content = await resolvedService.readFile(filePath);
      return {
        content: [{ type: 'text', text: content }],
        structuredContent: { content } as unknown as { [x: string]: unknown },
      };
    },
  );

  server.registerTool(
    'project.analyzeImpact',
    {
      title: 'Analyze code impact with intelligent risk assessment',
      description:
        'Analyze the impact of changing a symbol (function/class/interface). ' +
        'Provides intelligent risk assessment, test coverage analysis, and actionable recommendations. ' +
        'Enhanced mode: provide "symbol" and "type" for deep analysis with risk scoring. ' +
        'Legacy mode: provide "filePath" or "functionName" for basic graph queries.',
      inputSchema: analyzeImpactInputSchemaObject.shape,
      // Note: outputSchema is union type, not specifying for MCP compatibility
      outputSchema: {},
    },
    async ({ projectPath, symbol, type, maxDepth, filePath, functionName, limit }) => {
      const result = await resolvedService.analyzeImpact({
        projectPath,
        symbol,
        type,
        maxDepth,
        filePath,
        functionName,
        limit: limit ?? 100,
      });

      // Format output based on result type
      let formattedOutput: string;

      if ('riskLevel' in result) {
        // Enhanced format: more human-readable
        const enhanced = result as EnhancedImpactAnalysis;
        formattedOutput = formatEnhancedImpactAnalysis(enhanced);
      } else {
        // Legacy format: raw JSON
        formattedOutput = JSON.stringify(result, null, 2);
      }

      return {
        content: [{ type: 'text', text: formattedOutput }],
        structuredContent: result as unknown as { [x: string]: unknown },
      };
    },
  );

  server.registerTool(
    'project.findRelatedFiles',
    {
      title: 'Find related files with intelligent scoring',
      description:
        'Find files related to the target file using intelligent multi-relationship scoring. ' +
        'Enhanced mode: weighted scoring (IMPORTS 1.0, CALLS 0.8, IMPLEMENTS 0.9, shared deps 0.3). ' +
        'Legacy mode: simple counting. ' +
        'Provides detailed explanations for each relationship.',
      inputSchema: findRelatedFilesInputSchema.shape,
      outputSchema: relatedFilesOutputSchema.shape,
    },
    async ({
      projectPath,
      filePath,
      limit,
      enhanced,
      includeSharedDependencies,
      minScoreThreshold,
    }) => {
      const result = await resolvedService.findRelatedFiles({
        projectPath,
        filePath,
        limit: limit ?? 50,
        enhanced: enhanced ?? false,
        includeSharedDependencies,
        minScoreThreshold,
      });

      // Format output based on mode
      let formattedOutput: string;

      if (result.enhanced) {
        // Enhanced format: human-readable Markdown
        formattedOutput = formatEnhancedRelatedFiles(result);
      } else {
        // Legacy format: raw JSON
        formattedOutput = JSON.stringify(result, null, 2);
      }

      return {
        content: [{ type: 'text', text: formattedOutput }],
        structuredContent: result as unknown as { [x: string]: unknown },
      };
    },
  );
}
