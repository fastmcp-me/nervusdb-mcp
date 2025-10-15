use std::fmt;

/// 支持的编程语言（15种，对标 repomix）
#[derive(Debug, Clone, Copy, Hash, Eq, PartialEq)]
pub enum SupportedLanguage {
    TypeScript,
    JavaScript,
    #[cfg(feature = "python")]
    Python,
    #[cfg(feature = "go")]
    Go,
    #[cfg(feature = "rust-lang")]
    Rust,
    #[cfg(feature = "java")]
    Java,
    #[cfg(feature = "c-lang")]
    C,
    #[cfg(feature = "cpp")]
    Cpp,
    #[cfg(feature = "csharp")]
    CSharp,
    #[cfg(feature = "ruby")]
    Ruby,
    #[cfg(feature = "php")]
    PHP,
    #[cfg(feature = "swift")]
    Swift,
    #[cfg(feature = "solidity")]
    Solidity,
    #[cfg(feature = "css")]
    Css,
    #[cfg(feature = "vue")]
    Vue,
}

impl fmt::Display for SupportedLanguage {
    fn fmt(&self, f: &mut fmt::Formatter<'_>) -> fmt::Result {
        let name = match self {
            Self::TypeScript => "TypeScript",
            Self::JavaScript => "JavaScript",
            #[cfg(feature = "python")]
            Self::Python => "Python",
            #[cfg(feature = "go")]
            Self::Go => "Go",
            #[cfg(feature = "rust-lang")]
            Self::Rust => "Rust",
            #[cfg(feature = "java")]
            Self::Java => "Java",
            #[cfg(feature = "c-lang")]
            Self::C => "C",
            #[cfg(feature = "cpp")]
            Self::Cpp => "C++",
            #[cfg(feature = "csharp")]
            Self::CSharp => "C#",
            #[cfg(feature = "ruby")]
            Self::Ruby => "Ruby",
            #[cfg(feature = "php")]
            Self::PHP => "PHP",
            #[cfg(feature = "swift")]
            Self::Swift => "Swift",
            #[cfg(feature = "solidity")]
            Self::Solidity => "Solidity",
            #[cfg(feature = "css")]
            Self::Css => "CSS",
            #[cfg(feature = "vue")]
            Self::Vue => "Vue",
        };
        write!(f, "{}", name)
    }
}

impl SupportedLanguage {
    /// 获取所有支持的语言
    pub fn all() -> Vec<Self> {
        let mut langs = vec![
            Self::TypeScript,
            Self::JavaScript,
        ];
        
        #[cfg(feature = "python")]
        langs.push(Self::Python);
        
        #[cfg(feature = "go")]
        langs.push(Self::Go);
        
        #[cfg(feature = "rust-lang")]
        langs.push(Self::Rust);
        
        #[cfg(feature = "java")]
        langs.push(Self::Java);
        
        #[cfg(feature = "c-lang")]
        langs.push(Self::C);
        
        #[cfg(feature = "cpp")]
        langs.push(Self::Cpp);
        
        #[cfg(feature = "csharp")]
        langs.push(Self::CSharp);
        
        #[cfg(feature = "ruby")]
        langs.push(Self::Ruby);
        
        #[cfg(feature = "php")]
        langs.push(Self::PHP);
        
        #[cfg(feature = "swift")]
        langs.push(Self::Swift);
        
        #[cfg(feature = "solidity")]
        langs.push(Self::Solidity);
        
        #[cfg(feature = "css")]
        langs.push(Self::Css);
        
        #[cfg(feature = "vue")]
        langs.push(Self::Vue);
        
        langs
    }
}
