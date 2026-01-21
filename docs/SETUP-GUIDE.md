# Moodle MCP Setup Guide

This guide explains how to connect your AI assistant to Moodle using Moodle MCP.

## Overview

Moodle MCP consists of three parts:
1. **Server** — Routes commands between your AI and browser (hosted for you)
2. **Browser Extension** — Executes commands in your logged-in Moodle session
3. **MCP Remote** (optional) — Bridge for AI clients that need stdio transport

## Quick Start

### Step 1: Create an Account

1. Visit the Moodle MCP service (get URL from your administrator)
2. Click **"Sign in with Google"**
3. You'll be redirected to your dashboard

### Step 2: Get Your API Key

1. In the dashboard, click **"Create New Key"**
2. Give it a name (e.g., "My Laptop")
3. **Copy the key immediately** — it won't be shown again!

### Step 3: Install the Browser Extension

1. Download the extension from your dashboard (or get from admin)
2. Open Chrome and go to `chrome://extensions`
3. Enable **"Developer mode"** (top right toggle)
4. Click **"Load unpacked"**
5. Select the `browser-extension` folder
6. Click the extension icon and sign in with Google

### Step 4: Configure Your AI Client

Choose your AI client below and follow the instructions.

---

## Cursor IDE

Cursor uses stdio transport for MCP servers, so you need the **mcp-remote** bridge.

### Installation

```bash
# Download or clone the mcp-remote package
# Then install dependencies:
cd mcp-remote
npm install
```

### Configuration

Create or edit `.cursor/mcp.json` in your workspace:

```json
{
  "mcpServers": {
    "moodle": {
      "command": "npx",
      "args": ["tsx", "/full/path/to/mcp-remote/src/index.ts"],
      "env": {
        "MCP_SERVER_URL": "https://your-moodle-mcp-server.com",
        "MCP_API_KEY": "your-api-key-here"
      }
    }
  }
}
```

> **Note:** Replace `/full/path/to/` with the actual path where you installed mcp-remote.

### Steps

1. Install the mcp-remote package (see above)
2. Create `.cursor/mcp.json` with the configuration above
3. Replace the path and API key
4. Reload Cursor (Ctrl/Cmd + Shift + P → "Reload Window")
5. The Moodle tools should appear in your AI assistant

---

## Claude Desktop

Claude Desktop supports SSE transport natively.

### Configuration Location

- **macOS**: `~/Library/Application Support/Claude/claude_desktop_config.json`
- **Windows**: `%APPDATA%\Claude\claude_desktop_config.json`

### Configuration

```json
{
  "mcpServers": {
    "moodle": {
      "transport": {
        "type": "sse",
        "url": "https://your-moodle-mcp-server.com/mcp/sse"
      },
      "headers": {
        "Authorization": "Bearer your-api-key-here"
      }
    }
  }
}
```

### Steps

1. Open the config file location above
2. If the file doesn't exist, create it
3. Add the configuration (merge with existing if needed)
4. Replace `your-api-key-here` with your actual API key
5. Restart Claude Desktop

---

## Continue (VS Code Extension)

### Configuration Location

`~/.continue/config.json`

### Configuration

Add to the `experimental` section:

```json
{
  "experimental": {
    "modelContextProtocolServers": [
      {
        "name": "moodle",
        "transport": {
          "type": "sse",
          "url": "https://your-moodle-mcp-server.com/mcp/sse",
          "headers": {
            "Authorization": "Bearer your-api-key-here"
          }
        }
      }
    ]
  }
}
```

### Steps

1. Open Continue settings (gear icon)
2. Click "Open config.json"
3. Add the MCP server configuration
4. Replace with your API key
5. Reload VS Code

---

## Generic MCP Client

For any MCP-compatible client:

### SSE Transport (recommended if supported)

| Setting | Value |
|---------|-------|
| Transport | SSE |
| URL | `https://your-moodle-mcp-server.com/mcp/sse` |
| Auth Header | `Authorization: Bearer your-api-key` |

### Stdio Transport (using mcp-remote)

| Setting | Value |
|---------|-------|
| Command | `npx tsx /path/to/mcp-remote/src/index.ts` |
| Environment | `MCP_SERVER_URL=https://...` and `MCP_API_KEY=...` |

---

## Using Moodle MCP

Once configured, interact with Moodle using natural language:

### Example Prompts

**Course Navigation:**
- "Show me my Moodle courses"
- "Navigate to my CMPS 453 course"
- "Go to the gradebook for this course"

**Content Creation:**
- "Post an announcement about the homework deadline extension"
- "Create a new forum discussion welcoming students"

**Course Management:**
- "How many students are enrolled?"
- "Who hasn't submitted the assignment yet?"
- "Analyze participation in the self-introduction forum"

**Assignments:**
- "List all assignments with their due dates"
- "Extend the deadline for John Smith by 2 days"
- "Shift all homework deadlines by 1 week"

### Prerequisites

For commands to work:
1. ✅ Browser extension shows "Connected" (check popup)
2. ✅ You're logged into Moodle in that browser
3. ✅ A Moodle tab is open or recently visited

---

## Troubleshooting

### "Browser extension not connected"

1. Click the extension icon in Chrome
2. Check the status shows "Connected"
3. If disconnected, click "Reconnect" or reload the extension
4. Make sure you're signed in with the same Google account

### "Invalid API key"

1. Go to your dashboard
2. Check if your API key is still active
3. Create a new key if needed
4. Update your client configuration with the new key

### "Command timed out"

1. Ensure the Moodle page is fully loaded
2. Check your internet connection
3. Try navigating to the page first, then retry

### "Element not found"

1. The page structure may have changed
2. Try refreshing the Moodle page
3. Navigate to the correct page first

### Cursor: Tools not showing

1. Check that the path in `.cursor/mcp.json` is correct
2. Ensure mcp-remote dependencies are installed (`npm install`)
3. Check the Developer Console for errors
4. Try a full restart of Cursor (not just reload)

---

## Security Notes

- Your Moodle credentials **never** leave your browser
- The server only routes commands; it cannot access your Moodle data
- API keys can be revoked anytime from your dashboard
- All traffic is encrypted with HTTPS/WSS

---

## Getting Help

- **GitHub Issues**: Report bugs or request features
- **Documentation**: See other docs in the `docs/` folder
