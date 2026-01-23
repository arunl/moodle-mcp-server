# Moodle MCP

A bridge that lets AI assistants interact with Moodle LMS through your browser. Works with any Moodle instance—including those using SSO/LDAP—because it uses your existing browser session.

![License](https://img.shields.io/badge/license-MIT-blue.svg)
![Node](https://img.shields.io/badge/node-%3E%3D18.0.0-brightgreen.svg)

## Architecture

```
┌─────────────────────────────────────────────────────────────────────────┐
│                              YOUR MACHINE                               │
├─────────────────────────────────────────────────────────────────────────┤
│  ┌────────────────┐              ┌────────────────────────────────────┐ │
│  │  AI Assistant  │              │     Browser (Chrome/Edge)          │ │
│  │  (Claude,      │              │  ┌──────────────────────────────┐  │ │
│  │   Cursor, etc) │              │  │ Your Moodle (logged in)      │  │ │
│  └───────┬────────┘              │  └──────────────────────────────┘  │ │
│          │ MCP Protocol          │  ┌──────────────────────────────┐  │ │
│          │                       │  │ Browser Extension            │  │ │
│          │                       │  │ (executes commands securely) │  │ │
│          │                       │  └─────────────┬────────────────┘  │ │
└──────────┼───────────────────────┼────────────────┼───────────────────┘
           │                       │                │ WebSocket
           ▼                       │                ▼
┌──────────────────────────────────┴────────────────────────────────────┐
│                    Moodle MCP Server (Hosted)                         │
│              Routes commands · Never sees your credentials            │
└───────────────────────────────────────────────────────────────────────┘
```

**Key principle:** Your Moodle credentials never leave your browser. The server only routes commands between your AI assistant and the browser extension.

## Components

| Component | Description |
|-----------|-------------|
| **Server** (`server/`) | Hono-based Node.js server with Google OAuth, JWT auth, WebSocket bridge |
| **Browser Extension** (`browser-extension/`) | Chrome extension that executes MCP commands in your Moodle session |
| **MCP Remote** (`mcp-remote/`) | Generic stdio-to-HTTP bridge for MCP clients that only support stdio |

## Quick Start

### For Users (Hosted Service)

1. **Sign up** at the hosted service (get URL from your administrator)
2. **Get API key** from the dashboard
3. **Install extension** from the dashboard
4. **Configure AI client** (see [Setup Guide](docs/SETUP-GUIDE.md))

### For Developers (Local)

```bash
# Clone and install
git clone https://github.com/arunlakhotia/moodle-mcp.git
cd moodle-mcp/server
npm install

# Configure environment
cp env.example .env
# Edit .env with your Google OAuth credentials

# Start server
npm run dev
```

Then:
1. Load `browser-extension/` in Chrome (`chrome://extensions` → Developer mode → Load unpacked)
2. Visit `http://localhost:8080/dev` to create test credentials
3. Configure your AI client (see below)

## AI Client Configuration

### Cursor IDE (with stdio bridge)

Cursor requires stdio-based MCP servers. Use the `mcp-remote` bridge:

```bash
cd mcp-remote && npm install
```

Add to `.cursor/mcp.json`:

```json
{
  "mcpServers": {
    "moodle": {
      "command": "npx",
      "args": ["tsx", "/path/to/moodle-mcp/mcp-remote/src/index.ts"],
      "env": {
        "MCP_SERVER_URL": "http://localhost:8080",
        "MCP_API_KEY": "your-api-key"
      }
    }
  }
}
```

### Claude Desktop (SSE transport)

Add to `~/Library/Application Support/Claude/claude_desktop_config.json` (macOS) or `%APPDATA%\Claude\claude_desktop_config.json` (Windows):

```json
{
  "mcpServers": {
    "moodle": {
      "transport": {
        "type": "sse",
        "url": "http://localhost:8080/mcp/sse"
      },
      "headers": {
        "Authorization": "Bearer your-api-key"
      }
    }
  }
}
```

## Available Tools

### Navigation & Content
| Tool | Description |
|------|-------------|
| `browse_moodle` | Navigate to any Moodle URL |
| `extract_page_content` | Get content from current page |
| `click_element` | Click elements on the page |
| `type_text` | Type into input fields |
| `set_editor_content` | Set HTML in Moodle rich text editors |

### Courses
| Tool | Description |
|------|-------------|
| `get_courses` | List your enrolled courses |
| `open_course` | Navigate to a specific course |
| `get_course_content` | Get course activities and resources |
| `get_course_sections` | Get section IDs and names |

### Participants & Users
| Tool | Description |
|------|-------------|
| `list_participants` | List enrolled users with roles |
| `get_enrolled_users` | Get enrolled user details |
| `send_message` | Send direct message to a user |
| `bulk_send_message` | Send message to multiple users |

### Assignments
| Tool | Description |
|------|-------------|
| `list_assignments` | List assignments with due dates |
| `get_assignment` | Get assignment details |
| `get_assignment_submissions` | Get submission status |
| `create_assignment` | Create new assignment |
| `edit_assignment` | Modify assignment settings |
| `extend_assignment_deadline` | Grant deadline extension |
| `bulk_shift_deadlines` | Shift multiple deadlines |

### Forums
| Tool | Description |
|------|-------------|
| `forum_list_discussions` | List forum discussions |
| `find_forum_discussion` | Search discussions by subject |
| `create_forum_post` | Create new discussion |
| `delete_forum_discussion` | Delete a discussion |
| `analyze_forum` | Get participation statistics |

### Feedback Activities
| Tool | Description |
|------|-------------|
| `find_activity` | Find any activity by name/type |
| `analyze_feedback` | Get response statistics |

### Course Management
| Tool | Description |
|------|-------------|
| `edit_section` | Rename course sections |
| `add_section` | Add new sections |
| `delete_section` | Remove sections |
| `hide_section` | Show/hide sections |
| `move_section` | Reorder sections |
| `enable_editing` | Enable editing mode |

## Security

- 🔐 **Credentials stay local** — Your Moodle session never leaves your browser
- 🔑 **API keys are hashed** — Server stores only hashes
- 🚫 **No data storage** — Server routes commands only
- 🔒 **HTTPS/WSS** — All traffic encrypted in production

## Documentation

- [Setup Guide](docs/SETUP-GUIDE.md) — Detailed setup for various AI clients
- [Deployment Guide](docs/DEPLOYMENT.md) — Self-hosting the server
- [Architecture](docs/HOSTED-SERVICE-ARCHITECTURE.md) — Technical details

## License

MIT License — see [LICENSE](LICENSE)

## Acknowledgments

- [Model Context Protocol](https://modelcontextprotocol.io/) by Anthropic
- [Moodle](https://moodle.org/) Learning Management System
- University of Louisiana at Lafayette
