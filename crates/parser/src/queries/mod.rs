use crate::language::SupportedLanguage;

/// TypeScript/JavaScript query
pub const TYPESCRIPT_QUERY: &str = r#"
(comment) @comment

(interface_declaration
  name: (type_identifier) @definition.interface)

(type_alias_declaration
  name: (type_identifier) @definition.type)

(enum_declaration
  name: (identifier) @definition.enum)

(class_declaration
  name: (type_identifier) @definition.class)

(import_statement) @definition.import

(export_statement) @definition.export

(function_declaration
  name: (identifier) @definition.function)

(method_definition
  name: (property_identifier) @definition.method)

(lexical_declaration
  (variable_declarator
    name: (identifier) @definition.variable))
"#;

/// Python query
#[cfg(feature = "python")]
pub const PYTHON_QUERY: &str = r#"
(comment) @comment

(class_definition
  name: (identifier) @definition.class)

(function_definition
  name: (identifier) @definition.function)

(import_statement) @definition.import
(import_from_statement) @definition.import
"#;

/// Go query
#[cfg(feature = "go")]
pub const GO_QUERY: &str = r#"
(comment) @comment

(package_clause) @definition.package

(import_declaration) @definition.import

(type_declaration) @definition.type

(function_declaration
  name: (identifier) @definition.function)

(method_declaration
  name: (field_identifier) @definition.method)
"#;

/// Rust query
#[cfg(feature = "rust-lang")]
pub const RUST_QUERY: &str = r#"
(line_comment) @comment
(block_comment) @comment

(struct_item
  name: (type_identifier) @definition.struct)

(enum_item
  name: (type_identifier) @definition.enum)

(trait_item
  name: (type_identifier) @definition.trait)

(impl_item) @definition.impl

(function_item
  name: (identifier) @definition.function)

(mod_item
  name: (identifier) @definition.mod)

(use_declaration) @definition.use
"#;

/// Java query (参考 repomix 实现，支持完整的代码关系提取)
/// 修复：@definition.method 必须标记在整个 method_declaration 节点上，而非 name 子节点
/// 否则只会捕获方法名 identifier，无法提取方法体内容
#[cfg(feature = "java")]
pub const JAVA_QUERY: &str = r#"
(line_comment) @comment
(block_comment) @comment

(import_declaration) @definition.import

(package_declaration) @definition.package

(class_declaration
  name: (identifier) @definition.class)

(method_declaration) @definition.method

(method_invocation
  name: (identifier) @reference.call)

(interface_declaration
  name: (identifier) @definition.interface)

(enum_declaration
  name: (identifier) @definition.enum)

(type_list
  (type_identifier) @reference.implementation)

(object_creation_expression
  type: (type_identifier) @reference.class)

(superclass (type_identifier) @reference.class)
"#;

/// C# query
#[cfg(feature = "csharp")]
pub const CSHARP_QUERY: &str = r#"
(namespace_declaration) @definition.namespace

(using_directive) @definition.using

(class_declaration
  name: (identifier) @definition.class)

(interface_declaration
  name: (identifier) @definition.interface)

(method_declaration
  name: (identifier) @definition.method)
"#;

/// Ruby query
#[cfg(feature = "ruby")]
pub const RUBY_QUERY: &str = r#"
(class) @definition.class

(method) @definition.method

(module) @definition.module
"#;

/// PHP query
#[cfg(feature = "php")]
pub const PHP_QUERY: &str = r#"
(namespace_definition) @definition.namespace

(namespace_use_declaration) @definition.use

(class_declaration
  name: (name) @definition.class)

(function_definition
  name: (name) @definition.function)

(method_declaration
  name: (name) @definition.method)
"#;

/// C query
#[cfg(feature = "c-lang")]
pub const C_QUERY: &str = r#"
(comment) @comment

(preproc_include) @definition.include

(function_definition
  declarator: (function_declarator
    declarator: (identifier) @definition.function))

(struct_specifier
  name: (type_identifier) @definition.struct)

(enum_specifier
  name: (type_identifier) @definition.enum)

(type_definition
  declarator: (type_identifier) @definition.typedef)
"#;

