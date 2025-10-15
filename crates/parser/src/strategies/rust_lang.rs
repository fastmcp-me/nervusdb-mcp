use tree_sitter::Node;
use std::collections::HashSet;

use super::{Capture, ParseStrategy, get_node_text, get_lines_text};

/// Rust 解析策略
pub struct RustStrategy;

enum CaptureType {
    Comment,
    Struct,
    Enum,
    Trait,
    Impl,
    Function,
    Mod,
    Use,
}

impl RustStrategy {
    fn get_capture_type(&self, name: &str) -> Vec<CaptureType> {
        let mut types = Vec::new();
        
        if name.contains("comment") {
            types.push(CaptureType::Comment);
        }
        if name.contains("definition.struct") {
            types.push(CaptureType::Struct);
        }
        if name.contains("definition.enum") {
            types.push(CaptureType::Enum);
        }
        if name.contains("definition.trait") {
            types.push(CaptureType::Trait);
        }
        if name.contains("definition.impl") {
            types.push(CaptureType::Impl);
        }
        if name.contains("definition.function") {
            types.push(CaptureType::Function);
        }
        if name.contains("definition.mod") {
            types.push(CaptureType::Mod);
        }
        if name.contains("definition.use") {
            types.push(CaptureType::Use);
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
        
        // 查找签名结束位置（{ 之前）
        let signature_end = self.find_brace_start(source_code, start_row, end_row);
        let signature = get_lines_text(source_code, start_row, signature_end);
        
        // 移除 { 及之后的内容
        let cleaned = signature.split('{').next()?.trim().to_string();
        
        if processed_chunks.contains(&cleaned) {
            return None;
        }
        
        processed_chunks.insert(cleaned.clone());
        Some(cleaned)
    }
    
    fn find_brace_start(&self, source_code: &str, start: usize, end: usize) -> usize {
        let lines: Vec<&str> = source_code.lines().collect();
        
        for i in start..=end.min(lines.len() - 1) {
            if lines[i].contains('{') {
                return i;
            }
        }
        
        start
    }
}

impl ParseStrategy for RustStrategy {
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
        
        // Struct, Enum, Trait, Impl - 提取完整定义
        if capture_types.iter().any(|t| {
            matches!(t, CaptureType::Struct | CaptureType::Enum | CaptureType::Trait | CaptureType::Impl)
        }) {
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
        
        // Mod, Use - 直接提取
        let text = get_node_text(node, source_code).trim().to_string();
        
        if processed_chunks.contains(&text) {
            return None;
        }
        
        processed_chunks.insert(text.clone());
        Some(text)
    }
}
