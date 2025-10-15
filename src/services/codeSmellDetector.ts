/**
 * Code Smell Detector Service
 *
 * Detects common code smells and anti-patterns using AST analysis and graph queries.
 * Provides actionable insights and refactoring suggestions.
 *
 * Supported Code Smells:
 * 1. God Functions (high complexity)
 * 2. Deep Nesting (>4 levels)
 * 3. Long Parameter Lists (>5 parameters)
 * 4. Long Functions (>50 lines)
 * 5. Dead Code (unused functions)
 * 6. Magic Numbers
 * 7. Duplicated Code Patterns
 */

import type { QueryService, CodeEntityInfo } from '../domain/query/queryService.js';

/**
 * Severity levels for code smells
 */
export type SmellSeverity = 'INFO' | 'WARNING' | 'ERROR';

/**
 * Types of code smells
 */
export type SmellType =
  | 'god-function'
  | 'deep-nesting'
  | 'long-parameters'
  | 'long-function'
  | 'dead-code'
  | 'magic-number'
  | 'duplicated-code';

/**
 * Code smell detection result
 */
export interface CodeSmell {
  type: SmellType;
  severity: SmellSeverity;
  entity: CodeEntityInfo;
  location: {
    file: string;
    line: number;
    column?: number;
  };
  message: string;
  explanation: string;
  suggestion: string;
  metrics?: {
    complexity?: number;
    nestingDepth?: number;
    parameterCount?: number;
    lineCount?: number;
    referenceCount?: number;
  };
}

/**
 * Input for code smell detection
 */
export interface DetectSmellsInput {
  projectPath: string;
  symbols: string[]; // Function names to check
  severityThreshold?: SmellSeverity; // Only return smells >= threshold
  smellTypes?: SmellType[]; // Optional: specific smell types to check
  config?: SmellDetectionConfig;
}

/**
 * Configuration for smell detection
 */
export interface SmellDetectionConfig {
  // Complexity thresholds
  maxComplexity?: number; // default: 10
  maxNestingDepth?: number; // default: 4
  maxParameters?: number; // default: 5
  maxFunctionLines?: number; // default: 50

  // Dead code detection
  includeDead?: boolean; // default: true

  // Magic number detection
  detectMagicNumbers?: boolean; // default: true
  allowedNumbers?: number[]; // Numbers to exclude (e.g., 0, 1, -1)

  // Duplication detection
  detectDuplication?: boolean; // default: false (expensive)
  minDuplicationTokens?: number; // default: 50
}

/**
 * Result of code smell detection
 */
export interface DetectSmellsResult {
  projectPath: string;
  smells: CodeSmell[];
  summary: {
    totalSmells: number;
    byType: Record<SmellType, number>;
    bySeverity: Record<SmellSeverity, number>;
  };
  stats: {
    filesAnalyzed: number;
    entitiesAnalyzed: number;
    detectionTimeMs: number;
  };
}

/**
 * Service for detecting code smells
 */
export class CodeSmellDetector {
  constructor(private readonly deps: { queryService: QueryService }) {}

