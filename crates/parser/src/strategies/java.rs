use tree_sitter::Node;
use std::collections::HashSet;

use super::{Capture, ParseStrategy, get_node_text};

/// Java 解析策略
pub struct JavaStrategy;

enum CaptureType {
    Comment,
    Package,
    Import,
    Class,
    Interface,
    Enum,
    Method,
}

impl JavaStrategy {
    fn get_capture_type(&self, name: &str) -> Vec<CaptureType> {
        let mut types = Vec::new();
        
        if name.contains("comment") {
            types.push(CaptureType::Comment);
        }
        if name.contains("definition.package") {
            types.push(CaptureType::Package);
        }
        if name.contains("definition.import") {
            types.push(CaptureType::Import);
        }
        if name.contains("definition.class") {
            types.push(CaptureType::Class);
        }
        if name.contains("definition.interface") {
            types.push(CaptureType::Interface);
        }
        if name.contains("definition.enum") {
            types.push(CaptureType::Enum);
        }
        if name.contains("definition.method") {
            types.push(CaptureType::Method);
        }
        
        types
    }
    
    fn parse_method(
        &self,
        node: Node,
        source_code: &str,
        processed_chunks: &mut HashSet<String>,
    ) -> Option<String> {
        // 返回完整的方法内容（包括方法体），以便 TypeScript 侧提取函数调用
        // 修改理由：之前只返回签名，导致 indexingService.extractFunctionCalls 无法提取调用关系
        let text = get_node_text(node, source_code).trim().to_string();

        if processed_chunks.contains(&text) {
            return None;
        }

        processed_chunks.insert(text.clone());
        Some(text)
    }
    
    fn parse_class(
        &self,
        node: Node,
        source_code: &str,
        processed_chunks: &mut HashSet<String>,
    ) -> Option<String> {
        let start_row = node.start_position().row;
        
        // 只提取类声明行
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

impl ParseStrategy for JavaStrategy {
    fn parse_capture(
        &self,
        capture: Capture,
        source_code: &str,
        processed_chunks: &mut HashSet<String>,
    ) -> Option<String> {
        let node = capture.node;
        let name = capture.name;
        
        let capture_types = self.get_capture_type(name);
        
        // 方法
        if capture_types.iter().any(|t| matches!(t, CaptureType::Method)) {
            return self.parse_method(node, source_code, processed_chunks);
        }
        
        // 类
        if capture_types.iter().any(|t| matches!(t, CaptureType::Class)) {
            return self.parse_class(node, source_code, processed_chunks);
        }
        
        // 其他类型（直接提取）
        let text = get_node_text(node, source_code).trim().to_string();
        
        if processed_chunks.contains(&text) {
            return None;
        }
        
        processed_chunks.insert(text.clone());
        Some(text)
    }
}
