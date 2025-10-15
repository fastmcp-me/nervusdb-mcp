use synapse_parser::{LanguageManager, SupportedLanguage};

#[test]
fn test_supported_languages_count() {
    let langs = SupportedLanguage::all();
    
    // 默认 feature 支持 8 种语言: TS, JS, Python, Go, Rust, Java, C, C++
    #[cfg(not(feature = "all-languages"))]
    assert_eq!(langs.len(), 8, "Default features should support 8 languages");
    
    // all-languages feature 支持 15 种语言
    #[cfg(feature = "all-languages")]
    assert_eq!(langs.len(), 15, "All-languages feature should support 15 languages");
}

#[test]
fn test_typescript_parsing() {
    let mut manager = LanguageManager::new();
    
    let code = r#"
        function hello(name: string): string {
            return `Hello, ${name}!`;
        }
        
        class Greeter {
            greet(name: string) {
                return hello(name);
            }
        }
    "#;
    
    let result = manager.parse_file("test.ts", code);
    assert!(result.is_ok(), "TypeScript parsing should succeed");
    
    let parsed = result.unwrap();
    assert_eq!(parsed.language, "TypeScript");
    assert!(parsed.entities.len() > 0, "Should extract entities");
}

#[test]
fn test_javascript_parsing() {
    let mut manager = LanguageManager::new();
    
    let code = r#"
        function add(a, b) {
            return a + b;
        }
        
        const multiply = (a, b) => a * b;
    "#;
    
    let result = manager.parse_file("test.js", code);
    assert!(result.is_ok(), "JavaScript parsing should succeed");
}

#[cfg(feature = "python")]
#[test]
fn test_python_parsing() {
    let mut manager = LanguageManager::new();
    
    let code = r#"
def hello(name):
    return f"Hello, {name}!"

class Greeter:
    def greet(self, name):
        return hello(name)
    "#;
    
    let result = manager.parse_file("test.py", code);
    assert!(result.is_ok(), "Python parsing should succeed");
}

#[cfg(feature = "go")]
#[test]
fn test_go_parsing() {
    let mut manager = LanguageManager::new();
    
    let code = r#"
package main

func Hello(name string) string {
    return "Hello, " + name + "!"
}

type Greeter struct {
    name string
}
    "#;
    
    let result = manager.parse_file("test.go", code);
    assert!(result.is_ok(), "Go parsing should succeed");
}

#[cfg(feature = "rust-lang")]
#[test]
fn test_rust_parsing() {
    let mut manager = LanguageManager::new();
    
    let code = r#"
fn hello(name: &str) -> String {
    format!("Hello, {}!", name)
}

struct Greeter {
    name: String,
}
    "#;
    
    let result = manager.parse_file("test.rs", code);
    assert!(result.is_ok(), "Rust parsing should succeed");
}

#[cfg(feature = "java")]
#[test]
fn test_java_parsing() {
    let mut manager = LanguageManager::new();
    
    let code = r#"
public class Greeter {
    public String hello(String name) {
        return "Hello, " + name + "!";
    }
}
    "#;
    
    let result = manager.parse_file("test.java", code);
    assert!(result.is_ok(), "Java parsing should succeed");
}

#[cfg(feature = "c-lang")]
#[test]
fn test_c_parsing() {
    let mut manager = LanguageManager::new();
    
    let code = r#"
#include <stdio.h>

struct Point {
    int x;
    int y;
};

int add(int a, int b) {
    return a + b;
}
    "#;
    
    let result = manager.parse_file("test.c", code);
    assert!(result.is_ok(), "C parsing should succeed");
}

#[cfg(feature = "cpp")]
#[test]
fn test_cpp_parsing() {
    let mut manager = LanguageManager::new();
    
    let code = r#"
#include <string>

namespace math {
    class Calculator {
    public:
        int add(int a, int b) {
            return a + b;
        }
    };
}
    "#;
    
    let result = manager.parse_file("test.cpp", code);
    if let Err(e) = &result {
        eprintln!("C++ parsing error: {}", e);
    }
    assert!(result.is_ok(), "C++ parsing should succeed");
}

