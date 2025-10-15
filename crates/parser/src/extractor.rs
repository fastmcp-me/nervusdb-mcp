use tree_sitter::Node;

use crate::types::*;

/// 代码实体提取器
pub struct CodeEntityExtractor<'a> {
    file_path: &'a str,
    source_code: &'a str,
}

impl<'a> CodeEntityExtractor<'a> {
    pub fn new(file_path: &'a str, source_code: &'a str) -> Self {
        Self {
            file_path,
            source_code,
        }
    }

    /// 提取所有代码实体
    pub fn extract(&self, node: Node, result: &mut LegacyParseResult) {
        self.visit_node(node, result, false);
    }

    /// 递归访问节点
    fn visit_node(&self, node: Node, result: &mut LegacyParseResult, is_exported: bool) {
        match node.kind() {
            "export_statement" => {
                // 处理 export 语句
                let mut cursor = node.walk();
                for child in node.children(&mut cursor) {
                    self.visit_node(child, result, true);
                }
            }
            "function_declaration" | "method_definition" | "method_declaration" => {
                if let Some(entity) = self.extract_function(node, is_exported) {
                    result.entities.push(CodeEntity::Function(entity));
                }
            }
            "class_declaration" => {
                if let Some(entity) = self.extract_class(node, is_exported) {
                    result.entities.push(CodeEntity::Class(entity));
                }
            }
            "interface_declaration" => {
                if let Some(entity) = self.extract_interface(node, is_exported) {
                    result.entities.push(CodeEntity::Interface(entity));
                }
            }
            "lexical_declaration" => {
                // const/let 变量声明
                self.extract_variables(node, is_exported, result);
            }
            "import_statement" | "import_declaration" => {
                if let Some(import) = self.extract_import(node) {
                    result.imports.push(import);
                }
            }
            _ => {
                // 递归处理子节点
                let mut cursor = node.walk();
                for child in node.children(&mut cursor) {
                    self.visit_node(child, result, is_exported);
                }
            }
        }
    }

    /// 提取函数
    fn extract_function(&self, node: Node, is_exported: bool) -> Option<FunctionEntity> {
        let name = self.get_function_name(node)?;
        let range = Range {
            start: node.start_position().row + 1,
            end: node.end_position().row + 1,
        };

        let signature = self.get_node_text(node);
        let calls = self.extract_function_calls(node);
        let comments = self.extract_leading_comment(node);
        let annotations = self.extract_annotations(node);

        Some(FunctionEntity {
            name,
            file_path: self.file_path.to_string(),
            range,
            signature,
            parameters: Vec::new(), // TODO: 详细参数提取
            return_type: None,      // TODO: 返回类型提取
            calls,
            is_exported,
            comments,
            annotations,
        })
    }

    /// 提取类
    fn extract_class(&self, node: Node, is_exported: bool) -> Option<ClassEntity> {
        let name = node
            .child_by_field_name("name")
            .map(|n| self.get_node_text(n))?;

        let range = Range {
            start: node.start_position().row + 1,
            end: node.end_position().row + 1,
        };

        // 提取继承和实现
        let extends = self.extract_class_extends(node);
        let implements = self.extract_class_implements(node);

        // 提取方法
        let mut methods = Vec::new();
        if let Some(body) = node.child_by_field_name("body") {
            let mut cursor = body.walk();
            for child in body.children(&mut cursor) {
                // 支持 TypeScript (method_definition) 和 Java (method_declaration)
                if child.kind() == "method_definition" || child.kind() == "method_declaration" {
                    if let Some(method) = self.extract_function(child, false) {
                        methods.push(method);
                    }
                }
            }
        }

        let comments = self.extract_leading_comment(node);
        let annotations = self.extract_annotations(node);

        Some(ClassEntity {
            name,
            file_path: self.file_path.to_string(),
            range,
            extends,
            implements,
            methods,
            properties: Vec::new(), // TODO: 属性提取
            is_exported,
            comments,
            annotations,
        })
    }

    /// 提取接口
    fn extract_interface(&self, node: Node, is_exported: bool) -> Option<InterfaceEntity> {
        let name = node
            .child_by_field_name("name")
            .map(|n| self.get_node_text(n))?;

        let range = Range {
            start: node.start_position().row + 1,
            end: node.end_position().row + 1,
        };

        let extends = self.extract_interface_extends(node);
        let comments = self.extract_leading_comment(node);

        Some(InterfaceEntity {
            name,
            file_path: self.file_path.to_string(),
            range,
            extends,
            methods: Vec::new(), // TODO: 方法签名提取
            is_exported,
            comments,
        })
    }

    /// 提取变量
    fn extract_variables(&self, _node: Node, _is_exported: bool, _result: &mut LegacyParseResult) {
        // TODO: 实现变量提取
    }

    /// 提取 import 声明
    fn extract_import(&self, node: Node) -> Option<ImportDeclaration> {
        let source = node
            .child_by_field_name("source")
            .map(|n| {
                let text = self.get_node_text(n);
                // 移除引号
                text.trim_matches(|c| c == '"' || c == '\'').to_string()
            })?;

        // TODO: 提取 import specifiers
        let specifiers = Vec::new();
        let is_type_only = false; // TODO: 检测 type import

        Some(ImportDeclaration {
            source,
            specifiers,
            file_path: self.file_path.to_string(),
            is_type_only,
        })
    }

