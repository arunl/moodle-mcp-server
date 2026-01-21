#!/usr/bin/env node
/**
 * MCP Remote - A stdio-to-HTTP bridge for remote MCP servers
 * 
 * This bridge allows MCP clients that use stdio transport (like Cursor, Claude Desktop)
 * to connect to remote MCP servers over HTTP.
 * 
 * Usage:
 *   MCP_SERVER_URL=https://your-server.com MCP_API_KEY=your-key npx mcp-remote
 * 
 * Or in Cursor's mcp.json:
 *   {
 *     "mcpServers": {
 *       "my-server": {
 *         "command": "npx",
 *         "args": ["mcp-remote"],
 *         "env": {
 *           "MCP_SERVER_URL": "https://your-server.com",
 *           "MCP_API_KEY": "your-api-key"
 *         }
 *       }
 *     }
 *   }
 */

import { createInterface } from 'readline';

const SERVER_URL = process.env.MCP_SERVER_URL;
const API_KEY = process.env.MCP_API_KEY || '';
const MCP_ENDPOINT = process.env.MCP_ENDPOINT || '/mcp';

// Debug logging (to stderr so it doesn't interfere with JSON-RPC on stdout)
const DEBUG = process.env.MCP_DEBUG === '1' || process.env.MCP_DEBUG === 'true';
const debug = (msg: string) => {
  if (DEBUG) {
    console.error(`[mcp-remote] ${msg}`);
  }
};

// Validate configuration
if (!SERVER_URL) {
  console.error('Error: MCP_SERVER_URL environment variable is required');
  console.error('');
  console.error('Usage:');
  console.error('  MCP_SERVER_URL=https://your-server.com MCP_API_KEY=your-key npx mcp-remote');
  console.error('');
  console.error('Environment variables:');
  console.error('  MCP_SERVER_URL  - The base URL of the MCP server (required)');
  console.error('  MCP_API_KEY     - API key for authentication (optional, but usually required)');
  console.error('  MCP_ENDPOINT    - The MCP endpoint path (default: /mcp)');
  console.error('  MCP_DEBUG       - Set to "1" to enable debug logging');
  process.exit(1);
}

debug(`Starting MCP Remote bridge`);
debug(`Server: ${SERVER_URL}${MCP_ENDPOINT}`);
debug(`API Key: ${API_KEY ? API_KEY.substring(0, 10) + '...' : '(none)'}`);

// Track pending requests to avoid exiting before they complete
let pendingRequests = 0;
let inputClosed = false;

function checkExit() {
  if (inputClosed && pendingRequests === 0) {
    debug('All requests complete, exiting');
    process.exit(0);
  }
}

async function handleRequest(line: string) {
  pendingRequests++;
  
  try {
    const request = JSON.parse(line);
    debug(`Request: method=${request.method}, id=${request.id}`);
    
    // Forward to the HTTP server
    const url = `${SERVER_URL}${MCP_ENDPOINT}`;
    const headers: Record<string, string> = {
      'Content-Type': 'application/json',
    };
    
    if (API_KEY) {
      headers['Authorization'] = `Bearer ${API_KEY}`;
    }
    
    const response = await fetch(url, {
      method: 'POST',
      headers,
      body: JSON.stringify(request),
    });
    
    if (!response.ok) {
      // Return JSON-RPC error for HTTP errors
      const errorResponse = {
        jsonrpc: '2.0',
        id: request.id,
        error: {
          code: -32000,
          message: `HTTP ${response.status}: ${response.statusText}`,
        },
      };
      process.stdout.write(JSON.stringify(errorResponse) + '\n');
      debug(`HTTP error: ${response.status} ${response.statusText}`);
    } else {
      const result = await response.json();
      process.stdout.write(JSON.stringify(result) + '\n');
      debug(`Response: ${JSON.stringify(result).substring(0, 100)}...`);
    }
  } catch (error) {
    // Return JSON-RPC error for network/parse errors
    const errorMessage = error instanceof Error ? error.message : 'Unknown error';
    debug(`Error: ${errorMessage}`);
    
    let requestId = null;
    try {
      requestId = JSON.parse(line).id;
    } catch {
      // Couldn't parse request ID
    }
    
    const errorResponse = {
      jsonrpc: '2.0',
      id: requestId,
      error: {
        code: -32603,
        message: errorMessage,
      },
    };
    process.stdout.write(JSON.stringify(errorResponse) + '\n');
  } finally {
    pendingRequests--;
    checkExit();
  }
}

// Set up readline for stdin
const rl = createInterface({
  input: process.stdin,
  terminal: false,
});

// Handle incoming JSON-RPC requests
rl.on('line', (line) => {
  handleRequest(line);
});

rl.on('close', () => {
  debug('Input stream closed');
  inputClosed = true;
  checkExit();
});

// Handle process signals gracefully
process.on('SIGINT', () => {
  debug('Received SIGINT, exiting');
  process.exit(0);
});

process.on('SIGTERM', () => {
  debug('Received SIGTERM, exiting');
  process.exit(0);
});
