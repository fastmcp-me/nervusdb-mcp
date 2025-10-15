import path from 'node:path';

import { NervusDB } from '@nervusdb/core';

import type { IndexMetadata } from '../types/indexMetadata.js';

interface FingerprintValidator {
  validate(projectPath: string): Promise<IndexMetadata>;
}

export interface GraphFact {
  subject: string;
  predicate: string;
  object: string;
  properties?: Record<string, unknown>;
}

/**
 * 代码实体定义
 */
export interface CodeEntityInfo {
  nodeId: string;
  name: string;
  type: string;
  filePath: string;
  signature?: string;
  language?: string;
  startLine?: number;
  endLine?: number;
}

/**
 * 调用层次节点
 */
export interface CallHierarchyNode {
  entity: CodeEntityInfo;
  callers: CallHierarchyNode[];
  callees: CallHierarchyNode[];
  depth: number;
}

/**
 * 依赖树节点
 */
export interface DependencyNode {
  filePath: string;
  dependencies: DependencyNode[];
  depth: number;
}

/**
 * 影响范围分析结果
 */
export interface ImpactAnalysis {
  targetEntity: string;
  directCallers: CodeEntityInfo[];
  indirectCallers: CodeEntityInfo[];
  affectedFiles: string[];
  depth: number;
}

interface FactFilter {
  subject?: string;
  predicate?: string;
  object?: string;
}

interface QueryOptions {
  limit?: number;
  depth?: number; // 用于递归查询（如依赖树、调用层次）
}

interface QueryDependencies {
  fingerprint: FingerprintValidator;
  openDatabase?: typeof NervusDB.open;
}

const DEFAULT_LIMIT = 100;

export class QueryService {
  private readonly fingerprint: FingerprintValidator;
  private readonly openDatabase: typeof NervusDB.open;

  constructor(deps: QueryDependencies) {
    if (!deps?.fingerprint) {
      throw new Error('QueryService requires a fingerprint validator');
    }

    this.fingerprint = deps.fingerprint;
    this.openDatabase = deps.openDatabase ?? NervusDB.open.bind(NervusDB);
  }

  async findFacts(
    projectPath: string,
    filter: FactFilter,
    options: QueryOptions = {},
  ): Promise<GraphFact[]> {
    const limit = options.limit ?? DEFAULT_LIMIT;
    const meta = await this.fingerprint.validate(projectPath);
    const dbPath = path.resolve(meta.output.dbFile);

    const db = await this.openDatabase(dbPath, {
      enableLock: false,
      registerReader: false,
      experimental: { cypher: true },
    });
    try {
      const result = await db.find(filter).all();
      return normaliseFacts(result).slice(0, limit);
    } finally {
      await db.close();
    }
  }

  /**
   * 查找函数的所有调用者
   * @param projectPath 项目路径
   * @param functionName 函数名称或节点ID
   * @param options 查询选项
   */
  async findCallers(
    projectPath: string,
    functionName: string,
    options?: QueryOptions,
  ): Promise<GraphFact[]> {
    const target = functionName.startsWith('function:') ? functionName : `function:${functionName}`;
    return this.findFacts(projectPath, { predicate: 'CALLS', object: target }, options);
  }

  /**
   * 查找函数调用的所有函数（被调用者）
   * @param projectPath 项目路径
   * @param functionName 函数名称或节点ID
   * @param options 查询选项
   */
  async findCallees(
    projectPath: string,
    functionName: string,
    options?: QueryOptions,
  ): Promise<GraphFact[]> {
    const target = functionName.startsWith('function:') ? functionName : `function:${functionName}`;
    return this.findFacts(projectPath, { predicate: 'CALLS', subject: target }, options);
  }

  /**
   * 查找接口的所有实现类
   * @param projectPath 项目路径
   * @param interfaceName 接口名称或节点ID
   * @param options 查询选项
   */
  async findImplementations(
    projectPath: string,
    interfaceName: string,
    options?: QueryOptions,
  ): Promise<GraphFact[]> {
    const target = interfaceName.startsWith('interface:')
      ? interfaceName
      : `interface:${interfaceName}`;
    return this.findFacts(projectPath, { predicate: 'IMPLEMENTS', object: target }, options);
  }

  /**
   * 查找类的继承关系（子类）
   * @param projectPath 项目路径
   * @param className 类名称或节点ID
   * @param options 查询选项
   */
  async findSubclasses(
    projectPath: string,
    className: string,
    options?: QueryOptions,
  ): Promise<GraphFact[]> {
    const target = className.startsWith('class:') ? className : `class:${className}`;
    return this.findFacts(projectPath, { predicate: 'EXTENDS', object: target }, options);
  }

  /**
   * 查找类的父类
   * @param projectPath 项目路径
   * @param className 类名称或节点ID
   * @param options 查询选项
   */
  async findSuperclass(
    projectPath: string,
    className: string,
    options?: QueryOptions,
  ): Promise<GraphFact[]> {
    const target = className.startsWith('class:') ? className : `class:${className}`;
    return this.findFacts(projectPath, { predicate: 'EXTENDS', subject: target }, options);
  }

