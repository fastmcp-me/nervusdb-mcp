/**
 * Schema迁移工具
 *
 * 处理知识图谱schema版本升级
 */

import { createChildLogger } from '../../utils/logger.js';
import type { IndexMetadata } from '../types/indexMetadata.js';

const logger = createChildLogger({ service: 'SchemaMigrator' });

/**
 * 当前schema版本
 */
export const CURRENT_SCHEMA_VERSION = 2;

/**
 * Schema版本历史
 */
export const SCHEMA_VERSIONS = {
  V1: 1, // 文件级索引：仅支持 CONTAINS、HAS_ROOT
  V2: 2, // 代码级索引：支持 DEFINES、CALLS、IMPLEMENTS、EXTENDS、IMPORTS
} as const;

/**
 * Schema版本信息
 */
export interface SchemaVersionInfo {
  version: number;
  name: string;
  description: string;
  predicates: string[];
  features: string[];
}

/**
 * 迁移策略
 */
export type MigrationStrategy = 'rebuild' | 'warn' | 'auto';

/**
 * 迁移结果
 */
export interface MigrationResult {
  success: boolean;
  fromVersion: number;
  toVersion: number;
  strategy: MigrationStrategy;
  message: string;
}

/**
 * Schema兼容性检查结果
 */
export interface CompatibilityCheck {
  isCompatible: boolean;
  currentVersion: number;
  expectedVersion: number;
  needsMigration: boolean;
  canAutoMigrate: boolean;
  message: string;
}

/**
 * 获取schema版本信息
 */
export function getSchemaVersionInfo(version: number): SchemaVersionInfo {
  switch (version) {
    case SCHEMA_VERSIONS.V1:
      return {
        version: 1,
        name: 'File-Level Indexing',
        description: '文件级索引，仅支持文件包含关系',
        predicates: ['HAS_ROOT', 'CONTAINS'],
        features: ['项目文件索引', '文件列表查询', '基础文件关系'],
      };

    case SCHEMA_VERSIONS.V2:
      return {
        version: 2,
        name: 'Code-Level Indexing',
        description: '代码级索引，支持函数、类、接口等代码实体及其关系',
        predicates: [
          'HAS_ROOT',
          'CONTAINS',
          'DEFINES',
          'CALLS',
          'IMPLEMENTS',
          'EXTENDS',
          'IMPORTS',
        ],
        features: [
          '文件级索引（v1所有功能）',
          '代码实体提取（函数、类、接口）',
          '函数调用关系',
          '类继承关系',
          '接口实现关系',
          'import/export关系',
          '多语言支持（8种语言）',
          '影响范围分析',
          '调用层次查询',
        ],
      };

    default:
      return {
        version,
        name: 'Unknown',
        description: '未知schema版本',
        predicates: [],
        features: [],
      };
  }
}

/**
 * 检查schema兼容性
 */
export function checkCompatibility(metadata: IndexMetadata): CompatibilityCheck {
  const currentVersion = metadata.schemaVersion;
  const expectedVersion = CURRENT_SCHEMA_VERSION;

  if (currentVersion === expectedVersion) {
    return {
      isCompatible: true,
      currentVersion,
      expectedVersion,
      needsMigration: false,
      canAutoMigrate: false,
      message: `Schema version ${currentVersion} is up to date`,
    };
  }

  if (currentVersion > expectedVersion) {
    return {
      isCompatible: false,
      currentVersion,
      expectedVersion,
      needsMigration: false,
      canAutoMigrate: false,
      message:
        `Schema version ${currentVersion} is newer than expected ${expectedVersion}. ` +
        'Please update NervusDB MCP to the latest version.',
    };
  }

  // currentVersion < expectedVersion
  const fromInfo = getSchemaVersionInfo(currentVersion);
  const toInfo = getSchemaVersionInfo(expectedVersion);

  return {
    isCompatible: false,
    currentVersion,
    expectedVersion,
    needsMigration: true,
    canAutoMigrate: true, // 总是可以通过重建索引来迁移
    message:
      `Schema upgrade available: ${fromInfo.name} (v${currentVersion}) → ${toInfo.name} (v${expectedVersion}). ` +
      `Rebuild index to enable new features: ${toInfo.features.slice(-3).join(', ')}`,
  };
}

