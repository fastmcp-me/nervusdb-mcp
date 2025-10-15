import {
  IndexingService,
  type IndexingServiceOptions,
} from '../domain/indexing/indexingService.js';
import { createChildLogger } from '../utils/logger.js';
import type { IndexMetadata } from '../domain/types/indexMetadata.js';

const logger = createChildLogger({ service: 'IndexMaintenanceService' });

export interface IndexTelemetry {
  startTime: Date;
  endTime: Date;
  duration: number;
  processedFiles: number;
  projectPath: string;
  fingerprint: string;
  success: boolean;
  error?: string;
}

export interface IndexMaintenanceServiceOptions extends IndexingServiceOptions {
  onIndexStart?: (projectPath: string) => void;
  onIndexComplete?: (telemetry: IndexTelemetry) => void;
  onIndexError?: (error: Error, projectPath: string) => void;
}

/**
 * Service that wraps IndexingService with telemetry and maintenance hooks
 */
export class IndexMaintenanceService {
  private readonly indexingService: IndexingService;
  private readonly options: IndexMaintenanceServiceOptions;

  constructor(options: IndexMaintenanceServiceOptions = {}) {
    this.options = options;
    this.indexingService = new IndexingService({
      dbRoot: options.dbRoot,
      tempDir: options.tempDir,
    });
  }

  /**
   * Rebuild index for a project with telemetry tracking
   */
  async rebuildIndex(projectPath: string): Promise<{
    metadata: IndexMetadata;
    processedFiles: number;
    telemetry: IndexTelemetry;
  }> {
    const startTime = new Date();
    logger.info({ projectPath }, 'Index rebuild initiated');

    this.options.onIndexStart?.(projectPath);

    try {
      const result = await this.indexingService.index(projectPath);
      const endTime = new Date();
      const duration = endTime.getTime() - startTime.getTime();

      const telemetry: IndexTelemetry = {
        startTime,
        endTime,
        duration,
        processedFiles: result.processedFiles,
        projectPath,
        fingerprint: result.metadata.fingerprint.value,
        success: true,
      };

      logger.info(
        {
          projectPath,
          duration,
          processedFiles: result.processedFiles,
          fingerprint: result.metadata.fingerprint.value,
        },
        'Index rebuild completed successfully',
      );

      this.options.onIndexComplete?.(telemetry);

      return {
        metadata: result.metadata,
        processedFiles: result.processedFiles,
        telemetry,
      };
    } catch (error) {
      const endTime = new Date();
      const duration = endTime.getTime() - startTime.getTime();
      const err = error as Error;

      logger.error({ err, projectPath, duration }, 'Index rebuild failed');

      this.options.onIndexError?.(err, projectPath);

      throw error;
    }
  }

  /**
   * Get statistics about the last index operation
   */
  getLastTelemetry(): IndexTelemetry | null {
    // This could be enhanced to store telemetry history
    return null;
  }
}