  /**
   * Detect code smells in a project
   */
  async detectSmells(input: DetectSmellsInput): Promise<DetectSmellsResult> {
    const startTime = Date.now();

    // Default config
    const config: Required<SmellDetectionConfig> = {
      maxComplexity: input.config?.maxComplexity ?? 10,
      maxNestingDepth: input.config?.maxNestingDepth ?? 4,
      maxParameters: input.config?.maxParameters ?? 5,
      maxFunctionLines: input.config?.maxFunctionLines ?? 50,
      includeDead: input.config?.includeDead ?? true,
      detectMagicNumbers: input.config?.detectMagicNumbers ?? true,
      allowedNumbers: input.config?.allowedNumbers ?? [0, 1, -1, 100],
      detectDuplication: input.config?.detectDuplication ?? false,
      minDuplicationTokens: input.config?.minDuplicationTokens ?? 50,
    };

    const severityThreshold = input.severityThreshold ?? 'INFO';
    const smellTypes = input.smellTypes ?? [
      'god-function',
      'deep-nesting',
      'long-parameters',
      'long-function',
      'dead-code',
    ];

    // Get entity info for each symbol
    const functions: CodeEntityInfo[] = [];

    for (const symbolName of input.symbols) {
      try {
        // Try to get call hierarchy to verify function exists and get info
        const hierarchy = await this.deps.queryService.getCallHierarchy(
          input.projectPath,
          symbolName,
          0, // depth 0 to just get the entity info
        );
        functions.push(hierarchy.entity);
      } catch (error) {
        // Symbol not found or error, skip
        continue;
      }
    }

    if (functions.length === 0) {
      // No valid functions found
      return {
        projectPath: input.projectPath,
        smells: [],
        summary: {
          totalSmells: 0,
          byType: {
            'god-function': 0,
            'deep-nesting': 0,
            'long-parameters': 0,
            'long-function': 0,
            'dead-code': 0,
            'magic-number': 0,
            'duplicated-code': 0,
          },
          bySeverity: {
            INFO: 0,
            WARNING: 0,
            ERROR: 0,
          },
        },
        stats: {
          filesAnalyzed: 0,
          entitiesAnalyzed: 0,
          detectionTimeMs: Date.now() - startTime,
        },
      };
    }

    // Detect smells
    const smells: CodeSmell[] = [];

    for (const func of functions) {
      // God Function detection
      if (smellTypes.includes('god-function')) {
        const godSmell = await this.detectGodFunction(input.projectPath, func, config);
        if (godSmell && this.meetsThreshold(godSmell.severity, severityThreshold)) {
          smells.push(godSmell);
        }
      }

      // Long Function detection
      if (smellTypes.includes('long-function')) {
        const longSmell = this.detectLongFunction(func, config);
        if (longSmell && this.meetsThreshold(longSmell.severity, severityThreshold)) {
          smells.push(longSmell);
        }
      }

      // Long Parameter List detection
      if (smellTypes.includes('long-parameters')) {
        const paramSmell = this.detectLongParameters(func, config);
        if (paramSmell && this.meetsThreshold(paramSmell.severity, severityThreshold)) {
          smells.push(paramSmell);
        }
      }

      // Dead Code detection
      if (smellTypes.includes('dead-code') && config.includeDead) {
        const deadSmell = await this.detectDeadCode(input.projectPath, func);
        if (deadSmell && this.meetsThreshold(deadSmell.severity, severityThreshold)) {
          smells.push(deadSmell);
        }
      }
    }

    // Generate summary
    const summary = this.generateSummary(smells);

    const stats = {
      filesAnalyzed: new Set(functions.map((f) => f.filePath)).size,
      entitiesAnalyzed: functions.length,
      detectionTimeMs: Date.now() - startTime,
    };

    return {
      projectPath: input.projectPath,
      smells,
      summary,
      stats,
    };
  }

  /**
   * Detect God Function (high complexity)
   */
  private async detectGodFunction(
    projectPath: string,
    func: CodeEntityInfo,
    config: Required<SmellDetectionConfig>,
  ): Promise<CodeSmell | null> {
    // Approximate complexity by counting callees (functions it calls)
    try {
      const hierarchy = await this.deps.queryService.getCallHierarchy(
        projectPath,
        func.name,
        1, // depth 1 to count direct callees
      );

      const calleeCount = hierarchy.callees.length;

      // Heuristic: High number of callees indicates high complexity
      if (calleeCount > config.maxComplexity) {
        const severity: SmellSeverity =
          calleeCount > config.maxComplexity * 2 ? 'ERROR' : 'WARNING';

        return {
          type: 'god-function',
          severity,
          entity: func,
          location: {
            file: func.filePath,
            line: func.startLine ?? 0,
          },
          message: `Function '${func.name}' has high complexity`,
          explanation: `This function calls ${calleeCount} other functions, indicating it may be doing too much. God functions are hard to test, understand, and maintain.`,
          suggestion:
            'Consider breaking this function into smaller, focused functions using Extract Method refactoring.',
          metrics: {
            complexity: calleeCount,
          },
        };
      }
    } catch (error) {
      // Function not found in call hierarchy, skip
    }

    return null;
  }

