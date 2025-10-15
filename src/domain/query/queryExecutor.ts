import type { NervusDB } from '@nervusdb/core';
import { ValidationError } from '../shared/errors.js';
import { createChildLogger } from '../../utils/logger.js';
import {
  type QueryResult,
  type TypedQuery,
  type RawQuery,
  buildTypedQuery,
  validateQueryRequest,
} from './queryBuilder.js';

const logger = createChildLogger({ service: 'QueryExecutor' });

export interface QueryExecutorOptions {
  maxLimit?: number;
  defaultLimit?: number;
}

/**
 * Executes queries against NervusDB with validation and logging
 */
export class QueryExecutor {
  private readonly options: QueryExecutorOptions;

  constructor(options: QueryExecutorOptions = {}) {
    this.options = {
      maxLimit: options.maxLimit ?? 1000,
      defaultLimit: options.defaultLimit ?? 100,
    };
  }

  /**
   * Execute a query request (typed or raw)
   */
  async execute(db: NervusDB, request: unknown): Promise<QueryResult> {
    // Validate request
    const validatedRequest = validateQueryRequest(request);

    logger.debug({ request: validatedRequest }, 'Executing query');

    if (validatedRequest.type === 'typed') {
      return this.executeTypedQuery(db, validatedRequest);
    } else {
      return this.executeRawQuery(db, validatedRequest);
    }
  }

  /**
   * Execute a typed query using NervusDB's find API
   */
  private async executeTypedQuery(db: NervusDB, query: TypedQuery): Promise<QueryResult> {
    const { filter, options } = query;
    const limit = options?.limit ?? this.options.defaultLimit;
    const offset = options?.offset ?? 0;

    // Validate filter has at least one field
    if (!filter.subject && !filter.predicate && !filter.object) {
      throw new ValidationError(
        'Query filter must specify at least one field (subject, predicate, or object)',
      );
    }

    // Build query
    const queryObj = buildTypedQuery(filter);

    logger.debug({ filter, limit, offset }, 'Executing typed query');

    try {
      // Execute query with limit + 1 to check for more results
      const results = await db.find(queryObj).all();

      // Apply offset and limit
      const slicedResults = results.slice(offset, offset + limit + 1);
      const hasMore = slicedResults.length > limit;
      const facts = slicedResults.slice(0, limit).map((fact) => ({
        subject: String(fact.subject),
        predicate: String(fact.predicate),
        object: String(fact.object),
        properties: fact.objectProperties
          ? (fact.objectProperties as Record<string, unknown>)
          : undefined,
      }));

      logger.info({ count: facts.length, hasMore, filter }, 'Typed query executed successfully');

      return {
        facts,
        count: facts.length,
        hasMore,
      };
    } catch (error) {
      logger.error({ err: error, filter }, 'Typed query execution failed');
      throw error;
    }
  }

  /**
   * Extract node summary from a value
   *
   * Converts large node objects (with AST, source code) to compact summaries
   * containing only essential metadata. This prevents token limit errors when
   * returning query results via MCP.
   *
   * @param value - The value to extract summary from
   * @returns Node summary object if value is a node, undefined otherwise
   */
  private extractNodeSummary(value: unknown): Record<string, unknown> | undefined {
    // Only process objects (not arrays, null, or primitives)
    if (!value || typeof value !== 'object' || Array.isArray(value)) {
      return undefined;
    }

    const obj = value as Record<string, unknown>;

    // Check if this looks like a graph node (has node-like properties)
    const hasNodeProperties = 'id' in obj || 'name' in obj || 'type' in obj || 'label' in obj;
    if (!hasNodeProperties) {
      return undefined;
    }

    // Extract only essential metadata fields (avoid AST, source code, etc.)
    const summary: Record<string, unknown> = {};
    const keyFields = ['id', 'name', 'type', 'filePath', 'language', 'label', 'kind', 'signature'];

    for (const field of keyFields) {
      if (field in obj) {
        const fieldValue = obj[field];
        // Only include primitive values (avoid nested objects like AST)
        if (
          typeof fieldValue === 'string' ||
          typeof fieldValue === 'number' ||
          typeof fieldValue === 'boolean'
        ) {
          summary[field] = fieldValue;
        }
      }
    }

    // Return summary only if we extracted at least one field
    return Object.keys(summary).length > 0 ? summary : undefined;
  }

  /**
   * Execute a raw Cypher query
   */
  private async executeRawQuery(db: NervusDB, query: RawQuery): Promise<QueryResult> {
    const { cypher, params = {} } = query;

    logger.debug({ cypher, params }, 'Executing raw Cypher query');

    try {
      // Execute Cypher query via NervusDB's experimental API
      const cypherResult = await db.cypher(cypher, params, { readonly: true });

      // Convert CypherResult to QueryResult format
      const facts = cypherResult.records.map((record) => {
        // Extract first column as primary data
        const keys = Object.keys(record);
        if (keys.length === 0) {
          return {
            subject: '',
            predicate: '',
            object: '',
          };
        }

        // If record has typical triple structure (s, p, o)
        if ('subject' in record && 'predicate' in record && 'object' in record) {
          return {
            subject: String(record.subject),
            predicate: String(record.predicate),
            object: String(record.object),
            properties: record.properties as Record<string, unknown> | undefined,
          };
        }

        // For other queries (e.g., RETURN s, o), extract node summary
        const firstKey = keys[0];
        const value = record[firstKey];

        // Try to extract node summary (if value is a graph node)
        const nodeSummary = this.extractNodeSummary(value);

        // Extract a compact identifier for the object field
        let objectId: string;
        if (nodeSummary && 'id' in nodeSummary) {
          // If we have a node summary with ID, use it
          objectId = String(nodeSummary.id);
        } else if (typeof value === 'string') {
          // If value is already a string, use it directly
          objectId = value;
        } else if (value && typeof value === 'object') {
          // For other objects, try to extract a meaningful identifier
          const obj = value as Record<string, unknown>;
          objectId = String(obj.id || obj.name || obj.type || firstKey);
        } else {
          // For primitives, just stringify
          objectId = String(value);
        }

        return {
          subject: '',
          predicate: 'result',
          object: objectId,
          properties: nodeSummary, // Now contains full summary (id, name, type, filePath, etc.)
        };
      });

      logger.info(
        {
          count: facts.length,
          executionTime: cypherResult.summary.resultConsumedAfter,
          statementType: cypherResult.summary.statementType,
        },
        'Raw Cypher query executed successfully',
      );

      return {
        facts,
        count: facts.length,
        hasMore: false, // Cypher queries return all results
      };
    } catch (error) {
      logger.error({ err: error, cypher, params }, 'Raw Cypher query execution failed');
      throw error;
    }
  }
}
