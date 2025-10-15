import type { QueryService, GraphFact } from '../domain/query/queryService.js';

/**
 * Relationship type weights for scoring
 * Higher weight = stronger relationship
 */
const RELATIONSHIP_WEIGHTS: Record<string, number> = {
  IMPORTS: 1.0, // Direct dependency (strongest)
  IMPLEMENTS: 0.9, // Inheritance/interface implementation
  EXTENDS: 0.9, // Class inheritance
  CALLS: 0.8, // Function calls
  CONTAINS: 0.5, // File contains entity
  DEFINES: 0.4, // File defines entity
  // Shared dependency: calculated separately (0.3 per shared dep)
};

/**
 * Reason for relationship with human-readable explanation
 */
export interface RelationshipReason {
  type: string;
  weight: number;
  description: string;
  fact: GraphFact;
}

/**
 * Scored file with detailed reasons
 */
export interface ScoredFile {
  filePath: string;
  score: number;
  normalizedScore: number; // 0-1 range for comparison
  reasons: RelationshipReason[];
  relationshipCounts: Record<string, number>;
}

/**
 * Configuration for scoring algorithm
 */
export interface ScorerConfig {
  includeSharedDependencies?: boolean; // Include files that import same dependencies
  maxSharedDepsToCheck?: number; // Limit shared dependency analysis
  minScoreThreshold?: number; // Filter out low-scoring results
}

/**
 * Dependencies for RelatedFilesScorer
 */
export interface RelatedFilesScorerDependencies {
  queryService: QueryService;
}

/**
 * Input for scoring related files
 */
export interface ScoreRelatedFilesInput {
  projectPath: string;
  filePath: string;
  limit?: number;
  config?: ScorerConfig;
}

/**
 * Output of scoring operation
 */
export interface ScoreRelatedFilesResult {
  targetFile: string;
  scoredFiles: ScoredFile[];
  totalFilesAnalyzed: number;
  maxScore: number;
}

/**
 * RelatedFilesScorer: Intelligent multi-relationship file scoring service
 *
 * Analyzes code relationships to find related files with weighted scoring:
 * - IMPORTS (1.0): Direct dependencies
 * - IMPLEMENTS/EXTENDS (0.9): Inheritance relationships
 * - CALLS (0.8): Function call relationships
 * - CONTAINS/DEFINES (0.5/0.4): Entity membership
 * - Shared dependencies (0.3): Indirect relationships
 */
export class RelatedFilesScorer {
  private readonly queryService: QueryService;

  constructor(deps: RelatedFilesScorerDependencies) {
    if (!deps.queryService) {
      throw new Error('RelatedFilesScorer requires QueryService');
    }
    this.queryService = deps.queryService;
  }

  /**
   * Score and rank files by their relationship strength to target file
   */
  async scoreRelatedFiles(input: ScoreRelatedFilesInput): Promise<ScoreRelatedFilesResult> {
    const { projectPath, filePath, limit = 50, config = {} } = input;

    const {
      includeSharedDependencies = true,
      maxSharedDepsToCheck = 10,
      minScoreThreshold = 0.1,
    } = config;

    const targetFileNode = this.normalizeFileNode(filePath);

    // Step 1: Collect direct relationships (outgoing and incoming)
    const directRelations = await this.collectDirectRelations(projectPath, targetFileNode);

    // Step 2: Build initial scores from direct relationships
    const fileScores = new Map<
      string,
      {
        score: number;
        reasons: RelationshipReason[];
        relationshipCounts: Record<string, number>;
      }
    >();

    this.processDirectRelations(directRelations, targetFileNode, fileScores);

    // Step 3: Add shared dependency scoring (optional)
    if (includeSharedDependencies) {
      await this.addSharedDependencyScores(
        projectPath,
        targetFileNode,
        directRelations,
        fileScores,
        maxSharedDepsToCheck,
      );
    }

    // Step 4: Normalize scores and filter
    const scoredFiles = this.normalizeAndFilter(fileScores, minScoreThreshold);

    // Step 5: Sort and limit results
    scoredFiles.sort((a, b) => b.score - a.score);
    const limitedResults = scoredFiles.slice(0, limit);

    const maxScore = limitedResults.length > 0 ? limitedResults[0].score : 0;

    return {
      targetFile: filePath,
      scoredFiles: limitedResults,
      totalFilesAnalyzed: fileScores.size,
      maxScore,
    };
  }

