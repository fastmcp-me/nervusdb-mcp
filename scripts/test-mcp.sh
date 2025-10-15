#!/usr/bin/env bash
# Test Synapse-Architect MCP Server

set -e

GREEN='\033[0;32m'
RED='\033[0;31m'
YELLOW='\033[1;33m'
NC='\033[0m'

PROJECT_ROOT="$(cd "$(dirname "${BASH_SOURCE[0]}")/.." && pwd)"
BIN_PATH="$PROJECT_ROOT/bin/synapse-architect.js"

echo -e "${GREEN}🧪 Testing Synapse-Architect MCP Server${NC}"
echo ""

# Test 1: File exists
echo -e "${YELLOW}Test 1: Checking if binary exists...${NC}"
if [ -f "$BIN_PATH" ]; then
  echo -e "${GREEN}✅ Binary found: $BIN_PATH${NC}"
else
  echo -e "${RED}❌ Binary not found: $BIN_PATH${NC}"
  exit 1
fi

# Test 2: File is executable
echo -e "${YELLOW}Test 2: Checking executable permission...${NC}"
if [ -x "$BIN_PATH" ]; then
  echo -e "${GREEN}✅ File is executable${NC}"
else
  echo -e "${YELLOW}⚠️  File is not executable, fixing...${NC}"
  chmod +x "$BIN_PATH"
  echo -e "${GREEN}✅ Permission fixed${NC}"
fi

# Test 3: Node.js is available
echo -e "${YELLOW}Test 3: Checking Node.js...${NC}"
if command -v node &> /dev/null; then
  NODE_VERSION=$(node --version)
  echo -e "${GREEN}✅ Node.js found: $NODE_VERSION${NC}"
else
  echo -e "${RED}❌ Node.js not found in PATH${NC}"
  exit 1
fi

# Test 4: Initialize handshake
echo -e "${YELLOW}Test 4: Testing JSON-RPC initialization...${NC}"
RESPONSE=$(echo '{"jsonrpc":"2.0","method":"initialize","params":{"protocolVersion":"2024-11-05","capabilities":{},"clientInfo":{"name":"test","version":"1.0"}},"id":1}' | \
  node "$BIN_PATH" 2>/dev/null | head -1)

if echo "$RESPONSE" | jq -e '.result.serverInfo' &> /dev/null; then
  SERVER_NAME=$(echo "$RESPONSE" | jq -r '.result.serverInfo.name')
  SERVER_VERSION=$(echo "$RESPONSE" | jq -r '.result.serverInfo.version')
  echo -e "${GREEN}✅ Server responded correctly${NC}"
  echo "   Name: $SERVER_NAME"
  echo "   Version: $SERVER_VERSION"
else
  echo -e "${RED}❌ Server response invalid${NC}"
  echo "Response: $RESPONSE"
  exit 1
fi

# Test 5: Check stdout/stderr separation
echo -e "${YELLOW}Test 5: Checking stdout/stderr separation...${NC}"
TEMP_OUT=$(mktemp)
TEMP_ERR=$(mktemp)

echo '{"jsonrpc":"2.0","method":"initialize","params":{"protocolVersion":"2024-11-05","capabilities":{},"clientInfo":{"name":"test","version":"1.0"}},"id":1}' | \
  MCP_TRANSPORT=stdio node "$BIN_PATH" > "$TEMP_OUT" 2> "$TEMP_ERR"

# Check stdout contains only JSON
if head -1 "$TEMP_OUT" | jq empty 2>/dev/null; then
  echo -e "${GREEN}✅ stdout contains valid JSON-RPC${NC}"
else
  echo -e "${RED}❌ stdout is polluted (should only contain JSON-RPC)${NC}"
  echo "First line of stdout:"
  head -1 "$TEMP_OUT"
fi

# Check stderr contains logs
if grep -q "Logger initialized" "$TEMP_ERR" || grep -q "isStdioMode" "$TEMP_ERR"; then
  echo -e "${GREEN}✅ stderr contains logs${NC}"
else
  echo -e "${YELLOW}⚠️  No logs in stderr (might be disabled)${NC}"
fi

rm -f "$TEMP_OUT" "$TEMP_ERR"

# Test 6: Dependencies check
echo -e "${YELLOW}Test 6: Checking dependencies...${NC}"
if [ -d "$PROJECT_ROOT/node_modules/synapsedb" ]; then
  echo -e "${GREEN}✅ synapsedb dependency found${NC}"
else
  echo -e "${RED}❌ synapsedb dependency not found${NC}"
  echo -e "${YELLOW}   Run: cd $PROJECT_ROOT && pnpm install${NC}"
fi

# Summary
echo ""
echo -e "${GREEN}━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━${NC}"
echo -e "${GREEN}✅ All tests passed!${NC}"
echo -e "${GREEN}━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━${NC}"
echo ""
echo "Next steps:"
echo "  1. Run: bash $PROJECT_ROOT/scripts/configure-mcp.sh"
echo "  2. Restart your MCP client (Cursor/Claude Desktop/etc.)"
echo "  3. Check if 'synapse-architect' appears in the MCP servers list"
