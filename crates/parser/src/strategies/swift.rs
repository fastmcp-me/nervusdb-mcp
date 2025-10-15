use tree_sitter::Node;
use std::collections::HashSet;

use super::{Capture, ParseStrategy, get_node_text, get_lines_text};

/// Swift 解析策略
pub struct SwiftStrategy;

enum CaptureType {
    Comment,
    Import,
    Class,
    Struct,
    Protocol,
    Enum,
    Function,
    Extension,
}

impl SwiftStrategy {
    fn get_capture_type(&self, name: &str) -> Vec<CaptureType> {
        let mut types = Vec::new();
        
        if name.contains("comment") {
            types.push(CaptureType::Comment);
        }
        if name.contains("definition.import") {
            types.push(CaptureType::Import);
        }
        if name.contains("definition.class") {
            types.push(CaptureType::Class);
        }
        if name.contains("definition.struct") {
            types.push(CaptureType::Struct);
        }
        if name.contains("definition.protocol") {
            types.push(CaptureType::Protocol);
        }
        if name.contains("definition.enum") {
            types.push(CaptureType::Enum);
        }
        if name.contains("definition.function") {
            types.push(CaptureType::Function);
        }
        if name.contains("definition.extension") {
            types.push(CaptureType::Extension);
        }
        
        types
    }
    
    fn parse_class_struct_protocol(
        &self,
        node: Node,
        source_code: &str,
        processed_chunks: &mut HashSet<String>,
    ) -> Option<String> {
        // node 是名称，需要获取完整声明
        if let Some(parent) = node.parent() {
            let start_row = parent.start_position().row;
            
            // 只提取声明行（不包括方法体）
            let mut lines: Vec<String> = Vec::new();
            lines.push(source_code.lines().nth(start_row)?.to_string());
            
            // 检查下一行是否有继承或协议
            if let Some(next_line) = source_code.lines().nth(start_row + 1) {
                let trimmed = next_line.trim();
                if trimmed.starts_with(':') || trimmed.contains("where") {
                    lines.push(next_line.to_string());
                }
            }
            
            let definition = lines.join("\n");
            let cleaned = definition.split('{').next()?.trim().to_string();
            
            if processed_chunks.contains(&cleaned) {
                return None;
            }
            
            processed_chunks.insert(cleaned.clone());
            return Some(cleaned);
        }
        
        None
    }
    
    fn parse_function(
        &self,
        node: Node,
        source_code: &str,
        processed_chunks: &mut HashSet<String>,
    ) -> Option<String> {
        // 获取函数签名（不包括函数体）
        if let Some(parent) = node.parent() {
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
        
        None
    }
    
    fn find_signature_end(&self, source_code: &str, start: usize, end: usize) -> usize {
        let lines: Vec<&str> = source_code.lines().collect();
        
        for i in start..=end.min(lines.len() - 1) {
            let line = lines[i].trim();
            if line.ends_with('{') {
                return i;
            }
        }
        
        start
    }
}

impl ParseStrategy for SwiftStrategy {
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
        
        // 类、结构体、协议
        if capture_types.iter().any(|t| {
            matches!(t, CaptureType::Class | CaptureType::Struct | CaptureType::Protocol | CaptureType::Enum)
        }) {
            return self.parse_class_struct_protocol(node, source_code, processed_chunks);
        }
        
        // 导入、扩展、注释 - 直接提取
        if capture_types.iter().any(|t| {
            matches!(t, CaptureType::Import | CaptureType::Extension | CaptureType::Comment)
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
