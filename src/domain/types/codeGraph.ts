/**
 * 代码知识图谱关系定义
 *
 * 定义了代码级别的实体和关系，用于构建深度代码知识图谱
 */

/**
 * 图谱节点类型
 */
export type GraphNodeType =
  | 'project'
  | 'file'
  | 'function'
  | 'class'
  | 'interface'
  | 'method'
  | 'variable'
  | 'package';

/**
 * 图谱关系类型（谓词）
 */
export type GraphPredicate =
  // 项目级关系
  | 'HAS_ROOT'
  | 'CONTAINS' // project → file, class → method

  // 代码结构关系
  | 'DEFINES' // file → function/class/interface
  | 'EXPORTS' // file → symbol
  | 'IMPORTS' // file → file (module imports)
  | 'IMPORTS_FROM' // file → package

  // 类型关系
  | 'IMPLEMENTS' // class → interface
  | 'EXTENDS' // class → class

  // 调用关系
  | 'CALLS' // function → function
  | 'USES' // function → variable/constant

  // 依赖关系
  | 'DEPENDS_ON'; // file → file (综合依赖)

/**
 * 代码实体节点标识符
 */
export interface CodeNodeId {
  type: GraphNodeType;
  name: string;
  filePath?: string; // 用于区分同名实体
}

/**
 * 构造节点标识符字符串
 */
export function makeNodeId(node: CodeNodeId): string {
  if (node.filePath) {
    return `${node.type}:${node.filePath}#${node.name}`;
  }
  return `${node.type}:${node.name}`;
}

/**
 * 解析节点标识符字符串
 */
export function parseNodeId(nodeId: string): CodeNodeId | null {
  const match = nodeId.match(/^(\w+):(.+?)(?:#(.+))?$/);
  if (!match) return null;

  const [, type, filePathOrName, name] = match;

  if (name) {
    // 格式: type:filePath#name
    return {
      type: type as GraphNodeType,
      name,
      filePath: filePathOrName,
    };
  } else {
    // 格式: type:name
    return {
      type: type as GraphNodeType,
      name: filePathOrName,
    };
  }
}

/**
 * 代码关系（图的边）
 */
export interface CodeRelationship {
  subject: string;
  predicate: GraphPredicate;
  object: string;
  properties?: Record<string, unknown>;
}

/**
 * 代码实体在图中的属性
 */
export interface CodeEntityProperties {
  // 通用属性
  name: string;
  filePath?: string;
  startLine?: number;
  endLine?: number;

  // 类型特定属性
  signature?: string; // 函数/方法签名
  returnType?: string;
  parameters?: string[];
  isExported?: boolean;
  isAsync?: boolean;

  // 元数据
  language?: string;
  comments?: string;

  // 统计信息
  linesOfCode?: number;
  complexity?: number;
}
