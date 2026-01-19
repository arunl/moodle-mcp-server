#!/bin/bash
# Start the hosted MCP server for local development

# Get the directory where this script is located
SCRIPT_DIR="$( cd "$( dirname "${BASH_SOURCE[0]}" )" && pwd )"
cd "$SCRIPT_DIR/server"

export DATABASE_URL="file:local.db"
export JWT_SECRET="dev-secret-key-12345"
export SERVER_URL="http://localhost:8080"
export NODE_ENV="development"
export PORT="8080"

echo "Starting hosted MCP server..."
echo "  - HTTP API: http://localhost:8080"
echo "  - WebSocket: ws://localhost:8080/ws"
echo "  - Dev UI: http://localhost:8080/dev"
echo ""

npx tsx src/index.ts
