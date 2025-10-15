import { Command } from 'commander';
import path from 'node:path';

import { IndexMaintenanceService } from '../services/indexMaintenanceService.js';
import { logger } from '../utils/logger.js';

const program = new Command();

program
  .name('synapse-index')
  .description('构建 SynapseDB 影子索引并原子切换为正式知识图谱')
  .requiredOption('-p, --project <path>', '待索引的项目根路径')
  .option('--db-root <path>', 'SynapseDB 存储根目录（默认 .synapsedb/）')
  .option('--temp-root <path>', '影子库临时目录（默认 .synapsedb/tmp）')
  .option('--verbose', '显示详细日志')
  .action(async (options) => {
    if (options.verbose) {
      process.env.LOG_LEVEL = 'debug';
    }

    const service = new IndexMaintenanceService({
      dbRoot: options.dbRoot ? path.resolve(options.dbRoot) : undefined,
      tempDir: options.tempRoot ? path.resolve(options.tempRoot) : undefined,
      onIndexStart: (projectPath) => {
        logger.info({ projectPath }, 'Index rebuild starting...');
      },
      onIndexComplete: (telemetry) => {
        logger.info(
          {
            duration: telemetry.duration,
            processedFiles: telemetry.processedFiles,
            fingerprint: telemetry.fingerprint,
          },
          'Index rebuild completed successfully',
        );
      },
      onIndexError: (error, projectPath) => {
        logger.error({ err: error, projectPath }, 'Index rebuild failed');
      },
    });

    try {
      const result = await service.rebuildIndex(options.project);
      console.log(
        [
          `✓ 索引完成：${result.processedFiles} files`,
          `  存储目录：${result.metadata.projectPath}`,
          `  指纹：${result.metadata.fingerprint.value}`,
          `  耗时：${(result.telemetry.duration / 1000).toFixed(2)}s`,
        ].join('\n'),
      );
      process.exitCode = 0;
    } catch (error) {
      console.error('✗ 索引失败：', error instanceof Error ? error.message : String(error));
      process.exitCode = 1;
    }
  });

void program.parseAsync();