  /**
   * Collect all direct relationships (both directions)
   */
  private async collectDirectRelations(
    projectPath: string,
    fileNode: string,
  ): Promise<GraphFact[]> {
    // Query both outgoing and incoming edges
    const [outgoing, incoming] = await Promise.all([
      this.queryService.findFacts(projectPath, { subject: fileNode }, { limit: 200 }),
      this.queryService.findFacts(projectPath, { object: fileNode }, { limit: 200 }),
    ]);

    return [...outgoing, ...incoming];
  }

  /**
   * Process direct relationships and build initial scores
   */
  private processDirectRelations(
    relations: GraphFact[],
    targetFileNode: string,
    fileScores: Map<
      string,
      {
        score: number;
        reasons: RelationshipReason[];
        relationshipCounts: Record<string, number>;
      }
    >,
  ): void {
    for (const fact of relations) {
      const relatedFile = this.extractRelatedFile(fact, targetFileNode);
      if (!relatedFile) continue;

      const weight = RELATIONSHIP_WEIGHTS[fact.predicate] ?? 0.2; // Default weight for unknown predicates
      const reason = this.createReason(fact, weight, targetFileNode);

      const current = fileScores.get(relatedFile) ?? {
        score: 0,
        reasons: [],
        relationshipCounts: {},
      };

      current.score += weight;
      current.reasons.push(reason);
      current.relationshipCounts[fact.predicate] =
        (current.relationshipCounts[fact.predicate] ?? 0) + 1;

      fileScores.set(relatedFile, current);
    }
  }

  /**
   * Add scores for shared dependencies
   * Files that import the same dependencies are likely related
   */
  private async addSharedDependencyScores(
    projectPath: string,
    targetFileNode: string,
    directRelations: GraphFact[],
    fileScores: Map<
      string,
      {
        score: number;
        reasons: RelationshipReason[];
        relationshipCounts: Record<string, number>;
      }
    >,
    maxDepsToCheck: number,
  ): Promise<void> {
    // Find dependencies imported by target file
    const targetImports = directRelations
      .filter((f) => f.subject === targetFileNode && f.predicate === 'IMPORTS')
      .map((f) => f.object)
      .slice(0, maxDepsToCheck);

    if (targetImports.length === 0) return;

    // For each dependency, find other files that import it
    const sharedImportersPromises = targetImports.map((dep) =>
      this.queryService.findFacts(
        projectPath,
        {
          predicate: 'IMPORTS',
          object: dep,
        },
        { limit: 50 },
      ),
    );

    const sharedImportersResults = await Promise.all(sharedImportersPromises);

    // Count shared dependencies per file
    const sharedDepCounts = new Map<string, { count: number; sharedDeps: string[] }>();

    for (let i = 0; i < targetImports.length; i++) {
      const dep = targetImports[i];
      const importers = sharedImportersResults[i];

      for (const fact of importers) {
        const importer = fact.subject;
        if (importer === targetFileNode) continue; // Skip self

        const current = sharedDepCounts.get(importer) ?? { count: 0, sharedDeps: [] };
        current.count++;
        current.sharedDeps.push(dep);
        sharedDepCounts.set(importer, current);
      }
    }

    // Add shared dependency scores
    const SHARED_DEP_WEIGHT = 0.3;

    for (const [file, { count, sharedDeps }] of sharedDepCounts.entries()) {
      const score = count * SHARED_DEP_WEIGHT;
      const current = fileScores.get(file) ?? {
        score: 0,
        reasons: [],
        relationshipCounts: {},
      };

      // Create synthetic fact for shared dependency
      const reason: RelationshipReason = {
        type: 'SHARED_DEPENDENCIES',
        weight: score,
        description: `Shares ${count} dependenc${count > 1 ? 'ies' : 'y'}: ${this.formatDepList(sharedDeps)}`,
        fact: {
          subject: targetFileNode,
          predicate: 'SHARED_DEPENDENCIES',
          object: file,
          properties: { count, sharedDeps },
        },
      };

      current.score += score;
      current.reasons.push(reason);
      current.relationshipCounts.SHARED_DEPENDENCIES = count;

      fileScores.set(file, current);
    }
  }

