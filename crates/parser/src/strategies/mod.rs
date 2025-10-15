use tree_sitter::Node;
use std::collections::HashSet;

mod typescript;
#[cfg(feature = "python")]
mod python;
#[cfg(feature = "go")]
mod go_lang;
#[cfg(feature = "rust-lang")]
mod rust_lang;
#[cfg(feature = "java")]
mod java;
#[cfg(feature = "c-lang")]
mod c_lang;
#[cfg(feature = "cpp")]
mod cpp_lang;
#[cfg(feature = "swift")]
mod swift;
#[cfg(feature = "solidity")]
mod solidity;
#[cfg(feature = "css")]
mod css;
#[cfg(feature = "vue")]
mod vue;

pub use typescript::TypeScriptStrategy;
#[cfg(feature = "python")]
pub use python::PythonStrategy;
#[cfg(feature = "go")]
pub use go_lang::GoStrategy;
#[cfg(feature = "rust-lang")]
pub use rust_lang::RustStrategy;
#[cfg(feature = "java")]
pub use java::JavaStrategy;
#[cfg(feature = "c-lang")]
pub use c_lang::CStrategy;
#[cfg(feature = "cpp")]
pub use cpp_lang::CppStrategy;
#[cfg(feature = "swift")]
pub use swift::SwiftStrategy;
#[cfg(feature = "solidity")]
pub use solidity::SolidityStrategy;
#[cfg(feature = "css")]
pub use css::CssStrategy;
#[cfg(feature = "vue")]
pub use vue::VueStrategy;

use crate::language::SupportedLanguage;

/// 解析捕获的节点
pub struct Capture<'a> {
    pub node: Node<'a>,
    pub name: &'a str,
}

/// 解析策略 trait（继承自 repomix 的设计）
pub trait ParseStrategy: Send + Sync {
    /// 解析捕获的节点，返回提取的代码片段
    fn parse_capture(
        &self,
        capture: Capture,
        source_code: &str,
        processed_chunks: &mut HashSet<String>,
    ) -> Option<String>;

    /// 是否应该跳过此节点（预留接口，未来可能使用）
    #[allow(dead_code)]
    fn should_skip(&self, _node: &Node) -> bool {
        false
    }
}

/// 创建语言对应的策略（工厂模式）
pub fn create_strategy(lang: SupportedLanguage) -> Box<dyn ParseStrategy> {
    match lang {
        SupportedLanguage::TypeScript | SupportedLanguage::JavaScript => {
            Box::new(TypeScriptStrategy)
        }
        #[cfg(feature = "python")]
        SupportedLanguage::Python => Box::new(PythonStrategy),
        #[cfg(feature = "go")]
        SupportedLanguage::Go => Box::new(GoStrategy),
        #[cfg(feature = "rust-lang")]
        SupportedLanguage::Rust => Box::new(RustStrategy),
        #[cfg(feature = "java")]
        SupportedLanguage::Java => Box::new(JavaStrategy),
        #[cfg(feature = "c-lang")]
        SupportedLanguage::C => Box::new(CStrategy),
        #[cfg(feature = "cpp")]
        SupportedLanguage::Cpp => Box::new(CppStrategy),
        #[cfg(feature = "swift")]
        SupportedLanguage::Swift => Box::new(SwiftStrategy),
        #[cfg(feature = "solidity")]
        SupportedLanguage::Solidity => Box::new(SolidityStrategy),
        #[cfg(feature = "css")]
        SupportedLanguage::Css => Box::new(CssStrategy),
        #[cfg(feature = "vue")]
        SupportedLanguage::Vue => Box::new(VueStrategy),
    }
}

/// 辅助函数：获取节点的文本内容
pub fn get_node_text<'a>(node: Node, source_code: &'a str) -> &'a str {
    &source_code[node.byte_range()]
}

/// 辅助函数：获取指定行范围的文本
pub fn get_lines_text(source_code: &str, start_row: usize, end_row: usize) -> String {
    source_code
        .lines()
        .skip(start_row)
        .take(end_row - start_row + 1)
        .collect::<Vec<_>>()
        .join("\n")
}
