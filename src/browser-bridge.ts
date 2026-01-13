/**
 * Browser Bridge - Two-way communication with browser extension
 * 
 * Enables the MCP server to send commands to the browser extension
 * and receive responses (page content, screenshots, etc.)
 */

import { WebSocketServer, WebSocket } from 'ws';
import { createServer, Server as HttpServer } from 'http';

// Command types that can be sent to the browser
export interface BrowserCommand {
  id: string;
  action: 'navigate' | 'click' | 'type' | 'extract' | 'screenshot' | 'get_element' | 'wait' | 'evaluate';
  params: Record<string, unknown>;
}

// Response from the browser extension
export interface BrowserResponse {
  id: string;
  success: boolean;
  data?: unknown;
  error?: string;
}

// Page data extracted from the browser
export interface PageData {
  url: string;
  title: string;
  html?: string;
  text?: string;
  elements?: ElementInfo[];
  screenshot?: string; // base64
}

export interface ElementInfo {
  selector: string;
  tag: string;
  text: string;
  href?: string;
  classes?: string[];
  id?: string;
}

type CommandResolver = {
  resolve: (response: BrowserResponse) => void;
  reject: (error: Error) => void;
  timeout: NodeJS.Timeout;
};

export class BrowserBridge {
  private wss: WebSocketServer | null = null;
  private httpServer: HttpServer | null = null;
  private clients: Set<WebSocket> = new Set();
  private pendingCommands: Map<string, CommandResolver> = new Map();
  private commandTimeout: number = 30000; // 30 seconds
  private port: number;
  private isRunning: boolean = false;

  constructor(port: number = 3848) {
    this.port = port;
  }

  /**
   * Start the WebSocket server
   */
  start(): Promise<void> {
    return new Promise((resolve, reject) => {
      try {
        this.httpServer = createServer();
        this.wss = new WebSocketServer({ server: this.httpServer });

        this.wss.on('connection', (ws: WebSocket) => {
          console.error('[BrowserBridge] Extension connected');
          this.clients.add(ws);

          ws.on('message', (data: Buffer) => {
            try {
              const response: BrowserResponse = JSON.parse(data.toString());
              this.handleResponse(response);
            } catch (e) {
              console.error('[BrowserBridge] Invalid message:', e);
            }
          });

          ws.on('close', () => {
            console.error('[BrowserBridge] Extension disconnected');
            this.clients.delete(ws);
          });

          ws.on('error', (error) => {
            console.error('[BrowserBridge] WebSocket error:', error);
            this.clients.delete(ws);
          });

          // Send a ping to confirm connection
          ws.send(JSON.stringify({ type: 'connected', message: 'MCP Server connected' }));
        });

        this.httpServer.listen(this.port, '127.0.0.1', () => {
          this.isRunning = true;
          console.error(`[BrowserBridge] WebSocket server listening on ws://127.0.0.1:${this.port}`);
          resolve();
        });

        this.httpServer.on('error', (err: NodeJS.ErrnoException) => {
          if (err.code === 'EADDRINUSE') {
            console.error(`[BrowserBridge] Port ${this.port} in use`);
          }
          reject(err);
        });
      } catch (e) {
        reject(e);
      }
    });
  }

  /**
   * Check if any browser extension is connected
   */
  isConnected(): boolean {
    return this.clients.size > 0;
  }

  /**
   * Get connection status
   */
  getStatus(): { running: boolean; connected: boolean; clientCount: number } {
    return {
      running: this.isRunning,
      connected: this.isConnected(),
      clientCount: this.clients.size,
    };
  }

  /**
   * Handle response from browser extension
   */
  private handleResponse(response: BrowserResponse): void {
    const pending = this.pendingCommands.get(response.id);
    if (pending) {
      clearTimeout(pending.timeout);
      this.pendingCommands.delete(response.id);
      pending.resolve(response);
    }
  }

  /**
   * Send a command to the browser and wait for response
   */
  async sendCommand(command: Omit<BrowserCommand, 'id'>): Promise<BrowserResponse> {
    if (!this.isConnected()) {
      return {
        id: '',
        success: false,
        error: 'No browser extension connected. Please install the extension and open a Moodle page.',
      };
    }

    const id = `cmd_${Date.now()}_${Math.random().toString(36).substr(2, 9)}`;
    const fullCommand: BrowserCommand = { ...command, id };

    return new Promise((resolve, reject) => {
      const timeout = setTimeout(() => {
        this.pendingCommands.delete(id);
        resolve({
          id,
          success: false,
          error: 'Command timed out. The browser may be unresponsive.',
        });
      }, this.commandTimeout);

      this.pendingCommands.set(id, { resolve, reject, timeout });

      // Send to all connected clients (usually just one)
      const message = JSON.stringify(fullCommand);
      for (const client of this.clients) {
        if (client.readyState === WebSocket.OPEN) {
          client.send(message);
        }
      }
    });
  }

  // ============================================================================
  // High-level browser commands
  // ============================================================================

  /**
   * Navigate to a URL
   */
  async navigate(url: string): Promise<BrowserResponse> {
    return this.sendCommand({
      action: 'navigate',
      params: { url },
    });
  }

  /**
   * Click an element by selector
   */
  async click(selector: string): Promise<BrowserResponse> {
    return this.sendCommand({
      action: 'click',
      params: { selector },
    });
  }

  /**
   * Type text into an element
   */
  async type(selector: string, text: string): Promise<BrowserResponse> {
    return this.sendCommand({
      action: 'type',
      params: { selector, text },
    });
  }

  /**
   * Extract page data
   */
  async extract(options: {
    includeHtml?: boolean;
    includeText?: boolean;
    selectors?: string[];
  } = {}): Promise<BrowserResponse> {
    return this.sendCommand({
      action: 'extract',
      params: options,
    });
  }

  /**
   * Get information about specific elements
   */
  async getElements(selector: string): Promise<BrowserResponse> {
    return this.sendCommand({
      action: 'get_element',
      params: { selector },
    });
  }

  /**
   * Take a screenshot
   */
  async screenshot(): Promise<BrowserResponse> {
    return this.sendCommand({
      action: 'screenshot',
      params: {},
    });
  }

  /**
   * Wait for an element or time
   */
  async wait(options: { selector?: string; timeout?: number }): Promise<BrowserResponse> {
    return this.sendCommand({
      action: 'wait',
      params: options,
    });
  }

  /**
   * Evaluate JavaScript in the browser context
   * Useful for complex DOM manipulations like setting Moodle editor content
   */
  async evaluate(script: string): Promise<BrowserResponse> {
    return this.sendCommand({
      action: 'evaluate',
      params: { script },
    });
  }

  /**
   * Stop the server
   */
  stop(): void {
    if (this.wss) {
      this.wss.close();
    }
    if (this.httpServer) {
      this.httpServer.close();
    }
    this.isRunning = false;
  }
}

// Singleton instance
let bridgeInstance: BrowserBridge | null = null;

export function getBrowserBridge(port?: number): BrowserBridge {
  if (!bridgeInstance) {
    bridgeInstance = new BrowserBridge(port);
  }
  return bridgeInstance;
}
