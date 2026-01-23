# Moodle MCP - Hosted Service Architecture

## Overview

The hosted Moodle MCP service allows anyone with a Moodle account to use AI assistants (Claude, ChatGPT, Cursor, etc.) to interact with their Moodle courses without running any local server.

```
┌─────────────────────────────────────────────────────────────────────────────┐
│                              USER'S MACHINE                                  │
├─────────────────────────────────────────────────────────────────────────────┤
│  ┌──────────────────┐         ┌──────────────────────────────────────────┐  │
│  │   AI Chat Client │         │           Browser (Chrome/Edge)          │  │
│  │  (Claude, GPT,   │         │  ┌────────────────────────────────────┐  │  │
│  │   Cursor, etc.)  │         │  │         Moodle Website             │  │  │
│  │                  │         │  │    (moodle.university.edu)         │  │  │
│  │  Configured with │         │  └────────────────────────────────────┘  │  │
│  │  MCP endpoint +  │         │  ┌────────────────────────────────────┐  │  │
│  │  User API Key    │         │  │    Moodle MCP Browser Extension    │  │  │
│  └────────┬─────────┘         │  │    (logged in with user account)   │  │  │
│           │                   │  └──────────────┬─────────────────────┘  │  │
│           │                   │                 │                        │  │
└───────────┼───────────────────┼─────────────────┼────────────────────────┘  │
            │                   │                 │                            
            │ MCP Protocol      │                 │ WebSocket (WSS)            
            │ (HTTP+SSE)        │                 │                            
            │                   │                 │                            
┌───────────┼───────────────────┼─────────────────┼────────────────────────────┐
│           ▼                   │                 ▼           CLOUD SERVER     │
│  ┌─────────────────────────────────────────────────────────────────────┐    │
│  │                     Moodle MCP Hosted Service                       │    │
│  │                     (moodle-mcp.example.com)                        │    │
│  │  ┌─────────────────┐  ┌─────────────────┐  ┌─────────────────────┐ │    │
│  │  │   MCP Server    │  │   User/Session  │  │   Browser Bridge    │ │    │
│  │  │  (HTTP+SSE)     │◄─┤    Manager      ├─►│    (WebSocket)      │ │    │
│  │  │                 │  │                 │  │                     │ │    │
│  │  │ Validates API   │  │ Maps API keys   │  │ Routes commands to  │ │    │
│  │  │ keys, routes    │  │ to browser      │  │ correct user's      │ │    │
│  │  │ tool calls      │  │ connections     │  │ browser extension   │ │    │
│  │  └─────────────────┘  └────────┬────────┘  └─────────────────────┘ │    │
│  │                                │                                    │    │
│  │                       ┌────────▼────────┐                          │    │
│  │                       │    Database     │                          │    │
│  │                       │  (PostgreSQL)   │                          │    │
│  │                       │                 │                          │    │
│  │                       │ • Users         │                          │    │
│  │                       │ • API Keys      │                          │    │
│  │                       │ • Sessions      │                          │    │
│  │                       └─────────────────┘                          │    │
│  └─────────────────────────────────────────────────────────────────────┘    │
│                                                                              │
│  ┌─────────────────────────────────────────────────────────────────────┐    │
│  │                        Web Portal                                    │    │
│  │                   (moodle-mcp.example.com)                          │    │
│  │                                                                      │    │
│  │  • Google OAuth / SSO Login                                         │    │
│  │  • API Key Management                                               │    │
│  │  • MCP Configuration Generator                                      │    │
│  │  • Extension Download Links                                         │    │
│  │  • Documentation                                                    │    │
│  └─────────────────────────────────────────────────────────────────────┘    │
└──────────────────────────────────────────────────────────────────────────────┘
```

## User Flow

### 1. Registration
1. User visits `moodle-mcp.example.com`
2. Clicks "Sign in with Google" (or other SSO)
3. Account is created, API key is generated
4. User sees their API key and MCP configuration

### 2. Browser Extension Setup
1. User installs the Moodle MCP browser extension
2. Opens extension popup, clicks "Login"
3. Logs in with same Google account
4. Extension connects to hosted WebSocket server
5. Extension shows "Connected" status

### 3. AI Client Configuration
User adds to their MCP client configuration:

```json
{
  "mcpServers": {
    "moodle": {
      "url": "https://moodle-mcp.example.com/mcp",
      "headers": {
        "Authorization": "Bearer <USER_API_KEY>"
      }
    }
  }
}
```

### 4. Using the Service
1. User logs into their Moodle in the browser
2. User asks AI assistant: "Show me my Moodle courses"
3. AI client sends MCP request to hosted server
4. Server validates API key, finds user's browser connection
5. Server sends command to browser extension via WebSocket
6. Extension performs action in Moodle, returns result
7. Server returns result to AI client

## Security Model

### No Secrets on Server
- Server never stores Moodle credentials
- Server never sees Moodle session cookies
- All Moodle interactions happen in user's browser
- Server only routes commands, doesn't execute them

### Authentication Layers
1. **MCP Client → Server**: API key in Authorization header
2. **Browser Extension → Server**: JWT token from OAuth
3. **Browser → Moodle**: User's own session (never leaves browser)