#[cfg(feature = "swift")]
#[test]
fn test_swift_parsing() {
    let mut manager = LanguageManager::new();
    
    let code = r#"
import Foundation

class Greeter {
    func hello(name: String) -> String {
        return "Hello, \(name)!"
    }
}

struct Point {
    var x: Int
    var y: Int
}
    "#;
    
    let result = manager.parse_file("test.swift", code);
    assert!(result.is_ok(), "Swift parsing should succeed");
}

#[cfg(feature = "solidity")]
#[test]
fn test_solidity_parsing() {
    let mut manager = LanguageManager::new();
    
    let code = r#"
pragma solidity ^0.8.0;

contract HelloWorld {
    string public greeting = "Hello, World!";
    
    function setGreeting(string memory _greeting) public {
        greeting = _greeting;
    }
}
    "#;
    
    let result = manager.parse_file("test.sol", code);
    assert!(result.is_ok(), "Solidity parsing should succeed");
}

#[cfg(feature = "css")]
#[test]
fn test_css_parsing() {
    let mut manager = LanguageManager::new();
    
    let code = r#"
.container {
    display: flex;
    justify-content: center;
}

@media (max-width: 768px) {
    .container {
        flex-direction: column;
    }
}
    "#;
    
    let result = manager.parse_file("test.css", code);
    assert!(result.is_ok(), "CSS parsing should succeed");
}

#[cfg(feature = "vue")]
#[test]
fn test_vue_parsing() {
    let mut manager = LanguageManager::new();
    
    let code = r#"
<template>
  <div class="hello">
    <h1>{{ msg }}</h1>
  </div>
</template>

<script>
export default {
  name: 'HelloWorld',
  props: {
    msg: String
  }
}
</script>

<style scoped>
h1 {
  color: #42b983;
}
</style>
    "#;
    
    let result = manager.parse_file("test.vue", code);
    assert!(result.is_ok(), "Vue parsing should succeed");
}

#[test]
fn test_file_extension_detection() {
    let manager = LanguageManager::new();
    
    // TypeScript
    assert_eq!(manager.guess_language("file.ts"), Some(SupportedLanguage::TypeScript));
    assert_eq!(manager.guess_language("file.tsx"), Some(SupportedLanguage::TypeScript));
    
    // JavaScript
    assert_eq!(manager.guess_language("file.js"), Some(SupportedLanguage::JavaScript));
    assert_eq!(manager.guess_language("file.jsx"), Some(SupportedLanguage::JavaScript));
    
    #[cfg(feature = "python")]
    assert_eq!(manager.guess_language("file.py"), Some(SupportedLanguage::Python));
    
    #[cfg(feature = "go")]
    assert_eq!(manager.guess_language("file.go"), Some(SupportedLanguage::Go));
    
    #[cfg(feature = "rust-lang")]
    assert_eq!(manager.guess_language("file.rs"), Some(SupportedLanguage::Rust));
    
    #[cfg(feature = "java")]
    assert_eq!(manager.guess_language("file.java"), Some(SupportedLanguage::Java));
    
    #[cfg(feature = "c-lang")]
    {
        assert_eq!(manager.guess_language("file.c"), Some(SupportedLanguage::C));
        assert_eq!(manager.guess_language("file.h"), Some(SupportedLanguage::C));
    }
    
    #[cfg(feature = "cpp")]
    {
        assert_eq!(manager.guess_language("file.cpp"), Some(SupportedLanguage::Cpp));
        assert_eq!(manager.guess_language("file.hpp"), Some(SupportedLanguage::Cpp));
    }
    
    #[cfg(feature = "swift")]
    assert_eq!(manager.guess_language("file.swift"), Some(SupportedLanguage::Swift));
    
    #[cfg(feature = "solidity")]
    assert_eq!(manager.guess_language("file.sol"), Some(SupportedLanguage::Solidity));
    
    #[cfg(feature = "css")]
    {
        assert_eq!(manager.guess_language("file.css"), Some(SupportedLanguage::Css));
        assert_eq!(manager.guess_language("file.scss"), Some(SupportedLanguage::Css));
    }
    
    #[cfg(feature = "vue")]
    assert_eq!(manager.guess_language("file.vue"), Some(SupportedLanguage::Vue));
    
    // Unknown
    assert_eq!(manager.guess_language("file.unknown"), None);
}
