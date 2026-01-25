// Configuration for the Moodle MCP hosted service

// Available servers - add more as needed
export const SERVERS = {
  production: {
    name: 'Production (Fly.io)',
    url: 'https://moodle-mcp-server.fly.dev',
    description: 'Main production server'
  },
  localhost: {
    name: 'Local Development',
    url: 'http://localhost:3000',
    description: 'For local testing'
  }
};

// Default server key
export const DEFAULT_SERVER = 'production';

// Get the currently selected server from storage (async)
export async function getSelectedServer() {
  const result = await chrome.storage.local.get(['selectedServer']);
  const serverKey = result.selectedServer || DEFAULT_SERVER;
  return SERVERS[serverKey] || SERVERS[DEFAULT_SERVER];
}

// Get server URL (async)
export async function getServerUrl() {
  const server = await getSelectedServer();
  return server.url;
}

// Get WebSocket URL (async)
export async function getWsUrl() {
  const serverUrl = await getServerUrl();
  return serverUrl.replace('https://', 'wss://').replace('http://', 'ws://') + '/ws';
}

// Set the selected server
export async function setSelectedServer(serverKey) {
  if (!SERVERS[serverKey]) {
    throw new Error(`Unknown server: ${serverKey}`);
  }
  await chrome.storage.local.set({ selectedServer: serverKey });
}

// Legacy exports for backwards compatibility (will use production by default)
// Note: background.js will need to be updated to use async functions
export const SERVER_URL = SERVERS[DEFAULT_SERVER].url;
export const WS_URL = SERVER_URL.replace('https://', 'wss://').replace('http://', 'ws://') + '/ws';
export const OAUTH_REDIRECT = SERVER_URL + '/auth/extension/callback';
