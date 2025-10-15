import { describe, expect, it, vi } from 'vitest';

import { QueryService } from '../../../src/domain/query/queryService.js';
import type { IndexMetadata } from '../../../src/domain/types/indexMetadata.js';

const createMetadata = (): IndexMetadata => ({
  schemaVersion: 1,
  state: 'complete',
  projectPath: '/repo',
  projectHash: 'hash',
  indexedAt: new Date().toISOString(),
  fileCount: 10,
  fingerprint: {
    value: 'abc123',
    commit: 'abc123',
    branch: 'main',
    dirty: false,
  },
  versions: {},
  output: {
    dbFile: '/repo/.synapsedb/hash/graph.synapsedb',
  },
});

describe('QueryService', () => {
  it('normalises facts when querying callers', async () => {
    const metadata = createMetadata();
    const validate = vi.fn().mockResolvedValue(metadata);
    const all = vi.fn().mockResolvedValue([
      {
        subject: 'function:caller',
        predicate: 'CALLS',
        object: 'function:target',
        objectProperties: { occurrences: 2 },
      },
    ]);
    const find = vi.fn().mockReturnValue({ all });
    const close = vi.fn().mockResolvedValue(undefined);

    const openDatabase = vi.fn().mockResolvedValue({
      find,
      close,
    });

    const service = new QueryService({ fingerprint: { validate }, openDatabase });

    const result = await service.findCallers('/repo', 'target');

    expect(validate).toHaveBeenCalledWith('/repo');
    expect(openDatabase).toHaveBeenCalledWith('/repo/.synapsedb/hash/graph.synapsedb', {
      enableLock: false,
      registerReader: false,
      experimental: { cypher: true },
    });
    expect(find).toHaveBeenCalledWith({ predicate: 'CALLS', object: 'function:target' });
    expect(result).toEqual([
      {
        subject: 'function:caller',
        predicate: 'CALLS',
        object: 'function:target',
        properties: { occurrences: 2 },
      },
    ]);
    expect(close).toHaveBeenCalled();
  });

  it('respects query limit when listing facts', async () => {
    const metadata = createMetadata();
    const validate = vi.fn().mockResolvedValue(metadata);
    const facts = Array.from({ length: 5 }, (_, index) => ({
      subject: `file:${index}`,
      predicate: 'CONTAINS',
      object: `function:f${index}`,
    }));
    const all = vi.fn().mockResolvedValue(facts);
    const find = vi.fn().mockReturnValue({ all });
    const close = vi.fn().mockResolvedValue(undefined);
    const openDatabase = vi.fn().mockResolvedValue({ find, close });

    const service = new QueryService({ fingerprint: { validate }, openDatabase });

    const result = await service.findFacts('/repo', { predicate: 'CONTAINS' }, { limit: 2 });

    expect(result).toHaveLength(2);
    expect(result[0].subject).toBe('file:0');
    expect(close).toHaveBeenCalled();
  });

  it('does not duplicate prefixes for file and function helpers', async () => {
    const metadata = createMetadata();
    const validate = vi.fn().mockResolvedValue(metadata);
    const all = vi.fn().mockResolvedValue([]);
    const find = vi.fn().mockReturnValue({ all });
    const close = vi.fn().mockResolvedValue(undefined);
    const openDatabase = vi.fn().mockResolvedValue({ find, close });

    const service = new QueryService({ fingerprint: { validate }, openDatabase });

    await service.findCallers('/repo', 'function:target');
    await service.findFileMembership('/repo', 'file:src/index.ts');

    expect(find).toHaveBeenNthCalledWith(1, { predicate: 'CALLS', object: 'function:target' });
    expect(find).toHaveBeenNthCalledWith(2, {
      predicate: 'CONTAINS',
      object: 'file:src/index.ts',
    });
  });

  it('findDefinitions with empty string should query all definitions without subject filter', async () => {
    const metadata = createMetadata();
    const validate = vi.fn().mockResolvedValue(metadata);
    const all = vi.fn().mockResolvedValue([
      {
        subject: 'file:src/tools/index.ts',
        predicate: 'DEFINES',
        object: 'function:src/tools/index.ts#registerTools',
        objectProperties: {
          name: 'registerTools',
          type: 'function',
          signature:
            'export function registerTools(server: McpServer, options: RegisterToolsOptions): void',
        },
      },
      {
        subject: 'file:src/services/projectService.ts',
        predicate: 'DEFINES',
        object: 'class:src/services/projectService.ts#ProjectService',
        objectProperties: {
          name: 'ProjectService',
          type: 'class',
        },
      },
    ]);
    const find = vi.fn().mockReturnValue({ all });
    const close = vi.fn().mockResolvedValue(undefined);
    const openDatabase = vi.fn().mockResolvedValue({ find, close });

    const service = new QueryService({ fingerprint: { validate }, openDatabase });

    const result = await service.findDefinitions('/repo', '');

    // Should query with only predicate, no subject filter
    expect(find).toHaveBeenCalledWith({ predicate: 'DEFINES' });
    expect(result).toHaveLength(2);
    expect(result[0].name).toBe('registerTools');
    expect(result[0].type).toBe('function');
    expect(result[1].name).toBe('ProjectService');
    expect(result[1].type).toBe('class');
    expect(close).toHaveBeenCalled();
  });

  it('findDefinitions with filePath should filter by file subject', async () => {
    const metadata = createMetadata();
    const validate = vi.fn().mockResolvedValue(metadata);
    const all = vi.fn().mockResolvedValue([
      {
        subject: 'file:src/tools/index.ts',
        predicate: 'DEFINES',
        object: 'function:src/tools/index.ts#registerTools',
        objectProperties: {
          name: 'registerTools',
          type: 'function',
        },
      },
    ]);
    const find = vi.fn().mockReturnValue({ all });
    const close = vi.fn().mockResolvedValue(undefined);
    const openDatabase = vi.fn().mockResolvedValue({ find, close });

    const service = new QueryService({ fingerprint: { validate }, openDatabase });

    const result = await service.findDefinitions('/repo', 'src/tools/index.ts');

    // Should query with both predicate and subject
    expect(find).toHaveBeenCalledWith({
      predicate: 'DEFINES',
      subject: 'file:src/tools/index.ts',
    });
    expect(result).toHaveLength(1);
    expect(result[0].name).toBe('registerTools');
    expect(close).toHaveBeenCalled();
  });
});
