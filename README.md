# Moodle MCP Server

An MCP (Model Context Protocol) server that provides AI assistants with access to Moodle LMS. Interact with your courses, assignments, grades, calendar, and more through natural language.

![License](https://img.shields.io/badge/license-MIT-blue.svg)
![Node](https://img.shields.io/badge/node-%3E%3D18.0.0-brightgreen.svg)

## ⚠️ Important: University Moodle Compatibility

Many universities **disable Moodle's Web Services API**, which this MCP server requires. If your university uses SSO (Single Sign-On) and you cannot find security tokens in your Moodle preferences, the API is likely disabled.

### Alternative: Browser-Based Access (Recommended for Universities)

If your university has web services disabled, you can still access Moodle through **Cursor's browser extension**:

1. **Install the Cursor Browser Extension** in Chrome/Edge
2. **Log into Moodle** in your browser
3. **Ask Cursor naturally**: *"Get my courses from Moodle"*

Cursor will navigate to Moodle pages directly and extract the information for you.

**Requirements for browser-based access:**
- ✅ Browser must be open and logged into Moodle
- ✅ Cursor browser extension installed and connected
- ✅ Works with SSO/university authentication
- ❌ Does NOT require API tokens or web services

**Example prompts:**
- *"Show me my Moodle courses"*
- *"What assignments are due this week?"*
- *"Get the contents of my Software Methodology course"*

---

## Features (API Mode)

If your Moodle instance has web services enabled, this MCP server provides:

- 📚 **Courses** - List enrolled courses, view course contents and materials
- 📝 **Assignments** - Get assignments, due dates, submission status, and feedback
- 📊 **Grades** - View grades, percentages, and instructor feedback
- 📅 **Calendar** - Access upcoming deadlines and events
- 🔔 **Notifications** - Check recent notifications and messages
- 💬 **Forums** - Browse forum discussions
- 🔍 **Search** - Search for courses across the platform

## Requirements (API Mode)

- Node.js 18.0.0 or higher
- A Moodle account (student, teacher, or any role)
- **Moodle Web Services enabled** by your administrator
- A Moodle security token (see [Getting Your Token](#getting-your-token))

## Installation

### From npm (when published)

```bash
npm install -g moodle-mcp-server
```

### From source

```bash
git clone https://github.com/yourusername/moodle-mcp-server.git
cd moodle-mcp-server
npm install
npm run build
```

## Getting Your Token

Most university Moodle instances use SSO (Single Sign-On), so you'll need to get a security token from Moodle's preferences.

### Option 1: Security Keys (Recommended for SSO/University Moodle)

1. Log in to your Moodle site
2. Click on your profile picture/name in the top right
3. Select **Preferences** (or **Profile settings**)
4. Look for **Security keys** (sometimes under "User account")
5. Find the token for "Moodle mobile web service" and copy it

> **Note:** If you don't see Security keys, your Moodle admin may have disabled this feature. Contact your IT department.

### Option 2: Username/Password (Non-SSO Moodle only)

If your Moodle instance allows direct login (not SSO), you can use your username and password directly. This typically works for self-hosted or standalone Moodle installations.

## Configuration

Create a `.env` file in the project root (or set environment variables):

```bash
# Required: Your Moodle site URL (without trailing slash)
MOODLE_URL=https://moodle.yourschool.edu

# Authentication Option 1: Token (Recommended)
MOODLE_TOKEN=your_token_here

# Authentication Option 2: Username/Password (for non-SSO only)
# MOODLE_USERNAME=your_username
# MOODLE_PASSWORD=your_password

# Optional: Service name (default: moodle_mobile_app)
# MOODLE_SERVICE=moodle_mobile_app
```

## Usage with Claude Desktop

Add this to your Claude Desktop configuration file:

**Windows:** `%APPDATA%\Claude\claude_desktop_config.json`
**macOS:** `~/Library/Application Support/Claude/claude_desktop_config.json`

```json
{
  "mcpServers": {
    "moodle": {
      "command": "node",
      "args": ["C:/path/to/moodle-mcp-server/dist/index.js"],
      "env": {
        "MOODLE_URL": "https://moodle.yourschool.edu",
        "MOODLE_TOKEN": "your_token_here"
      }
    }
  }
}
```

Or if installed globally:

```json
{
  "mcpServers": {
    "moodle": {
      "command": "moodle-mcp",
      "env": {
        "MOODLE_URL": "https://moodle.yourschool.edu",
        "MOODLE_TOKEN": "your_token_here"
      }
    }
  }
}
```

## Usage with Cursor

Add to your Cursor MCP settings (`.cursor/mcp.json` or global settings):

```json
{
  "mcpServers": {
    "moodle": {
      "command": "node",
      "args": ["C:/path/to/moodle-mcp-server/dist/index.js"],
      "env": {
        "MOODLE_URL": "https://moodle.yourschool.edu",
        "MOODLE_TOKEN": "your_token_here"
      }
    }
  }
}
```

## Available Tools

| Tool | Description |
|------|-------------|
| `get_site_info` | Get Moodle site info and authenticated user details |
| `get_courses` | List all enrolled courses with progress |
| `get_course_contents` | Get sections, modules, and files for a course |
| `get_assignments` | Get assignments with due dates and descriptions |
| `get_assignment_status` | Check submission status and feedback for an assignment |
| `get_grades` | Get all grades for a course |
| `get_upcoming_deadlines` | Get upcoming assignments and deadlines |
| `get_calendar_events` | Get calendar events within a date range |
| `get_notifications` | Get recent notifications |
| `get_forum_discussions` | Browse forum discussions |
| `get_user_profile` | Get user profile information |
| `search_courses` | Search for courses by name |

## Example Prompts

Once configured, you can ask your AI assistant things like:

- "What courses am I enrolled in?"
- "What assignments are due this week?"
- "Show me my grades for [Course Name]"
- "What's the status of my assignment for [Assignment Name]?"
- "What are the upcoming deadlines?"
- "Show me the contents of [Course Name]"
- "Do I have any new notifications?"

## Deployment

### Running as a Service

You can run this MCP server on a remote machine and connect to it. Here's an example using Docker:

```dockerfile
FROM node:20-alpine
WORKDIR /app
COPY package*.json ./
RUN npm ci --only=production
COPY dist ./dist
ENV NODE_ENV=production
CMD ["node", "dist/index.js"]
```

### Environment Variables for Production

| Variable | Required | Description |
|----------|----------|-------------|
| `MOODLE_URL` | Yes | Your Moodle instance URL |
| `MOODLE_TOKEN` | Yes* | Security token from Moodle |
| `MOODLE_USERNAME` | No* | Username (if not using token) |
| `MOODLE_PASSWORD` | No* | Password (if not using token) |
| `MOODLE_SERVICE` | No | Web service name (default: `moodle_mobile_app`) |

*Either `MOODLE_TOKEN` or both `MOODLE_USERNAME` and `MOODLE_PASSWORD` are required.

## Troubleshooting

### "Invalid login" error
- For SSO/university Moodle: You must use a security token, not username/password
- Make sure the token hasn't expired
- Verify the MOODLE_URL is correct (no trailing slash)

### "Access denied" or "No permission" errors
- Some Moodle functions may be restricted by your institution
- Contact your IT department to enable the "Moodle mobile web service"

### Token not found in Preferences
- Security keys must be enabled by your Moodle administrator
- Check Site Administration → Plugins → Web services → Manage tokens
- Ask your IT department for help

### Cannot find courses or grades
- Make sure you're enrolled in the courses
- Some courses may be hidden or not yet started
- Verify your Moodle role has the necessary permissions

## API Reference

This server uses Moodle's Web Services REST API. Common functions used:

- `core_webservice_get_site_info` - Site information
- `core_enrol_get_users_courses` - User's courses
- `core_course_get_contents` - Course contents
- `mod_assign_get_assignments` - Assignments
- `mod_assign_get_submission_status` - Submission status
- `gradereport_user_get_grade_items` - Grades
- `core_calendar_get_action_events_by_timesort` - Calendar events
- `message_popup_get_popup_notifications` - Notifications

For full API documentation, see [Moodle Web Services API](https://docs.moodle.org/dev/Web_service_API_functions).

## Security Notes

- **Never commit your `.env` file** or expose your token publicly
- Tokens provide access to your Moodle account - treat them like passwords
- Consider using environment variables in production instead of config files
- The server only reads data - it cannot modify your courses or submissions

## Contributing

Contributions are welcome! Please feel free to submit a Pull Request.

1. Fork the repository
2. Create your feature branch (`git checkout -b feature/AmazingFeature`)
3. Commit your changes (`git commit -m 'Add some AmazingFeature'`)
4. Push to the branch (`git push origin feature/AmazingFeature`)
5. Open a Pull Request

## License

This project is licensed under the MIT License - see the [LICENSE](LICENSE) file for details.

## Browser-Based Access (Detailed)

For universities with web services disabled, here's the complete setup for browser-based Moodle access:

### Setup Steps

1. **Install Cursor Browser Extension**
   - Open Chrome or Edge
   - Go to `chrome://extensions` or `edge://extensions`
   - Enable "Developer mode"
   - Install the Cursor browser extension (check Cursor documentation)

2. **Log into Moodle**
   - Navigate to your Moodle site (e.g., `moodle.yourschool.edu`)
   - Complete SSO/login process
   - Stay logged in (don't close the browser)

3. **Use Natural Language in Cursor**
   - Ask: *"Get my courses from Moodle"*
   - Cursor will open your Moodle in the browser and extract info

### How It Works

```
┌─────────────┐     ┌──────────────────┐     ┌─────────────┐
│   Cursor    │────▶│ Browser Extension │────▶│   Moodle    │
│  (AI Chat)  │◀────│   (navigates)     │◀────│  (web page) │
└─────────────┘     └──────────────────┘     └─────────────┘
```

- Cursor controls your browser via the extension
- Navigates to Moodle pages and reads the content
- No API tokens required - uses your existing browser session

### Limitations

| Aspect | Browser Mode | API Mode (MCP Server) |
|--------|--------------|----------------------|
| Requires browser open | ✅ Yes | ❌ No |
| Works with SSO | ✅ Yes | ⚠️ Limited |
| Requires API tokens | ❌ No | ✅ Yes |
| Speed | Slower (page loads) | Faster (direct API) |
| Works offline | ❌ No | ❌ No |

### Troubleshooting Browser Mode

**"Not connected to Moodle"**
- Make sure you're logged into Moodle in your browser
- Check that the browser extension is active
- Try refreshing the Moodle page

**"Session expired"**
- Log back into Moodle
- University sessions typically expire after 2 hours of inactivity

**Browser not responding**
- Check if browser extension is installed and enabled
- Restart the browser
- Reload Cursor window (Ctrl+Shift+P → "Reload Window")

## Acknowledgments

- [Model Context Protocol](https://modelcontextprotocol.io/) by Anthropic
- [Moodle](https://moodle.org/) Learning Management System
- University of Louisiana at Lafayette for testing