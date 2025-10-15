# nervusdb-mcp 安装指南

## 快速安装

### 1. 生成 GitHub Token

访问 https://github.com/settings/tokens 生成 token，需勾选：

- ✅ `read:packages`
- ✅ `repo`（如果仓库私有）

### 2. 配置并登录

```bash
# 配置 registry
echo "@nervusdb:registry=https://npm.pkg.github.com" > .npmrc

# 登录（首次安装）
npm login --scope=@nervusdb --registry=https://npm.pkg.github.com
# Username: 你的GitHub用户名
# Password: 粘贴刚生成的 token (ghp_xxx...)
# Email: 你的GitHub邮箱
```

### 3. 安装

```bash
# 全局安装
npm install -g @nervusdb/mcp@latest

# 验证
nervusdb-mcp --version
```

## 访问权限

由于包在 GitHub Packages 上，你需要：

1. 有 GitHub 账号
2. 生成 Personal Access Token
3. 如果包是私有的，需加入 nervusdb 组织

## 故障排查

### 401 Unauthorized

- 重新生成 token 并登录
- 确认 token 权限包含 `read:packages`

### 404 Not Found

- 确认版本号正确：`@nervusdb/mcp@latest`
- 确认已登录：`npm whoami --registry=https://npm.pkg.github.com`

### ETARGET No matching version

- 使用 `@latest` 标签
- 检查可用版本：`npm view @nervusdb/mcp versions --registry=https://npm.pkg.github.com`

## 支持

遇到问题？提交 Issue：https://github.com/nervusdb/nervusdb-mcp/issues
