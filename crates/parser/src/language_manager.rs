use tree_sitter::{Language, Parser, Query, QueryCursor};
use std::collections::{HashMap, HashSet};

use crate::language::SupportedLanguage;
use crate::strategies::{create_strategy, Capture, ParseStrategy};
use crate::queries::get_query;
use crate::ext_to_lang::guess_language;
use crate::types::ParseResult;

/// 语言资源（Parser + Query + Strategy）
struct LanguageResources {
    #[allow(dead_code)]
    language: Language,
    parser: Parser,
    query: Query,
    strategy: Box<dyn ParseStrategy>,
}

/// 多语言管理器（核心）
pub struct LanguageManager {
    resources: HashMap<SupportedLanguage, LanguageResources>,
}

impl LanguageManager {
    /// 创建新的管理器
    pub fn new() -> Self {
        Self {
            resources: HashMap::new(),
        }
    }
    
    /// 延迟加载语言资源
    fn load_language(&mut self, lang: SupportedLanguage) -> Result<&mut LanguageResources, String> {
        if !self.resources.contains_key(&lang) {
            let resources = self.prepare_language(lang)?;
            self.resources.insert(lang, resources);
        }
        
        Ok(self.resources.get_mut(&lang).unwrap())
    }
    
    /// 准备语言资源
    fn prepare_language(&self, lang: SupportedLanguage) -> Result<LanguageResources, String> {
        // 加载 tree-sitter 语言
        let language = load_tree_sitter_language(lang)?;
        
        // 创建 parser
        let mut parser = Parser::new();
        parser
            .set_language(&language)
            .map_err(|e| format!("Failed to set language: {}", e))?;
        
        // 创建 query
        let query_str = get_query(lang);
        let query = Query::new(&language, query_str)
            .map_err(|e| format!("Failed to create query: {}", e))?;
        
        // 创建策略
        let strategy = create_strategy(lang);
        
        Ok(LanguageResources {
            language,
            parser,
            query,
            strategy,
        })
    }
    
    /// 根据文件路径猜测语言
    pub fn guess_language(&self, file_path: &str) -> Option<SupportedLanguage> {
        guess_language(file_path)
    }
    
    /// 解析单个文件
    pub fn parse_file(&mut self, file_path: &str, source_code: &str) -> Result<ParseResult, String> {
        let lang = self.guess_language(file_path)
            .ok_or_else(|| format!("Unsupported file type: {}", file_path))?;
        
        self.parse_with_language(file_path, source_code, lang)
    }
    
    /// 使用指定语言解析
    pub fn parse_with_language(
        &mut self,
        file_path: &str,
        source_code: &str,
        lang: SupportedLanguage,
    ) -> Result<ParseResult, String> {
        let resources = self.load_language(lang)?;
        
        // 解析源代码
        let tree = resources.parser
            .parse(source_code, None)
            .ok_or("Failed to parse source code")?;
        
        let root_node = tree.root_node();
        
        // 使用 query 提取代码实体
        let mut cursor = QueryCursor::new();
        let matches = cursor.matches(&resources.query, root_node, source_code.as_bytes());
        
        let mut processed_chunks = HashSet::new();
        let mut entities = Vec::new();
        
        for match_ in matches {
            for capture in match_.captures {
                let capture_name = resources.query.capture_names()[capture.index as usize];
                
                let capture_data = Capture {
                    node: capture.node,
                    name: capture_name,
                };
                
                if let Some(code) = resources.strategy.parse_capture(
                    capture_data,
                    source_code,
                    &mut processed_chunks,
                ) {
                    entities.push(code);
                }
            }
        }
        
        // 构建结果
        Ok(ParseResult {
            file_path: file_path.to_string(),
            language: format!("{}", lang),
            entities,
            imports: Vec::new(), // TODO: 单独提取
            exports: Vec::new(), // TODO: 单独提取
            errors: Vec::new(),
        })
    }
    
    /// 批量解析文件
    pub fn parse_files_batch(
        &mut self,
        files: Vec<(String, String)>, // (path, content)
    ) -> Result<Vec<ParseResult>, String> {
        let mut results = Vec::new();
        
        // 按语言分组（优化）
        let mut by_lang: HashMap<SupportedLanguage, Vec<(String, String)>> = HashMap::new();
        
        for (path, content) in files {
            if let Some(lang) = self.guess_language(&path) {
                by_lang.entry(lang).or_default().push((path, content));
            }
        }
        
        // 处理每种语言的文件
        for (lang, files) in by_lang {
            // 预加载语言资源
            self.load_language(lang)?;
            
            for (path, content) in files {
                match self.parse_with_language(&path, &content, lang) {
                    Ok(result) => results.push(result),
                    Err(e) => {
                        // 记录错误但继续处理
                        eprintln!("Failed to parse {}: {}", path, e);
                    }
                }
            }
        }
        
        Ok(results)
    }
    
    /// 获取支持的语言列表
    pub fn supported_languages() -> Vec<SupportedLanguage> {
        SupportedLanguage::all()
    }
}

/// 加载 tree-sitter 语言
fn load_tree_sitter_language(lang: SupportedLanguage) -> Result<Language, String> {
    // 统一使用 0.23.x API：所有语言包都提供 LANGUAGE 常量（LanguageFn 类型）
    // LanguageFn 可以转换为 Language
    let language = match lang {
        SupportedLanguage::TypeScript => {
            tree_sitter_typescript::LANGUAGE_TYPESCRIPT.into()
        }
        SupportedLanguage::JavaScript => {
            tree_sitter_typescript::LANGUAGE_TSX.into()
        }
        #[cfg(feature = "python")]
        SupportedLanguage::Python => {
            tree_sitter_python::LANGUAGE.into()
        }
        #[cfg(feature = "go")]
        SupportedLanguage::Go => {
            tree_sitter_go::LANGUAGE.into()
        }
        #[cfg(feature = "rust-lang")]
        SupportedLanguage::Rust => {
            tree_sitter_rust::LANGUAGE.into()
        }
        #[cfg(feature = "java")]
        SupportedLanguage::Java => {
            tree_sitter_java::LANGUAGE.into()
        }
        #[cfg(feature = "c-lang")]
        SupportedLanguage::C => {
            tree_sitter_c::LANGUAGE.into()
        }
        #[cfg(feature = "cpp")]
        SupportedLanguage::Cpp => {
            tree_sitter_cpp::LANGUAGE.into()
        }
        #[cfg(feature = "swift")]
        SupportedLanguage::Swift => {
            tree_sitter_swift::LANGUAGE.into()
        }
        #[cfg(feature = "solidity")]
        SupportedLanguage::Solidity => {
            tree_sitter_solidity::language().into()
        }
        #[cfg(feature = "css")]
        SupportedLanguage::Css => {
            tree_sitter_css::LANGUAGE.into()
        }
        #[cfg(feature = "vue")]
        SupportedLanguage::Vue => {
            tree_sitter_vue::LANGUAGE.into()
        }
    };
    
    Ok(language)
}
