#!/bin/bash
# release.sh - 自动化发布脚本
# 用法: ./scripts/release.sh 0.1.21

set -e

# 颜色输出
RED='\033[0;31m'
GREEN='\033[0;32m'
YELLOW='\033[1;33m'
BLUE='\033[0;34m'
NC='\033[0m'

# 配置
PRIVATE_REPO_DIR="$(cd "$(dirname "$0")/.." && pwd)"
PUBLIC_REPO_DIR="${PUBLIC_REPO_DIR:-../nervusdb-mcp-public}"

# 检查参数
if [ -z "$1" ]; then
  echo -e "${RED}❌ 错误: 缺少版本号参数${NC}"
  echo "用法: ./scripts/release.sh 0.1.21"
  exit 1
fi

VERSION="$1"
VERSION_TAG="v${VERSION}"

# 验证版本号格式（X.Y.Z）
if ! [[ "$VERSION" =~ ^[0-9]+\.[0-9]+\.[0-9]+$ ]]; then
  echo -e "${RED}❌ 错误: 版本号格式不正确${NC}"
  echo "必须是 X.Y.Z 格式，例如: 0.1.21"
  exit 1
fi

echo -e "${BLUE}🚀 开始发布 ${VERSION_TAG}${NC}"
echo ""

# ==================== 步骤 1: 环境检查 ====================
echo -e "${YELLOW}[1/7] 检查环境...${NC}"

# 检查是否在私有仓库
CURRENT_REMOTE=$(git remote get-url origin 2>/dev/null || echo "")
if [[ ! "$CURRENT_REMOTE" =~ nervusdb-mcp-dev|Synapse-Architect ]]; then
  echo -e "${RED}❌ 错误: 当前不在私有开发仓库${NC}"
  echo "当前 remote: $CURRENT_REMOTE"
  echo "请在 nervusdb-mcp-dev 仓库中运行此脚本"
  exit 1
fi

# 检查工作区是否干净
if [ -n "$(git status --porcelain)" ]; then
  echo -e "${RED}❌ 错误: 工作区有未提交的更改${NC}"
  echo "请先提交或暂存所有更改"
  git status --short
  exit 1
fi

# 检查 tag 是否已存在
if git rev-parse "$VERSION_TAG" >/dev/null 2>&1; then
  echo -e "${RED}❌ 错误: Tag ${VERSION_TAG} 已存在${NC}"
  echo "请使用不同的版本号，或删除旧 tag: git tag -d ${VERSION_TAG}"
  exit 1
fi

# 检查公开仓库目录
if [ ! -d "$PUBLIC_REPO_DIR" ]; then
  echo -e "${RED}❌ 错误: 公开仓库目录不存在: $PUBLIC_REPO_DIR${NC}"
  echo "请设置环境变量 PUBLIC_REPO_DIR 或创建目录"
  exit 1
fi

# 检查必要的命令
for cmd in git rsync gh jq; do
  if ! command -v $cmd &> /dev/null; then
    echo -e "${RED}❌ 错误: 缺少必要的命令: $cmd${NC}"
    if [ "$cmd" = "gh" ]; then
      echo "安装: brew install gh"
    elif [ "$cmd" = "jq" ]; then
      echo "安装: brew install jq"
    fi
    exit 1
  fi
done

echo -e "${GREEN}✅ 环境检查通过${NC}"
echo ""

# ==================== 步骤 2: 更新版本号 ====================
echo -e "${YELLOW}[2/7] 更新版本号...${NC}"

# 更新 package.json
if [ -f "package.json" ]; then
  # 使用 jq 更新版本号
  jq ".version = \"${VERSION}\"" package.json > package.json.tmp
  mv package.json.tmp package.json
  echo "  ✓ package.json 更新为 ${VERSION}"
fi

# 更新 Cargo.toml
if [ -f "Cargo.toml" ]; then
  sed -i.bak "s/^version = \".*\"/version = \"${VERSION}\"/" Cargo.toml
  rm -f Cargo.toml.bak
  echo "  ✓ Cargo.toml 更新为 ${VERSION}"
fi

# 运行 pnpm install 更新 lockfile
if command -v pnpm &> /dev/null; then
  pnpm install --lockfile-only > /dev/null 2>&1
  echo "  ✓ pnpm-lock.yaml 已更新"
fi

echo -e "${GREEN}✅ 版本号更新完成${NC}"
echo ""

# ==================== 步骤 3: 提交版本变更到私有仓库 ====================
echo -e "${YELLOW}[3/7] 提交版本变更到私有仓库...${NC}"

git add package.json Cargo.toml pnpm-lock.yaml 2>/dev/null || true
git commit -m "chore: bump version to ${VERSION_TAG}" --quiet

echo -e "${GREEN}✅ 版本变更已提交${NC}"
echo ""

# ==================== 步骤 4: 创建 Tag 并推送私有仓库 ====================
echo -e "${YELLOW}[4/7] 创建 Tag 并推送私有仓库...${NC}"

# 从 CHANGELOG.md 提取 Release Notes（如果存在）
RELEASE_NOTES=""
if [ -f "CHANGELOG.md" ]; then
  # 尝试提取对应版本的 changelog
  RELEASE_NOTES=$(awk "/^## \[${VERSION}\]/,/^## \[/" CHANGELOG.md | sed '$d' | tail -n +2 || echo "")
