import { describe, it, expect, vi } from 'vitest';
import { McpError, ErrorCode } from '@modelcontextprotocol/sdk/types.js';
import { withErrorHandling, safeExecute } from '../../src/utils/errorHandler.js';
import { ValidationError } from '../../src/domain/shared/errors.js';

describe('errorHandler', () => {
  describe('withErrorHandling', () => {
    it('should execute handler successfully', async () => {
      const handler = vi.fn().mockResolvedValue({ success: true });
      const wrappedHandler = withErrorHandling('test-tool', handler);

      const result = await wrappedHandler({ input: 'test' });

      expect(result).toEqual({ success: true });
      expect(handler).toHaveBeenCalledWith({ input: 'test' });
    });

    it('should catch and map domain errors', async () => {
      const handler = vi.fn().mockRejectedValue(new ValidationError('Invalid input'));
      const wrappedHandler = withErrorHandling('test-tool', handler);

      await expect(wrappedHandler({ input: 'test' })).rejects.toThrow(McpError);

      try {
        await wrappedHandler({ input: 'test' });
      } catch (error) {
        expect(error).toBeInstanceOf(McpError);
        expect((error as McpError).code).toBe(ErrorCode.InvalidParams);
      }
    });

    it('should pass through McpError as-is', async () => {
      const originalError = new McpError(ErrorCode.InvalidRequest, 'Test error');
      const handler = vi.fn().mockRejectedValue(originalError);
      const wrappedHandler = withErrorHandling('test-tool', handler);

      await expect(wrappedHandler({ input: 'test' })).rejects.toThrow(originalError);
    });

    it('should handle unknown errors', async () => {
      const handler = vi.fn().mockRejectedValue('string error');
      const wrappedHandler = withErrorHandling('test-tool', handler);

      await expect(wrappedHandler({ input: 'test' })).rejects.toThrow(McpError);

      try {
        await wrappedHandler({ input: 'test' });
      } catch (error) {
        expect(error).toBeInstanceOf(McpError);
        expect((error as McpError).data).toMatchObject({
          code: 'UNKNOWN_ERROR',
        });
      }
    });
  });

  describe('safeExecute', () => {
    it('should execute function successfully', async () => {
      const fn = vi.fn().mockResolvedValue('success');
      const result = await safeExecute(fn, 'test-context');

      expect(result).toBe('success');
      expect(fn).toHaveBeenCalled();
    });

    it('should handle errors and rethrow', async () => {
      const error = new Error('Test error');
      const fn = vi.fn().mockRejectedValue(error);

      await expect(safeExecute(fn, 'test-context')).rejects.toThrow(error);
    });

    it('should work with synchronous functions', async () => {
      const fn = vi.fn().mockReturnValue('sync result');
      const result = await safeExecute(fn);

      expect(result).toBe('sync result');
    });
  });
});
