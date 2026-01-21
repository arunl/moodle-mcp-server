#!/usr/bin/env npx tsx
/**
 * MCP stdio-to-SSE bridge client
 * This allows Cursor to connect to the hosted MCP server via stdio transport
 */

import { createInterface } from 'readline';

const SERVER_URL = process.env.MCP_SERVER_URL || 'http://localhost:8080';
const API_KEY = process.env.MCP_API_KEY || '';

// Debug: log to stderr so it doesn't interfere with JSON-RPC stdout
const debug = (msg: string) => {
  if (process.env.MCP_DEBUG) {
    console.error(`[mcp-stdio] ${msg}`);
  }
};

debug(`Starting stdio client, SERVER_URL=${SERVER_URL}`);

if (!API_KEY) {
  console.error('MCP_API_KEY environment variable is required');
  process.exit(1);
}

debug(`API_KEY present: ${API_KEY.substring(0, 10)}...`);

// Track pending requests to avoid exiting prematurely
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
  debug(`Received line: ${line.substring(0, 100)}...`);
  
  try {
    const request = JSON.parse(line);
    debug(`Parsed request: method=${request.method}, id=${request.id}`);
    
    // Forward to the HTTP server
    debug(`Forwarding to ${SERVER_URL}/mcp`);
    const response = await fetch(`${SERVER_URL}/mcp`, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        'Authorization': `Bearer ${API_KEY}`
      },
      body: JSON.stringify(request)
    });
    
    debug(`Got response: status=${response.status}`);
    const result = await response.json();
    debug(`Response JSON: ${JSON.stringify(result).substring(0, 200)}...`);
    
    // Send response back to Cursor via stdout
    const output = JSON.stringify(result);
    process.stdout.write(output + '\n');
    debug(`Wrote to stdout: ${output.substring(0, 100)}...`);
  } catch (error) {
    debug(`Error: ${error}`);
    // Send error response
    const errorResponse = {
      jsonrpc: '2.0',
      id: null,
      error: {
        code: -32603,
        message: error instanceof Error ? error.message : 'Internal error'
      }
    };
    process.stdout.write(JSON.stringify(errorResponse) + '\n');
  } finally {
    pendingRequests--;
    checkExit();
  }
}

const rl = createInterface({
  input: process.stdin,
  terminal: false
});

// Handle incoming JSON-RPC requests from Cursor
rl.on('line', (line) => {
  // Fire off the async handler without awaiting (to allow multiple concurrent requests)
  handleRequest(line);
});

rl.on('close', () => {
  debug('Input closed');
  inputClosed = true;
  checkExit();
});
