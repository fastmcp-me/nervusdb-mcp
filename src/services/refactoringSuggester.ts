/**
 * Refactoring Suggester Service
 *
 * Generates intelligent refactoring suggestions based on detected code smells.
 * Provides priority scoring, impact analysis, and actionable recommendations.
 *
 * Supported Refactoring Patterns:
 * 1. Extract Method (for God Functions and Long Functions)
 * 2. Introduce Parameter Object (for Long Parameter Lists)
 * 3. Remove Dead Code (for Dead Code smells)
 * 4. Inline Function (for trivial wrappers)
 * 5. Rename Symbol (for poor naming)
 * 6. Split Function (for functions doing too much)
 */

import type {
  QueryService,
  CodeEntityInfo,
  CallHierarchyNode,
} from '../domain/query/queryService.js';
import type { CodeSmell } from './codeSmellDetector.js';

/**
 * Refactoring pattern types
 */
export type RefactoringPattern =
  | 'extract-method'
  | 'introduce-parameter-object'
  | 'remove-dead-code'
  | 'inline-function'
  | 'rename-symbol'
  | 'split-function';

/**
 * Priority level for refactoring
 */
export type RefactoringPriority = 'high' | 'medium' | 'low';

/**
 * A specific refactoring suggestion
 */
export interface RefactoringSuggestion {
  id: string;
  pattern: RefactoringPattern;
  priority: RefactoringPriority;
  targetEntity: CodeEntityInfo;
  smell?: CodeSmell; // The smell that triggered this suggestion
  title: string;
  description: string;
  reasoning: string;
  benefits: string[];
  risks: string[];
  score: {
    benefit: number; // 0-10
    risk: number; // 0-10
    effort: number; // 0-10 (higher = more work)
    impact: number; // 0-10 (higher = more files affected)
    overall: number; // Weighted score for sorting
  };
  steps: string[]; // Step-by-step instructions
  estimatedTime?: string; // e.g., "15 minutes"
  affectedFiles?: string[];
}

/**
 * Input for refactoring suggestion
 */
export interface SuggestRefactoringsInput {
  projectPath: string;
  smells?: CodeSmell[]; // Optional: provide detected smells
  targetSymbol?: string; // Optional: focus on specific symbol
  maxSuggestions?: number; // Limit number of suggestions
}

/**
 * Result of refactoring suggestion
 */
export interface SuggestRefactoringsResult {
  projectPath: string;
  suggestions: RefactoringSuggestion[];
  summary: {
    totalSuggestions: number;
    byPattern: Record<RefactoringPattern, number>;
    byPriority: Record<RefactoringPriority, number>;
  };
  stats: {
    analysisTimeMs: number;
  };
}

/**
 * Service for generating refactoring suggestions
 */
export class RefactoringSuggester {
  constructor(private readonly deps: { queryService: QueryService }) {}

  /**
   * Generate refactoring suggestions based on code smells
   */
  async suggestRefactorings(input: SuggestRefactoringsInput): Promise<SuggestRefactoringsResult> {
    const startTime = Date.now();

    const suggestions: RefactoringSuggestion[] = [];

    // Process each smell and generate suggestions
    if (input.smells && input.smells.length > 0) {
      for (const smell of input.smells) {
        const smellSuggestions = await this.generateSuggestionsForSmell(input.projectPath, smell);
        suggestions.push(...smellSuggestions);
      }
    }

    // Sort by overall score (descending)
    suggestions.sort((a, b) => b.score.overall - a.score.overall);

    // Limit if requested
    const limitedSuggestions = input.maxSuggestions
      ? suggestions.slice(0, input.maxSuggestions)
      : suggestions;

    // Generate summary
    const summary = this.generateSummary(limitedSuggestions);

    return {
      projectPath: input.projectPath,
      suggestions: limitedSuggestions,
      summary,
      stats: {
        analysisTimeMs: Date.now() - startTime,
      },
    };
  }

