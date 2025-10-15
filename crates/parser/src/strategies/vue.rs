use tree_sitter::Node;
use std::collections::HashSet;

use super::{Capture, ParseStrategy, get_node_text};

/// Vue 解析策略（处理 .vue 单文件组件）
pub struct VueStrategy;

enum CaptureType {
    Comment,
    Script,
    Style,
    Template,
}

impl VueStrategy {
    fn get_capture_type(&self, name: &str) -> Vec<CaptureType> {
        let mut types = Vec::new();
        
        if name.contains("comment") {
            types.push(CaptureType::Comment);
        }
        if name.contains("definition.script") {
            types.push(CaptureType::Script);
        }
        if name.contains("definition.style") {
            types.push(CaptureType::Style);
        }
        if name.contains("definition.template") {
            types.push(CaptureType::Template);
        }
        
        types
    }
}

impl ParseStrategy for VueStrategy {
    fn parse_capture(
        &self,
        capture: Capture,
        source_code: &str,
        processed_chunks: &mut HashSet<String>,
    ) -> Option<String> {
        let node = capture.node;
        let name = capture.name;
        
        let capture_types = self.get_capture_type(name);
        
        // 对于 Vue 组件，我们提取 <script>, <style>, <template> 标签的内容
        // 这里简化处理，直接提取标签本身
        if capture_types.iter().any(|t| {
            matches!(t, CaptureType::Script | CaptureType::Style | CaptureType::Template)
        }) {
            // 提取标签开始部分（不包括内容，因为内容太长）
            let start_row = node.start_position().row;
            let line = source_code.lines().nth(start_row);
            
            if let Some(line_text) = line {
                let cleaned = line_text.trim().to_string();
                
                if processed_chunks.contains(&cleaned) {
                    return None;
                }
                
                processed_chunks.insert(cleaned.clone());
                return Some(cleaned);
            }
        }
        
        // 注释 - 直接提取
        if capture_types.iter().any(|t| matches!(t, CaptureType::Comment)) {
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
