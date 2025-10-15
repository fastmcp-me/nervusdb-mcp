import type { QueryService, CodeEntityInfo } from '../domain/query/queryService.js';

/**
 * Symbol type filter for definition search
 */
export type SymbolType =
  | 'function'
  | 'class'
  | 'interface'
  | 'variable'
  | 'constant'
  | 'type'
  | 'enum'
  | 'any';

/**
 * Search mode for definition lookup
 */
export type SearchMode = 'exact' | 'prefix' | 'contains' | 'fuzzy';

/**
 * Definition search result with confidence score
 */
export interface DefinitionResult extends CodeEntityInfo {
  confidence: number; // 0-1, higher is better
  matchReason: string; // Why this result matched
}

/**
 * Configuration for definition search
 */
export interface DefinitionSearchConfig {
  symbolType?: SymbolType; // Filter by type
  searchMode?: SearchMode; // Search algorithm
  filePathHint?: string; // Prefer definitions in this file
  caseSensitive?: boolean; // Case-sensitive matching
  maxResults?: number; // Limit number of results
  minConfidence?: number; // Filter low-confidence results
}

/**
 * Input for definition search
 */
export interface FindDefinitionInput {
  projectPath: string;
  symbolName: string;
  config?: DefinitionSearchConfig;
}

/**
 * Output of definition search
 */
export interface FindDefinitionResult {
  query: {
    symbolName: string;
    searchMode: SearchMode;
    symbolType?: SymbolType;
  };
  definitions: DefinitionResult[];
  totalFound: number;
  searchTimeMs: number;
}

/**
 * Dependencies for DefinitionLocator
 */
export interface DefinitionLocatorDependencies {
  queryService: QueryService;
}

/**
 * DefinitionLocator: High-accuracy symbol definition finder
 *
 * Capabilities:
 * - Exact name matching (default)
 * - Prefix/contains/fuzzy matching
 * - Type filtering (function/class/interface/etc.)
 * - Confidence scoring
 * - Ambiguity resolution (multiple definitions)
 * - File path hints for disambiguation
 *
 * Target: ≥95% accuracy
 */
export class DefinitionLocator {
  private readonly queryService: QueryService;

  constructor(deps: DefinitionLocatorDependencies) {
    if (!deps.queryService) {
      throw new Error('DefinitionLocator requires QueryService');
    }
    this.queryService = deps.queryService;
  }

  /**
   * Find definition(s) of a symbol
   */
  async findDefinition(input: FindDefinitionInput): Promise<FindDefinitionResult> {
    const startTime = Date.now();

    const config: Required<DefinitionSearchConfig> = {
      symbolType: input.config?.symbolType ?? 'any',
      searchMode: input.config?.searchMode ?? 'exact',
      filePathHint: input.config?.filePathHint ?? '',
      caseSensitive: input.config?.caseSensitive ?? true,
      maxResults: input.config?.maxResults ?? 50,
      minConfidence: input.config?.minConfidence ?? 0.5,
    };

    // Step 1: Get all DEFINES facts from the project
    const allDefinitions = await this.queryService.findDefinitions(
      input.projectPath,
      '', // Empty to get all definitions
      { limit: 1000 }, // Reasonable limit
    );

    // Step 2: Filter and score matches
    const matches = this.filterAndScore(allDefinitions, input.symbolName, config);

    // Step 3: Sort by confidence and apply limits
    matches.sort((a, b) => b.confidence - a.confidence);
    const filteredMatches = matches
      .filter((m) => m.confidence >= config.minConfidence)
      .slice(0, config.maxResults);

    const searchTimeMs = Date.now() - startTime;

    return {
      query: {
        symbolName: input.symbolName,
        searchMode: config.searchMode,
        symbolType: config.symbolType !== 'any' ? config.symbolType : undefined,
      },
      definitions: filteredMatches,
      totalFound: matches.length,
      searchTimeMs,
    };
  }

  /**
   * Filter definitions and assign confidence scores
   */
  private filterAndScore(
    allDefinitions: CodeEntityInfo[],
    symbolName: string,
    config: Required<DefinitionSearchConfig>,
  ): DefinitionResult[] {
    const results: DefinitionResult[] = [];

    for (const def of allDefinitions) {
      // Type filtering
      if (config.symbolType !== 'any' && def.type !== config.symbolType) {
        continue;
      }

      // Name matching
      const nameMatch = this.matchName(
        def.name,
        symbolName,
        config.searchMode,
        config.caseSensitive,
      );

      if (!nameMatch.matches) {
        continue;
      }

      // Calculate confidence score
      const confidence = this.calculateConfidence(def, symbolName, nameMatch, config);

      // Generate match reason
      const matchReason = this.generateMatchReason(def, symbolName, nameMatch, config);

      results.push({
        ...def,
        confidence,
        matchReason,
      });
    }

    return results;
  }

