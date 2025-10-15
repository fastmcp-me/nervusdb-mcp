/**
 * Schema Migration Module
 */

export {
  CURRENT_SCHEMA_VERSION,
  SCHEMA_VERSIONS,
  getSchemaVersionInfo,
  checkCompatibility,
  migrate,
  getMigrationAdvice,
  shouldAutoMigrate,
  type SchemaVersionInfo,
  type MigrationStrategy,
  type MigrationResult,
  type CompatibilityCheck,
} from './schemaMigrator.js';