  /**
   * Normalize scores and filter out low scores
   */
  private normalizeAndFilter(
    fileScores: Map<
      string,
      {
        score: number;
        reasons: RelationshipReason[];
        relationshipCounts: Record<string, number>;
      }
    >,
    minThreshold: number,
  ): ScoredFile[] {
    const scores = Array.from(fileScores.entries()).map(([, data]) => data.score);
    const maxScore = Math.max(...scores, 1); // Avoid division by zero

    const results: ScoredFile[] = [];

    for (const [filePath, data] of fileScores.entries()) {
      const normalizedScore = data.score / maxScore;

      if (normalizedScore >= minThreshold) {
        results.push({
          filePath: this.denormalizeFileNode(filePath),
          score: data.score,
          normalizedScore,
          reasons: data.reasons,
          relationshipCounts: data.relationshipCounts,
        });
      }
    }

    return results;
  }

  /**
   * Create human-readable reason for relationship
   */
  private createReason(
    fact: GraphFact,
    weight: number,
    targetFileNode: string,
  ): RelationshipReason {
    const isOutgoing = fact.subject === targetFileNode;
    const relationType = fact.predicate;

    let description = '';

    switch (relationType) {
      case 'IMPORTS':
        description = isOutgoing
          ? `Imports: ${this.denormalizeFileNode(fact.object)}`
          : `Imported by: ${this.denormalizeFileNode(fact.subject)}`;
        break;
      case 'CALLS':
        description = isOutgoing
          ? `Calls function in: ${this.denormalizeFileNode(fact.object)}`
          : `Function called by: ${this.denormalizeFileNode(fact.subject)}`;
        break;
      case 'IMPLEMENTS':
      case 'EXTENDS':
        description = isOutgoing
          ? `${relationType} interface/class in: ${this.denormalizeFileNode(fact.object)}`
          : `Interface/class ${relationType.toLowerCase()} by: ${this.denormalizeFileNode(fact.subject)}`;
        break;
      case 'CONTAINS':
        description = isOutgoing
          ? `Contains: ${fact.object}`
          : `Contained in: ${this.denormalizeFileNode(fact.subject)}`;
        break;
      case 'DEFINES':
        description = isOutgoing
          ? `Defines: ${fact.object}`
          : `Defined in: ${this.denormalizeFileNode(fact.subject)}`;
        break;
      default:
        description = `${relationType}: ${isOutgoing ? fact.object : fact.subject}`;
    }

    return {
      type: relationType,
      weight,
      description,
      fact,
    };
  }

  /**
   * Extract related file from fact (not the target file)
   */
  private extractRelatedFile(fact: GraphFact, targetFileNode: string): string | null {
    const candidates = [fact.subject, fact.object].filter(
      (node) => node.startsWith('file:') && node !== targetFileNode,
    );
    return candidates[0] ?? null;
  }

  /**
   * Normalize file path to node format (file:...)
   */
  private normalizeFileNode(filePath: string): string {
    return filePath.startsWith('file:') ? filePath : `file:${filePath}`;
  }

  /**
   * Remove file: prefix from node
   */
  private denormalizeFileNode(nodeId: string): string {
    return nodeId.startsWith('file:') ? nodeId.substring(5) : nodeId;
  }

  /**
   * Format dependency list for display (truncate if too long)
   */
  private formatDepList(deps: string[], maxDisplay = 3): string {
    const displayDeps = deps.slice(0, maxDisplay).map((d) => this.denormalizeFileNode(d));
    if (deps.length > maxDisplay) {
      return `${displayDeps.join(', ')}, +${deps.length - maxDisplay} more`;
    }
    return displayDeps.join(', ');
  }
}
