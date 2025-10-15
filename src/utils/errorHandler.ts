import { McpError } from '@modelcontextprotocol/sdk/types.js';
import { mapDomainErrorToMcp } from './errorMapping.js';
import { logger } from './logger.js';

export type ToolHandler<TArgs = unknown, TResult = unknown> = (args: TArgs) => Promise<TResult>;

export function withErrorHandling<TArgs, TResult>(
  toolName: string,
  handler: ToolHandler<TArgs, TResult>,
): ToolHandler<TArgs, TResult> {
  return async (args: TArgs): Promise<TResult> => {
    const log = logger.child({ tool: toolName });

    try {
      log.debug({ args }, 'Tool execution started');
      const result = await handler(args);
      log.info('Tool execution completed successfully');
      return result;
    } catch (error) {
      log.error({ err: error, args }, 'Tool execution failed');

      if (error instanceof McpError) {
        throw error;
      }

      if (error instanceof Error) {
        throw mapDomainErrorToMcp(error);
      }

      throw new McpError(-32603, 'An unexpected error occurred', {
        code: 'UNKNOWN_ERROR',
        originalError: String(error),
      });
    }
  };
}

export function safeExecute<T>(fn: () => T | Promise<T>, context?: string): Promise<T> {
  const log = context ? logger.child({ context }) : logger;

  return Promise.resolve()
    .then(() => fn())
    .catch((error) => {
      log.error({ err: error }, 'Safe execution failed');
      throw error;
    });
}
