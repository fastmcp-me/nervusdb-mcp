use tree_sitter::Node;
use std::collections::HashSet;

use super::{Capture, ParseStrategy, get_node_text};

/// CSS 解析策略
pub struct CssStrategy;

enum CaptureType {
    Comment,
    Selector,
    Media,
    Keyframes,
    Import,
}

impl CssStrategy {
    fn get_capture_type(&self, name: &str) -> Vec<CaptureType> {
        let mut types = Vec::new();
        
        if name.contains("comment") {
            types.push(CaptureType::Comment);
        }
        if name.contains("definition.selector") {
            types.push(CaptureType::Selector);
        }
        if name.contains("definition.media") {
            types.push(CaptureType::Media);
        }
        if name.contains("definition.keyframes") {
            types.push(CaptureType::Keyframes);
        }
        if name.contains("definition.import") {
            types.push(CaptureType::Import);
        }
        
        types
    }
}

impl ParseStrategy for CssStrategy {
    fn parse_capture(
        &self,
        capture: Capture,
        source_code: &str,
        processed_chunks: &mut HashSet<String>,
    ) -> Option<String> {
        let node = capture.node;
        let name = capture.name;
        
        let capture_types = self.get_capture_type(name);
        
        // 对于 CSS，我们主要提取选择器和 @ 规则
        // 选择器
        if capture_types.iter().any(|t| matches!(t, CaptureType::Selector)) {
            let text = get_node_text(node, source_code).trim().to_string();
            
            if processed_chunks.contains(&text) {
                return None;
            }
            
            processed_chunks.insert(text.clone());
            return Some(text);
        }
        
        // @ 规则（media, keyframes, import）和注释 - 直接提取
        let text = get_node_text(node, source_code).trim().to_string();
        
        if processed_chunks.contains(&text) {
            return None;
        }
        
        processed_chunks.insert(text.clone());
        Some(text)
    }
}
