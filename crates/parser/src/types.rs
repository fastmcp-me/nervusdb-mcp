use serde::{Deserialize, Serialize};

/// 代码实体的统一枚举类型
#[derive(Debug, Clone, Serialize, Deserialize)]
#[serde(tag = "kind", rename_all = "lowercase")]
pub enum CodeEntity {
    Function(FunctionEntity),
    Class(ClassEntity),
    Interface(InterfaceEntity),
    Variable(VariableEntity),
}

/// 函数实体
#[derive(Debug, Clone, Serialize, Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct FunctionEntity {
    pub name: String,
    pub file_path: String,
    pub range: Range,
    pub signature: String,
    pub parameters: Vec<Parameter>,
    pub return_type: Option<String>,
    pub calls: Vec<String>,
    pub is_exported: bool,
    #[serde(skip_serializing_if = "Option::is_none")]
    pub comments: Option<String>,
    #[serde(skip_serializing_if = "Vec::is_empty", default)]
    pub annotations: Vec<Annotation>,
}

/// 类实体
#[derive(Debug, Clone, Serialize, Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct ClassEntity {
    pub name: String,
    pub file_path: String,
    pub range: Range,
    #[serde(skip_serializing_if = "Option::is_none")]
    pub extends: Option<String>,
    pub implements: Vec<String>,
    pub methods: Vec<FunctionEntity>,
    pub properties: Vec<PropertyEntity>,
    pub is_exported: bool,
    #[serde(skip_serializing_if = "Option::is_none")]
    pub comments: Option<String>,
    #[serde(skip_serializing_if = "Vec::is_empty", default)]
    pub annotations: Vec<Annotation>,
}

/// 接口实体
#[derive(Debug, Clone, Serialize, Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct InterfaceEntity {
    pub name: String,
    pub file_path: String,
    pub range: Range,
    pub extends: Vec<String>,
    pub methods: Vec<MethodSignature>,
    pub is_exported: bool,
    #[serde(skip_serializing_if = "Option::is_none")]
    pub comments: Option<String>,
}

/// 变量实体
#[derive(Debug, Clone, Serialize, Deserialize)]
pub struct VariableEntity {
    pub name: String,
    pub file_path: String,
    pub range: Range,
    pub var_type: Option<String>,
    pub is_exported: bool,
    pub is_const: bool,
}

/// 属性实体
#[derive(Debug, Clone, Serialize, Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct PropertyEntity {
    pub name: String,
    pub range: Range,
    pub prop_type: Option<String>,
    pub is_static: bool,
    pub visibility: Visibility,
}

/// 方法签名
#[derive(Debug, Clone, Serialize, Deserialize)]
pub struct MethodSignature {
    pub name: String,
    pub parameters: Vec<Parameter>,
    pub return_type: Option<String>,
}

/// 函数参数
#[derive(Debug, Clone, Serialize, Deserialize)]
pub struct Parameter {
    pub name: String,
    pub param_type: Option<String>,
    pub is_optional: bool,
}

/// 注解信息（用于 Java/TypeScript 装饰器等）
#[derive(Debug, Clone, Serialize, Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct Annotation {
    pub name: String,
    #[serde(skip_serializing_if = "Option::is_none")]
    pub arguments: Option<String>,
}

/// 源码范围（行号）
#[derive(Debug, Clone, Serialize, Deserialize)]
pub struct Range {
    pub start: usize,
    pub end: usize,
}

/// 可见性修饰符
#[derive(Debug, Clone, Serialize, Deserialize)]
#[serde(rename_all = "lowercase")]
pub enum Visibility {
    Public,
    Private,
    Protected,
}

/// Import 声明
#[derive(Debug, Clone, Serialize, Deserialize)]
pub struct ImportDeclaration {
    pub source: String,
    pub specifiers: Vec<String>,
    pub file_path: String,
    pub is_type_only: bool,
}

/// Export 声明
#[derive(Debug, Clone, Serialize, Deserialize)]
pub struct ExportDeclaration {
    pub specifiers: Vec<String>,
    pub file_path: String,
    pub source: Option<String>,
}

/// 解析错误
#[derive(Debug, Clone, Serialize, Deserialize)]
pub struct ParseError {
    pub message: String,
    pub range: Option<Range>,
}

/// 解析结果（新版本 - 支持多语言）
#[derive(Debug, Clone, Serialize, Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct ParseResult {
    pub file_path: String,
    pub language: String,
    pub entities: Vec<String>, // 提取的代码片段
    pub imports: Vec<ImportDeclaration>,
    pub exports: Vec<ExportDeclaration>,
    pub errors: Vec<ParseError>,
}

/// 旧版解析结果（保留兼容性）
#[derive(Debug, Clone, Serialize, Deserialize)]
pub struct LegacyParseResult {
    pub entities: Vec<CodeEntity>,
    pub imports: Vec<ImportDeclaration>,
    pub exports: Vec<ExportDeclaration>,
    pub errors: Vec<ParseError>,
}
