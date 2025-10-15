use tree_sitter::Node;
use std::collections::HashSet;

use super::{Capture, ParseStrategy, get_node_text, get_lines_text};

/// C 解析策略
pub struct CStrategy;

enum CaptureType {
    Comment,
    Include,
    Function,
    Struct,
    Enum,
    Typedef,
}

impl CStrategy {
    fn get_capture_type(&self, name: &str) -> Vec<CaptureType> {
        let mut types = Vec::new();
        
        if name.contains("comment") {
            types.push(CaptureType::Comment);
        }
        if name.contains("definition.include") {
            types.push(CaptureType::Include);
        }
        if name.contains("definition.function") {
            types.push(CaptureType::Function);
        }
        if name.contains("definition.struct") {
            types.push(CaptureType::Struct);
        }
        if name.contains("definition.enum") {
            types.push(CaptureType::Enum);
        }
        if name.contains("definition.typedef") {
            types.push(CaptureType::Typedef);
        }
        
        types
    }
    
    fn parse_function(
        &self,
        node: Node,
        source_code: &str,
        processed_chunks: &mut HashSet<String>,
    ) -> Option<String> {
        // 获取函数签名（不包括函数体）
        // node 是函数名，需要获取 function_definition 父节点
        let mut current = node;
        while let Some(parent) = current.parent() {
            if parent.kind() == "function_definition" {
                let start_row = parent.start_position().row;
                let end_row = parent.end_position().row;
                
                // 查找函数签名结束位置（{ 之前）
                let signature_end = self.find_signature_end(source_code, start_row, end_row);
                let signature = get_lines_text(source_code, start_row, signature_end);
                let cleaned = signature.trim().to_string();
                
                if processed_chunks.contains(&cleaned) {
                    return None;
                }
                
                processed_chunks.insert(cleaned.clone());
                return Some(cleaned);
            }
            current = parent;
        }
        
        None
    }
    
    fn find_signature_end(&self, source_code: &str, start: usize, end: usize) -> usize {
        let lines: Vec<&str> = source_code.lines().collect();
        
        for i in start..=end.min(lines.len() - 1) {
            let line = lines[i].trim();
            if line.ends_with('{') || line.ends_with(';') {
                return i;
            }
        }
        
        start
    }
    
    fn parse_struct_or_enum(
        &self,
        node: Node,
        source_code: &str,
        processed_chunks: &mut HashSet<String>,
    ) -> Option<String> {
        // node 是结构体/枚举名称，需要获取完整的定义
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
        
        None
    }
}

impl ParseStrategy for CStrategy {
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
        
        // 结构体和枚举
        if capture_types.iter().any(|t| matches!(t, CaptureType::Struct | CaptureType::Enum)) {
            return self.parse_struct_or_enum(node, source_code, processed_chunks);
        }
        
        // 类型定义、包含、注释 - 直接提取
        if capture_types.iter().any(|t| {
            matches!(t, CaptureType::Typedef | CaptureType::Include | CaptureType::Comment)
        }) {
            let text = get_node_text(node, source_code).trim().to_string();
            
            if processed_chunks.contains(&text) {
                return None;
            }
            
            processed_chunks.insert(text.clone());
            return Some(text);
        }
        
        None
    }
}
