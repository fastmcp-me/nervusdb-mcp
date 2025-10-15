import { z } from 'zod';

// Query builder schemas
export const QueryFilterSchema = z.object({
  subject: z.string().optional(),
  predicate: z.string().optional(),
  object: z.string().optional(),
});

export const QueryOptionsSchema = z.object({
  limit: z.number().int().min(1).max(1000).default(100),
  offset: z.number().int().min(0).default(0),
});

export const TypedQuerySchema = z.object({
  type: z.literal('typed'),
  filter: QueryFilterSchema,
  options: QueryOptionsSchema.optional(),
});

export const RawQuerySchema = z.object({
  type: z.literal('raw'),
  cypher: z.string().min(1),
  params: z.record(z.unknown()).optional(),
});

export const QueryRequestSchema = z.discriminatedUnion('type', [TypedQuerySchema, RawQuerySchema]);

// Type exports
export type QueryFilter = z.infer<typeof QueryFilterSchema>;
export type QueryOptions = z.infer<typeof QueryOptionsSchema>;
export type TypedQuery = z.infer<typeof TypedQuerySchema>;
export type RawQuery = z.infer<typeof RawQuerySchema>;
export type QueryRequest = z.infer<typeof QueryRequestSchema>;

export interface QueryResult {
  facts: Array<{
    subject: string;
    predicate: string;
    object: string;
    properties?: Record<string, unknown>;
  }>;
  count: number;
  hasMore: boolean;
}

/**
 * Convert typed query filter to SynapseDB query
 */
export function buildTypedQuery(filter: QueryFilter): {
  subject?: string;
  predicate?: string;
  object?: string;
} {
  return {
    ...(filter.subject && { subject: filter.subject }),
    ...(filter.predicate && { predicate: filter.predicate }),
    ...(filter.object && { object: filter.object }),
  };
}

/**
 * Validate query request
 */
export function validateQueryRequest(request: unknown): QueryRequest {
  return QueryRequestSchema.parse(request);
}