  /**
   * Generate suggestions for a specific code smell
   */
  private async generateSuggestionsForSmell(
    projectPath: string,
    smell: CodeSmell,
  ): Promise<RefactoringSuggestion[]> {
    const suggestions: RefactoringSuggestion[] = [];

    switch (smell.type) {
      case 'god-function':
        suggestions.push(...(await this.suggestExtractMethod(projectPath, smell)));
        break;

      case 'long-function':
        suggestions.push(...(await this.suggestSplitFunction(projectPath, smell)));
        break;

      case 'long-parameters':
        suggestions.push(await this.suggestParameterObject(projectPath, smell));
        break;

      case 'dead-code':
        suggestions.push(await this.suggestRemoveDeadCode(projectPath, smell));
        break;

      default:
        // Other smell types not yet supported
        break;
    }

    return suggestions;
  }

  /**
   * Suggest Extract Method refactoring for God Function
   */
  private async suggestExtractMethod(
    projectPath: string,
    smell: CodeSmell,
  ): Promise<RefactoringSuggestion[]> {
    const suggestions: RefactoringSuggestion[] = [];

    try {
      // Get call hierarchy to see what this function calls
      const hierarchy = await this.deps.queryService.getCallHierarchy(
        projectPath,
        smell.entity.name,
        1, // depth 1 to see direct callees
      );

      const callees = hierarchy.callees;

      if (callees.length === 0) {
        return suggestions;
      }

      // Group callees by logical concerns (heuristic: similar names)
      const groups = this.groupCalleesByLogic(callees);

      // Generate suggestion for each group
      let suggestionCount = 0;
      for (const group of groups) {
        if (group.callees.length < 2) continue; // Need at least 2 to extract

        suggestionCount++;
        const groupName = group.name;

        const suggestion: RefactoringSuggestion = {
          id: `extract-method-${smell.entity.name}-${suggestionCount}`,
          pattern: 'extract-method',
          priority: this.calculatePriority(smell, callees.length),
          targetEntity: smell.entity,
          smell,
          title: `Extract "${groupName}" logic into separate method`,
          description: `Extract ${group.callees.length} related function calls into a dedicated method`,
          reasoning: `This function has high complexity (${smell.metrics?.complexity}). Extracting ${groupName} logic will improve readability and testability.`,
          benefits: [
            'Reduces function complexity',
            'Improves code readability',
            'Makes logic reusable',
            'Easier to test in isolation',
          ],
          risks: ['May introduce new parameters', 'Need to ensure correct scope'],
          score: {
            benefit: Math.min(10, Math.floor((smell.metrics?.complexity || 10) / 2)),
            risk: 2, // Low risk for extract method
            effort: Math.min(10, Math.floor(group.callees.length / 2)),
            impact: await this.calculateImpact(projectPath, smell.entity.name),
            overall: 0, // Will be calculated
          },
          steps: [
            `1. Identify the ${groupName} code block in ${smell.entity.name}`,
            `2. Create a new private method: extract${this.capitalize(groupName)}()`,
            '3. Move the identified code into the new method',
            '4. Replace original code with a call to the new method',
            '5. Run tests to verify behavior unchanged',
          ],
          estimatedTime: this.estimateTime(group.callees.length),
          affectedFiles: [smell.location.file],
        };

        // Calculate overall score
        suggestion.score.overall = this.calculateOverallScore(suggestion.score);

        suggestions.push(suggestion);
      }
    } catch (error) {
      // Failed to get hierarchy, skip
    }

    return suggestions;
  }

