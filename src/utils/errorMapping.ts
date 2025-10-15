import { McpError, ErrorCode } from '@modelcontextprotocol/sdk/types.js';
import {
  DomainError,
  ValidationError,
  NotFoundError,
  ConflictError,
  InternalError,
} from '../domain/shared/errors.js';
import { IndexNotFoundError, FingerprintMismatchError } from '../domain/fingerprint/errors.js';
import { logger } from './logger.js';

export interface ErrorDetails {
  code: string;
  message: string;
  details?: unknown;
  stack?: string;
}

export function mapDomainErrorToMcp(error: Error): McpError {
  const isDev = process.env.NODE_ENV !== 'production';

  if (error instanceof ValidationError) {
    return new McpError(ErrorCode.InvalidParams, error.message, {
      code: error.code,
      details: error.details,
      ...(isDev && { stack: error.stack }),
    });
  }

  if (error instanceof NotFoundError || error instanceof IndexNotFoundError) {
    return new McpError(ErrorCode.InvalidRequest, error.message, {
      code: error.code ?? 'NOT_FOUND',
      ...(isDev && { stack: error.stack }),
    });
  }

  if (error instanceof FingerprintMismatchError) {
    return new McpError(ErrorCode.InvalidRequest, error.message, {
      code: 'FINGERPRINT_MISMATCH',
      ...(isDev && { stack: error.stack }),
    });
  }

  if (error instanceof ConflictError) {
    return new McpError(ErrorCode.InvalidRequest, error.message, {
      code: error.code,
      ...(isDev && { stack: error.stack }),
    });
  }

  if (error instanceof InternalError) {
    logger.error({ err: error, cause: error.cause }, 'Internal error occurred');
    return new McpError(
      ErrorCode.InternalError,
      isDev ? error.message : 'An internal error occurred',
      {
        code: error.code,
        ...(isDev && { stack: error.stack, cause: error.cause?.message }),
      },
    );
  }

  if (error instanceof DomainError) {
    return new McpError(
      error.isOperational ? ErrorCode.InvalidRequest : ErrorCode.InternalError,
      error.message,
      {
        code: error.code,
        ...(isDev && { stack: error.stack }),
      },
    );
  }

  logger.error({ err: error }, 'Unhandled error occurred');
  return new McpError(
    ErrorCode.InternalError,
    isDev ? error.message : 'An unexpected error occurred',
    {
      code: 'UNKNOWN_ERROR',
      ...(isDev && { stack: error.stack }),
    },
  );
}

export function createErrorDetails(error: Error): ErrorDetails {
  if (error instanceof DomainError) {
    return error.toJSON();
  }

  return {
    code: 'UNKNOWN_ERROR',
    message: error.message,
    stack: error.stack,
  };
}