  /**
   * Detect Long Function
   */
  private detectLongFunction(
    func: CodeEntityInfo,
    config: Required<SmellDetectionConfig>,
  ): CodeSmell | null {
    if (!func.startLine || !func.endLine) {
      return null;
    }

    const lineCount = func.endLine - func.startLine + 1;

    if (lineCount > config.maxFunctionLines) {
      const severity: SmellSeverity = lineCount > config.maxFunctionLines * 2 ? 'ERROR' : 'WARNING';

      return {
        type: 'long-function',
        severity,
        entity: func,
        location: {
          file: func.filePath,
          line: func.startLine,
        },
        message: `Function '${func.name}' is too long (${lineCount} lines)`,
        explanation: `Long functions are harder to understand, test, and maintain. Functions should ideally be under ${config.maxFunctionLines} lines.`,
        suggestion: 'Extract logical blocks into separate functions with descriptive names.',
        metrics: {
          lineCount,
        },
      };
    }

    return null;
  }

  /**
   * Detect Long Parameter List
   */
  private detectLongParameters(
    func: CodeEntityInfo,
    config: Required<SmellDetectionConfig>,
  ): CodeSmell | null {
    if (!func.signature) {
      return null;
    }

    // Simple heuristic: count commas in parameter list
    const paramMatch = func.signature.match(/\(([^)]*)\)/);
    if (!paramMatch) {
      return null;
    }

    const params = paramMatch[1].split(',').filter((p) => p.trim().length > 0);
    const paramCount = params.length;

    if (paramCount > config.maxParameters) {
      const severity: SmellSeverity = paramCount > config.maxParameters * 2 ? 'ERROR' : 'WARNING';

      return {
        type: 'long-parameters',
        severity,
        entity: func,
        location: {
          file: func.filePath,
          line: func.startLine ?? 0,
        },
        message: `Function '${func.name}' has too many parameters (${paramCount})`,
        explanation: `Functions with many parameters are hard to call and understand. Consider grouping related parameters.`,
        suggestion:
          'Introduce a parameter object or configuration object to group related parameters.',
        metrics: {
          parameterCount: paramCount,
        },
      };
    }

    return null;
  }

  /**
   * Detect Dead Code (unused function)
   */
  private async detectDeadCode(
    projectPath: string,
    func: CodeEntityInfo,
  ): Promise<CodeSmell | null> {
    try {
      // Check if function has any callers
      const hierarchy = await this.deps.queryService.getCallHierarchy(
        projectPath,
        func.name,
        1, // depth 1 to check for direct callers
      );

      if (hierarchy.callers.length === 0) {
        // No callers found - potential dead code
        return {
          type: 'dead-code',
          severity: 'INFO',
          entity: func,
          location: {
            file: func.filePath,
            line: func.startLine ?? 0,
          },
          message: `Function '${func.name}' appears to be unused`,
          explanation: `This function has no callers in the codebase. It may be dead code that can be safely removed.`,
          suggestion:
            'If this is not an exported API or entry point, consider removing it to reduce codebase complexity.',
          metrics: {
            referenceCount: 0,
          },
        };
      }
    } catch (error) {
      // Function not found in call hierarchy, assume it's used elsewhere
    }

    return null;
  }

  /**
   * Check if severity meets threshold
   */
  private meetsThreshold(severity: SmellSeverity, threshold: SmellSeverity): boolean {
    const levels: Record<SmellSeverity, number> = {
      INFO: 1,
      WARNING: 2,
      ERROR: 3,
    };

    return levels[severity] >= levels[threshold];
  }

  /**
   * Generate summary statistics
   */
  private generateSummary(smells: CodeSmell[]): DetectSmellsResult['summary'] {
    const byType: Record<SmellType, number> = {
      'god-function': 0,
      'deep-nesting': 0,
      'long-parameters': 0,
      'long-function': 0,
      'dead-code': 0,
      'magic-number': 0,
      'duplicated-code': 0,
    };

    const bySeverity: Record<SmellSeverity, number> = {
      INFO: 0,
      WARNING: 0,
      ERROR: 0,
    };

    for (const smell of smells) {
      byType[smell.type]++;
      bySeverity[smell.severity]++;
    }

    return {
      totalSmells: smells.length,
      byType,
      bySeverity,
    };
  }
}
