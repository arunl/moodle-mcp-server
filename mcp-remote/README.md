# MCP Remote

A stdio-to-HTTP bridge for connecting MCP clients to remote MCP servers.

## What is this?

The [Model Context Protocol (MCP)](https://modelcontextprotocol.io/) defines how AI assistants communicate with external tools. MCP clients like **Cursor** and **Claude Desktop** use **stdio transport** - they spawn a local process and communicate via stdin/stdout.

But what if your MCP server is **hosted remotely** (in the cloud)? That's where `mcp-remote` comes in. It acts as a bridge:

```
┌─────────────────┐         ┌─────────────┐         ┌─────────────────┐
│  Cursor /       │  stdio  │ mcp-remote  │  HTTP   │  Remote MCP     │
│  Claude Desktop │ ◄─────► │  (bridge)   │ ◄─────► │  Server         │
└─────────────────┘         └─────────────┘         └─────────────────┘
```

## Installation

```bash
npm install -g mcp-remote
# or
npx mcp-remote
```

## Usage

### With Cursor

Add to your `~/.cursor/mcp.json`:

```json
{
  "mcpServers": {
    "my-remote-server": {
      "command": "npx",
      "args": ["mcp-remote"],
      "env": {
        "MCP_SERVER_URL": "https://your-mcp-server.com",
        "MCP_API_KEY": "your-api-key"
      }
    }
  }
}
```

### With Claude Desktop

Add to your Claude Desktop config:

```json
{
  "mcpServers": {
    "my-remote-server": {
      "command": "npx",
      "args": ["mcp-remote"],
      "env": {
        "MCP_SERVER_URL": "https://your-mcp-server.com",
        "MCP_API_KEY": "your-api-key"
      }
    }
  }
}
```

### Command Line

```bash
MCP_SERVER_URL=https://your-server.com MCP_API_KEY=your-key npx mcp-remote
```

## Environment Variables

| Variable | Required | Description |
|----------|----------|-------------|
| `MCP_SERVER_URL` | Yes | Base URL of the remote MCP server |
| `MCP_API_KEY` | No* | API key for Bearer token authentication |
| `MCP_ENDPOINT` | No | MCP endpoint path (default: `/mcp`) |
| `MCP_DEBUG` | No | Set to `1` to enable debug logging |

*Most servers require authentication

## How It Works

1. MCP client (Cursor/Claude) sends JSON-RPC requests via stdin
2. `mcp-remote` forwards requests to the HTTP server with Bearer auth
3. Server responds with JSON-RPC
4. `mcp-remote` writes response to stdout

The bridge is completely transparent - it just forwards messages without modification.

## Server Requirements

Your remote MCP server must:
- Accept POST requests at the MCP endpoint (default: `/mcp`)
- Accept `Content-Type: application/json`
- Support `Authorization: Bearer <token>` header (if using API keys)
- Return valid MCP JSON-RPC responses

## License

MIT