    /// 提取函数调用
    fn extract_function_calls(&self, node: Node) -> Vec<String> {
        let mut calls = Vec::new();
        self.collect_calls(node, &mut calls);
        calls
    }

    /// 递归收集函数调用
    fn collect_calls(&self, node: Node, calls: &mut Vec<String>) {
        // TypeScript/JavaScript: call_expression
        if node.kind() == "call_expression" {
            if let Some(function) = node.child_by_field_name("function") {
                let call_name = self.get_node_text(function);
                // 只保留简单的函数名，去掉链式调用
                let simple_name = call_name.split('.').last().unwrap_or(&call_name);
                calls.push(simple_name.to_string());
            }
        }

        // Java: method_invocation
        // Pattern: (method_invocation name: (identifier) @method.name)
        if node.kind() == "method_invocation" {
            if let Some(name) = node.child_by_field_name("name") {
                let call_name = self.get_node_text(name);
                calls.push(call_name);
            }
        }

        let mut cursor = node.walk();
        for child in node.children(&mut cursor) {
            self.collect_calls(child, calls);
        }
    }

    /// 提取类的继承
    fn extract_class_extends(&self, node: Node) -> Option<String> {
        node.child_by_field_name("extends")
            .map(|n| self.get_node_text(n))
    }

    /// 提取类的实现
    fn extract_class_implements(&self, _node: Node) -> Vec<String> {
        // TODO: 实现接口提取
        Vec::new()
    }

    /// 提取接口的继承
    fn extract_interface_extends(&self, _node: Node) -> Vec<String> {
        // TODO: 实现接口继承提取
        Vec::new()
    }

    /// 获取函数名
    fn get_function_name(&self, node: Node) -> Option<String> {
        node.child_by_field_name("name")
            .map(|n| self.get_node_text(n))
    }

    /// 获取节点文本
    fn get_node_text(&self, node: Node) -> String {
        self.source_code[node.byte_range()].to_string()
    }

    /// 提取前置注释
    fn extract_leading_comment(&self, _node: Node) -> Option<String> {
        // TODO: 实现 JSDoc 注释提取
        None
    }

    /// 提取节点的注解（Java annotations / TypeScript decorators）
    fn extract_annotations(&self, node: Node) -> Vec<Annotation> {
        let mut annotations = Vec::new();

        // 检查当前节点的前一个兄弟节点
        let mut prev_sibling = node.prev_sibling();

        // 向前遍历所有注解节点
        while let Some(sibling) = prev_sibling {
            match sibling.kind() {
                // Java: marker_annotation (@Override, @Service)
                "marker_annotation" => {
                    if let Some(name_node) = sibling.child_by_field_name("name") {
                        let name = self.get_node_text(name_node);
                        annotations.push(Annotation {
                            name: name.trim_start_matches('@').to_string(),
                            arguments: None,
                        });
                    }
                }
                // Java: annotation (@RequestMapping(path="/api"))
                "annotation" => {
                    if let Some(name_node) = sibling.child_by_field_name("name") {
                        let name = self.get_node_text(name_node);
                        // 提取参数
                        let arguments = sibling
                            .child_by_field_name("arguments")
                            .map(|args| self.get_node_text(args));

                        annotations.push(Annotation {
                            name: name.trim_start_matches('@').to_string(),
                            arguments,
                        });
                    }
                }
                // TypeScript: decorator
                "decorator" => {
                    let text = self.get_node_text(sibling);
                    annotations.push(Annotation {
                        name: text.trim_start_matches('@').to_string(),
                        arguments: None,
                    });
                }
                // 遇到非注解节点，停止向前查找
                kind if !kind.starts_with("line_comment")
                    && !kind.starts_with("block_comment")
                    && kind != "modifiers" => break,
                _ => {}
            }
            prev_sibling = sibling.prev_sibling();
        }

        // 反转顺序，因为我们是从后向前遍历的
        annotations.reverse();
        annotations
    }
}

#[cfg(test)]
mod tests {
    use super::*;
    use tree_sitter::{Parser, Tree};
    fn parse_code(code: &str) -> Tree {
        let mut parser = Parser::new();
        let language: tree_sitter::Language = tree_sitter_typescript::LANGUAGE_TYPESCRIPT.into();
        parser.set_language(&language).unwrap();
        parser.parse(code, None).unwrap()
    }

    #[test]
    fn test_extract_function() {
        let code = r#"
function hello() {
    console.log("hello");
}
        "#;
        let tree = parse_code(code);
        let root = tree.root_node();
        let extractor = CodeEntityExtractor::new("test.ts", code);
        let mut result = LegacyParseResult {
            entities: Vec::new(),
            imports: Vec::new(),
            exports: Vec::new(),
            errors: Vec::new(),
        };

        extractor.extract(root, &mut result);
        assert_eq!(result.entities.len(), 1);
    }
}
