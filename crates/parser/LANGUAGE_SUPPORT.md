# Multi-Language Parser Support

## Overview

The Synapse Architect parser now supports **15 programming languages**, matching the language coverage of repomix.

## Supported Languages

| #   | Language   | File Extensions                       | Status      | Feature Flag   |
| --- | ---------- | ------------------------------------- | ----------- | -------------- |
| 1   | TypeScript | `.ts`, `.tsx`, `.mts`, `.cts`         | ✅ Default  | Always enabled |
| 2   | JavaScript | `.js`, `.jsx`, `.mjs`, `.cjs`         | ✅ Default  | Always enabled |
| 3   | Python     | `.py`, `.pyi`, `.pyw`                 | ✅ Default  | `python`       |
| 4   | Go         | `.go`                                 | ✅ Default  | `go`           |
| 5   | Rust       | `.rs`                                 | ✅ Default  | `rust-lang`    |
| 6   | Java       | `.java`                               | ✅ Default  | `java`         |
| 7   | C          | `.c`, `.h`                            | ✅ Default  | `c-lang`       |
| 8   | C++        | `.cpp`, `.cc`, `.cxx`, `.hpp`, `.hxx` | ✅ Default  | `cpp`          |
| 9   | C#         | `.cs`                                 | ⚙️ Optional | `csharp`       |
| 10  | Ruby       | `.rb`                                 | ⚙️ Optional | `ruby`         |
| 11  | PHP        | `.php`                                | ⚙️ Optional | `php`          |
| 12  | Swift      | `.swift`                              | ⚙️ Optional | `swift`        |
| 13  | Solidity   | `.sol`                                | ⚙️ Optional | `solidity`     |
| 14  | CSS        | `.css`, `.scss`, `.sass`              | ⚙️ Optional | `css`          |
| 15  | Vue        | `.vue`                                | ⚙️ Optional | `vue`          |

## Language Features

### What Each Parser Extracts

#### TypeScript/JavaScript

- Functions, methods, classes
- Interfaces, type aliases, enums
- Import/export statements

#### Python

- Functions, classes, methods
- Import statements

#### Go

- Functions, methods
- Types, structs, interfaces
- Package declarations

#### Rust

- Functions, structs, enums, traits
- Impl blocks, modules
- Use declarations

#### Java

- Classes, interfaces, enums
- Methods
- Package and import declarations

#### C

- Functions
- Structs, enums, typedefs
- Preprocessor includes

#### C++

- Functions, classes, namespaces
- Structs, enums
- Templates, using declarations

#### C#

- Classes, interfaces, methods
- Namespaces, using directives

#### Ruby

- Classes, modules, methods

#### PHP

- Classes, functions, methods
- Namespaces, use declarations

#### Swift

- Classes, structs, protocols
- Functions, extensions
- Import declarations

#### Solidity

- Contracts, interfaces, libraries
- Functions, modifiers, events
- Structs, enums

#### CSS

- Selectors, media queries
- Keyframes, imports

#### Vue

- Template, script, style sections

## Usage

### Basic Usage

```rust
use synapse_parser::LanguageManager;

let mut manager = LanguageManager::new();

// Auto-detect language from file extension
let result = manager.parse_file("src/main.rs", source_code)?;

// Or specify language explicitly
let result = manager.parse_with_language(
    "file.txt",
    source_code,
    SupportedLanguage::Rust
)?;

println!("Parsed {} entities", result.entities.len());
```

### Enabling Languages

**Default features** (8 languages):

```toml
[dependencies]
synapse-parser = "0.1.0"
```

**All 15 languages**:

```toml
[dependencies]
synapse-parser = { version = "0.1.0", features = ["all-languages"] }
```

**Custom selection**:

```toml
[dependencies]
synapse-parser = { version = "0.1.0", features = ["python", "go", "swift"] }
```

## Architecture

### Design Patterns

1. **Strategy Pattern**: Each language has its own parsing strategy
2. **Lazy Loading**: Language parsers are loaded only when needed
3. **Query-based Extraction**: Uses tree-sitter queries for declarative parsing
4. **Resource Pooling**: Parsers and queries are cached for performance

### Performance

- **Native Performance**: Rust + tree-sitter native libraries (3-5x faster than WASM)
- **Memory Efficient**: Lazy loading and resource pooling
- **Incremental Parsing**: Supports parsing individual files or batches

## Testing

Run all tests:

```bash
cargo test -p synapse-parser
```

Test specific language:

```bash
cargo test -p synapse-parser test_cpp_parsing
```

Test with all languages enabled:

```bash
cargo test -p synapse-parser --features all-languages
```

## Adding New Languages

To add support for a new language:

1. Add tree-sitter dependency to `Cargo.toml`
2. Add language enum variant in `src/language.rs`
3. Add file extension mapping in `src/ext_to_lang.rs`
4. Create query definition in `src/queries/mod.rs`
5. Create parse strategy in `src/strategies/`
6. Update `src/language_manager.rs` to load the language
7. Add tests in `tests/multi_language_test.rs`

## References

- [ADR-005: Multi-Language Parser Architecture](../../docs/architecture/ADR-005-multi-language-parser-architecture.md)
- [tree-sitter documentation](https://tree-sitter.github.io/)
- [repomix language support](https://github.com/yamadashy/repomix)