  /**
   * Suggest Split Function for Long Function
   */
  private async suggestSplitFunction(
    projectPath: string,
    smell: CodeSmell,
  ): Promise<RefactoringSuggestion[]> {
    const lineCount = smell.metrics?.lineCount || 0;

    const suggestion: RefactoringSuggestion = {
      id: `split-function-${smell.entity.name}`,
      pattern: 'split-function',
      priority: this.calculatePriority(smell, lineCount),
      targetEntity: smell.entity,
      smell,
      title: `Split ${smell.entity.name} into smaller functions`,
      description: `This function has ${lineCount} lines. Split into logical units.`,
      reasoning: `Long functions are hard to understand and maintain. Breaking it down will improve clarity.`,
      benefits: [
        'Improves readability',
        'Easier to test',
        'Better separation of concerns',
        'Reduces cognitive load',
      ],
      risks: ['Need to identify logical boundaries', 'May require passing more parameters'],
      score: {
        benefit: Math.min(10, Math.floor(lineCount / 10)),
        risk: 3,
        effort: Math.min(10, Math.floor(lineCount / 15)),
        impact: await this.calculateImpact(projectPath, smell.entity.name),
        overall: 0,
      },
      steps: [
        '1. Read through the function to identify logical sections',
        '2. Look for sequential blocks that accomplish distinct tasks',
        '3. For each block, create a descriptive private method',
        '4. Extract the code into the new method',
        '5. Replace with method call',
        '6. Run tests after each extraction',
      ],
      estimatedTime: this.estimateTime(Math.floor(lineCount / 20)),
      affectedFiles: [smell.location.file],
    };

    suggestion.score.overall = this.calculateOverallScore(suggestion.score);

    return [suggestion];
  }

  /**
   * Suggest Introduce Parameter Object for Long Parameter List
   */
  private async suggestParameterObject(
    projectPath: string,
    smell: CodeSmell,
  ): Promise<RefactoringSuggestion> {
    const paramCount = smell.metrics?.parameterCount || 0;

    const suggestion: RefactoringSuggestion = {
      id: `param-object-${smell.entity.name}`,
      pattern: 'introduce-parameter-object',
      priority: this.calculatePriority(smell, paramCount),
      targetEntity: smell.entity,
      smell,
      title: `Introduce parameter object for ${smell.entity.name}`,
      description: `Replace ${paramCount} parameters with a configuration object`,
      reasoning: `Functions with many parameters are hard to call correctly. A parameter object simplifies the interface.`,
      benefits: [
        'Simplifies function signature',
        'Makes parameters self-documenting',
        'Easy to add new options later',
        'Reduces chance of argument order errors',
      ],
      risks: ['All callers need to be updated', 'Need to define the parameter interface'],
      score: {
        benefit: Math.min(10, paramCount),
        risk: await this.calculateImpact(projectPath, smell.entity.name),
        effort: Math.min(10, Math.floor(paramCount / 2)),
        impact: await this.calculateImpact(projectPath, smell.entity.name),
        overall: 0,
      },
      steps: [
        `1. Create a new interface: ${smell.entity.name}Options`,
        '2. Define properties for each parameter',
        '3. Update function signature to accept the options object',
        '4. Update function body to use options.propertyName',
        '5. Find all callers and update them',
        '6. Run tests to verify',
      ],
      estimatedTime: this.estimateTime(paramCount),
      affectedFiles: [smell.location.file],
    };

    suggestion.score.overall = this.calculateOverallScore(suggestion.score);

    return suggestion;
  }

  /**
   * Suggest Remove Dead Code
   */
  private async suggestRemoveDeadCode(
    projectPath: string,
    smell: CodeSmell,
  ): Promise<RefactoringSuggestion> {
    const suggestion: RefactoringSuggestion = {
      id: `remove-dead-${smell.entity.name}`,
      pattern: 'remove-dead-code',
      priority: 'low', // Dead code is low priority
      targetEntity: smell.entity,
      smell,
      title: `Remove unused function ${smell.entity.name}`,
      description: 'This function has no callers and can be safely removed',
      reasoning: 'Dead code increases maintenance burden and confuses developers.',
      benefits: ['Reduces codebase size', 'Improves code clarity', 'Less code to maintain'],
      risks: ['May be called dynamically (reflection)', 'May be part of public API'],
      score: {
        benefit: 5, // Moderate benefit
        risk: 2, // Low risk (but check if exported)
        effort: 1, // Very easy to remove
        impact: 1, // No impact (no callers)
        overall: 0,
      },
      steps: [
        '1. Verify function is not exported as public API',
        '2. Search for dynamic calls (string references)',
        '3. Delete the function',
        '4. Run tests to ensure nothing breaks',
      ],
      estimatedTime: '5 minutes',
      affectedFiles: [smell.location.file],
    };

    suggestion.score.overall = this.calculateOverallScore(suggestion.score);

    return suggestion;
  }