fi

# 如果没有找到 changelog，使用默认消息
if [ -z "$RELEASE_NOTES" ]; then
  RELEASE_NOTES="Release ${VERSION_TAG}

See CHANGELOG.md for details."
fi

# 创建 annotated tag
git tag -a "$VERSION_TAG" -m "$RELEASE_NOTES"
echo "  ✓ Tag ${VERSION_TAG} 已创建"

# 推送到私有仓库
git push origin main --quiet
git push origin "$VERSION_TAG" --quiet
echo "  ✓ 已推送到私有仓库"

echo -e "${GREEN}✅ Tag 创建并推送完成${NC}"
echo ""

# ==================== 步骤 5: 同步到公开仓库 ====================
echo -e "${YELLOW}[5/7] 同步到公开仓库...${NC}"

# 运行同步脚本（设置 AUTO_SYNC 环境变量跳过交互）
AUTO_SYNC=1 PUBLIC_REPO_DIR="$PUBLIC_REPO_DIR" "$PRIVATE_REPO_DIR/scripts/sync-to-public.sh"

echo -e "${GREEN}✅ 文件同步完成${NC}"
echo ""

# ==================== 步骤 6: 提交并推送公开仓库 ====================
echo -e "${YELLOW}[6/7] 提交并推送公开仓库...${NC}"

cd "$PUBLIC_REPO_DIR"

# 添加所有变更
git add .

# 创建单个 squash commit（保持历史干净）
if [ -n "$(git status --porcelain)" ]; then
  git commit -m "chore: release ${VERSION_TAG}

Release ${VERSION_TAG} from private development repository.

License: MIT
" --quiet
  echo "  ✓ Commit 已创建（历史保持干净）"
else
  echo "  ℹ️  没有文件变更，跳过 commit"
fi

# 创建 tag
git tag -a "$VERSION_TAG" -m "Release ${VERSION_TAG}"
echo "  ✓ Tag ${VERSION_TAG} 已创建"

# 推送到公开仓库
git push origin main --quiet
git push origin "$VERSION_TAG" --quiet
echo "  ✓ 已推送到公开仓库"

echo -e "${GREEN}✅ 公开仓库发布完成${NC}"
echo ""

# ==================== 步骤 7: 创建 GitHub Release ====================
echo -e "${YELLOW}[7/7] 创建 GitHub Release...${NC}"

# 准备 Release Notes
RELEASE_NOTES_FILE=$(mktemp)
cat > "$RELEASE_NOTES_FILE" << EOF
# Release ${VERSION_TAG}

## 🚀 What's Changed

${RELEASE_NOTES}

## 📦 Installation

\`\`\`bash
# Via npx (recommended)
npx @nervusdb/mcp@${VERSION}

# Or install globally
npm install -g @nervusdb/mcp@${VERSION}
\`\`\`

## 📚 Documentation

- [README](https://github.com/nervusdb/nervusdb-mcp#readme)
- [npm Package](https://www.npmjs.com/package/@nervusdb/mcp)
- [CHANGELOG](https://github.com/nervusdb/nervusdb-mcp/blob/main/CHANGELOG.md)

## 📄 License

MIT - see [LICENSE](https://github.com/nervusdb/nervusdb-mcp/blob/main/LICENSE) for details.
EOF

# 创建 GitHub Release
gh release create "$VERSION_TAG" \
  --title "Release ${VERSION_TAG}" \
  --notes-file "$RELEASE_NOTES_FILE" \
  --repo nervusdb/nervusdb-mcp

rm -f "$RELEASE_NOTES_FILE"

RELEASE_URL="https://github.com/nervusdb/nervusdb-mcp/releases/tag/${VERSION_TAG}"
echo "  ✓ GitHub Release 已创建"

echo -e "${GREEN}✅ GitHub Release 创建完成${NC}"
echo ""

# ==================== 发布成功总结 ====================
echo -e "${GREEN}━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━${NC}"
echo -e "${GREEN}🎉 发布成功！${NC}"
echo -e "${GREEN}━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━${NC}"
echo ""
echo -e "${BLUE}📦 版本信息${NC}"
echo "  版本号: ${VERSION}"
echo "  Tag: ${VERSION_TAG}"
echo ""
echo -e "${BLUE}🔗 重要链接${NC}"
echo "  npm 包: https://www.npmjs.com/package/@nervusdb/mcp"
echo "  GitHub: https://github.com/nervusdb/nervusdb-mcp"
echo "  Release: ${RELEASE_URL}"
echo ""
echo -e "${BLUE}📊 公开仓库状态${NC}"
cd "$PUBLIC_REPO_DIR"
echo "  最新 commit: $(git log -1 --oneline)"
echo "  Commit 历史: $(git rev-list --count HEAD) 个 commits（保持干净）"
echo ""
echo -e "${YELLOW}💡 下一步建议${NC}"
echo "  1. 检查 npm 包是否已发布: npm view @nervusdb/mcp@${VERSION}"
echo "  2. 在 GitHub 上添加 Release 说明（如需要）"
echo "  3. 推广到社区（如 Reddit, Twitter）"
echo ""

# 返回私有仓库目录
cd "$PRIVATE_REPO_DIR"
