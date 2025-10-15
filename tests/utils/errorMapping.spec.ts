import { describe, it, expect } from 'vitest';
import { McpError, ErrorCode } from '@modelcontextprotocol/sdk/types.js';
import {
  ValidationError,
  NotFoundError,
  ConflictError,
  InternalError,
} from '../../src/domain/shared/errors.js';
import {
  IndexNotFoundError,
  FingerprintMismatchError,
} from '../../src/domain/fingerprint/errors.js';
import { mapDomainErrorToMcp, createErrorDetails } from '../../src/utils/errorMapping.js';

describe('errorMapping', () => {
  describe('mapDomainErrorToMcp', () => {
    it('should map ValidationError to InvalidParams', () => {
      const error = new ValidationError('Invalid input', { field: 'email' });
      const mcpError = mapDomainErrorToMcp(error);

      expect(mcpError).toBeInstanceOf(McpError);
      expect(mcpError.code).toBe(ErrorCode.InvalidParams);
      expect(mcpError.message).toContain('Invalid input');
      expect(mcpError.data).toMatchObject({
        code: 'VALIDATION_ERROR',
        details: { field: 'email' },
      });
    });

    it('should map NotFoundError to InvalidRequest', () => {
      const error = new NotFoundError('User', '123');
      const mcpError = mapDomainErrorToMcp(error);

      expect(mcpError).toBeInstanceOf(McpError);
      expect(mcpError.code).toBe(ErrorCode.InvalidRequest);
      expect(mcpError.message).toContain('User not found: 123');
      expect(mcpError.data).toMatchObject({
        code: 'NOT_FOUND',
      });
    });

    it('should map IndexNotFoundError to InvalidRequest', () => {
      const error = new IndexNotFoundError();
      const mcpError = mapDomainErrorToMcp(error);

      expect(mcpError).toBeInstanceOf(McpError);
      expect(mcpError.code).toBe(ErrorCode.InvalidRequest);
      expect(mcpError.data).toMatchObject({
        code: 'INDEX_NOT_FOUND',
      });
    });

    it('should map FingerprintMismatchError to InvalidRequest', () => {
      const error = new FingerprintMismatchError();
      const mcpError = mapDomainErrorToMcp(error);

      expect(mcpError).toBeInstanceOf(McpError);
      expect(mcpError.code).toBe(ErrorCode.InvalidRequest);
      expect(mcpError.data).toMatchObject({
        code: 'FINGERPRINT_MISMATCH',
      });
    });

    it('should map ConflictError to InvalidRequest', () => {
      const error = new ConflictError('Resource already exists');
      const mcpError = mapDomainErrorToMcp(error);

      expect(mcpError).toBeInstanceOf(McpError);
      expect(mcpError.code).toBe(ErrorCode.InvalidRequest);
      expect(mcpError.message).toContain('Resource already exists');
      expect(mcpError.data).toMatchObject({
        code: 'CONFLICT',
      });
    });

    it('should map InternalError to InternalError', () => {
      const cause = new Error('Database connection failed');
      const error = new InternalError('Internal error occurred', cause);
      const mcpError = mapDomainErrorToMcp(error);

      expect(mcpError).toBeInstanceOf(McpError);
      expect(mcpError.code).toBe(ErrorCode.InternalError);
      expect(mcpError.data).toMatchObject({
        code: 'INTERNAL_ERROR',
      });
    });

    it('should map unknown Error to InternalError', () => {
      const error = new Error('Something went wrong');
      const mcpError = mapDomainErrorToMcp(error);

      expect(mcpError).toBeInstanceOf(McpError);
      expect(mcpError.code).toBe(ErrorCode.InternalError);
      expect(mcpError.data).toMatchObject({
        code: 'UNKNOWN_ERROR',
      });
    });

    it('should include stack trace in development mode', () => {
      const originalEnv = process.env.NODE_ENV;
      process.env.NODE_ENV = 'development';

      try {
        const error = new ValidationError('Test error');
        const mcpError = mapDomainErrorToMcp(error);

        expect(mcpError.data).toHaveProperty('stack');
      } finally {
        process.env.NODE_ENV = originalEnv;
      }
    });

    it('should not include stack trace in production mode', () => {
      const originalEnv = process.env.NODE_ENV;
      process.env.NODE_ENV = 'production';

      try {
        const error = new ValidationError('Test error');
        const mcpError = mapDomainErrorToMcp(error);

        expect(mcpError.data).not.toHaveProperty('stack');
      } finally {
        process.env.NODE_ENV = originalEnv;
      }
    });
  });

  describe('createErrorDetails', () => {
    it('should create details from DomainError', () => {
      const error = new ValidationError('Invalid input', { field: 'email' });
      const details = createErrorDetails(error);

      expect(details).toMatchObject({
        name: 'ValidationError',
        code: 'VALIDATION_ERROR',
        message: 'Invalid input',
        isOperational: true,
        details: { field: 'email' },
      });
    });

    it('should create details from generic Error', () => {
      const error = new Error('Something went wrong');
      const details = createErrorDetails(error);

      expect(details).toMatchObject({
        code: 'UNKNOWN_ERROR',
        message: 'Something went wrong',
      });
      expect(details).toHaveProperty('stack');
    });

    it('should include cause for InternalError', () => {
      const cause = new Error('Database error');
      const error = new InternalError('Internal error', cause);
      const details = createErrorDetails(error);

      expect(details).toMatchObject({
        name: 'InternalError',
        code: 'INTERNAL_ERROR',
        message: 'Internal error',
        isOperational: false,
        cause: 'Database error',
      });
    });
  });
});
