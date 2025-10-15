use tree_sitter::Node;
use std::collections::HashSet;

use super::{Capture, ParseStrategy, get_node_text, get_lines_text};

/// Python 解析策略（基于 repomix 的实现）
pub struct PythonStrategy;

enum CaptureType {
    Comment,
    Class,
    Function,
    Import,
}

impl PythonStrategy {
    fn get_capture_type(&self, name: &str) -> Vec<CaptureType> {
        let mut types = Vec::new();
        
        if name.contains("comment") {
            types.push(CaptureType::Comment);
        }
        if name.contains("definition.class") {
            types.push(CaptureType::Class);
        }
        if name.contains("definition.function") {
            types.push(CaptureType::Function);
        }
        if name.contains("definition.import") {
            types.push(CaptureType::Import);
        }
        
        types
    }
    
    fn parse_function(
        &self,
        node: Node,
        source_code: &str,
        processed_chunks: &mut HashSet<String>,
    ) -> Option<String> {
        let start_row = node.start_position().row;
        let end_row = node.end_position().row;
        
        // 查找签名结束位置（冒号之前）
        let signature_end = self.find_signature_end(source_code, start_row, end_row);
        
        let lines: Vec<&str> = source_code.lines().collect();
        let signature: String = lines[start_row..=signature_end]
            .iter()
            .map(|l| l.trim())
            .collect::<Vec<_>>()
            .join("\n");
        
        if processed_chunks.contains(&signature) {
            return None;
        }
        
        processed_chunks.insert(signature.clone());
        Some(signature)
    }
    
    fn find_signature_end(&self, source_code: &str, start: usize, end: usize) -> usize {
        let lines: Vec<&str> = source_code.lines().collect();
        
        for i in start..=end.min(lines.len() - 1) {
            if lines[i].trim_end().ends_with(':') {
                return i;
            }
        }
        
        start
    }
}

impl ParseStrategy for PythonStrategy {
    fn parse_capture(
        &self,
        capture: Capture,
        source_code: &str,
        processed_chunks: &mut HashSet<String>,
    ) -> Option<String> {
        let node = capture.node;
        let name = capture.name;
        
        let capture_types = self.get_capture_type(name);
        
        // 函数
        if capture_types.iter().any(|t| matches!(t, CaptureType::Function)) {
            return self.parse_function(node, source_code, processed_chunks);
        }
        
        // 类 - 提取完整定义（包括方法）
        if capture_types.iter().any(|t| matches!(t, CaptureType::Class)) {
            if let Some(parent) = node.parent() {
                let start_row = parent.start_position().row;
                let end_row = parent.end_position().row;
                let full_text = get_lines_text(source_code, start_row, end_row);
                let cleaned = full_text.trim().to_string();
                
                if processed_chunks.contains(&cleaned) {
                    return None;
                }
                
                processed_chunks.insert(cleaned.clone());
                return Some(cleaned);
            }
        }
        
        // 导入（直接提取）
        if capture_types.iter().any(|t| matches!(t, CaptureType::Import)) {
            let text = get_node_text(node, source_code).trim().to_string();
            
            if processed_chunks.contains(&text) {
                return None;
            }
            
            processed_chunks.insert(text.clone());
            return Some(text);
        }
        
        // 注释
        if capture_types.iter().any(|t| matches!(t, CaptureType::Comment)) {
            return Some(get_node_text(node, source_code).trim().to_string());
        }
        
        None
    }
}
