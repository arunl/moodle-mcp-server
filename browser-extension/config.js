// Configuration for the Moodle MCP hosted service
// Uncomment ONE of the following SERVER_URL lines:

// Local development:
// export const SERVER_URL = 'http://localhost:3000';

// Production (Fly.io):
export const SERVER_URL = 'https://moodle-mcp-server.fly.dev';

// Custom domain (future):
// export const SERVER_URL = 'https://mcpconnector.io';
// WebSocket URL for browser bridge
export const WS_URL = SERVER_URL.replace('https://', 'wss://').replace('http://', 'ws://') + '/ws';

// OAuth redirect URL
export const OAUTH_REDIRECT = SERVER_URL + '/auth/extension/callback';
