import { describe, it, expect, vi } from 'vitest';
import { QueryExecutor } from '../../../src/domain/query/queryExecutor.js';
import { ValidationError } from '../../../src/domain/shared/errors.js';

describe('QueryExecutor', () => {
  const mockDb = {
    find: vi.fn(),
    close: vi.fn(),
    cypher: vi.fn(),
  };

  describe('execute', () => {
    it('should execute typed query successfully', async () => {
      const executor = new QueryExecutor();
      const mockResults = [
        { subject: 'project:test', predicate: 'CONTAINS', object: 'file:test.ts' },
        { subject: 'project:test', predicate: 'CONTAINS', object: 'file:test2.ts' },
      ];

      mockDb.find.mockReturnValue({ all: vi.fn().mockResolvedValue(mockResults) });

      const query = {
        type: 'typed' as const,
        filter: { predicate: 'CONTAINS' },
        options: { limit: 10, offset: 0 },
      };

      const result = await executor.execute(mockDb as any, query);

      expect(result.facts).toHaveLength(2);
      expect(result.count).toBe(2);
      expect(result.hasMore).toBe(false);
      expect(mockDb.find).toHaveBeenCalledWith({ predicate: 'CONTAINS' });
    });

    it('should handle pagination correctly', async () => {
      const executor = new QueryExecutor();
      const mockResults = Array.from({ length: 15 }, (_, i) => ({
        subject: 'project:test',
        predicate: 'CONTAINS',
        object: `file:test${i}.ts`,
      }));

      mockDb.find.mockReturnValue({ all: vi.fn().mockResolvedValue(mockResults) });

      const query = {
        type: 'typed' as const,
        filter: { predicate: 'CONTAINS' },
        options: { limit: 10, offset: 0 },
      };

      const result = await executor.execute(mockDb as any, query);

      expect(result.facts).toHaveLength(10);
      expect(result.hasMore).toBe(true);
    });

    it('should apply offset correctly', async () => {
      const executor = new QueryExecutor();
      const mockResults = Array.from({ length: 15 }, (_, i) => ({
        subject: 'project:test',
        predicate: 'CONTAINS',
        object: `file:test${i}.ts`,
      }));

      mockDb.find.mockReturnValue({ all: vi.fn().mockResolvedValue(mockResults) });

      const query = {
        type: 'typed' as const,
        filter: { predicate: 'CONTAINS' },
        options: { limit: 5, offset: 10 },
      };

      const result = await executor.execute(mockDb as any, query);

      expect(result.facts).toHaveLength(5);
      expect(result.facts[0].object).toBe('file:test10.ts');
      expect(result.hasMore).toBe(false);
    });

    it('should throw ValidationError for empty filter', async () => {
      const executor = new QueryExecutor();

      const query = {
        type: 'typed' as const,
        filter: {},
      };

      await expect(executor.execute(mockDb as any, query)).rejects.toThrow(ValidationError);
    });

    it('should execute raw Cypher queries successfully', async () => {
      const executor = new QueryExecutor();
      const mockCypherResult = {
        records: [
          { subject: 'file:test.ts', predicate: 'DEFINES', object: 'function:test' },
          { subject: 'file:test2.ts', predicate: 'DEFINES', object: 'function:test2' },
        ],
        summary: {
          statement: 'MATCH (s)-[r:DEFINES]->(o) RETURN s, r, o',
          parameters: {},
          resultAvailableAfter: 5,
          resultConsumedAfter: 10,
          statementType: 'READ_ONLY' as const,
        },
      };

      mockDb.cypher.mockResolvedValue(mockCypherResult);

      const query = {
        type: 'raw' as const,
        cypher: 'MATCH (s)-[r:DEFINES]->(o) RETURN s, r, o',
      };

      const result = await executor.execute(mockDb as any, query);

      expect(result.facts).toHaveLength(2);
      expect(result.count).toBe(2);
      expect(result.hasMore).toBe(false);
      expect(mockDb.cypher).toHaveBeenCalledWith(
        'MATCH (s)-[r:DEFINES]->(o) RETURN s, r, o',
        {},
        { readonly: true },
      );
    });

    it('should include object properties in results', async () => {
      const executor = new QueryExecutor();
      const mockResults = [
        {
          subject: 'project:test',
          predicate: 'CONTAINS',
          object: 'file:test.ts',
          objectProperties: { path: 'src/test.ts', length: 100 },
        },
      ];

      mockDb.find.mockReturnValue({ all: vi.fn().mockResolvedValue(mockResults) });

      const query = {
        type: 'typed' as const,
        filter: { predicate: 'CONTAINS' },
      };

      const result = await executor.execute(mockDb as any, query);

      expect(result.facts[0].properties).toEqual({ path: 'src/test.ts', length: 100 });
    });

    it('should throw on invalid request format', async () => {
      const executor = new QueryExecutor();

      await expect(executor.execute(mockDb as any, { invalid: 'query' })).rejects.toThrow();
    });
  });
});
