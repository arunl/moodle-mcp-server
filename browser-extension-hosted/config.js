// Configuration for the Moodle MCP hosted service
// Change this URL when deploying to production
export const SERVER_URL = 'https://moodle-mcp.example.com';

// WebSocket URL for browser bridge
export const WS_URL = SERVER_URL.replace('https://', 'wss://').replace('http://', 'ws://') + '/ws';

// OAuth redirect URL
export const OAUTH_REDIRECT = SERVER_URL + '/auth/extension/callback';
