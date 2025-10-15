# NervusDB MCP CLI 使用指南

## 概述

`nervusdb-mcp` 是一个全局命令行工具，提供了强大的代码知识图谱分析能力，专为 AI 编程助手设计。

## 安装

### 全局安装

```bash
npm install -g @nervusdb/mcp
# 或
pnpm add -g @nervusdb/mcp
```

### 本地开发

```bash
git clone https://github.com/luQingU/nervusdb-mcp.git
cd nervusdb-mcp
pnpm install
pnpm build
```

## 命令用法

### 查看版本信息

```bash
nervusdb-mcp --version
```

输出示例：

```
@nervusdb/mcp v0.1.7
Official MCP server for NervusDB - Code knowledge graph with AI integration
```

### 查看帮助信息

```bash
nervusdb-mcp --help
```

输出示例：

```
NervusDB MCP Server - Code Knowledge Graph for AI

Usage:
  nervusdb-mcp              Start the MCP server in stdio mode
  nervusdb-mcp --version    Show version information
  nervusdb-mcp --help       Show this help message

Description:
  The NervusDB MCP server provides AI assistants with powerful code
  understanding capabilities through knowledge graph analysis.

Environment Variables:
  NERVUSDB_ROOT            Custom database root directory (default: ~/.nervusdb)
  MCP_TRANSPORT           Transport mode (stdio|http, default: stdio)

For more information, visit: https://github.com/luQingU/nervusdb-mcp
```

### 启动 MCP 服务器

```bash
nervusdb-mcp
```

这将启动 stdio 模式的 MCP 服务器，用于与 AI 编程助手（如 Claude Desktop、Cursor、Cline 等）集成。

## 环境变量

| 变量名          | 默认值        | 描述                   |
| --------------- | ------------- | ---------------------- |
| `NERVUSDB_ROOT` | `~/.nervusdb` | 数据库根目录           |
| `MCP_TRANSPORT` | `stdio`       | 传输模式 (stdio\|http) |

## 功能特性

### ✅ 版本管理

- 支持 `--version` 和 `-v` 参数
- 显示包名、版本号和描述信息

### ✅ 帮助信息

- 支持 `--help` 和 `-h` 参数
- 详细的使用说明和环境变量说明

### ✅ 自动重建索引

- 当检测到代码变更（Git fingerprint 不匹配）时自动重建索引
- 无需手动干预，确保知识图谱始终保持最新

### ✅ MCP 服务器

- 提供 13 个 MCP 工具，涵盖工作流、项目、代码、数据库四大类别
- 支持代码知识图谱查询、项目结构分析、影响范围评估等功能

## 与 AI 编程助手集成

### Claude Desktop 配置

在 Claude Desktop 的配置文件中添加：

```json
{
  "mcpServers": {
    "nervusdb-mcp": {
      "command": "nervusdb-mcp",
      "args": []
    }
  }
}
```

### Cursor 配置

在 Cursor 的 MCP 设置中添加 nervusdb-mcp 作为服务器。

## 开发模式

对于本地开发，可以直接使用：

```bash
# 启动 stdio 模式服务器
pnpm start:stdio

# 启动 HTTP 模式服务器
pnpm start

# 运行测试
pnpm test:run

# 构建项目
pnpm build
```

## 故障排除

### 权限问题

如果遇到权限问题，确保 bin 文件具有执行权限：

```bash
chmod +x node_modules/@nervusdb/mcp/bin/nervusdb-mcp.js
```

### 索引问题

如果遇到索引相关问题，可以手动清理索引目录：

```bash
rm -rf ~/.nervusdb
```

## 更多信息

- 📖 [完整文档](https://github.com/luQingU/nervusdb-mcp)
- 🐛 [问题反馈](https://github.com/luQingU/nervusdb-mcp/issues)
- 🔄 [更新日志](./CHANGELOG.md)
