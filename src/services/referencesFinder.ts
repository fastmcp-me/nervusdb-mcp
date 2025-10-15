import type { QueryService, GraphFact, CodeEntityInfo } from '../domain/query/queryService.js';

/**
 * Reference type classification
 */
export type ReferenceType =
  | 'call' // Function call
  | 'import' // Import statement
  | 'implementation' // Interface implementation
  | 'extension' // Class extension
  | 'type_usage' // Type annotation usage
  | 'instantiation' // Class instantiation
  | 'other'; // Other references

/**
 * Reference location with context
 */
export interface ReferenceLocation {
  file: string;
  line?: number;
  column?: number;
  context?: string; // Surrounding code context
}

/**
 * Reference result with metadata
 */
export interface Reference {
  type: ReferenceType;
  location: ReferenceLocation;
  referrer: CodeEntityInfo; // What is referencing this symbol
  fact: GraphFact; // Underlying graph fact
}

/**
 * References grouped by file
 */
export interface FileReferences {
  file: string;
  referenceCount: number;
  references: Reference[];
}

/**
 * Configuration for reference search
 */
export interface ReferenceSearchConfig {
  includeDeclaration?: boolean; // Include definition location
  groupByFile?: boolean; // Group results by file
  maxReferences?: number; // Limit total references
  referenceTypes?: ReferenceType[]; // Filter by type
}

/**
 * Input for reference search
 */
export interface FindReferencesInput {
  projectPath: string;
  symbolName: string;
  symbolType?: 'function' | 'class' | 'interface' | 'variable' | 'any';
  config?: ReferenceSearchConfig;
}

/**
 * Output of reference search
 */
export interface FindReferencesResult {
  query: {
    symbolName: string;
    symbolType?: string;
  };
  definition?: CodeEntityInfo; // Symbol definition location
  references: Reference[];
  fileReferences?: FileReferences[]; // Grouped by file
  totalReferences: number;
  searchTimeMs: number;
}

/**
 * Dependencies for ReferencesFinder
 */
export interface ReferencesFinderDependencies {
  queryService: QueryService;
}

/**
 * ReferencesFinder: High-recall symbol references finder
 *
 * Capabilities:
 * - Function call references
 * - Import/export references
 * - Interface implementation references
 * - Class extension references
 * - Type usage references
 * - Grouped by file output
 * - Context extraction
 *
 * Target: ≥90% recall
 */
export class ReferencesFinder {
  private readonly queryService: QueryService;

  constructor(deps: ReferencesFinderDependencies) {
    if (!deps.queryService) {
      throw new Error('ReferencesFinder requires QueryService');
    }
    this.queryService = deps.queryService;
  }

  /**
   * Find all references to a symbol
   */
  async findReferences(input: FindReferencesInput): Promise<FindReferencesResult> {
    const startTime = Date.now();

    const config: Required<ReferenceSearchConfig> = {
      includeDeclaration: input.config?.includeDeclaration ?? true,
      groupByFile: input.config?.groupByFile ?? true,
      maxReferences: input.config?.maxReferences ?? 500,
      referenceTypes: input.config?.referenceTypes ?? [],
    };

    // Step 1: Find symbol definition
    const definition = await this.findDefinition(
      input.projectPath,
      input.symbolName,
      input.symbolType,
    );

    if (!definition) {
      // No definition found, return empty result
      return {
        query: {
          symbolName: input.symbolName,
          symbolType: input.symbolType,
        },
        references: [],
        totalReferences: 0,
        searchTimeMs: Date.now() - startTime,
      };
    }

    // Step 2: Collect all reference facts
    const referenceFacts = await this.collectReferenceFacts(
      input.projectPath,
      definition,
      input.symbolType,
    );

    // Step 3: Convert facts to references with context
    const references = await this.processReferenceFacts(
      referenceFacts,
      definition,
      input.projectPath,
    );

    // Step 4: Filter by type if specified
    let filteredReferences = references;
    if (config.referenceTypes.length > 0) {
      filteredReferences = references.filter((ref) => config.referenceTypes.includes(ref.type));
    }

    // Step 5: Limit results
    filteredReferences = filteredReferences.slice(0, config.maxReferences);

    // Step 6: Group by file if requested
    let fileReferences: FileReferences[] | undefined;
    if (config.groupByFile) {
      fileReferences = this.groupByFile(filteredReferences);
    }

    const searchTimeMs = Date.now() - startTime;

    return {
      query: {
        symbolName: input.symbolName,
        symbolType: input.symbolType,
      },
      definition: config.includeDeclaration ? definition : undefined,
      references: filteredReferences,
      fileReferences,
      totalReferences: filteredReferences.length,
      searchTimeMs,
    };
  }