/// C++ query
#[cfg(feature = "cpp")]
pub const CPP_QUERY: &str = r#"
(comment) @comment

(preproc_include) @definition.include

(function_definition
  declarator: (function_declarator
    declarator: (identifier) @definition.function))

(function_definition
  declarator: (function_declarator
    declarator: (qualified_identifier
      name: (identifier) @definition.function)))

(class_specifier
  name: (type_identifier) @definition.class)

(struct_specifier
  name: (type_identifier) @definition.struct)

(enum_specifier
  name: (type_identifier) @definition.enum)

(namespace_definition) @definition.namespace

(using_declaration) @definition.using

(template_declaration) @definition.template
"#;

/// Swift query
#[cfg(feature = "swift")]
pub const SWIFT_QUERY: &str = r#"
(comment) @comment

(import_declaration) @definition.import

(class_declaration
  name: (type_identifier) @definition.class)

(struct_declaration
  name: (type_identifier) @definition.struct)

(protocol_declaration
  name: (type_identifier) @definition.protocol)

(enum_declaration
  name: (type_identifier) @definition.enum)

(function_declaration
  name: (simple_identifier) @definition.function)

(extension_declaration) @definition.extension
"#;

/// Solidity query
#[cfg(feature = "solidity")]
pub const SOLIDITY_QUERY: &str = r#"
(comment) @comment

(pragma_directive) @definition.pragma

(import_directive) @definition.import

(contract_declaration
  name: (identifier) @definition.contract)

(interface_declaration
  name: (identifier) @definition.interface)

(library_declaration
  name: (identifier) @definition.library)

(function_definition
  name: (identifier) @definition.function)

(modifier_definition
  name: (identifier) @definition.modifier)

(event_definition
  name: (identifier) @definition.event)

(struct_declaration
  name: (identifier) @definition.struct)

(enum_declaration
  name: (identifier) @definition.enum)
"#;

/// CSS query
#[cfg(feature = "css")]
pub const CSS_QUERY: &str = r#"
(comment) @comment

(rule_set
  (selectors) @definition.selector)

(media_statement) @definition.media

(keyframes_statement
  name: (keyframes_name) @definition.keyframes)

(import_statement) @definition.import
"#;

/// Vue query (基于 HTML 和 JavaScript 混合)
#[cfg(feature = "vue")]
pub const VUE_QUERY: &str = r#"
(comment) @comment

(script_element) @definition.script

(style_element) @definition.style

(template_element) @definition.template
"#;

/// 获取语言对应的 query
pub fn get_query(lang: SupportedLanguage) -> &'static str {
    match lang {
        SupportedLanguage::TypeScript | SupportedLanguage::JavaScript => TYPESCRIPT_QUERY,
        #[cfg(feature = "python")]
        SupportedLanguage::Python => PYTHON_QUERY,
        #[cfg(feature = "go")]
        SupportedLanguage::Go => GO_QUERY,
        #[cfg(feature = "rust-lang")]
        SupportedLanguage::Rust => RUST_QUERY,
        #[cfg(feature = "java")]
        SupportedLanguage::Java => JAVA_QUERY,
        #[cfg(feature = "c-lang")]
        SupportedLanguage::C => C_QUERY,
        #[cfg(feature = "cpp")]
        SupportedLanguage::Cpp => CPP_QUERY,
        #[cfg(feature = "csharp")]
        SupportedLanguage::CSharp => CSHARP_QUERY,
        #[cfg(feature = "ruby")]
        SupportedLanguage::Ruby => RUBY_QUERY,
        #[cfg(feature = "php")]
        SupportedLanguage::PHP => PHP_QUERY,
        #[cfg(feature = "swift")]
        SupportedLanguage::Swift => SWIFT_QUERY,
        #[cfg(feature = "solidity")]
        SupportedLanguage::Solidity => SOLIDITY_QUERY,
        #[cfg(feature = "css")]
        SupportedLanguage::Css => CSS_QUERY,
        #[cfg(feature = "vue")]
        SupportedLanguage::Vue => VUE_QUERY,
        #[allow(unreachable_patterns)]
        _ => TYPESCRIPT_QUERY, // Fallback
    }
}
