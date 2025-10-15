mod types;
mod language;
mod ext_to_lang;
mod strategies;
mod queries;
mod language_manager;

// 旧版实现（保留）
mod parser;
mod extractor;

pub use types::*;
pub use language::SupportedLanguage;
pub use language_manager::LanguageManager;

// 旧版 API（保留兼容性）
pub use parser::ASTParser as LegacyASTParser;

#[cfg(test)]
mod tests {
    use super::*;

    #[test]
    fn test_language_manager_creation() {
        let _manager = LanguageManager::new();
    }
    
    #[test]
    fn test_guess_language() {
        let manager = LanguageManager::new();
        assert_eq!(manager.guess_language("test.ts"), Some(SupportedLanguage::TypeScript));
        assert_eq!(manager.guess_language("test.js"), Some(SupportedLanguage::JavaScript));
        
        #[cfg(feature = "python")]
        assert_eq!(manager.guess_language("test.py"), Some(SupportedLanguage::Python));
    }
    
    #[test]
    fn test_supported_languages() {
        let langs = LanguageManager::supported_languages();
        assert!(langs.len() >= 2); // 至少 TS/JS
    }
}