  /**
   * Find symbol definition using multiple strategies
   */
  private async findDefinition(
    projectPath: string,
    symbolName: string,
    symbolType?: string,
  ): Promise<CodeEntityInfo | null> {
    // Try findSymbolDefinition first
    const definition = await this.queryService.findSymbolDefinition(projectPath, symbolName);

    if (definition) {
      // Type filtering if specified
      if (symbolType && symbolType !== 'any' && definition.type !== symbolType) {
        return null;
      }
      return definition;
    }

    // Fallback: search through all definitions
    const allDefinitions = await this.queryService.findDefinitions(projectPath, '', {
      limit: 1000,
    });

    for (const def of allDefinitions) {
      if (def.name === symbolName) {
        if (!symbolType || symbolType === 'any' || def.type === symbolType) {
          return def;
        }
      }
    }

    return null;
  }

  /**
   * Collect all reference facts based on symbol type
   */
  private async collectReferenceFacts(
    projectPath: string,
    definition: CodeEntityInfo,
    symbolType?: string,
  ): Promise<GraphFact[]> {
    const facts: GraphFact[] = [];
    const targetNodeId = definition.nodeId;

    // Strategy 1: Function calls (for functions)
    if (!symbolType || symbolType === 'function' || symbolType === 'any') {
      try {
        const callFacts = await this.queryService.findCallers(projectPath, targetNodeId, {
          limit: 200,
        });
        facts.push(...callFacts);
      } catch (e) {
        // Ignore errors, continue with other strategies
      }
    }

    // Strategy 2: Interface implementations (for interfaces)
    if (!symbolType || symbolType === 'interface' || symbolType === 'any') {
      try {
        const implFacts = await this.queryService.findImplementations(projectPath, targetNodeId, {
          limit: 200,
        });
        facts.push(...implFacts);
      } catch (e) {
        // Ignore
      }
    }

    // Strategy 3: Class extensions (for classes)
    if (!symbolType || symbolType === 'class' || symbolType === 'any') {
      try {
        const extFacts = await this.queryService.findSubclasses(projectPath, targetNodeId, {
          limit: 200,
        });
        facts.push(...extFacts);
      } catch (e) {
        // Ignore
      }
    }

    // Strategy 4: Import references (all symbols)
    try {
      // Find files that import the file containing this symbol
      const fileNode = `file:${definition.filePath}`;
      const importFacts = await this.queryService.findFacts(
        projectPath,
        { predicate: 'IMPORTS', object: fileNode },
        { limit: 200 },
      );
      facts.push(...importFacts);
    } catch (e) {
      // Ignore
    }

    // Strategy 5: Generic references (USES relationship if available)
    try {
      const usesFacts = await this.queryService.findFacts(
        projectPath,
        { predicate: 'USES', object: targetNodeId },
        { limit: 200 },
      );
      facts.push(...usesFacts);
    } catch (e) {
      // Ignore
    }

    // Deduplicate facts by (subject, predicate, object) tuple
    return this.deduplicateFacts(facts);
  }