  /**
   * 查找文件的所有导入
   * @param projectPath 项目路径
   * @param filePath 文件路径
   * @param options 查询选项
   */
  async findImports(
    projectPath: string,
    filePath: string,
    options?: QueryOptions,
  ): Promise<GraphFact[]> {
    const target = filePath.startsWith('file:') ? filePath : `file:${filePath}`;
    return this.findFacts(projectPath, { predicate: 'IMPORTS', subject: target }, options);
  }

  /**
   * 查找导入了指定文件的所有文件
   * @param projectPath 项目路径
   * @param filePath 文件路径
   * @param options 查询选项
   */
  async findImporters(
    projectPath: string,
    filePath: string,
    options?: QueryOptions,
  ): Promise<GraphFact[]> {
    const target = filePath.startsWith('file:') ? filePath : `file:${filePath}`;
    return this.findFacts(projectPath, { predicate: 'IMPORTS', object: target }, options);
  }

  /**
   * 查找文件定义的所有实体（函数、类、接口等）
   * @param projectPath 项目路径
   * @param filePath 文件路径
   * @param options 查询选项
   */
  async findDefinitions(
    projectPath: string,
    filePath: string,
    options?: QueryOptions,
  ): Promise<CodeEntityInfo[]> {
    // Build query filter - only add subject filter if filePath is provided
    const filter: FactFilter = { predicate: 'DEFINES' };

    // Only add subject filter when filePath is not empty
    if (filePath && filePath.trim() !== '') {
      const target = filePath.startsWith('file:') ? filePath : `file:${filePath}`;
      filter.subject = target;
    }

    const facts = await this.findFacts(projectPath, filter, options);

    return facts.map((fact) => this.factToEntityInfo(fact));
  }

  /**
   * 查找符号的定义位置
   * @param projectPath 项目路径
   * @param symbolName 符号名称
   */
  async findSymbolDefinition(
    projectPath: string,
    symbolName: string,
  ): Promise<CodeEntityInfo | null> {
    const meta = await this.fingerprint.validate(projectPath);
    const dbPath = path.resolve(meta.output.dbFile);
    const db = await this.openDatabase(dbPath, {
      enableLock: false,
      registerReader: false,
      experimental: { cypher: true },
    });

    try {
      const result = await db.find({ predicate: 'DEFINES' }).all();
      const facts = normaliseFacts(result);

      // 查找匹配的实体
      for (const fact of facts) {
        const props = fact.properties;
        if (props && props.name === symbolName) {
          return this.factToEntityInfo(fact);
        }
      }

      return null;
    } finally {
      await db.close();
    }
  }

  /**
   * 递归查找文件依赖树
   * @param projectPath 项目路径
   * @param filePath 文件路径
   * @param maxDepth 最大递归深度（默认3）
   */
  async findDependencies(
    projectPath: string,
    filePath: string,
    maxDepth: number = 3,
  ): Promise<DependencyNode> {
    const visited = new Set<string>();
    const target = filePath.startsWith('file:') ? filePath : `file:${filePath}`;

    const buildTree = async (nodeId: string, depth: number): Promise<DependencyNode> => {
      if (depth >= maxDepth || visited.has(nodeId)) {
        return { filePath: nodeId, dependencies: [], depth };
      }

      visited.add(nodeId);
      const imports = await this.findFacts(
        projectPath,
        { predicate: 'IMPORTS', subject: nodeId },
        { limit: 50 },
      );

      const dependencies = await Promise.all(
        imports
          .filter((fact) => !visited.has(fact.object))
          .map((fact) => buildTree(fact.object, depth + 1)),
      );

      return { filePath: nodeId, dependencies, depth };
    };

    return buildTree(target, 0);
  }

  /**
   * 分析符号变更的影响范围
   * @param projectPath 项目路径
   * @param symbolName 符号名称（函数、类等）
   * @param maxDepth 最大递归深度（默认3）
   */
  async analyzeImpact(
    projectPath: string,
    symbolName: string,
    maxDepth: number = 3,
  ): Promise<ImpactAnalysis> {
    const target = symbolName.includes(':') ? symbolName : `function:${symbolName}`;

    // 查找直接调用者
    const directCallers = await this.findCallers(projectPath, target, { limit: 100 });

    // 递归查找间接调用者
    const visited = new Set<string>([target]);
    const indirectCallers: GraphFact[] = [];

    const findIndirect = async (entityId: string, depth: number) => {
      if (depth >= maxDepth) return;

      const callers = await this.findCallers(projectPath, entityId, { limit: 50 });
      for (const caller of callers) {
        if (!visited.has(caller.subject)) {
          visited.add(caller.subject);
          indirectCallers.push(caller);
          await findIndirect(caller.subject, depth + 1);
        }
      }
    };

    for (const caller of directCallers) {
      await findIndirect(caller.subject, 1);
    }

    // 提取受影响的文件
    const affectedFiles = new Set<string>();
    for (const caller of [...directCallers, ...indirectCallers]) {
      const filePath = this.extractFilePath(caller.subject);
      if (filePath) affectedFiles.add(filePath);
    }

    return {
      targetEntity: target,
      directCallers: directCallers.map((f) => this.factToEntityInfo(f)),
      indirectCallers: indirectCallers.map((f) => this.factToEntityInfo(f)),
      affectedFiles: Array.from(affectedFiles),
      depth: maxDepth,
    };
  }