/**
 * 执行schema迁移
 *
 * @param metadata 当前索引元数据
 * @param strategy 迁移策略
 * @param rebuildFn 重建索引的函数
 */
export async function migrate(
  metadata: IndexMetadata,
  strategy: MigrationStrategy = 'warn',
  rebuildFn?: () => Promise<void>,
): Promise<MigrationResult> {
  const check = checkCompatibility(metadata);

  if (!check.needsMigration) {
    return {
      success: true,
      fromVersion: check.currentVersion,
      toVersion: check.expectedVersion,
      strategy,
      message: check.message,
    };
  }

  logger.info(
    {
      currentVersion: check.currentVersion,
      expectedVersion: check.expectedVersion,
      strategy,
    },
    'Schema migration needed',
  );

  switch (strategy) {
    case 'rebuild':
      if (!rebuildFn) {
        return {
          success: false,
          fromVersion: check.currentVersion,
          toVersion: check.expectedVersion,
          strategy,
          message: 'Rebuild function not provided for migration strategy "rebuild"',
        };
      }

      try {
        logger.info('Starting schema migration by rebuilding index');
        await rebuildFn();
        logger.info('Schema migration completed successfully');

        return {
          success: true,
          fromVersion: check.currentVersion,
          toVersion: check.expectedVersion,
          strategy,
          message: `Schema migrated from v${check.currentVersion} to v${check.expectedVersion} by rebuilding index`,
        };
      } catch (error) {
        logger.error({ error }, 'Schema migration failed');
        return {
          success: false,
          fromVersion: check.currentVersion,
          toVersion: check.expectedVersion,
          strategy,
          message: `Migration failed: ${error instanceof Error ? error.message : String(error)}`,
        };
      }

    case 'auto':
      // 自动策略：如果提供了rebuild函数，执行迁移；否则只警告
      if (rebuildFn) {
        return migrate(metadata, 'rebuild', rebuildFn);
      }
    // Fall through to warn

    case 'warn':
    default:
      logger.warn(check.message);
      return {
        success: false,
        fromVersion: check.currentVersion,
        toVersion: check.expectedVersion,
        strategy,
        message: check.message,
      };
  }
}

/**
 * 获取迁移建议
 */
export function getMigrationAdvice(metadata: IndexMetadata): string {
  const check = checkCompatibility(metadata);

  if (!check.needsMigration) {
    return 'Your index is up to date. No migration needed.';
  }

  const fromInfo = getSchemaVersionInfo(check.currentVersion);
  const toInfo = getSchemaVersionInfo(check.expectedVersion);

  const newFeatures = toInfo.features.filter((f) => !fromInfo.features.includes(f));

  return `
Schema Migration Available
━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━

Current: ${fromInfo.name} (v${check.currentVersion})
Latest:  ${toInfo.name} (v${check.expectedVersion})

New Features in v${check.expectedVersion}:
${newFeatures.map((f, i) => `  ${i + 1}. ${f}`).join('\n')}

To upgrade, run:
  nervusdb-mcp rebuild-index <project-path>

Or use the MCP tool:
  db.rebuildIndex({ projectPath: "<path>" })

This will rebuild the knowledge graph with the latest schema.
`.trim();
}

/**
 * 检查是否需要自动迁移
 */
export function shouldAutoMigrate(
  metadata: IndexMetadata,
  autoMigrateEnabled: boolean = false,
): boolean {
  if (!autoMigrateEnabled) return false;

  const check = checkCompatibility(metadata);
  return check.needsMigration && check.canAutoMigrate;
}