### Data Privacy
- Server only stores: email, name (from OAuth), API keys
- No Moodle data is stored on server
- All Moodle data flows directly: Browser ↔ Server ↔ AI Client

## Technical Components

### 1. Web Portal (`/server/web/`)
- **Framework**: Next.js or SvelteKit
- **Auth**: NextAuth.js / Auth.js with Google provider
- **Features**:
  - Landing page with value proposition
  - OAuth login flow
  - Dashboard with API key management
  - MCP configuration generator
  - Extension download links

### 2. MCP Server (`/server/mcp/`)
- **Transport**: HTTP + Server-Sent Events (SSE)
- **Endpoints**:
  - `POST /mcp` - MCP JSON-RPC requests
  - `GET /mcp/sse` - Server-Sent Events stream
- **Authentication**: Bearer token (API key)

### 3. Browser Bridge (`/server/bridge/`)
- **Protocol**: WebSocket (WSS)
- **Authentication**: JWT from OAuth
- **Connection Management**: Map user IDs to WebSocket connections

### 4. Database Schema
```sql
-- Users table
CREATE TABLE users (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  email VARCHAR(255) UNIQUE NOT NULL,
  name VARCHAR(255),
  picture VARCHAR(500),
  created_at TIMESTAMP DEFAULT NOW(),
  updated_at TIMESTAMP DEFAULT NOW()
);

-- API Keys table
CREATE TABLE api_keys (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id UUID REFERENCES users(id) ON DELETE CASCADE,
  key_hash VARCHAR(64) NOT NULL, -- SHA-256 hash of the key
  key_prefix VARCHAR(8) NOT NULL, -- First 8 chars for display
  name VARCHAR(100) DEFAULT 'Default',
  created_at TIMESTAMP DEFAULT NOW(),
  last_used_at TIMESTAMP,
  revoked_at TIMESTAMP
);

-- Browser Sessions table (for WebSocket connections)
CREATE TABLE browser_sessions (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id UUID REFERENCES users(id) ON DELETE CASCADE,
  connected_at TIMESTAMP DEFAULT NOW(),
  last_ping_at TIMESTAMP,
  user_agent VARCHAR(500),
  moodle_url VARCHAR(500)
);
```

### 5. Updated Browser Extension
Changes from local version:
- Add login UI (OAuth popup)
- Store JWT token
- Connect to hosted WSS endpoint instead of localhost
- Include auth token in WebSocket connection

## Directory Structure

```
moodle-mcp/
├── server/                    # Hosted service
│   ├── web/                   # Web portal (Next.js)
│   │   ├── app/
│   │   │   ├── page.tsx       # Landing page
│   │   │   ├── dashboard/     # User dashboard
│   │   │   └── api/
│   │   │       ├── auth/      # NextAuth routes
│   │   │       └── keys/      # API key management
│   │   └── components/
│   ├── mcp/                   # MCP HTTP+SSE server
│   │   └── index.ts
│   ├── bridge/                # WebSocket bridge
│   │   └── index.ts
│   ├── db/                    # Database
│   │   ├── schema.sql
│   │   └── client.ts
│   └── shared/                # Shared utilities
│       ├── auth.ts
│       └── types.ts
├── browser-extension/         # Updated extension
│   ├── manifest.json
│   ├── background.js
│   ├── auth.js               # OAuth handling
│   └── popup.html            # Updated with login
├── src/                       # Original local MCP (kept for reference)
└── docs/
    ├── HOSTED-SERVICE-ARCHITECTURE.md
    └── SETUP-GUIDE.md
```

## MCP Registry / Marketplace

### Smithery (smithery.ai)
Create `smithery.yaml`:
```yaml
name: moodle-mcp
title: Moodle MCP Server
description: Interact with any Moodle LMS through AI assistants
author: Your Name
repository: https://github.com/yourusername/moodle-mcp
transport: sse
endpoint: https://moodle-mcp.example.com/mcp
auth:
  type: bearer
  header: Authorization
```

### MCP Hub
Submit to: https://github.com/modelcontextprotocol/servers

## Deployment Options

### Option 1: Vercel + Supabase
- Web portal: Vercel (Next.js)
- Database: Supabase PostgreSQL
- WebSocket: Vercel Functions or separate service

### Option 2: Railway
- All-in-one deployment
- PostgreSQL included
- WebSocket support

### Option 3: Fly.io
- Global edge deployment
- Built-in PostgreSQL
- Native WebSocket support

## Environment Variables

```env
# Database
DATABASE_URL=postgresql://...

# Auth
GOOGLE_CLIENT_ID=...
GOOGLE_CLIENT_SECRET=...
NEXTAUTH_SECRET=...
NEXTAUTH_URL=https://moodle-mcp.example.com

# Server
MCP_SERVER_URL=https://moodle-mcp.example.com
WEBSOCKET_URL=wss://moodle-mcp.example.com/ws
```

## Rate Limiting

- API requests: 100/minute per user
- WebSocket messages: 60/minute per connection
- API key generation: 5 keys per user

## Monitoring

- Connection status dashboard
- Request/response logging
- Error tracking (Sentry)
- Usage analytics
