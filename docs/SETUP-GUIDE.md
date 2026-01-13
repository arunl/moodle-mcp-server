# Moodle MCP Setup Guide

This guide explains how to set up the Moodle MCP hosted service with various AI clients.

## Quick Start

### 1. Create an Account

1. Visit [moodle-mcp.example.com](https://moodle-mcp.example.com)
2. Click "Sign in with Google"
3. Authorize the application
4. You'll be redirected to your dashboard

### 2. Get Your API Key

1. In the dashboard, click "Create New Key"
2. Give it a name (e.g., "Claude Desktop")
3. **Copy the key immediately** - it won't be shown again!

### 3. Install Browser Extension

1. Download the extension from your dashboard
2. Unzip the file
3. In Chrome/Edge: go to `chrome://extensions`
4. Enable "Developer mode"
5. Click "Load unpacked" and select the unzipped folder
6. Click the extension icon and sign in with Google

### 4. Configure Your AI Client

Choose your AI client below and follow the specific instructions.

---

## Claude Desktop

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
        "url": "https://moodle-mcp.example.com/mcp/sse"
      },
      "headers": {
        "Authorization": "Bearer YOUR_API_KEY"
      }
    }
  }
}
```

### Steps

1. Open the config file location above
2. If the file doesn't exist, create it
3. Add the configuration above (merge with existing if needed)
4. Replace `YOUR_API_KEY` with your actual API key
5. Restart Claude Desktop

---

## Cursor IDE

### Configuration Location

- **Workspace**: `.cursor/mcp.json` in your project folder
- **Global**: User settings

### Configuration

```json
{
  "mcpServers": {
    "moodle": {
      "transport": {
        "type": "sse",
        "url": "https://moodle-mcp.example.com/mcp/sse"
      },
      "headers": {
        "Authorization": "Bearer YOUR_API_KEY"
      }
    }
  }
}
```

### Steps

1. Create `.cursor/mcp.json` in your project root
2. Add the configuration above
3. Replace `YOUR_API_KEY` with your actual API key
4. Reload Cursor (Ctrl/Cmd + Shift + P → "Reload Window")

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
          "url": "https://moodle-mcp.example.com/mcp/sse",
          "headers": {
            "Authorization": "Bearer YOUR_API_KEY"
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
4. Replace `YOUR_API_KEY` with your actual API key
5. Reload VS Code

---

## ChatGPT (with MCP Plugin)

> Note: ChatGPT MCP support requires a compatible plugin or integration.

### Configuration

Use the MCP Gateway or similar bridge:

```json
{
  "servers": [
    {
      "name": "Moodle",
      "url": "https://moodle-mcp.example.com/mcp/sse",
      "auth": {
        "type": "bearer",
        "token": "YOUR_API_KEY"
      }
    }
  ]
}
```

---

## Generic MCP Client

For any MCP-compatible client, use these settings:

| Setting | Value |
|---------|-------|
| Transport | SSE |
| URL | `https://moodle-mcp.example.com/mcp/sse` |
| Auth Type | Bearer Token |
| Auth Header | `Authorization: Bearer YOUR_API_KEY` |

---

## Using Moodle MCP

Once configured, you can interact with Moodle using natural language:

### Example Prompts

**Course Navigation:**
- "Show me my Moodle courses"
- "Navigate to my CMPS 453 course"
- "Go to the gradebook for this course"

**Content Creation:**
- "Create a new chapter called 'Introduction' with this content..."
- "Add an announcement to my course"
- "Update the course overview with better formatting"

**Course Management:**
- "How many students are enrolled?"
- "Show me the course activities"
- "Extract the syllabus content"

### Prerequisites

For commands to work, ensure:
1. ✅ Browser extension is connected (check extension popup)
2. ✅ You're logged into Moodle in that browser
3. ✅ The Moodle tab is active or recently visited

---

## Troubleshooting

### "Browser extension not connected"

1. Click the extension icon
2. Check the status shows "Connected"
3. If disconnected, click "Reconnect"
4. Make sure you're signed in

### "Invalid API key"

1. Go to your dashboard
2. Check if your API key is still active
3. Create a new key if needed
4. Update your client configuration

### "Command timed out"

1. Ensure the Moodle page is loaded
2. Check your internet connection
3. Try the command again
4. If persistent, check Moodle server status

### "Element not found"

1. Navigate to the correct page first
2. Wait for the page to fully load
3. Check if Moodle's UI has changed

---

## Security Notes

- Your Moodle credentials **never** leave your browser
- The server only routes commands; it cannot access your Moodle
- API keys can be revoked anytime from your dashboard
- All traffic is encrypted with HTTPS/WSS

---

## Getting Help

- **GitHub Issues**: [github.com/arunlakhotia/moodle-mcp/issues](https://github.com/arunlakhotia/moodle-mcp/issues)
- **Documentation**: [docs/HOSTED-SERVICE-ARCHITECTURE.md](./HOSTED-SERVICE-ARCHITECTURE.md)