  /**
   * Process facts into Reference objects with context
   */
  private async processReferenceFacts(
    facts: GraphFact[],
    definition: CodeEntityInfo,
    projectPath: string,
  ): Promise<Reference[]> {
    const references: Reference[] = [];

    for (const fact of facts) {
      const referenceType = this.classifyReferenceType(fact);

      // Extract referrer entity info
      const referrer = await this.extractReferrer(fact, projectPath);

      // Extract location
      const location = this.extractLocation(fact, referrer);

      references.push({
        type: referenceType,
        location,
        referrer,
        fact,
      });
    }

    return references;
  }

  /**
   * Classify reference type based on predicate
   */
  private classifyReferenceType(fact: GraphFact): ReferenceType {
    switch (fact.predicate) {
      case 'CALLS':
        return 'call';
      case 'IMPORTS':
        return 'import';
      case 'IMPLEMENTS':
        return 'implementation';
      case 'EXTENDS':
        return 'extension';
      case 'USES':
        return 'type_usage';
      default:
        return 'other';
    }
  }

  /**
   * Extract referrer entity information from fact
   */
  private async extractReferrer(fact: GraphFact, _: string): Promise<CodeEntityInfo> {
    const subjectNodeId = fact.subject;

    // Try to get full entity info from properties
    if (fact.properties) {
      const props = fact.properties;
      if (props.name && props.type && props.filePath) {
        return {
          nodeId: subjectNodeId,
          name: props.name as string,
          type: props.type as string,
          filePath: props.filePath as string,
          signature: props.signature as string | undefined,
          language: props.language as string | undefined,
          startLine: props.startLine as number | undefined,
          endLine: props.endLine as number | undefined,
        };
      }
    }

    // Fallback: parse from nodeId
    const parts = subjectNodeId.split(':');
    if (parts.length >= 2) {
      const type = parts[0];
      const rest = parts.slice(1).join(':');

      // Extract file path and name
      let filePath = '';
      let name = '';

      if (type === 'file') {
        filePath = rest;
        name = rest.split('/').pop() || rest;
      } else {
        // Format: type:filePath#symbolName
        const hashIndex = rest.indexOf('#');
        if (hashIndex !== -1) {
          filePath = rest.substring(0, hashIndex);
          name = rest.substring(hashIndex + 1);
        } else {
          filePath = rest;
          name = rest.split('/').pop() || rest;
        }
      }

      return {
        nodeId: subjectNodeId,
        name,
        type,
        filePath,
      };
    }

    // Last resort: use nodeId as name
    return {
      nodeId: subjectNodeId,
      name: subjectNodeId,
      type: 'unknown',
      filePath: '',
    };
  }

  /**
   * Extract location from fact and referrer
   */
  private extractLocation(fact: GraphFact, referrer: CodeEntityInfo): ReferenceLocation {
    return {
      file: referrer.filePath,
      line: referrer.startLine,
      column: undefined,
      context: referrer.signature,
    };
  }

  /**
   * Group references by file
   */
  private groupByFile(references: Reference[]): FileReferences[] {
    const fileMap = new Map<string, Reference[]>();

    for (const ref of references) {
      const file = ref.location.file;
      if (!fileMap.has(file)) {
        fileMap.set(file, []);
      }
      fileMap.get(file)!.push(ref);
    }

    const fileReferences: FileReferences[] = [];
    for (const [file, refs] of fileMap.entries()) {
      fileReferences.push({
        file,
        referenceCount: refs.length,
        references: refs,
      });
    }

    // Sort by reference count (descending)
    fileReferences.sort((a, b) => b.referenceCount - a.referenceCount);

    return fileReferences;
  }

  /**
   * Deduplicate facts by unique key
   */
  private deduplicateFacts(facts: GraphFact[]): GraphFact[] {
    const seen = new Set<string>();
    const deduplicated: GraphFact[] = [];

    for (const fact of facts) {
      const key = `${fact.subject}|${fact.predicate}|${fact.object}`;
      if (!seen.has(key)) {
        seen.add(key);
        deduplicated.push(fact);
      }
    }

    return deduplicated;
  }
}
