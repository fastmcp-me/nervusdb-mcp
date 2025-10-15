use tree_sitter::Node;
use std::collections::HashSet;

use super::{Capture, ParseStrategy, get_node_text, get_lines_text};

/// TypeScript/JavaScript 解析策略（基于 repomix 的实现）
pub struct TypeScriptStrategy;

enum CaptureType {
    Comment,
    Interface,
    Type,
    Enum,
    Class,
    Import,
    Function,
    Method,
    Property,
}

impl TypeScriptStrategy {
    fn get_capture_type(&self, name: &str) -> Vec<CaptureType> {
        let mut types = Vec::new();
        
        if name.contains("comment") {
            types.push(CaptureType::Comment);
        }
        if name.contains("definition.interface") {
            types.push(CaptureType::Interface);
        }
        if name.contains("definition.type") {
            types.push(CaptureType::Type);
        }
        if name.contains("definition.enum") {
            types.push(CaptureType::Enum);
        }
        if name.contains("definition.class") {
            types.push(CaptureType::Class);
        }
        if name.contains("definition.import") {
            types.push(CaptureType::Import);
        }
        if name.contains("definition.function") {
            types.push(CaptureType::Function);
        }
        if name.contains("definition.method") {
            types.push(CaptureType::Method);
        }
        if name.contains("definition.property") {
            types.push(CaptureType::Property);
        }
        
        types
    }
    
    fn parse_interface_or_type(
        &self,
        node: Node,
        source_code: &str,
        processed_chunks: &mut HashSet<String>,
    ) -> Option<String> {
        // 提取完整的接口或类型定义（直到找到结束的 }）
        let start_row = node.start_position().row;
        let end_row = node.end_position().row;
        
        let full_text = get_lines_text(source_code, start_row, end_row);
        let cleaned = full_text.trim().to_string();
        
        if processed_chunks.contains(&cleaned) {
            return None;
        }
        
        processed_chunks.insert(cleaned.clone());
        Some(cleaned)
    }
    
    fn parse_function(
        &self,
        node: Node,
        source_code: &str,
        processed_chunks: &mut HashSet<String>,
    ) -> Option<String> {
        let start_row = node.start_position().row;
        let end_row = node.end_position().row;
        
        // 查找函数签名的结束位置（不包括函数体）
        let signature_end = self.find_signature_end(source_code, start_row, end_row);
        let signature = get_lines_text(source_code, start_row, signature_end);
        let cleaned = self.clean_function_signature(&signature);
        
        if processed_chunks.contains(&cleaned) {
            return None;
        }
        
        processed_chunks.insert(cleaned.clone());
        Some(cleaned)
    }
    
    fn find_signature_end(&self, source_code: &str, start: usize, end: usize) -> usize {
        let lines: Vec<&str> = source_code.lines().collect();
        
        for i in start..=end.min(lines.len() - 1) {
            let line = lines[i].trim();
            if line.contains(')') && (line.ends_with('{') || line.ends_with("=>") || line.ends_with(';')) {
                return i;
            }
        }
        
        start
    }
    
    fn clean_function_signature(&self, signature: &str) -> String {
        let mut result = signature.to_string();
        
        // 移除函数体的开始 { 或 =>
        if let Some(pos) = result.rfind('{') {
            result = result[..pos].trim().to_string();
        } else if let Some(pos) = result.rfind("=>") {
            result = result[..pos].trim().to_string();
        }
        
        result
    }
    
    fn parse_class(
        &self,
        node: Node,
        source_code: &str,
        processed_chunks: &mut HashSet<String>,
    ) -> Option<String> {
        let start_row = node.start_position().row;
        
        // 只提取类声明行（不包括方法）
        let mut lines: Vec<String> = Vec::new();
        lines.push(source_code.lines().nth(start_row)?.to_string());
        
        // 检查下一行是否有 extends 或 implements
        if let Some(next_line) = source_code.lines().nth(start_row + 1) {
            let trimmed = next_line.trim();
            if trimmed.starts_with("extends") || trimmed.starts_with("implements") {
                lines.push(next_line.to_string());
            }
        }
        
        let definition = lines.join("\n");
        let cleaned = definition.split('{').next()?.trim().to_string();
        
        if processed_chunks.contains(&cleaned) {
            return None;
        }
        
        processed_chunks.insert(cleaned.clone());
        Some(cleaned)
    }
}

impl ParseStrategy for TypeScriptStrategy {
    fn parse_capture(
        &self,
        capture: Capture,
        source_code: &str,
        processed_chunks: &mut HashSet<String>,
    ) -> Option<String> {
        let node = capture.node;
        let name = capture.name;
        
        let capture_types = self.get_capture_type(name);
        
        // 函数和方法
        if capture_types.iter().any(|t| matches!(t, CaptureType::Function | CaptureType::Method)) {
            return self.parse_function(node, source_code, processed_chunks);
        }
        
        // 类
        if capture_types.iter().any(|t| matches!(t, CaptureType::Class)) {
            return self.parse_class(node, source_code, processed_chunks);
        }
        
        // 接口、类型、枚举 - 提取父节点（完整定义）
        if capture_types.iter().any(|t| {
            matches!(t, CaptureType::Interface | CaptureType::Type | CaptureType::Enum)
        }) {
            // node 是名字节点，需要提取父节点（完整声明）
            if let Some(parent) = node.parent() {
                return self.parse_interface_or_type(parent, source_code, processed_chunks);
            }
            return None;
        }
        
        // 导入（直接提取节点文本）
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
