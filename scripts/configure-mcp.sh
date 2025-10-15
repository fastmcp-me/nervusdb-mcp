#!/usr/bin/env bash
# Configure Synapse-Architect MCP Server for various clients

set -e

# Colors for output
RED='\033[0;31m'
GREEN='\033[0;32m'
YELLOW='\033[1;33m'
NC='\033[0m' # No Color

# Get the absolute path to the project root
PROJECT_ROOT="$(cd "$(dirname "${BASH_SOURCE[0]}")/.." && pwd)"
BIN_PATH="$PROJECT_ROOT/bin/synapse-architect.js"

echo -e "${GREEN}🔧 Synapse-Architect MCP Configuration${NC}"
echo "Project: $PROJECT_ROOT"
echo ""

# Check if bin file exists
if [ ! -f "$BIN_PATH" ]; then
  echo -e "${RED}❌ Error: $BIN_PATH not found${NC}"
  exit 1
fi

# Ensure executable permission
chmod +x "$BIN_PATH"

# Test server
echo -e "${YELLOW}Testing server...${NC}"
if echo '{"jsonrpc":"2.0","method":"initialize","params":{"protocolVersion":"2024-11-05","capabilities":{},"clientInfo":{"name":"test","version":"1.0"}},"id":1}' | \
   node "$BIN_PATH" 2>/dev/null | grep -q '"serverInfo"'; then
  echo -e "${GREEN}✅ Server test passed${NC}"
else
  echo -e "${RED}❌ Server test failed${NC}"
  exit 1
fi

# Function to create config
create_config() {
  local config_path="$1"
  local config_dir=$(dirname "$config_path")
  
  # Create directory if not exists
  mkdir -p "$config_dir"
  
  # Create or update config
  if [ -f "$config_path" ]; then
    echo -e "${YELLOW}⚠️  Config file already exists: $config_path${NC}"
    echo -e "${YELLOW}   Backing up to: $config_path.backup${NC}"
    cp "$config_path" "$config_path.backup"
  fi
  
  # Check if config is valid JSON
  if [ -f "$config_path" ] && ! jq empty "$config_path" 2>/dev/null; then
    echo -e "${RED}❌ Existing config is not valid JSON. Please fix it manually.${NC}"
    return 1
  fi
  
  # Merge with existing config or create new
  if [ -f "$config_path" ]; then
    jq --arg bin "$BIN_PATH" \
       '.mcpServers["synapse-architect"] = {"command": "node", "args": [$bin]}' \
       "$config_path" > "$config_path.tmp"
    mv "$config_path.tmp" "$config_path"
  else
    cat > "$config_path" <<EOF
{
  "mcpServers": {
    "synapse-architect": {
      "command": "node",
      "args": [
        "$BIN_PATH"
      ]
    }
  }
}
EOF
  fi
  
  echo -e "${GREEN}✅ Config created/updated: $config_path${NC}"
}

# Detect and configure clients
echo ""
echo -e "${YELLOW}📋 Detecting MCP clients...${NC}"

CLAUDE_CONFIG="$HOME/Library/Application Support/Claude/claude_desktop_config.json"
CURSOR_CONFIG="$HOME/.cursor/mcp.json"
CURSOR_CONFIG_ALT="$HOME/Library/Application Support/Cursor/User/mcp.json"
WINDSURF_CONFIG="$HOME/.windsurf/mcp.json"

# Array to track configured clients
CONFIGURED=()

# Claude Desktop
if [ -d "$HOME/Library/Application Support/Claude" ] || command -v claude &> /dev/null; then
  echo ""
  echo -e "${GREEN}Found: Claude Desktop${NC}"
  read -p "Configure Claude Desktop? (y/n) " -n 1 -r
  echo
  if [[ $REPLY =~ ^[Yy]$ ]]; then
    create_config "$CLAUDE_CONFIG"
    CONFIGURED+=("Claude Desktop")
  fi
fi

# Cursor
if [ -d "$HOME/.cursor" ] || [ -d "$HOME/Library/Application Support/Cursor" ] || command -v cursor &> /dev/null; then
  echo ""
  echo -e "${GREEN}Found: Cursor${NC}"
  read -p "Configure Cursor? (y/n) " -n 1 -r
  echo
  if [[ $REPLY =~ ^[Yy]$ ]]; then
    if [ -d "$HOME/.cursor" ]; then
      create_config "$CURSOR_CONFIG"
    else
      create_config "$CURSOR_CONFIG_ALT"
    fi
    CONFIGURED+=("Cursor")
  fi
fi

# Windsurf
if [ -d "$HOME/.windsurf" ] || command -v windsurf &> /dev/null; then
  echo ""
  echo -e "${GREEN}Found: Windsurf${NC}"
  read -p "Configure Windsurf? (y/n) " -n 1 -r
  echo
  if [[ $REPLY =~ ^[Yy]$ ]]; then
    create_config "$WINDSURF_CONFIG"
    CONFIGURED+=("Windsurf")
  fi
fi

# Summary
echo ""
echo -e "${GREEN}━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━${NC}"
echo -e "${GREEN}✅ Configuration Complete${NC}"
echo -e "${GREEN}━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━${NC}"

if [ ${#CONFIGURED[@]} -eq 0 ]; then
  echo -e "${YELLOW}No clients were configured.${NC}"
else
  echo "Configured clients:"
  for client in "${CONFIGURED[@]}"; do
    echo "  ✓ $client"
  done
fi

echo ""
echo -e "${YELLOW}⚠️  Important: Restart your client(s) to apply changes${NC}"
echo ""
echo "To manually verify the configuration:"
echo "  cat '$CLAUDE_CONFIG'"
echo ""
echo "To test the server:"
echo "  bash $PROJECT_ROOT/scripts/test-mcp.sh"