  /**
   * Match symbol name based on search mode
   */
  private matchName(
    defName: string,
    queryName: string,
    mode: SearchMode,
    caseSensitive: boolean,
  ): { matches: boolean; exactMatch: boolean; score: number } {
    const def = caseSensitive ? defName : defName.toLowerCase();
    const query = caseSensitive ? queryName : queryName.toLowerCase();

    switch (mode) {
      case 'exact':
        return {
          matches: def === query,
          exactMatch: def === query,
          score: def === query ? 1.0 : 0.0,
        };

      case 'prefix':
        return {
          matches: def.startsWith(query),
          exactMatch: def === query,
          score: def === query ? 1.0 : 0.9,
        };

      case 'contains':
        return {
          matches: def.includes(query),
          exactMatch: def === query,
          score: def === query ? 1.0 : def.startsWith(query) ? 0.85 : 0.7,
        };

      case 'fuzzy': {
        const fuzzyScore = this.fuzzyMatch(def, query);
        return {
          matches: fuzzyScore > 0.5,
          exactMatch: def === query,
          score: fuzzyScore,
        };
      }

      default:
        return { matches: false, exactMatch: false, score: 0.0 };
    }
  }

  /**
   * Simple fuzzy matching (Levenshtein distance based)
   */
  private fuzzyMatch(str1: string, str2: string): number {
    const len1 = str1.length;
    const len2 = str2.length;

    // If strings are equal
    if (str1 === str2) return 1.0;

    // If one is empty
    if (len1 === 0 || len2 === 0) return 0.0;

    // If query is substring
    if (str1.includes(str2)) {
      return 0.9 - (len1 - len2) / (len1 * 10);
    }

    // Calculate Levenshtein distance
    const matrix: number[][] = Array(len2 + 1)
      .fill(null)
      .map(() => Array(len1 + 1).fill(0));

    for (let i = 0; i <= len1; i++) matrix[0][i] = i;
    for (let j = 0; j <= len2; j++) matrix[j][0] = j;

    for (let j = 1; j <= len2; j++) {
      for (let i = 1; i <= len1; i++) {
        const cost = str1[i - 1] === str2[j - 1] ? 0 : 1;
        matrix[j][i] = Math.min(
          matrix[j][i - 1] + 1,
          matrix[j - 1][i] + 1,
          matrix[j - 1][i - 1] + cost,
        );
      }
    }

    const distance = matrix[len2][len1];
    const maxLen = Math.max(len1, len2);
    const similarity = 1 - distance / maxLen;

    return Math.max(0, similarity);
  }

  /**
   * Calculate confidence score for a match
   *
   * Factors:
   * - Name match quality (0.4 weight)
   * - Type match (0.2 weight)
   * - File path hint match (0.2 weight)
   * - Signature completeness (0.1 weight)
   * - Location info completeness (0.1 weight)
   */
  private calculateConfidence(
    def: CodeEntityInfo,
    queryName: string,
    nameMatch: { matches: boolean; exactMatch: boolean; score: number },
    config: Required<DefinitionSearchConfig>,
  ): number {
    let score = 0.0;

    // Factor 1: Name match quality (40%)
    score += nameMatch.score * 0.4;

    // Factor 2: Type match bonus (20%)
    if (config.symbolType === 'any' || def.type === config.symbolType) {
      score += 0.2;

      // Exact type match bonus
      if (config.symbolType !== 'any' && def.type === config.symbolType) {
        score += 0.05;
      }
    }

    // Factor 3: File path hint match (20%)
    if (config.filePathHint) {
      if (def.filePath === config.filePathHint) {
        score += 0.2;
      } else if (
        def.filePath.includes(config.filePathHint) ||
        config.filePathHint.includes(def.filePath)
      ) {
        score += 0.1;
      }
    } else {
      score += 0.1;
    }

    // Factor 4: Signature completeness (10%)
    if (def.signature && def.signature.length > 0) {
      score += 0.1;
    } else {
      score += 0.05;
    }

    // Factor 5: Location info completeness (10%)
    const hasLocation = def.startLine !== undefined && def.endLine !== undefined;
    if (hasLocation) {
      score += 0.1;
    } else {
      score += 0.05;
    }

    // Bonus: Exact name match
    if (nameMatch.exactMatch) {
      score += 0.1;
    }

    // Normalize to [0, 1]
    return Math.min(1.0, Math.max(0.0, score));
  }

  /**
   * Generate human-readable match reason
   */
  private generateMatchReason(
    def: CodeEntityInfo,
    queryName: string,
    nameMatch: { matches: boolean; exactMatch: boolean; score: number },
    config: Required<DefinitionSearchConfig>,
  ): string {
    const reasons: string[] = [];

    // Name match
    if (nameMatch.exactMatch) {
      reasons.push('Exact name match');
    } else if (nameMatch.score > 0.9) {
      reasons.push('Very close name match');
    } else if (nameMatch.score > 0.7) {
      reasons.push('Partial name match');
    } else {
      reasons.push('Fuzzy name match');
    }

    // Type match
    if (config.symbolType !== 'any' && def.type === config.symbolType) {
      reasons.push(`Type: ${def.type}`);
    }

    // File hint
    if (config.filePathHint && def.filePath.includes(config.filePathHint)) {
      reasons.push('In expected file');
    }

    // Location
    if (def.startLine !== undefined) {
      reasons.push(`Line ${def.startLine}`);
    }

    return reasons.join(', ');
  }
}
