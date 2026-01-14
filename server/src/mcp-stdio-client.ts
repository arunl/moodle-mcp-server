#!/usr/bin/env npx tsx
/**
 * MCP stdio-to-SSE bridge client
 * This allows Cursor to connect to the hosted MCP server via stdio transport
 */

import { createInterface } from 'readline';

const SERVER_URL = process.env.MCP_SERVER_URL || 'http://localhost:8080';
const API_KEY = process.env.MCP_API_KEY || '';

if (!API_KEY) {
  console.error('MCP_API_KEY environment variable is required');
  process.exit(1);
}

const rl = createInterface({
  input: process.stdin,
  terminal: false
});

// Handle incoming JSON-RPC requests from Cursor
rl.on('line', async (line) => {
  try {
    const request = JSON.parse(line);
    
    // Forward to the HTTP server
    const response = await fetch(`${SERVER_URL}/mcp`, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        'Authorization': `Bearer ${API_KEY}`
      },
      body: JSON.stringify(request)
    });
    
    const result = await response.json();
    
    // Send response back to Cursor
    console.log(JSON.stringify(result));
  } catch (error) {
    // Send error response
    const errorResponse = {
      jsonrpc: '2.0',
      id: null,
      error: {
        code: -32603,
        message: error instanceof Error ? error.message : 'Internal error'
      }
    };
    console.log(JSON.stringify(errorResponse));
  }
});

rl.on('close', () => {
  process.exit(0);
});