  /**
   * Group callees by logical concern (heuristic based on naming)
   */
  private groupCalleesByLogic(
    callees: CallHierarchyNode[],
  ): Array<{ name: string; callees: CallHierarchyNode[] }> {
    const groups = new Map<string, CallHierarchyNode[]>();

    // Simple heuristic: group by common prefixes
    for (const callee of callees) {
      const name = callee.entity.name;

      // Look for common patterns
      const patterns = [
        { regex: /^validate/, group: 'validation' },
        { regex: /^check/, group: 'validation' },
        { regex: /^fetch|^get|^load/, group: 'data-fetching' },
        { regex: /^save|^store|^persist/, group: 'data-persistence' },
        { regex: /^send|^notify|^emit/, group: 'notification' },
        { regex: /^format|^render/, group: 'formatting' },
        { regex: /^calculate|^compute/, group: 'calculation' },
        { regex: /^log|^debug/, group: 'logging' },
      ];

      let grouped = false;
      for (const pattern of patterns) {
        if (pattern.regex.test(name)) {
          if (!groups.has(pattern.group)) {
            groups.set(pattern.group, []);
          }
          groups.get(pattern.group)!.push(callee);
          grouped = true;
          break;
        }
      }

      if (!grouped) {
        // Default group
        if (!groups.has('general')) {
          groups.set('general', []);
        }
        groups.get('general')!.push(callee);
      }
    }

    return Array.from(groups.entries()).map(([name, callees]) => ({ name, callees }));
  }

  /**
   * Calculate priority based on smell severity and metrics
   */
  private calculatePriority(smell: CodeSmell, metric: number): RefactoringPriority {
    if (smell.severity === 'ERROR' || metric > 20) {
      return 'high';
    } else if (smell.severity === 'WARNING' || metric > 10) {
      return 'medium';
    } else {
      return 'low';
    }
  }

  /**
   * Calculate impact score (number of callers)
   */
  private async calculateImpact(projectPath: string, symbolName: string): Promise<number> {
    try {
      const hierarchy = await this.deps.queryService.getCallHierarchy(
        projectPath,
        symbolName,
        1, // depth 1 to count direct callers
      );

      const callerCount = hierarchy.callers.length;
      return Math.min(10, callerCount);
    } catch {
      return 1; // Unknown impact
    }
  }

  /**
   * Calculate overall score from components
   */
  private calculateOverallScore(score: RefactoringSuggestion['score']): number {
    // Weighted formula: prioritize high benefit, low risk, low effort
    const weighted =
      score.benefit * 0.4 + // 40% benefit
      (10 - score.risk) * 0.3 + // 30% inverse risk
      (10 - score.effort) * 0.2 + // 20% inverse effort
      (10 - score.impact) * 0.1; // 10% inverse impact

    return Math.round(weighted * 10) / 10;
  }

  /**
   * Estimate time based on complexity
   */
  private estimateTime(units: number): string {
    if (units <= 2) return '15 minutes';
    if (units <= 5) return '30 minutes';
    if (units <= 10) return '1 hour';
    return '2+ hours';
  }

  /**
   * Capitalize first letter
   */
  private capitalize(str: string): string {
    return str.charAt(0).toUpperCase() + str.slice(1);
  }

  /**
   * Generate summary statistics
   */
  private generateSummary(
    suggestions: RefactoringSuggestion[],
  ): SuggestRefactoringsResult['summary'] {
    const byPattern: Record<RefactoringPattern, number> = {
      'extract-method': 0,
      'introduce-parameter-object': 0,
      'remove-dead-code': 0,
      'inline-function': 0,
      'rename-symbol': 0,
      'split-function': 0,
    };

    const byPriority: Record<RefactoringPriority, number> = {
      high: 0,
      medium: 0,
      low: 0,
    };

    for (const suggestion of suggestions) {
      byPattern[suggestion.pattern]++;
      byPriority[suggestion.priority]++;
    }

    return {
      totalSuggestions: suggestions.length,
      byPattern,
      byPriority,
    };
  }
}
