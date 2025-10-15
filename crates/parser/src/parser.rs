use tree_sitter::{Node, Parser};
// tree-sitter 0.23.x 使用 LANGUAGE 常量

use crate::extractor::CodeEntityExtractor;
use crate::types::*;

/// AST 解析器
pub struct ASTParser {
    parser: Parser,
}

impl ASTParser {
    /// 创建新的解析器实例
    pub fn new() -> Result<Self, String> {
        let mut parser = Parser::new();
        let language: tree_sitter::Language = tree_sitter_typescript::LANGUAGE_TYPESCRIPT.into();
        
        parser
            .set_language(&language)
            .map_err(|e| format!("Failed to load TypeScript grammar: {}", e))?;
        
        Ok(Self { parser })
    }

    /// 解析文件内容
    pub fn parse_file(&mut self, file_path: &str, source_code: &str) -> Result<LegacyParseResult, String> {
        let tree = self.parser
            .parse(source_code, None)
            .ok_or("Failed to parse source code")?;

        let root_node = tree.root_node();
        let mut result = LegacyParseResult {
            entities: Vec::new(),
            imports: Vec::new(),
            exports: Vec::new(),
            errors: Vec::new(),
        };

        // 使用 extractor 提取代码实体
        let extractor = CodeEntityExtractor::new(file_path, source_code);
        extractor.extract(root_node, &mut result);

        // 检查语法错误
        if root_node.has_error() {
            self.collect_errors(root_node, source_code, &mut result);
        }
        
        Ok(result)
    }

    /// 收集语法错误
    fn collect_errors(&self, node: Node, source_code: &str, result: &mut LegacyParseResult) {
        if node.is_error() {
            result.errors.push(ParseError {
                message: format!("Syntax error at {:?}", node.range()),
                range: Some(Range {
                    start: node.start_position().row,
                    end: node.end_position().row,
                }),
            });
        }

        let mut cursor = node.walk();
        for child in node.children(&mut cursor) {
            self.collect_errors(child, source_code, result);
        }
    }
}

#[cfg(test)]
mod tests {
    use super::*;

    #[test]
    fn test_parse_simple_function() {
        let mut parser = ASTParser::new().unwrap();
        let code = r#"
export function processData(input: string): number {
    const result = validateInput(input);
    return result.length;
}
        "#;

        let result = parser.parse_file("test.ts", code).unwrap();
        
        assert!(!result.entities.is_empty());
        assert_eq!(result.errors.len(), 0);
    }

    #[test]
    fn test_parse_class() {
        let mut parser = ASTParser::new().unwrap();
        let code = r#"
export class UserService implements IUserService {
    private repository: Repository;

    async getUser(id: string): Promise<User> {
        return await this.repository.findById(id);
    }
}
        "#;

        let result = parser.parse_file("test.ts", code).unwrap();
        
        assert!(!result.entities.is_empty());
    }

    #[test]
    fn test_parse_imports() {
        let mut parser = ASTParser::new().unwrap();
        let code = r#"
import { config } from './config';
import type { User } from '../types';
        "#;

        let result = parser.parse_file("test.ts", code).unwrap();
        
        assert_eq!(result.imports.len(), 2);
    }

    #[test]
    fn test_parse_with_syntax_error() {
        let mut parser = ASTParser::new().unwrap();
        let code = r#"
function broken(
        "#;

        let result = parser.parse_file("test.ts", code).unwrap();
        
        assert!(!result.errors.is_empty());
    }
}
