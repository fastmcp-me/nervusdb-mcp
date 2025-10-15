use lazy_static::lazy_static;
use std::collections::HashMap;

use crate::language::SupportedLanguage;

lazy_static! {
    /// 文件扩展名到语言的映射 (基于 repomix)
    pub static ref EXT_TO_LANG: HashMap<&'static str, SupportedLanguage> = {
        let mut m = HashMap::new();
        
        // TypeScript
        m.insert("ts", SupportedLanguage::TypeScript);
        m.insert("tsx", SupportedLanguage::TypeScript);
        m.insert("mts", SupportedLanguage::TypeScript);
        m.insert("cts", SupportedLanguage::TypeScript);
        
        // JavaScript
        m.insert("js", SupportedLanguage::JavaScript);
        m.insert("jsx", SupportedLanguage::JavaScript);
        m.insert("mjs", SupportedLanguage::JavaScript);
        m.insert("cjs", SupportedLanguage::JavaScript);
        
        #[cfg(feature = "python")]
        {
            m.insert("py", SupportedLanguage::Python);
            m.insert("pyi", SupportedLanguage::Python);
            m.insert("pyw", SupportedLanguage::Python);
        }
        
        #[cfg(feature = "go")]
        {
            m.insert("go", SupportedLanguage::Go);
        }
        
        #[cfg(feature = "rust-lang")]
        {
            m.insert("rs", SupportedLanguage::Rust);
        }
        
        #[cfg(feature = "java")]
        {
            m.insert("java", SupportedLanguage::Java);
        }
        
        #[cfg(feature = "c-lang")]
        {
            m.insert("c", SupportedLanguage::C);
            m.insert("h", SupportedLanguage::C);
        }
        
        #[cfg(feature = "cpp")]
        {
            m.insert("cpp", SupportedLanguage::Cpp);
            m.insert("cc", SupportedLanguage::Cpp);
            m.insert("cxx", SupportedLanguage::Cpp);
            m.insert("hpp", SupportedLanguage::Cpp);
            m.insert("hxx", SupportedLanguage::Cpp);
        }
        
        #[cfg(feature = "swift")]
        {
            m.insert("swift", SupportedLanguage::Swift);
        }
        
        #[cfg(feature = "solidity")]
        {
            m.insert("sol", SupportedLanguage::Solidity);
        }
        
        #[cfg(feature = "css")]
        {
            m.insert("css", SupportedLanguage::Css);
            m.insert("scss", SupportedLanguage::Css);
            m.insert("sass", SupportedLanguage::Css);
        }
        
        #[cfg(feature = "vue")]
        {
            m.insert("vue", SupportedLanguage::Vue);
        }
        
        m
    };
}

/// 根据文件路径猜测语言
pub fn guess_language(file_path: &str) -> Option<SupportedLanguage> {
    use std::path::Path;
    
    let ext = Path::new(file_path)
        .extension()?
        .to_str()?
        .to_lowercase();
    
    EXT_TO_LANG.get(ext.as_str()).copied()
}

#[cfg(test)]
mod tests {
    use super::*;

    #[test]
    fn test_guess_typescript() {
        assert_eq!(guess_language("file.ts"), Some(SupportedLanguage::TypeScript));
        assert_eq!(guess_language("file.tsx"), Some(SupportedLanguage::TypeScript));
    }

    #[test]
    fn test_guess_javascript() {
        assert_eq!(guess_language("file.js"), Some(SupportedLanguage::JavaScript));
        assert_eq!(guess_language("file.jsx"), Some(SupportedLanguage::JavaScript));
    }

    #[cfg(feature = "python")]
    #[test]
    fn test_guess_python() {
        assert_eq!(guess_language("file.py"), Some(SupportedLanguage::Python));
    }

    #[test]
    fn test_guess_unknown() {
        assert_eq!(guess_language("file.unknown"), None);
    }
}
