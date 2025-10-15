import { describe, it, expect } from 'vitest';
import {
  QueryFilterSchema,
  QueryOptionsSchema,
  TypedQuerySchema,
  RawQuerySchema,
  QueryRequestSchema,
  buildTypedQuery,
  validateQueryRequest,
} from '../../../src/domain/query/queryBuilder.js';
import { ValidationError } from '../../../src/domain/shared/errors.js';

describe('queryBuilder', () => {
  describe('QueryFilterSchema', () => {
    it('should validate filter with subject only', () => {
      const result = QueryFilterSchema.parse({ subject: 'project:test' });
      expect(result).toEqual({ subject: 'project:test' });
    });

    it('should validate filter with all fields', () => {
      const result = QueryFilterSchema.parse({
        subject: 'project:test',
        predicate: 'CONTAINS',
        object: 'file:test.ts',
      });
      expect(result).toEqual({
        subject: 'project:test',
        predicate: 'CONTAINS',
        object: 'file:test.ts',
      });
    });

    it('should allow empty filter', () => {
      const result = QueryFilterSchema.parse({});
      expect(result).toEqual({});
    });
  });

  describe('QueryOptionsSchema', () => {
    it('should use default values', () => {
      const result = QueryOptionsSchema.parse({});
      expect(result).toEqual({ limit: 100, offset: 0 });
    });

    it('should accept custom values', () => {
      const result = QueryOptionsSchema.parse({ limit: 50, offset: 10 });
      expect(result).toEqual({ limit: 50, offset: 10 });
    });

    it('should enforce minimum limit', () => {
      expect(() => QueryOptionsSchema.parse({ limit: 0 })).toThrow();
    });

    it('should enforce maximum limit', () => {
      expect(() => QueryOptionsSchema.parse({ limit: 2000 })).toThrow();
    });
  });

  describe('TypedQuerySchema', () => {
    it('should validate typed query', () => {
      const query = {
        type: 'typed' as const,
        filter: { predicate: 'CONTAINS' },
        options: { limit: 50 },
      };
      const result = TypedQuerySchema.parse(query);
      expect(result).toMatchObject(query);
    });

    it('should work without options', () => {
      const query = {
        type: 'typed' as const,
        filter: { predicate: 'CONTAINS' },
      };
      const result = TypedQuerySchema.parse(query);
      expect(result.filter).toEqual({ predicate: 'CONTAINS' });
    });
  });

  describe('RawQuerySchema', () => {
    it('should validate raw query', () => {
      const query = {
        type: 'raw' as const,
        cypher: 'MATCH (n) RETURN n',
      };
      const result = RawQuerySchema.parse(query);
      expect(result).toEqual(query);
    });

    it('should validate raw query with params', () => {
      const query = {
        type: 'raw' as const,
        cypher: 'MATCH (n) WHERE n.name = $name RETURN n',
        params: { name: 'test' },
      };
      const result = RawQuerySchema.parse(query);
      expect(result).toEqual(query);
    });

    it('should reject empty cypher', () => {
      const query = {
        type: 'raw' as const,
        cypher: '',
      };
      expect(() => RawQuerySchema.parse(query)).toThrow();
    });
  });

  describe('QueryRequestSchema', () => {
    it('should validate typed query request', () => {
      const request = {
        type: 'typed' as const,
        filter: { predicate: 'CONTAINS' },
      };
      const result = QueryRequestSchema.parse(request);
      expect(result.type).toBe('typed');
    });

    it('should validate raw query request', () => {
      const request = {
        type: 'raw' as const,
        cypher: 'MATCH (n) RETURN n',
      };
      const result = QueryRequestSchema.parse(request);
      expect(result.type).toBe('raw');
    });

    it('should reject invalid type', () => {
      const request = {
        type: 'invalid',
        filter: {},
      };
      expect(() => QueryRequestSchema.parse(request)).toThrow();
    });
  });

  describe('buildTypedQuery', () => {
    it('should build query with subject only', () => {
      const result = buildTypedQuery({ subject: 'project:test' });
      expect(result).toEqual({ subject: 'project:test' });
    });

    it('should build query with all fields', () => {
      const result = buildTypedQuery({
        subject: 'project:test',
        predicate: 'CONTAINS',
        object: 'file:test.ts',
      });
      expect(result).toEqual({
        subject: 'project:test',
        predicate: 'CONTAINS',
        object: 'file:test.ts',
      });
    });

    it('should omit undefined fields', () => {
      const result = buildTypedQuery({ predicate: 'CONTAINS' });
      expect(result).toEqual({ predicate: 'CONTAINS' });
      expect(result).not.toHaveProperty('subject');
      expect(result).not.toHaveProperty('object');
    });
  });

  describe('validateQueryRequest', () => {
    it('should validate and return typed query', () => {
      const request = {
        type: 'typed',
        filter: { predicate: 'CONTAINS' },
      };
      const result = validateQueryRequest(request);
      expect(result.type).toBe('typed');
    });

    it('should throw on invalid request', () => {
      expect(() => validateQueryRequest({ invalid: 'data' })).toThrow();
    });
  });
});
