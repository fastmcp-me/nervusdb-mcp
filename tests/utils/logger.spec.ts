import { describe, it, expect } from 'vitest';
import { logger, createChildLogger } from '../../src/utils/logger.js';

describe('logger', () => {
  it('should export a logger instance', () => {
    expect(logger).toBeDefined();
    expect(logger.info).toBeDefined();
    expect(logger.error).toBeDefined();
    expect(logger.warn).toBeDefined();
    expect(logger.debug).toBeDefined();
  });

  it('should create child logger with bindings', () => {
    const childLogger = createChildLogger({ service: 'TestService', requestId: '123' });

    expect(childLogger).toBeDefined();
    expect(childLogger.info).toBeDefined();
  });

  it('should have different log levels', () => {
    expect(logger.level).toBeDefined();
    expect(typeof logger.level).toBe('string');
  });
});
