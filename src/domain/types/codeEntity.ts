/**
 * 代码实体类型定义
 *
 * 这些类型与 Rust 端的类型保持一致，通过 JSON 序列化传输
 */

/**
 * 代码实体统一类型
 */
export type CodeEntity = FunctionEntity | ClassEntity | InterfaceEntity | VariableEntity;

/**
 * 函数实体
 */
export interface FunctionEntity {
  kind: 'function';
  name: string;
  filePath: string;
  range: Range;
  signature: string;
  parameters: Parameter[];
  returnType?: string;
  calls: string[];
  isExported: boolean;
  comments?: string;
}

/**
 * 类实体
 */
export interface ClassEntity {
  kind: 'class';
  name: string;
  filePath: string;
  range: Range;
  extends?: string;
  implements: string[];
  methods: FunctionEntity[];
  properties: PropertyEntity[];
  isExported: boolean;
  comments?: string;
}

/**
 * 接口实体
 */
export interface InterfaceEntity {
  kind: 'interface';
  name: string;
  filePath: string;
  range: Range;
  extends: string[];
  methods: MethodSignature[];
  isExported: boolean;
  comments?: string;
}

/**
 * 变量实体
 */
export interface VariableEntity {
  kind: 'variable';
  name: string;
  filePath: string;
  range: Range;
  varType?: string;
  isExported: boolean;
  isConst: boolean;
}

/**
 * 属性实体
 */
export interface PropertyEntity {
  name: string;
  range: Range;
  propType?: string;
  isStatic: boolean;
  visibility: 'public' | 'private' | 'protected';
}

/**
 * 方法签名
 */
export interface MethodSignature {
  name: string;
  parameters: Parameter[];
  returnType?: string;
}

/**
 * 函数参数
 */
export interface Parameter {
  name: string;
  paramType?: string;
  isOptional: boolean;
}

/**
 * 源码范围（行号）
 */
export interface Range {
  start: number;
  end: number;
}

/**
 * Import 声明
 */
export interface ImportDeclaration {
  source: string;
  specifiers: string[];
  filePath: string;
  isTypeOnly: boolean;
}

/**
 * Export 声明
 */
export interface ExportDeclaration {
  specifiers: string[];
  filePath: string;
  source?: string;
}

/**
 * 解析错误
 */
export interface ParseError {
  message: string;
  range?: Range;
}

/**
 * 解析结果
 */
export interface ParseResult {
  entities: CodeEntity[];
  imports: ImportDeclaration[];
  exports: ExportDeclaration[];
  errors: ParseError[];
}

/**
 * 解析统计信息
 */
export interface ParseStats {
  functions: number;
  classes: number;
  interfaces: number;
  imports: number;
  exports: number;
  errors: number;
}
