# Moodle MCP Server

An MCP (Model Context Protocol) server that provides AI assistants with access to Moodle LMS. Interact with your courses, assignments, grades, calendar, and more through natural language.

![License](https://img.shields.io/badge/license-MIT-blue.svg)
![Node](https://img.shields.io/badge/node-%3E%3D18.0.0-brightgreen.svg)

## 🚀 New: Hosted Service

**No setup required!** Use our hosted service to connect any AI assistant to Moodle:

1. 🔑 **Sign up** at [moodle-mcp.example.com](https://moodle-mcp.example.com)
2. 📦 **Install** the browser extension
3. ⚡ **Connect** your AI client with your API key

Works with **Claude Desktop**, **Cursor**, **ChatGPT** (via MCP), and any MCP-compatible client.

[📖 Setup Guide](docs/SETUP-GUIDE.md) | [🏗️ Architecture](docs/HOSTED-SERVICE-ARCHITECTURE.md)

---

## How It Works

```
┌─────────────────────────────────────────────────────────────────────────────┐
│                              YOUR MACHINE                                    │
├─────────────────────────────────────────────────────────────────────────────┤
│  ┌──────────────────┐         ┌──────────────────────────────────────────┐  │
│  │   AI Assistant   │         │           Browser (Chrome/Edge)          │  │
│  │  (Claude, etc.)  │         │  ┌────────────────────────────────────┐  │  │
│  │                  │         │  │         Your Moodle Site           │  │  │
│  │  Uses MCP to     │         │  │    (logged in with your account)   │  │  │
│  │  send commands   │         │  └────────────────────────────────────┘  │  │
│  └────────┬─────────┘         │  ┌────────────────────────────────────┐  │  │
│           │                   │  │     Moodle MCP Browser Extension   │  │  │
│           │ MCP Protocol      │  │    (executes commands securely)    │  │  │
│           │                   │  └──────────────┬─────────────────────┘  │  │
└───────────┼───────────────────┼─────────────────┼────────────────────────┘  
            │                   │                 │ WebSocket
            ▼                   │                 ▼
┌───────────────────────────────┴─────────────────────────────────────────────┐
│                        Moodle MCP Hosted Service                            │
│                     (routes commands, never sees your data)                 │
└─────────────────────────────────────────────────────────────────────────────┘
```

**Your credentials never leave your browser.** The server only routes commands between your AI assistant and browser extension.

---

## Features

- 📚 **Browse Courses** - List and navigate your enrolled courses
- 📝 **Create Content** - Write Moodle Books, announcements, pages
- 👥 **Manage Students** - View enrollments (instructors)
- ⚙️ **Course Settings** - Access course configuration
- 🎨 **Rich Formatting** - Generate styled HTML content

## Quick Start

### Option 1: Hosted Service (Recommended)

1. **Create Account**: Visit [moodle-mcp.example.com](https://moodle-mcp.example.com) and sign in with Google
2. **Get API Key**: From your dashboard, create an API key
3. **Install Extension**: Download and install the browser extension
4. **Configure AI Client**: Add to your client's MCP config:

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

5. **Use It**: Log into Moodle in your browser and start chatting!

### Option 2: Self-Hosted (Local)

If you prefer to run your own server:

```bash
# Clone the repo
git clone https://github.com/arunlakhotia/moodle-mcp.git
cd moodle-mcp

# Install and build
npm install
npm run build

# Configure in your MCP client
# Use the local browser extension from browser-extension/
```

See the [local setup guide](#local-server-setup) below.

---

## Example Prompts

Once configured, try these with your AI assistant:

**Navigation:**
- *"Show me my Moodle courses"*
- *"Go to my Software Engineering course"*
- *"Navigate to the gradebook"*

**Content Creation:**
- *"Create a new chapter called 'Introduction' with an overview of the course"*
- *"Update the course overview with better formatting"*
- *"Add a styled HTML announcement"*

**Course Management:**
- *"How many students are enrolled in this course?"*
- *"Show me the course activities"*
- *"Extract the syllabus content"*

---

## Available Tools

| Tool | Description |
|------|-------------|
| `get_browser_status` | Check if browser extension is connected |
| `browse_moodle` | Navigate to any Moodle page |
| `click_element` | Click elements on the page |
| `type_text` | Type into input fields |
| `extract_page_content` | Get content from current page |
| `set_editor_content` | Set HTML in Moodle editors |
| `get_courses` | List enrolled courses |
| `get_course_content` | Get course activities |
| `get_enrolled_users` | List enrolled students |

---

## Why Browser-Based?

Most universities **disable Moodle's Web Services API** and use SSO (Single Sign-On). This makes traditional API-based access impossible.

Our browser-based approach:
- ✅ Works with **any** Moodle (SSO, LDAP, standard)
- ✅ Uses your **existing login session**
- ✅ **No API tokens** required
- ✅ **Credentials stay in your browser**
- ✅ Works with **organizational policies**

---

## Local Server Setup

For self-hosting, you can run the MCP server locally:

### Requirements
- Node.js 18+
- Browser extension installed

### Installation

```bash
git clone https://github.com/arunlakhotia/moodle-mcp.git
cd moodle-mcp
npm install
npm run build
```

### Browser Extension Setup

1. Go to `chrome://extensions` (or `edge://extensions`)
2. Enable "Developer mode"
3. Click "Load unpacked"
4. Select the `browser-extension/` folder
5. Click the extension icon and configure

### MCP Client Configuration

Add to your Claude Desktop or Cursor config:

```json
{
  "mcpServers": {
    "moodle": {
      "command": "node",
      "args": ["path/to/moodle-mcp/dist/index.js"],
      "cwd": "path/to/moodle-mcp"
    }
  }
}
```

---

## Security

- 🔐 **Credentials stay local**: Your Moodle session never leaves your browser
- 🔑 **API keys are hashed**: We never store your actual API key
- 🚫 **No data storage**: The server routes commands, doesn't store your Moodle data
- 🔒 **HTTPS/WSS**: All traffic is encrypted

---

## Deploying Your Own Hosted Service

Want to run the hosted service for your organization?

```bash
cd server
npm install
npm run build

# Set environment variables
export DATABASE_URL=postgresql://...
export GOOGLE_CLIENT_ID=...
export GOOGLE_CLIENT_SECRET=...
export JWT_SECRET=...

npm start
```

See [HOSTED-SERVICE-ARCHITECTURE.md](docs/HOSTED-SERVICE-ARCHITECTURE.md) for full deployment guide.

---

## Troubleshooting

### "Browser extension not connected"
1. Check the extension popup shows "Connected"
2. Click "Reconnect" if disconnected
3. Make sure you're signed in

### "Command timed out"
1. Ensure Moodle page is fully loaded
2. Check your internet connection
3. Try navigating to the page first

### "Invalid API key"
1. Check your API key in the dashboard
2. Create a new key if needed
3. Update your client configuration

---

## Contributing

Contributions welcome! Please see our [contributing guidelines](CONTRIBUTING.md).

1. Fork the repository
2. Create your feature branch
3. Commit your changes
4. Open a Pull Request

---

## License

MIT License - see [LICENSE](LICENSE)

---

## Acknowledgments

- [Model Context Protocol](https://modelcontextprotocol.io/) by Anthropic
- [Moodle](https://moodle.org/) Learning Management System
- University of Louisiana at Lafayette for testing and feedback
