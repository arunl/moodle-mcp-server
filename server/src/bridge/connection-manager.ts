import { WebSocket } from 'ws';
import { verifyToken } from '../auth/jwt.js';

interface BrowserConnection {
  ws: WebSocket;
  userId: string;
  email: string;
  moodleUrl?: string;
  connectedAt: Date;
  lastPingAt: Date;
}

interface PendingCommand {
  resolve: (response: any) => void;
  reject: (error: Error) => void;
  timeout: NodeJS.Timeout;
}

// Manages WebSocket connections from browser extensions
export class ConnectionManager {
  // Map of user ID to their browser connection
  private connections = new Map<string, BrowserConnection>();
  
  // Map of command ID to pending promise resolvers
  private pendingCommands = new Map<string, PendingCommand>();
  
  // Command timeout in milliseconds
  private commandTimeout = 30000;

  // Add a new browser connection
  async addConnection(ws: WebSocket, token: string): Promise<{ userId: string; email: string } | null> {
    try {
      const payload = await verifyToken(token);
      
      if (payload.type !== 'access') {
        console.error('[ConnectionManager] Invalid token type:', payload.type);
        return null;
      }

      // Close existing connection for this user if any
      const existing = this.connections.get(payload.sub);
      if (existing) {
        console.log(`[ConnectionManager] Closing existing connection for user ${payload.sub}`);
        existing.ws.close(1000, 'New connection established');
      }

      const connection: BrowserConnection = {
        ws,
        userId: payload.sub,
        email: payload.email,
        connectedAt: new Date(),
        lastPingAt: new Date(),
      };

      this.connections.set(payload.sub, connection);
      console.log(`[ConnectionManager] User ${payload.email} connected (total: ${this.connections.size})`);

      // Set up message handler
      ws.on('message', (data) => this.handleMessage(payload.sub, data.toString()));
      ws.on('close', () => this.removeConnection(payload.sub));
      ws.on('error', (error) => {
        console.error(`[ConnectionManager] WebSocket error for user ${payload.sub}:`, error);
      });

      return { userId: payload.sub, email: payload.email };
    } catch (error) {
      console.error('[ConnectionManager] Auth error:', error);
      return null;
    }
  }

  // Remove a connection
  removeConnection(userId: string): void {
    const connection = this.connections.get(userId);
    if (connection) {
      this.connections.delete(userId);
      console.log(`[ConnectionManager] User ${connection.email} disconnected (total: ${this.connections.size})`);
    }
  }

  // Check if a user has an active browser connection
  isUserConnected(userId: string): boolean {
    const connection = this.connections.get(userId);
    return connection !== undefined && connection.ws.readyState === WebSocket.OPEN;
  }

  // Update connection metadata
  updateConnectionMeta(userId: string, meta: { moodleUrl?: string }): void {
    const connection = this.connections.get(userId);
    if (connection) {
      if (meta.moodleUrl) connection.moodleUrl = meta.moodleUrl;
      connection.lastPingAt = new Date();
    }
  }

  // Send a command to a user's browser and wait for response
  async sendCommand(userId: string, command: BrowserCommand): Promise<any> {
    const connection = this.connections.get(userId);
    
    if (!connection || connection.ws.readyState !== WebSocket.OPEN) {
      throw new Error('Browser extension not connected. Please ensure the extension is running and logged in.');
    }

    return new Promise((resolve, reject) => {
      const timeout = setTimeout(() => {
        this.pendingCommands.delete(command.id);
        reject(new Error(`Command ${command.action} timed out after ${this.commandTimeout}ms`));
      }, this.commandTimeout);

      this.pendingCommands.set(command.id, { resolve, reject, timeout });
      
      connection.ws.send(JSON.stringify(command));
    });
  }

  // Handle incoming message from browser
  private handleMessage(userId: string, data: string): void {
    try {
      const message = JSON.parse(data);
      
      // Handle command responses
      if (message.id && this.pendingCommands.has(message.id)) {
        const pending = this.pendingCommands.get(message.id)!;
        clearTimeout(pending.timeout);
        this.pendingCommands.delete(message.id);
        
        if (message.success) {
          pending.resolve(message.data);
        } else {
          pending.reject(new Error(message.error || 'Command failed'));
        }
        return;
      }

      // Handle status updates
      if (message.type === 'status') {
        this.updateConnectionMeta(userId, { moodleUrl: message.moodleUrl });
        return;
      }

      // Handle ping
      if (message.type === 'ping') {
        const connection = this.connections.get(userId);
        if (connection) {
          connection.lastPingAt = new Date();
          connection.ws.send(JSON.stringify({ type: 'pong' }));
        }
        return;
      }

      console.log(`[ConnectionManager] Unknown message from user ${userId}:`, message);
    } catch (error) {
      console.error(`[ConnectionManager] Error parsing message from user ${userId}:`, error);
    }
  }

  // Get connection stats
  getStats(): { totalConnections: number; users: Array<{ email: string; moodleUrl?: string; connectedAt: Date }> } {
    const users = Array.from(this.connections.values()).map((c) => ({
      email: c.email,
      moodleUrl: c.moodleUrl,
      connectedAt: c.connectedAt,
    }));
    
    return {
      totalConnections: this.connections.size,
      users,
    };
  }
}

// Browser command interface
export interface BrowserCommand {
  id: string;
  action: 
    | 'navigate' | 'click' | 'type' | 'extract' | 'screenshot' | 'evaluate' | 'wait'
    // Moodle-specific extraction actions (CSP-safe, no eval)
    | 'extract_participants' | 'extract_editing_status' | 'extract_addable_sections' 
    | 'extract_forum_discussions' | 'extract_course_sections'
    // Assignment extraction actions
    | 'extract_assignments' | 'extract_assignment_details' | 'extract_submissions'
    // Editor and form actions
    | 'setEditor' | 'set_moodle_date';
  params: Record<string, unknown>;
}

// Singleton instance
export const connectionManager = new ConnectionManager();
