# OAuth 2.1 Provider for ChatGPT Integration

## Overview

This document outlines the plan to add OAuth 2.1 provider capabilities to the MCP server, enabling ChatGPT (and other OAuth 2.1 clients) to authenticate users and access MCP tools.

## Current Architecture

```
Browser Extension ──► MCP Server ──► Google OAuth (we are CLIENT)
                          │
                      API Key auth
```

## Target Architecture

```
Browser Extension ──► MCP Server ──► Google OAuth (user identity)
                          │
ChatGPT ─────────────────►│ (we are PROVIDER)
                          │
                     OAuth 2.1 auth
```

## Key Concepts

| Role | Current | New |
|------|---------|-----|
| **Google OAuth** | Authenticates users (identity) | Same — still used for user login |
| **API Keys** | Browser extension → MCP Server | Unchanged |
| **OAuth 2.1 Provider** | N/A | **NEW** — ChatGPT → MCP Server |

## OAuth 2.1 Requirements

ChatGPT requires OAuth 2.1 compliance, which mandates:

1. **Discovery endpoint** — `/.well-known/oauth-authorization-server`
2. **PKCE required** — All authorization requests must use code_challenge/code_verifier
3. **Authorization code flow only** — No implicit grant
4. **Refresh token rotation** — Each refresh returns a new refresh token

## Endpoints to Implement

| Endpoint | Method | Purpose |
|----------|--------|---------|
| `/.well-known/oauth-authorization-server` | GET | Discovery metadata |
| `/oauth/authorize` | GET | Login + consent screen |
| `/oauth/authorize` | POST | Handle consent decision |
| `/oauth/token` | POST | Exchange code for tokens |
| `/oauth/userinfo` | GET | Return user profile |
| `/oauth/revoke` | POST | Revoke tokens (optional) |

## Database Schema Additions

```sql
-- Authorization codes (short-lived, one-time use)
CREATE TABLE oauth_codes (
  code TEXT PRIMARY KEY,           -- hashed
  user_id INTEGER NOT NULL,
  client_id TEXT,                  -- optional, ChatGPT may not provide
  redirect_uri TEXT NOT NULL,
  scopes TEXT NOT NULL,
  code_challenge TEXT NOT NULL,    -- PKCE
  code_challenge_method TEXT NOT NULL,
  expires_at INTEGER NOT NULL,
  created_at INTEGER DEFAULT CURRENT_TIMESTAMP
);

-- Access tokens issued to OAuth clients (ChatGPT)
CREATE TABLE oauth_access_tokens (
  token TEXT PRIMARY KEY,          -- hashed
  user_id INTEGER NOT NULL,
  client_id TEXT,
  scopes TEXT NOT NULL,
  expires_at INTEGER NOT NULL,
  created_at INTEGER DEFAULT CURRENT_TIMESTAMP
);

-- Refresh tokens (for token rotation)
CREATE TABLE oauth_refresh_tokens (
  token TEXT PRIMARY KEY,          -- hashed
  user_id INTEGER NOT NULL,
  client_id TEXT,
  scopes TEXT NOT NULL,
  expires_at INTEGER NOT NULL,
  created_at INTEGER DEFAULT CURRENT_TIMESTAMP
);
```

## File Structure

```
server/src/
  oauth/                    ← NEW: OAuth 2.1 Provider
    index.ts               ← Hono router, mounts all oauth routes
    discovery.ts           ← /.well-known/oauth-authorization-server
    authorize.ts           ← /oauth/authorize (GET + POST)
    token.ts               ← /oauth/token
    userinfo.ts            ← /oauth/userinfo
    schema.ts              ← Drizzle schema for oauth tables
    utils.ts               ← Hash functions, token generation
  auth/                     ← Existing: Google OAuth Client
  routes/
    mcp.ts                  ← Update to accept OAuth tokens
```

## Authentication Flow

```
1. User clicks "Connect Moodle MCP" in ChatGPT
                    │
                    ▼
2. ChatGPT fetches /.well-known/oauth-authorization-server
   Learns endpoint URLs
                    │
                    ▼
3. ChatGPT redirects user to /oauth/authorize
   (with PKCE code_challenge)
                    │
                    ▼
4. MCP Server: Is user logged in?
   NO  → Redirect to Google OAuth → User logs in
   YES → Show consent screen
                    │
                    ▼
5. User clicks "Allow"
   MCP Server generates authorization code
   Redirects to ChatGPT with code
                    │
                    ▼
6. ChatGPT calls POST /oauth/token
   (with code + PKCE code_verifier)
                    │
                    ▼
7. MCP Server validates PKCE, issues access_token
                    │
                    ▼
8. ChatGPT calls MCP tools with Bearer token
   MCP Server validates token, executes tool
```

## Implementation Order

1. [x] Database schema (`server/src/oauth/schema.ts`)
2. [x] Utility functions (`server/src/oauth/utils.ts`)
3. [x] Discovery endpoint (`server/src/oauth/discovery.ts`)
4. [x] Authorization endpoint (`server/src/oauth/authorize.ts`)
5. [x] Token endpoint (`server/src/oauth/token.ts`)
6. [x] Userinfo endpoint (`server/src/oauth/userinfo.ts`)
7. [x] Mount routes in main app (`server/src/index.ts`)
8. [x] Update MCP auth to accept OAuth tokens (`server/src/routes/mcp.ts`)
9. [ ] Push schema to database (`npm run db:push`)
10. [ ] Deploy to Fly.io
11. [ ] Test with ChatGPT

## Local Testing

Two test scripts are available:

### Quick Token Test (No Browser Required)
```bash
cd server
npm run test:oauth
```
This creates a test user and OAuth token directly in the database, then tests the MCP endpoint.

### Full OAuth Flow Test (Browser Required)
```bash
cd server
npm run test:oauth-flow
```
This simulates the complete OAuth flow:
1. Run once to get authorization URL
2. Visit URL in browser, log in, approve
3. Run again with the authorization code to exchange for tokens

## Configuration

No new environment variables required — reuses existing:
- `SERVER_URL` — Base URL for discovery metadata
- `JWT_SECRET` — Can reuse for token signing (or generate separate)
- Database — Same Turso database

## Notes

- OAuth provider code is intentionally isolated in `server/src/oauth/` for potential future extraction to separate service
- Client ID/Secret are optional (ChatGPT uses PKCE as primary security)
- Google OAuth remains the user identity provider — OAuth 2.1 provider just issues tokens after Google auth