  /**
   * 获取调用层次结构（调用者和被调用者）
   * @param projectPath 项目路径
   * @param functionName 函数名称
   * @param maxDepth 最大深度（默认2）
   */
  async getCallHierarchy(
    projectPath: string,
    functionName: string,
    maxDepth: number = 2,
  ): Promise<CallHierarchyNode> {
    const target = functionName.startsWith('function:') ? functionName : `function:${functionName}`;
    const visited = new Set<string>();

    const buildHierarchy = async (
      entityId: string,
      depth: number,
      direction: 'callers' | 'callees',
    ): Promise<CallHierarchyNode> => {
      if (depth >= maxDepth || visited.has(`${entityId}-${direction}`)) {
        const info = await this.getEntityInfo(projectPath, entityId);
        return { entity: info, callers: [], callees: [], depth };
      }

      visited.add(`${entityId}-${direction}`);
      const info = await this.getEntityInfo(projectPath, entityId);

      let callers: CallHierarchyNode[] = [];
      let callees: CallHierarchyNode[] = [];

      if (direction === 'callers' || depth === 0) {
        const callerFacts = await this.findCallers(projectPath, entityId, { limit: 20 });
        callers = await Promise.all(
          callerFacts.slice(0, 10).map((f) => buildHierarchy(f.subject, depth + 1, 'callers')),
        );
      }

      if (direction === 'callees' || depth === 0) {
        const calleeFacts = await this.findCallees(projectPath, entityId, { limit: 20 });
        callees = await Promise.all(
          calleeFacts.slice(0, 10).map((f) => buildHierarchy(f.object, depth + 1, 'callees')),
        );
      }

      return { entity: info, callers, callees, depth };
    };

    return buildHierarchy(target, 0, 'callers');
  }

  /**
   * 将GraphFact转换为CodeEntityInfo
   */
  private factToEntityInfo(fact: GraphFact): CodeEntityInfo {
    const props = fact.properties || {};
    const nodeId = fact.predicate === 'DEFINES' ? fact.object : fact.subject;

    return {
      nodeId,
      name: (props.name as string) || this.extractName(nodeId),
      type: (props.type as string) || this.extractType(nodeId),
      filePath: this.extractFilePath(nodeId) || '',
      signature: props.signature as string | undefined,
      language: props.language as string | undefined,
      startLine: props.startLine as number | undefined,
      endLine: props.endLine as number | undefined,
    };
  }

  /**
   * 获取实体的详细信息
   */
  private async getEntityInfo(projectPath: string, nodeId: string): Promise<CodeEntityInfo> {
    // 尝试从DEFINES关系中查找实体信息
    const facts = await this.findFacts(projectPath, { object: nodeId }, { limit: 1 });
    if (facts.length > 0) {
      return this.factToEntityInfo(facts[0]);
    }

    // 如果找不到，返回基本信息
    return {
      nodeId,
      name: this.extractName(nodeId),
      type: this.extractType(nodeId),
      filePath: this.extractFilePath(nodeId) || '',
    };
  }

  /**
   * 从节点ID提取名称
   */
  private extractName(nodeId: string): string {
    // 格式: type:filePath#name 或 type:name
    const match = nodeId.match(/#([^#]+)$/);
    if (match) return match[1];

    const parts = nodeId.split(':');
    return parts.length > 1 ? parts[parts.length - 1] : nodeId;
  }

  /**
   * 从节点ID提取类型
   */
  private extractType(nodeId: string): string {
    const match = nodeId.match(/^(\w+):/);
    return match ? match[1] : 'unknown';
  }

  /**
   * 从节点ID提取文件路径
   */
  private extractFilePath(nodeId: string): string | null {
    // 格式: type:filePath#name
    const match = nodeId.match(/^[^:]+:(.+?)#/);
    if (match) return match[1];

    // 格式: file:path
    if (nodeId.startsWith('file:')) {
      return nodeId.substring(5);
    }

    return null;
  }

  async findFileMembership(
    projectPath: string,
    filePath: string,
    options?: QueryOptions,
  ): Promise<GraphFact[]> {
    const target = filePath.startsWith('file:') ? filePath : `file:${filePath}`;
    return this.findFacts(projectPath, { object: target, predicate: 'CONTAINS' }, options);
  }
}

type RawFact = {
  subject: unknown;
  predicate: unknown;
  object: unknown;
  objectProperties?: unknown;
};

function normaliseFacts(facts: RawFact[]): GraphFact[] {
  return facts.map((fact) => ({
    subject: String(fact.subject),
    predicate: String(fact.predicate),
    object: String(fact.object),
    properties: normaliseProperties(fact.objectProperties),
  }));
}

function normaliseProperties(properties: unknown): Record<string, unknown> | undefined {
  if (!properties || typeof properties !== 'object') {
    return undefined;
  }
  return { ...properties } as Record<string, unknown>;
}
