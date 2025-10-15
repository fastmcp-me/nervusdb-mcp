# 贡献指南

感谢你愿意为 NervusDB MCP 做出贡献。为了保持项目的高标准，请遵循以下流程：

## 基本要求

- 所有改动必须通过 Issue 跟踪，并以 `feature/<issue-id>-<keyword>` 的分支命名。
- 提交信息遵循 Conventional Commits，如 `feat: add project structure ADR (#42)`。
- 任何影响用户体验或接口的改动必须更新相关文档与 ADR。

## 开发流程

1. 从 `main` 创建功能分支：
   ```bash
   git checkout -b feature/42-index-shadow-store
   ```
2. 安装依赖并运行质量检查脚本：
   ```bash
   pnpm install
   pnpm run check
   ```
3. 编写或更新测试，确保覆盖关键路径。
4. 提交前执行 `pnpm run fmt`、`pnpm run lint`、`pnpm run test`。
5. 提交 Pull Request 并等待至少一名维护者 Review。

## 代码风格

- 使用 TypeScript + ESLint + Prettier，风格错误视为 CI 失败。
- 复杂逻辑附近可添加中文注释解释设计意图。

## 文档更新

- 新增或修改特性必须同步更新 `docs/` 下的相关文档。
- 架构决策调整需新增或 supersede ADR。

感谢配合，让我们一起构建可靠的工程工具。
