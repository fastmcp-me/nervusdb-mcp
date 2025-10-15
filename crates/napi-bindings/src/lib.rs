#![deny(clippy::all)]

use napi::bindgen_prelude::*;
use napi_derive::napi;
use synapse_parser::{
    LanguageManager as RustLanguageManager,
    LegacyASTParser as RustParser,
};

/// NAPI AST Parser（旧版 - 保持向后兼容）
#[napi(js_name = "ASTParser")]
pub struct ASTParser {
    inner: RustParser,
}

/// Legacy AST Parser（别名，用于明确标识）
pub type LegacyASTParser = ASTParser;

#[napi]
impl ASTParser {
    /// 创建新的解析器实例
    #[napi(constructor)]
    pub fn new() -> Result<Self> {
        let inner = RustParser::new().map_err(|e| Error::from_reason(e))?;
        Ok(Self { inner })
    }

    /// 解析文件
    /// 
    /// # Arguments
    /// 
    /// * `file_path` - 文件路径
    /// * `source_code` - 源代码内容
    /// 
    /// # Returns
    /// 
    /// 返回 JSON 序列化的 ParseResult
    #[napi]
    pub fn parse_file(&mut self, file_path: String, source_code: String) -> Result<String> {
        let result = self
            .inner
            .parse_file(&file_path, &source_code)
            .map_err(|e| Error::from_reason(e))?;

        // 序列化为 JSON
        serde_json::to_string(&result).map_err(|e| Error::from_reason(e.to_string()))
    }

    /// 获取支持的文件扩展名
    #[napi]
    pub fn get_supported_extensions() -> Vec<String> {
        vec![
            ".ts".to_string(),
            ".tsx".to_string(),
            ".js".to_string(),
            ".jsx".to_string(),
        ]
    }

    /// 批量解析文件（性能优化版本）
    /// 
    /// # Arguments
    /// 
    /// * `files` - 文件列表，每个元素为 [file_path, source_code]
    /// 
    /// # Returns
    /// 
    /// 返回 JSON 数组，每个元素为解析结果
    #[napi]
    pub fn parse_files_batch(&mut self, files: Vec<Vec<String>>) -> Result<Vec<String>> {
        files
            .into_iter()
            .map(|file_info| {
                if file_info.len() != 2 {
                    return Err(Error::from_reason("Each file must have [path, content]"));
                }
                
                let file_path = &file_info[0];
                let source_code = &file_info[1];
                
                let result = self
                    .inner
                    .parse_file(file_path, source_code)
                    .map_err(|e| Error::from_reason(e))?;

                serde_json::to_string(&result).map_err(|e| Error::from_reason(e.to_string()))
            })
            .collect()
    }
}

/// 性能基准测试辅助函数
/// 
/// # Arguments
/// 
/// * `source_code` - 源代码内容
/// * `iterations` - 迭代次数
/// 
/// # Returns
/// 
/// 平均每次解析耗时（秒）
#[napi]
pub fn benchmark_parse(source_code: String, iterations: u32) -> Result<f64> {
    use std::time::Instant;

    let mut parser = RustParser::new().map_err(|e| Error::from_reason(e))?;

    let start = Instant::now();
    for _ in 0..iterations {
        let _ = parser.parse_file("bench.ts", &source_code);
    }
    let duration = start.elapsed();

    Ok(duration.as_secs_f64() / iterations as f64)
}

/// 解析文件并返回统计信息（用于快速检查）
/// 
/// # Arguments
/// 
/// * `source_code` - 源代码内容
/// 
/// # Returns
/// 
/// 返回统计信息：{"functions": 10, "classes": 2, "imports": 5, "errors": 0}
#[napi(object)]
pub struct ParseStats {
    pub functions: u32,
    pub classes: u32,
    pub interfaces: u32,
    pub imports: u32,
    pub exports: u32,
    pub errors: u32,
}

#[napi]
pub fn get_parse_stats(source_code: String) -> Result<ParseStats> {
    let mut parser = RustParser::new().map_err(|e| Error::from_reason(e))?;
    
    let result = parser
        .parse_file("temp.ts", &source_code)
        .map_err(|e| Error::from_reason(e))?;

    let mut stats = ParseStats {
        functions: 0,
        classes: 0,
        interfaces: 0,
        imports: result.imports.len() as u32,
        exports: result.exports.len() as u32,
        errors: result.errors.len() as u32,
    };

    for entity in result.entities {
        match entity {
            synapse_parser::CodeEntity::Function(_) => stats.functions += 1,
            synapse_parser::CodeEntity::Class(_) => stats.classes += 1,
            synapse_parser::CodeEntity::Interface(_) => stats.interfaces += 1,
            _ => {}
        }
    }

    Ok(stats)
}

// ==================== 新版多语言 API ====================

/// 多语言解析器管理器（新版 API）
#[napi]
pub struct LanguageManager {
    inner: RustLanguageManager,
}

#[napi]
impl LanguageManager {
    /// 创建新的语言管理器
    #[napi(constructor)]
    pub fn new() -> Result<Self> {
        Ok(Self {
            inner: RustLanguageManager::new(),
        })
    }

    /// 根据文件路径自动检测语言并解析
    #[napi]
    pub fn parse_file(&mut self, file_path: String, source_code: String) -> Result<String> {
        let result = self
            .inner
            .parse_file(&file_path, &source_code)
            .map_err(|e| Error::from_reason(e))?;

        serde_json::to_string(&result).map_err(|e| Error::from_reason(e.to_string()))
    }

    /// 批量解析文件（性能优化版本）
    /// 
    /// # Arguments
    /// 
    /// * `files` - 文件列表，每个元素为 [file_path, source_code]
    /// 
    /// # Returns
    /// 
    /// 返回 JSON 数组，每个元素为解析结果
    #[napi]
    pub fn parse_files_batch(&mut self, files: Vec<Vec<String>>) -> Result<Vec<String>> {
        let files_tuple: Vec<(String, String)> = files
            .into_iter()
            .filter_map(|file_info| {
                if file_info.len() == 2 {
                    Some((file_info[0].clone(), file_info[1].clone()))
                } else {
                    None
                }
            })
            .collect();

        let results = self
            .inner
            .parse_files_batch(files_tuple)
            .map_err(|e| Error::from_reason(e))?;

        results
            .iter()
            .map(|r| serde_json::to_string(r).map_err(|e| Error::from_reason(e.to_string())))
            .collect()
    }

    /// 根据文件路径猜测语言
    #[napi]
    pub fn guess_language(&self, file_path: String) -> Option<String> {
        self.inner.guess_language(&file_path).map(|lang| format!("{}", lang))
    }

    /// 获取支持的语言列表
    #[napi]
    pub fn get_supported_languages() -> Vec<String> {
        RustLanguageManager::supported_languages()
            .iter()
            .map(|lang| format!("{}", lang))
            .collect()
    }
}
