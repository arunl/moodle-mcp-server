import { Hono } from 'hono';
import { cors } from 'hono/cors';
import { logger } from 'hono/logger';
import { getCookie, deleteCookie } from 'hono/cookie';
import { serve } from '@hono/node-server';
import { createNodeWebSocket } from '@hono/node-ws';
import authRoutes from './routes/auth.js';
import apiRoutes from './routes/api.js';
import mcpRoutes from './routes/mcp.js';
import oauthRoutes from './oauth/index.js';
import fileRoutes from './routes/files.js';
import { connectionManager } from './bridge/connection-manager.js';
import { verifyToken } from './auth/jwt.js';
import { db, users } from './db/index.js';
import { eq } from 'drizzle-orm';
import { versionInfo, getVersionDetails, getVersionString, versionFooterCss } from './version.js';

// Type declarations for Hono context variables
declare module 'hono' {
  interface ContextVariableMap {
    userId: string;
    userEmail: string;
  }
}

const app = new Hono();

// Create WebSocket handler
const { injectWebSocket, upgradeWebSocket } = createNodeWebSocket({ app });

// Middleware
app.use('*', logger());
app.use(
  '*',
  cors({
    origin: process.env.CORS_ORIGIN?.split(',') || ['http://localhost:3000'],
    credentials: true,
  })
);

// Health check
app.get('/health', (c) => {
  const stats = connectionManager.getStats();
  return c.json({
    status: 'ok',
    version: versionInfo.version,
    commit: versionInfo.commit,
    connections: stats.totalConnections,
    mode: versionInfo.environment,
  });
});

// Version endpoint - detailed version information
app.get('/version', (c) => {
  return c.json(getVersionDetails());
});

// Development mode endpoints (only available when NODE_ENV === 'development')
if (process.env.NODE_ENV === 'development') {
  const { createAccessToken, generateApiKey, hashApiKey } = await import('./auth/jwt.js');
  const { db, users, apiKeys } = await import('./db/index.js');
  const { eq } = await import('drizzle-orm');

  // Dev page - simple UI for testing
  app.get('/dev', (c) => {
    const port = process.env.PORT || '3000';
    return c.html(`
<!DOCTYPE html>
<html>
<head>
  <title>Dev Mode - MCP Connector</title>
  <style>
    body { font-family: system-ui; background: #0a0a0f; color: #f0f0f5; padding: 2rem; max-width: 700px; margin: 0 auto; }
    h1 { color: #ff6b35; }
    .card { background: #1a1a24; padding: 1.5rem; border-radius: 12px; margin: 1rem 0; }
    button { background: linear-gradient(135deg, #ff6b35, #ff8c5a); color: white; border: none; padding: 0.75rem 1.5rem; border-radius: 8px; cursor: pointer; font-size: 1rem; margin: 0.5rem 0.5rem 0.5rem 0; }
    button:hover { transform: translateY(-2px); }
    button.copy-btn { background: #2a2a3a; padding: 0.5rem 1rem; font-size: 0.85rem; }
    button.copy-btn:hover { background: #3a3a4a; }
    button.copy-btn.copied { background: #10b981; }
    pre { background: #12121a; padding: 1rem; border-radius: 8px; overflow-x: auto; font-size: 0.85rem; position: relative; }
    .success { color: #10b981; }
    .label { color: #a0a0b0; font-size: 0.875rem; margin-bottom: 0.5rem; }
    .copyable { display: flex; align-items: center; gap: 0.5rem; margin: 0.5rem 0; }
    .copyable code { background: #12121a; padding: 0.5rem 1rem; border-radius: 6px; font-family: 'JetBrains Mono', monospace; font-size: 0.85rem; flex: 1; word-break: break-all; border: 1px solid #2a2a3a; }
    #result { margin-top: 1rem; }
  </style>
</head>
<body>
  <h1>🔧 Dev Mode</h1>
  <p>Test the MCP Connector without Google OAuth</p>
  
  <div class="card">
    <h3>Step 1: Create Test User</h3>
    <button onclick="devLogin()">Create Dev User & Get Token</button>
    <div id="login-result"></div>
  </div>
  
  <div class="card">
    <h3>Step 2: Generate API Key</h3>
    <button onclick="getApiKey()">Generate API Key</button>
    <div id="key-result"></div>
  </div>
  
  <div class="card">
    <h3>Step 3: Use in MCP Config</h3>
    <p class="label">Add to <code>.cursor/mcp.json</code> in your project:</p>
    <pre id="config-template">{
  "mcpServers": {
    "moodle-local": {
      "command": "npx",
      "args": ["tsx", "path/to/mcp-remote/src/index.ts"],
      "env": {
        "MCP_SERVER_URL": "http://localhost:${port}",
        "MCP_API_KEY": "YOUR_API_KEY"
      }
    }
  }
}</pre>
    <button class="copy-btn" onclick="copyConfig()">📋 Copy Config</button>
  </div>

  <script>
    let currentToken = '';
    let currentApiKey = '';
    
    function copyToClipboard(text, btn) {
      navigator.clipboard.writeText(text).then(() => {
        const original = btn.textContent;
        btn.textContent = '✅ Copied!';
        btn.classList.add('copied');
        setTimeout(() => {
          btn.textContent = original;
          btn.classList.remove('copied');
        }, 2000);
      });
    }
    
    async function devLogin() {
      const res = await fetch('/dev/login', { method: 'POST' });
      const data = await res.json();
      currentToken = data.accessToken;
      document.getElementById('login-result').innerHTML = 
        '<p class="success">✅ ' + data.message + '</p>' +
        '<p class="label">User: ' + data.user.email + '</p>' +
        '<p class="label">Token (for browser extension):</p>' +
        '<div class="copyable"><code id="token-value">' + data.accessToken + '</code>' +
        '<button class="copy-btn" onclick="copyToClipboard(currentToken, this)">📋 Copy</button></div>';
    }
    
    async function getApiKey() {
      const res = await fetch('/dev/api-key', { method: 'POST' });
      const data = await res.json();
      if (data.error) {
        document.getElementById('key-result').innerHTML = '<p style="color:#ef4444">❌ ' + data.error + '</p>';
        return;
      }
      currentApiKey = data.apiKey;
      document.getElementById('key-result').innerHTML = 
        '<p class="success">✅ ' + data.message + '</p>' +
        '<p class="label">API Key (for MCP config):</p>' +
        '<div class="copyable"><code id="key-value">' + data.apiKey + '</code>' +
        '<button class="copy-btn" onclick="copyToClipboard(currentApiKey, this)">📋 Copy</button></div>';
      
      // Update config template with the actual key
      updateConfigTemplate();
    }
    
    function updateConfigTemplate() {
      const config = {
        mcpServers: {
          "moodle-local": {
            command: "npx",
            args: ["tsx", "path/to/mcp-remote/src/index.ts"],
            env: {
              MCP_SERVER_URL: "http://localhost:${port}",
              MCP_API_KEY: currentApiKey || "YOUR_API_KEY"
            }
          }
        }
      };
      document.getElementById('config-template').textContent = JSON.stringify(config, null, 2);
    }
    
    function copyConfig() {
      const configText = document.getElementById('config-template').textContent;
      copyToClipboard(configText, event.target);
    }
  </script>
</body>
</html>
    `);
  });

  // Dev login - creates a test user and returns tokens
  app.post('/dev/login', async (c) => {
    const testUserId = 'dev-user-001';
    const testEmail = 'dev@localhost';
    
    // Check if test user exists
    let [user] = await db.select().from(users).where(eq(users.id, testUserId));
    
    if (!user) {
      // Create test user
      [user] = await db.insert(users).values({
        id: testUserId,
        email: testEmail,
        name: 'Dev User',
        googleId: 'dev-google-id',
      }).returning();
      console.log('[Dev] Created test user:', testEmail);
    }
    
    // Generate tokens
    const accessToken = await createAccessToken(user.id, user.email, user.name || undefined);
    
    return c.json({
      message: 'Dev login successful',
      user: { id: user.id, email: user.email, name: user.name },
      accessToken,
      instructions: 'Use this token in Authorization header or set as cookie',
    });
  });

  // Dev API key - generates an API key for the test user
  app.post('/dev/api-key', async (c) => {
    const testUserId = 'dev-user-001';
    
    // Check if test user exists
    const [user] = await db.select().from(users).where(eq(users.id, testUserId));
    if (!user) {
      return c.json({ error: 'Run /dev/login first to create test user' }, 400);
    }
    
    // Generate API key
    const key = generateApiKey();
    const keyHash = await hashApiKey(key);
    const keyPrefix = key.substring(0, 12);
    
    await db.insert(apiKeys).values({
      userId: testUserId,
      keyHash,
      keyPrefix,
      name: 'Dev Key',
    });
    
    return c.json({
      message: 'Dev API key created',
      apiKey: key,
      keyPrefix,
      instructions: 'Use in MCP config: Authorization: Bearer ' + key,
    });
  });

  console.log('🔧 Dev mode enabled: /dev/login and /dev/api-key available');
}

// Auth routes
app.route('/auth', authRoutes);

// API routes (requires auth)
app.route('/api', apiRoutes);

// File download routes (for unmasked file downloads)
app.route('/files', fileRoutes);

// MCP routes
app.route('/mcp', mcpRoutes);

// Also mount MCP at root for clients that expect it there (e.g., ChatGPT)
app.route('', mcpRoutes);

// OAuth 2.1 Provider routes (for ChatGPT integration)
// Mounts /.well-known/oauth-authorization-server and /oauth/*
app.route('', oauthRoutes);

// WebSocket endpoint for browser extensions
app.get(
  '/ws',
  upgradeWebSocket((c) => {
    return {
      onOpen: async (evt, ws) => {
        console.log('[WebSocket] New connection');
      },
      
      onMessage: async (evt, ws) => {
        try {
          const message = JSON.parse(evt.data.toString());
          
          // Handle authentication message
          if (message.type === 'auth') {
            const result = await connectionManager.addConnection(
              ws.raw as any, // Cast to ws.WebSocket
              message.token
            );
            
            if (result) {
              ws.send(JSON.stringify({
                type: 'auth_success',
                userId: result.userId,
                email: result.email,
              }));
            } else {
              ws.send(JSON.stringify({
                type: 'auth_error',
                error: 'Invalid or expired token',
              }));
              ws.close(1008, 'Authentication failed');
            }
            return;
          }
          
          // Other messages are handled by connectionManager
        } catch (error) {
          console.error('[WebSocket] Message error:', error);
        }
      },
      
      onClose: (evt, ws) => {
        console.log('[WebSocket] Connection closed');
      },
      
      onError: (evt, ws) => {
        console.error('[WebSocket] Error:', evt);
      },
    };
  })
);

// Check environment configuration
const isDevMode = process.env.NODE_ENV === 'development';
const hasGoogleOAuth = !!(process.env.GOOGLE_CLIENT_ID && process.env.GOOGLE_CLIENT_SECRET);

// ============================================================================
// SHARED UI COMPONENTS
// ============================================================================

const sharedStyles = `
  :root {
    --bg-primary: #0a0a0f;
    --bg-secondary: #12121a;
    --bg-card: #1a1a24;
    --bg-sidebar: #0f0f14;
    --text-primary: #f0f0f5;
    --text-secondary: #a0a0b0;
    --text-muted: #6b7280;
    --accent: #ff6b35;
    --accent-hover: #ff8c5a;
    --accent-secondary: #f7c948;
    --success: #10b981;
    --danger: #ef4444;
    --info: #3b82f6;
    --border: rgba(255,255,255,0.08);
    --border-hover: rgba(255,255,255,0.15);
  }
  
  * { margin: 0; padding: 0; box-sizing: border-box; }
  
  body {
    font-family: 'Inter', -apple-system, BlinkMacSystemFont, 'Segoe UI', sans-serif;
    background: var(--bg-primary);
    color: var(--text-primary);
    min-height: 100vh;
    line-height: 1.6;
  }
  
  a { color: var(--accent); text-decoration: none; }
  a:hover { color: var(--accent-hover); }
  
  code {
    font-family: 'JetBrains Mono', 'SF Mono', Monaco, monospace;
    background: var(--bg-secondary);
    padding: 0.15rem 0.4rem;
    border-radius: 4px;
    font-size: 0.85em;
  }
  
  /* ========== HEADER ========== */
  .header {
    position: fixed;
    top: 0;
    left: 0;
    right: 0;
    height: 60px;
    background: var(--bg-secondary);
    border-bottom: 1px solid var(--border);
    display: flex;
    align-items: center;
    justify-content: space-between;
    padding: 0 1.5rem;
    z-index: 100;
  }
  
  .header-left {
    display: flex;
    align-items: center;
    gap: 2rem;
  }
  
  .logo {
    font-size: 1.25rem;
    font-weight: 700;
    display: flex;
    align-items: center;
    gap: 0.5rem;
    color: var(--text-primary);
  }
  
  .logo span { color: var(--accent); }
  
  .header-right {
    display: flex;
    align-items: center;
    gap: 1rem;
  }
  
  .browser-status {
    display: flex;
    align-items: center;
    gap: 0.5rem;
    padding: 0.4rem 0.75rem;
    border-radius: 100px;
    font-size: 0.8rem;
    font-weight: 500;
  }
  
  .browser-status.connected {
    background: rgba(16, 185, 129, 0.15);
    color: var(--success);
  }
  
  .browser-status.disconnected {
    background: rgba(239, 68, 68, 0.15);
    color: var(--danger);
  }
  
  .user-menu {
    display: flex;
    align-items: center;
    gap: 0.75rem;
    cursor: pointer;
    padding: 0.25rem 0.5rem;
    border-radius: 8px;
    transition: background 0.2s;
  }
  
  .user-menu:hover { background: var(--bg-card); }
  
  .user-avatar {
    width: 32px;
    height: 32px;
    border-radius: 50%;
  }
  
  .user-name {
    font-size: 0.9rem;
    font-weight: 500;
  }
  
  /* ========== NAVIGATION BAR ========== */
  .navbar {
    display: flex;
    align-items: center;
    gap: 0.25rem;
  }
  
  .nav-link {
    padding: 0.5rem 1rem;
    color: var(--text-secondary);
    font-size: 0.9rem;
    font-weight: 500;
    border-radius: 6px;
    transition: all 0.2s;
  }
  
  .nav-link:hover {
    color: var(--text-primary);
    background: var(--bg-card);
  }
  
  .nav-link.active {
    color: var(--accent);
  }
  
  /* ========== SIDEBAR ========== */
  .sidebar {
    position: fixed;
    top: 60px;
    left: 0;
    bottom: 0;
    width: 260px;
    background: var(--bg-sidebar);
    border-right: 1px solid var(--border);
    padding: 1.5rem 0;
    overflow-y: auto;
  }
  
  .sidebar-section {
    margin-bottom: 1.5rem;
  }
  
  .sidebar-title {
    font-size: 0.7rem;
    font-weight: 600;
    text-transform: uppercase;
    letter-spacing: 0.05em;
    color: var(--text-muted);
    padding: 0 1.25rem;
    margin-bottom: 0.5rem;
  }
  
  .sidebar-item {
    display: flex;
    align-items: center;
    gap: 0.75rem;
    padding: 0.6rem 1.25rem;
    color: var(--text-secondary);
    font-size: 0.9rem;
    cursor: pointer;
    transition: all 0.15s;
    border-left: 3px solid transparent;
  }
  
  .sidebar-item:hover {
    background: var(--bg-card);
    color: var(--text-primary);
  }
  
  .sidebar-item.active {
    background: rgba(255, 107, 53, 0.1);
    color: var(--accent);
    border-left-color: var(--accent);
  }
  
  .sidebar-item-icon {
    font-size: 1.1rem;
    width: 1.5rem;
    text-align: center;
  }
  
  .sidebar-nested {
    padding-left: 1rem;
  }
  
  .sidebar-nested .sidebar-item {
    font-size: 0.85rem;
    padding: 0.5rem 1.25rem;
  }
  
  /* ========== MAIN CONTENT ========== */
  .main-content {
    margin-left: 260px;
    margin-top: 60px;
    padding: 2rem;
    min-height: calc(100vh - 60px);
  }
  
  .main-content.no-sidebar {
    margin-left: 0;
  }
  
  .main-content.centered {
    max-width: 1200px;
    margin-left: auto;
    margin-right: auto;
    margin-top: 60px;
  }
  
  .page-header {
    margin-bottom: 2rem;
  }
  
  .page-title {
    font-size: 1.75rem;
    font-weight: 700;
    margin-bottom: 0.5rem;
  }
  
  .page-description {
    color: var(--text-secondary);
    font-size: 0.95rem;
  }
  
  /* ========== CARDS ========== */
  .card {
    background: var(--bg-card);
    border: 1px solid var(--border);
    border-radius: 12px;
    padding: 1.5rem;
    margin-bottom: 1.5rem;
  }
  
  .card-header {
    display: flex;
    align-items: center;
    justify-content: space-between;
    margin-bottom: 1rem;
  }
  
  .card-title {
    font-size: 1rem;
    font-weight: 600;
    display: flex;
    align-items: center;
    gap: 0.5rem;
  }
  
  .card-body {
    color: var(--text-secondary);
    font-size: 0.9rem;
  }
  
  /* ========== BUTTONS ========== */
  .btn {
    display: inline-flex;
    align-items: center;
    gap: 0.5rem;
    padding: 0.6rem 1.25rem;
    border-radius: 8px;
    font-weight: 500;
    font-size: 0.9rem;
    cursor: pointer;
    border: none;
    font-family: inherit;
    transition: all 0.15s;
  }
  
  .btn-primary {
    background: linear-gradient(135deg, var(--accent), var(--accent-hover));
    color: white;
  }
  
  .btn-primary:hover {
    transform: translateY(-1px);
    box-shadow: 0 4px 12px rgba(255, 107, 53, 0.3);
  }
  
  .btn-secondary {
    background: var(--bg-secondary);
    color: var(--text-primary);
    border: 1px solid var(--border);
  }
  
  .btn-secondary:hover {
    background: var(--bg-card);
    border-color: var(--border-hover);
  }
  
  .btn-danger {
    background: var(--danger);
    color: white;
  }
  
  .btn-danger:hover {
    background: #dc2626;
  }
  
  .btn-sm {
    padding: 0.4rem 0.75rem;
    font-size: 0.8rem;
  }
  
  .btn-icon {
    padding: 0.5rem;
    width: 36px;
    height: 36px;
    justify-content: center;
  }
  
  /* ========== FORMS ========== */
  .form-group {
    margin-bottom: 1rem;
  }
  
  .form-label {
    display: block;
    font-size: 0.85rem;
    font-weight: 500;
    color: var(--text-secondary);
    margin-bottom: 0.4rem;
  }
  
  .form-input, .form-select, .form-textarea {
    width: 100%;
    padding: 0.6rem 0.75rem;
    background: var(--bg-secondary);
    border: 1px solid var(--border);
    border-radius: 8px;
    color: var(--text-primary);
    font-family: inherit;
    font-size: 0.9rem;
    transition: border-color 0.15s;
  }
  
  .form-input:focus, .form-select:focus, .form-textarea:focus {
    outline: none;
    border-color: var(--accent);
  }
  
  .form-textarea {
    min-height: 120px;
    resize: vertical;
    font-family: 'JetBrains Mono', monospace;
    font-size: 0.85rem;
  }
  
  /* ========== LISTS ========== */
  .list-item {
    display: flex;
    align-items: center;
    justify-content: space-between;
    padding: 0.75rem 1rem;
    background: var(--bg-secondary);
    border-radius: 8px;
    margin-bottom: 0.5rem;
  }
  
  .list-item-content {
    flex: 1;
  }
  
  .list-item-title {
    font-weight: 500;
    font-size: 0.9rem;
  }
  
  .list-item-subtitle {
    font-size: 0.8rem;
    color: var(--text-muted);
    font-family: 'JetBrains Mono', monospace;
  }
  
  .list-item-actions {
    display: flex;
    gap: 0.5rem;
  }
  
  /* ========== CODE BLOCKS ========== */
  .code-block {
    background: var(--bg-secondary);
    border: 1px solid var(--border);
    border-radius: 8px;
    padding: 1rem;
    overflow-x: auto;
  }
  
  .code-block pre {
    font-family: 'JetBrains Mono', monospace;
    font-size: 0.8rem;
    color: var(--text-secondary);
    white-space: pre;
    margin: 0;
  }
  
  /* ========== TABS ========== */
  .tabs {
    display: flex;
    gap: 0.25rem;
    margin-bottom: 1rem;
    border-bottom: 1px solid var(--border);
    padding-bottom: 0.5rem;
  }
  
  .tab {
    padding: 0.5rem 1rem;
    font-size: 0.85rem;
    font-weight: 500;
    color: var(--text-secondary);
    border-radius: 6px;
    cursor: pointer;
    transition: all 0.15s;
  }
  
  .tab:hover {
    color: var(--text-primary);
    background: var(--bg-card);
  }
  
  .tab.active {
    color: var(--accent);
    background: rgba(255, 107, 53, 0.1);
  }
  
  /* ========== ALERTS ========== */
  .alert {
    padding: 1rem;
    border-radius: 8px;
    margin-bottom: 1rem;
    font-size: 0.9rem;
  }
  
  .alert-success {
    background: rgba(16, 185, 129, 0.1);
    border: 1px solid rgba(16, 185, 129, 0.3);
    color: var(--success);
  }
  
  .alert-info {
    background: rgba(59, 130, 246, 0.1);
    border: 1px solid rgba(59, 130, 246, 0.3);
    color: var(--info);
  }
  
  .alert-warning {
    background: rgba(247, 201, 72, 0.1);
    border: 1px solid rgba(247, 201, 72, 0.3);
    color: var(--accent-secondary);
  }
  
  /* ========== FOOTER ========== */
  .footer {
    padding: 1.5rem;
    text-align: center;
    border-top: 1px solid var(--border);
    margin-top: 2rem;
  }
  
  .footer-text {
    font-size: 0.8rem;
    color: var(--text-muted);
  }
  
  .version-info {
    display: flex;
    justify-content: center;
    gap: 0.5rem;
    margin-top: 0.5rem;
    font-size: 0.7rem;
    font-family: 'JetBrains Mono', monospace;
  }
  
  .version-info .version { color: var(--success); }
  .version-info .commit { color: #8b5cf6; }
  
  /* ========== UTILITIES ========== */
  .hidden { display: none !important; }
  .text-success { color: var(--success); }
  .text-danger { color: var(--danger); }
  .text-muted { color: var(--text-muted); }
  .mt-1 { margin-top: 0.5rem; }
  .mt-2 { margin-top: 1rem; }
  .mb-1 { margin-bottom: 0.5rem; }
  .mb-2 { margin-bottom: 1rem; }
  .flex { display: flex; }
  .flex-col { flex-direction: column; }
  .gap-1 { gap: 0.5rem; }
  .gap-2 { gap: 1rem; }
  .items-center { align-items: center; }
  .justify-between { justify-content: space-between; }
  
  /* ========== RESPONSIVE ========== */
  @media (max-width: 768px) {
    .sidebar { display: none; }
    .main-content { margin-left: 0; }
    .navbar { display: none; }
  }
`;

const footerHtml = `
<footer class="footer">
  <p class="footer-text">Moodle MCP · Built for educators, by educators</p>
  <div class="version-info">
    <span class="version">v${versionInfo.version}</span>
    <span>·</span>
    <span class="commit" title="Commit: ${versionInfo.commitFull}">${versionInfo.commit}</span>
    ${versionInfo.buildDate ? `<span>·</span><span>${new Date(versionInfo.buildDate).toLocaleDateString()}</span>` : ''}
  </div>
</footer>
`;

// Landing page HTML
app.get('/', (c) => {
  const accessToken = getCookie(c, 'access_token');
  // If logged in, redirect to dashboard
  if (accessToken) {
    return c.redirect('/dashboard');
  }
  
  // Generate sign-in button
  let signInButton = '';
  if (hasGoogleOAuth) {
    signInButton = '<a href="/auth/google" class="btn btn-primary">Sign in with Google</a>';
  } else if (isDevMode) {
    signInButton = '<a href="/dev" class="btn btn-primary">🔧 Dev Login</a>';
  } else {
    signInButton = '<span class="btn btn-secondary" style="opacity:0.5;cursor:not-allowed;">Sign in unavailable</span>';
  }
  
  return c.html(`
<!DOCTYPE html>
<html lang="en">
<head>
  <meta charset="UTF-8">
  <meta name="viewport" content="width=device-width, initial-scale=1.0">
  <title>Moodle MCP - AI-Powered Moodle Access</title>
  <link href="https://fonts.googleapis.com/css2?family=Inter:wght@400;500;600;700&family=JetBrains+Mono:wght@400;500&display=swap" rel="stylesheet">
  <style>
    ${sharedStyles}
    
    .hero {
      min-height: calc(100vh - 60px);
      display: flex;
      flex-direction: column;
      justify-content: center;
      align-items: center;
      text-align: center;
      padding: 4rem 2rem;
      background: 
        radial-gradient(ellipse at 30% 20%, rgba(255,107,53,0.12) 0%, transparent 50%),
        radial-gradient(ellipse at 70% 80%, rgba(247,201,72,0.08) 0%, transparent 50%);
    }
    
    .hero h1 {
      font-size: 3.5rem;
      font-weight: 700;
      line-height: 1.1;
      margin-bottom: 1.5rem;
    }
    
    .hero h1 span {
      background: linear-gradient(135deg, var(--accent), var(--accent-secondary));
      -webkit-background-clip: text;
      -webkit-text-fill-color: transparent;
    }
    
    .hero p {
      font-size: 1.2rem;
      color: var(--text-secondary);
      max-width: 600px;
      margin-bottom: 2rem;
    }
    
    .hero-buttons {
      display: flex;
      gap: 1rem;
      margin-bottom: 3rem;
    }
    
    .features-grid {
      display: grid;
      grid-template-columns: repeat(auto-fit, minmax(280px, 1fr));
      gap: 1.5rem;
      max-width: 1000px;
      padding: 0 2rem;
    }
    
    .feature-card {
      background: var(--bg-card);
      border: 1px solid var(--border);
      border-radius: 12px;
      padding: 1.5rem;
      text-align: left;
      transition: all 0.2s;
    }
    
    .feature-card:hover {
      border-color: var(--accent);
      transform: translateY(-2px);
    }
    
    .feature-icon {
      font-size: 2rem;
      margin-bottom: 0.75rem;
    }
    
    .feature-card h3 {
      font-size: 1rem;
      margin-bottom: 0.5rem;
    }
    
    .feature-card p {
      font-size: 0.9rem;
      color: var(--text-secondary);
    }
    
    .section {
      padding: 4rem 2rem;
      max-width: 1000px;
      margin: 0 auto;
    }
    
    .section-title {
      font-size: 2rem;
      text-align: center;
      margin-bottom: 2rem;
    }
    
    .steps {
      display: grid;
      grid-template-columns: repeat(auto-fit, minmax(200px, 1fr));
      gap: 2rem;
    }
    
    .step {
      text-align: center;
    }
    
    .step-number {
      width: 48px;
      height: 48px;
      background: linear-gradient(135deg, var(--accent), var(--accent-secondary));
      border-radius: 50%;
      display: flex;
      align-items: center;
      justify-content: center;
      font-weight: 700;
      margin: 0 auto 1rem;
    }
    
    .step h3 { margin-bottom: 0.5rem; }
    .step p { color: var(--text-secondary); font-size: 0.9rem; }
  </style>
</head>
<body>
  <header class="header">
    <div class="header-left">
      <a href="/" class="logo">🎓 Moodle<span>MCP</span></a>
      <nav class="navbar">
        <a href="#features" class="nav-link">Features</a>
        <a href="#ferpa" class="nav-link">FERPA Compliance</a>
        <a href="#how-it-works" class="nav-link">How it Works</a>
      </nav>
    </div>
    <div class="header-right">
      ${signInButton}
    </div>
  </header>
  
  <main class="main-content no-sidebar centered">
    <section class="hero">
      <h1>Use AI to <span>Navigate Moodle</span></h1>
      <p>Connect Claude, ChatGPT, Cursor, or any AI assistant to your Moodle courses. Create content, manage assignments, and interact with your LMS using natural language.</p>
      <div class="hero-buttons">
        ${signInButton}
        <a href="#how-it-works" class="btn btn-secondary">Learn More</a>
      </div>
    </section>
    
    <section id="features" class="section">
      <h2 class="section-title">Features</h2>
      <div class="features-grid">
        <div class="feature-card">
          <div class="feature-icon">🔐</div>
          <h3>FERPA Compliant</h3>
          <p>Student names are automatically masked before reaching AI services. The AI never sees real student data.</p>
        </div>
        <div class="feature-card">
          <div class="feature-icon">🛡️</div>
          <h3>Secure by Design</h3>
          <p>Your Moodle credentials never leave your browser. The server only routes commands.</p>
        </div>
        <div class="feature-card">
          <div class="feature-icon">🌐</div>
          <h3>Works with Any Moodle</h3>
          <p>SSO, LDAP, or standard auth—if you can log in, you can use it with AI.</p>
        </div>
        <div class="feature-card">
          <div class="feature-icon">🤖</div>
          <h3>AI Client Agnostic</h3>
          <p>Works with Claude Desktop, ChatGPT, Cursor, and any MCP-compatible AI.</p>
        </div>
        <div class="feature-card">
          <div class="feature-icon">📚</div>
          <h3>Course Management</h3>
          <p>Create content, set up assignments, manage grades—all through conversation.</p>
        </div>
        <div class="feature-card">
          <div class="feature-icon">⚡</div>
          <h3>Real-Time Sync</h3>
          <p>Browser extension maintains live connection. Actions execute instantly.</p>
        </div>
      </div>
    </section>
    
    <section id="ferpa" class="section">
      <div class="alert alert-success">
        <strong>🔒 Student Privacy Protected</strong>
        <p class="mt-1">Student PII is masked before it reaches any AI service. Names like "John Smith" become "M12345_name" — the AI never sees real student data. <a href="https://github.com/arunlakhotia/moodle-mcp/blob/main/docs/FERPA-COMPLIANCE.md">Read our FERPA compliance documentation →</a></p>
      </div>
    </section>
    
    <section id="how-it-works" class="section">
      <h2 class="section-title">How It Works</h2>
      <div class="steps">
        <div class="step">
          <div class="step-number">1</div>
          <h3>Sign Up</h3>
          <p>Create an account with Google and get your API key.</p>
        </div>
        <div class="step">
          <div class="step-number">2</div>
          <h3>Install Extension</h3>
          <p>Add the browser extension and sign in.</p>
        </div>
        <div class="step">
          <div class="step-number">3</div>
          <h3>Configure AI</h3>
          <p>Add the MCP server to your AI client.</p>
        </div>
        <div class="step">
          <div class="step-number">4</div>
          <h3>Start Using</h3>
          <p>Log into Moodle and start talking to AI!</p>
        </div>
      </div>
    </section>
    
    ${footerHtml}
  </main>
</body>
</html>
  `);
});

// Dashboard page
app.get('/dashboard', async (c) => {
  const accessToken = getCookie(c, 'access_token');
  // If not logged in, redirect to login
  if (!accessToken) {
    return c.redirect('/');
  }
  
  // Verify token and get user info
  try {
    const payload = await verifyToken(accessToken);
    const [user] = await db
      .select()
      .from(users)
      .where(eq(users.id, payload.sub));
    
    if (!user) {
      return c.redirect('/');
    }
    
    // Return dashboard with user info injected
    return c.html(dashboardPageHtml(user));
  } catch (error) {
    // Token invalid, clear and redirect
    deleteCookie(c, 'access_token');
    deleteCookie(c, 'refresh_token');
    return c.redirect('/');
  }
});

// Dashboard page HTML generator
function dashboardPageHtml(user: { name: string | null; email: string; picture: string | null }) {
  return `
<!DOCTYPE html>
<html lang="en">
<head>
  <meta charset="UTF-8">
  <meta name="viewport" content="width=device-width, initial-scale=1.0">
  <title>Dashboard - Moodle MCP</title>
  <link href="https://fonts.googleapis.com/css2?family=Inter:wght@400;500;600;700&family=JetBrains+Mono:wght@400;500&display=swap" rel="stylesheet">
  <style>
    ${sharedStyles}
    
    .pii-tool-grid {
      display: grid;
      grid-template-columns: 1fr 1fr;
      gap: 1rem;
    }
    
    @media (max-width: 768px) {
      .pii-tool-grid { grid-template-columns: 1fr; }
    }
  </style>
</head>
<body>
  <header class="header">
    <div class="header-left">
      <a href="/dashboard" class="logo">🎓 Moodle<span>MCP</span></a>
      <nav class="navbar">
        <a href="#features" class="nav-link">Features</a>
        <a href="#ferpa" class="nav-link">FERPA Compliance</a>
        <a href="#how-it-works" class="nav-link">How it Works</a>
      </nav>
    </div>
    <div class="header-right">
      <div id="browser-status" class="browser-status disconnected">
        <span>●</span> <span id="browser-status-text">Disconnected</span>
      </div>
      <div class="user-menu" onclick="toggleUserDropdown()">
        ${user.picture ? `<img src="${user.picture}" alt="Profile" class="user-avatar">` : '<span class="user-avatar" style="background:var(--accent);display:flex;align-items:center;justify-content:center;font-weight:600;">'+((user.name || user.email)[0].toUpperCase())+'</span>'}
        <span class="user-name">${user.name || user.email}</span>
      </div>
      <a href="/auth/logout" class="btn btn-secondary btn-sm">Sign Out</a>
    </div>
  </header>
  
  <aside class="sidebar">
    <div class="sidebar-section">
      <div class="sidebar-title">Integration</div>
      <div class="sidebar-item active" onclick="showSection('browser-extension')">
        <span class="sidebar-item-icon">🔌</span>
        Browser Extension
      </div>
      <div class="sidebar-item" onclick="showSection('ai-agent')">
        <span class="sidebar-item-icon">🤖</span>
        AI Agent
      </div>
    </div>
    
    <div class="sidebar-section">
      <div class="sidebar-title">PII Tools</div>
      <div class="sidebar-item" onclick="showSection('mask-unmask')">
        <span class="sidebar-item-icon">🔄</span>
        Online Mask/Unmask
      </div>
    </div>
  </aside>
  
  <main class="main-content">
    <!-- BROWSER EXTENSION SECTION -->
    <section id="section-browser-extension">
      <div class="page-header">
        <h1 class="page-title">Browser Extension</h1>
        <p class="page-description">Connect your browser to enable AI interactions with Moodle.</p>
      </div>
      
      <div class="card">
        <div class="card-header">
          <h3 class="card-title">📡 Connection Status</h3>
          <div id="extension-status" class="browser-status disconnected">
            <span>●</span> <span>Disconnected</span>
          </div>
        </div>
        <div class="card-body">
          <p>The browser extension connects your Moodle session to the MCP server. Once connected, AI assistants can interact with your courses.</p>
        </div>
      </div>
      
      <div class="card">
        <div class="card-header">
          <h3 class="card-title">📥 Download & Install</h3>
        </div>
        <div class="card-body">
          <p class="mb-2">Install the browser extension to get started:</p>
          <ol style="padding-left: 1.5rem; color: var(--text-secondary);">
            <li>Download the <code>browser-extension</code> folder from the project</li>
            <li>Open Chrome and go to <code>chrome://extensions/</code></li>
            <li>Enable "Developer mode" (toggle in top right)</li>
            <li>Click "Load unpacked" and select the folder</li>
            <li>Click the extension icon and sign in</li>
          </ol>
          <div class="mt-2">
            <a href="https://github.com/arunlakhotia/moodle-mcp/tree/main/browser-extension" target="_blank" class="btn btn-primary">
              📦 Download Extension
            </a>
          </div>
        </div>
      </div>
    </section>
    
    <!-- AI AGENT SECTION -->
    <section id="section-ai-agent" class="hidden">
      <div class="page-header">
        <h1 class="page-title">AI Agent Configuration</h1>
        <p class="page-description">Connect your AI client to Moodle MCP.</p>
      </div>
      
      <div class="card">
        <div class="card-header">
          <h3 class="card-title">🔑 API Keys</h3>
          <button class="btn btn-primary btn-sm" onclick="createApiKey()">+ Create Key</button>
        </div>
        <div id="api-keys-list" class="card-body">
          <p class="text-muted">Loading...</p>
        </div>
      </div>
      
      <div class="card">
        <div class="card-header">
          <h3 class="card-title">⚙️ MCP Configuration</h3>
        </div>
        <div class="card-body">
          <div class="tabs">
            <div class="tab active" onclick="showConfig('cursor')">Cursor IDE</div>
            <div class="tab" onclick="showConfig('claude')">Claude Desktop</div>
            <div class="tab" onclick="showConfig('chatgpt')">ChatGPT</div>
          </div>
          
          <div class="code-block">
            <pre id="mcp-config"></pre>
          </div>
          
          <div id="config-note" class="alert alert-info mt-2">
            <strong>Note:</strong> Cursor requires the mcp-remote bridge. 
            <a href="https://github.com/arunlakhotia/moodle-mcp/tree/main/mcp-remote" target="_blank">Download it here</a>, 
            then update the path in the config.
          </div>
          
          <div class="mt-2 flex gap-1">
            <button class="btn btn-secondary" onclick="copyConfig()">📋 Copy Configuration</button>
            <button class="btn btn-secondary" onclick="downloadConfig()">⬇️ Download Config File</button>
          </div>
        </div>
      </div>
    </section>
    
    <!-- MASK/UNMASK SECTION -->
    <section id="section-mask-unmask" class="hidden">
      <div class="page-header">
        <h1 class="page-title">Online Mask/Unmask</h1>
        <p class="page-description">Convert between masked tokens and real names.</p>
      </div>
      
      <div class="card">
        <div class="card-header">
          <h3 class="card-title">📁 Uploaded Files</h3>
          <button class="btn btn-secondary btn-sm" onclick="loadFiles()">🔄 Refresh</button>
        </div>
        <div id="files-list" class="card-body">
          <p class="text-muted">Loading...</p>
        </div>
      </div>
      
      <div class="card">
        <div class="card-header">
          <h3 class="card-title">📤 Upload File</h3>
        </div>
        <div class="card-body">
          <div class="form-group">
            <label class="form-label">Course</label>
            <select id="file-course-select" class="form-select">
              <option value="">-- Select a course --</option>
            </select>
          </div>
          <div class="form-group">
            <label class="form-label">File (CSV, TXT, DOCX, XLSX, PPTX)</label>
            <input type="file" id="upload-file" class="form-input" accept=".csv,.txt,.tsv,.docx,.xlsx,.pptx">
          </div>
          <div class="flex gap-1">
            <button class="btn btn-primary" onclick="uploadAndUnmask()">📤 Upload & Unmask on Download</button>
            <button class="btn btn-secondary" onclick="uploadAndMask()">🔒 Upload & Mask</button>
          </div>
          <div id="upload-status" class="mt-1"></div>
        </div>
      </div>
      
      <div class="card">
        <div class="card-header">
          <h3 class="card-title">🔄 Text Mask/Unmask</h3>
        </div>
        <div class="card-body">
          <div class="form-group">
            <label class="form-label">Course</label>
            <select id="pii-course-select" class="form-select">
              <option value="">-- Select a course --</option>
            </select>
          </div>
          
          <div class="pii-tool-grid">
            <div class="form-group">
              <label class="form-label">Masked Text (with tokens)</label>
              <textarea id="masked-text" class="form-textarea" placeholder="M12345_name submitted the assignment..."></textarea>
            </div>
            <div class="form-group">
              <label class="form-label">Unmasked Text (with names)</label>
              <textarea id="unmasked-text" class="form-textarea" placeholder="John Smith submitted the assignment..."></textarea>
            </div>
          </div>
          
          <div class="flex gap-1 justify-between">
            <div class="flex gap-1">
              <button class="btn btn-secondary" onclick="unmaskText()">← Unmask</button>
              <button class="btn btn-primary" onclick="maskText()">Mask →</button>
            </div>
            <div class="flex gap-1">
              <button class="btn btn-secondary btn-sm" onclick="copyMasked()">📋 Copy Masked</button>
              <button class="btn btn-secondary btn-sm" onclick="copyUnmasked()">📋 Copy Unmasked</button>
            </div>
          </div>
          <div id="pii-status" class="mt-1"></div>
        </div>
      </div>
    </section>
    
    ${footerHtml}
  </main>
  
  <script>
    // ==================== STATE ====================
    let currentSection = 'browser-extension';
    let currentConfigType = 'cursor';
    let serverUrl = window.location.origin;
    let userApiKey = 'YOUR_API_KEY';
    
    // ==================== SECTION NAVIGATION ====================
    function showSection(section) {
      // Hide all sections
      document.querySelectorAll('main > section').forEach(s => s.classList.add('hidden'));
      // Show selected section
      document.getElementById('section-' + section).classList.remove('hidden');
      
      // Update sidebar
      document.querySelectorAll('.sidebar-item').forEach(i => i.classList.remove('active'));
      event.target.closest('.sidebar-item').classList.add('active');
      
      currentSection = section;
      
      // Load section-specific data
      if (section === 'ai-agent') loadApiKeys();
      if (section === 'mask-unmask') { loadFiles(); loadCourses(); }
    }
    
    // ==================== BROWSER STATUS ====================
    async function checkBrowserStatus() {
      try {
        const res = await fetch('/auth/browser-status');
        const data = await res.json();
        
        const headerStatus = document.getElementById('browser-status');
        const headerText = document.getElementById('browser-status-text');
        const extStatus = document.getElementById('extension-status');
        
        if (data.connected) {
          headerStatus.className = 'browser-status connected';
          headerText.textContent = 'Connected';
          if (extStatus) {
            extStatus.className = 'browser-status connected';
            extStatus.innerHTML = '<span>●</span> <span>Connected</span>';
          }
        } else {
          headerStatus.className = 'browser-status disconnected';
          headerText.textContent = 'Disconnected';
          if (extStatus) {
            extStatus.className = 'browser-status disconnected';
            extStatus.innerHTML = '<span>●</span> <span>Disconnected</span>';
          }
        }
      } catch (e) {
        console.error('Error checking browser status:', e);
      }
    }
    
    // ==================== API KEYS ====================
    async function loadApiKeys() {
      try {
        const res = await fetch('/api/keys');
        const { keys } = await res.json();
        
        const list = document.getElementById('api-keys-list');
        if (!keys || keys.length === 0) {
          list.innerHTML = '<p class="text-muted">No API keys yet. Create one to get started.</p>';
          return;
        }
        
        list.innerHTML = keys.map(key => \`
          <div class="list-item">
            <div class="list-item-content">
              <div class="list-item-title">\${key.name}</div>
              <div class="list-item-subtitle">\${key.keyPrefix}...</div>
            </div>
            <div class="list-item-actions">
              <button class="btn btn-danger btn-sm" onclick="revokeKey('\${key.id}')">Revoke</button>
            </div>
          </div>
        \`).join('');
      } catch (error) {
        console.error('Error loading API keys:', error);
      }
    }
    
    async function createApiKey() {
      const name = prompt('Enter a name for this API key (e.g., "My Laptop", "Work PC"):');
      if (!name) return;
      
      try {
        const res = await fetch('/api/keys', {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({ name }),
        });
        
        const data = await res.json();
        if (data.key) {
          userApiKey = data.key;
          showApiKeyModal(data.key);
          showConfig(currentConfigType);
          loadApiKeys();
        } else {
          alert('Error: ' + (data.error || 'Failed to create key'));
        }
      } catch (error) {
        alert('Error creating API key');
      }
    }
    
    function showApiKeyModal(key) {
      const modal = document.createElement('div');
      modal.style.cssText = 'position:fixed;inset:0;background:rgba(0,0,0,0.8);display:flex;align-items:center;justify-content:center;z-index:1000;';
      modal.innerHTML = \`
        <div class="card" style="max-width:500px;width:90%;">
          <h3 class="text-success mb-2">✓ API Key Created!</h3>
          <p class="text-muted mb-2">Save this key now - it will not be shown again!</p>
          <div class="code-block mb-2">
            <pre style="word-break:break-all;white-space:pre-wrap;user-select:all;">\${key}</pre>
          </div>
          <div class="flex gap-1">
            <button onclick="navigator.clipboard.writeText('\${key}');this.textContent='Copied!';this.className='btn btn-secondary';" class="btn btn-primary" style="flex:1;">📋 Copy Key</button>
            <button onclick="this.closest('[style*=\\"position:fixed\\"]').remove();" class="btn btn-secondary" style="flex:1;">Close</button>
          </div>
        </div>
      \`;
      modal.onclick = (e) => { if (e.target === modal) modal.remove(); };
      document.body.appendChild(modal);
    }
    
    async function revokeKey(keyId) {
      if (!confirm('Are you sure you want to revoke this API key?')) return;
      try {
        await fetch('/api/keys/' + keyId, { method: 'DELETE' });
        loadApiKeys();
      } catch (error) {
        alert('Error revoking key');
      }
    }
    
    // ==================== MCP CONFIG ====================
    function showConfig(type) {
      currentConfigType = type;
      const configEl = document.getElementById('mcp-config');
      const noteEl = document.getElementById('config-note');
      
      // Update tabs
      document.querySelectorAll('.tab').forEach(t => t.classList.remove('active'));
      event?.target?.classList.add('active');
      
      if (type === 'cursor') {
        configEl.textContent = JSON.stringify({
          mcpServers: {
            moodle: {
              command: "npx",
              args: ["tsx", "/path/to/mcp-remote/src/index.ts"],
              env: {
                MCP_SERVER_URL: serverUrl,
                MCP_API_KEY: userApiKey
              }
            }
          }
        }, null, 2);
        noteEl.innerHTML = '<strong>Note:</strong> Cursor requires the <a href="https://github.com/arunlakhotia/moodle-mcp/tree/main/mcp-remote" target="_blank">mcp-remote bridge</a>. Download it and update the path in the config.';
        noteEl.className = 'alert alert-info mt-2';
      } else if (type === 'claude') {
        configEl.textContent = JSON.stringify({
          mcpServers: {
            moodle: {
              transport: { type: "sse", url: serverUrl + "/mcp/sse" },
              headers: { Authorization: "Bearer " + userApiKey }
            }
          }
        }, null, 2);
        noteEl.innerHTML = '<strong>Config location:</strong><br>macOS: <code>~/Library/Application Support/Claude/claude_desktop_config.json</code><br>Windows: <code>%APPDATA%\\\\Claude\\\\claude_desktop_config.json</code>';
        noteEl.className = 'alert alert-info mt-2';
      } else if (type === 'chatgpt') {
        configEl.textContent = JSON.stringify({
          name: "Moodle MCP",
          type: "mcp",
          mcp: {
            transport: { type: "sse", url: serverUrl + "/mcp/sse" },
            headers: { Authorization: "Bearer " + userApiKey }
          }
        }, null, 2);
        noteEl.innerHTML = '<strong>ChatGPT Setup:</strong> Use the MCP plugin settings in ChatGPT to add this configuration. OAuth authentication is also supported.';
        noteEl.className = 'alert alert-info mt-2';
      }
    }
    
    function copyConfig() {
      navigator.clipboard.writeText(document.getElementById('mcp-config').textContent);
      alert('Configuration copied!');
    }
    
    function downloadConfig() {
      const config = document.getElementById('mcp-config').textContent;
      const filename = currentConfigType === 'cursor' ? 'mcp.json' : 'claude_desktop_config.json';
      const blob = new Blob([config], { type: 'application/json' });
      const url = URL.createObjectURL(blob);
      const a = document.createElement('a');
      a.href = url;
      a.download = filename;
      a.click();
      URL.revokeObjectURL(url);
    }
    
    // ==================== FILES ====================
    async function loadCourses() {
      try {
        const res = await fetch('/files/courses');
        if (!res.ok) return;
        
        const data = await res.json();
        const selectors = ['file-course-select', 'pii-course-select'].map(id => document.getElementById(id)).filter(Boolean);
        
        selectors.forEach(select => {
          select.innerHTML = '<option value="">-- Select a course --</option>';
          if (data.courses) {
            data.courses.forEach(course => {
              const option = document.createElement('option');
              option.value = course.id;
              option.textContent = course.name;
              select.appendChild(option);
            });
          }
        });
      } catch (error) {
        console.log('Error loading courses:', error);
      }
    }
    
    async function loadFiles() {
      const list = document.getElementById('files-list');
      try {
        const res = await fetch('/files/list');
        if (!res.ok) {
          list.innerHTML = '<p class="text-muted">Could not load files</p>';
          return;
        }
        
        const data = await res.json();
        if (!data.files || data.files.length === 0) {
          list.innerHTML = '<p class="text-muted">No files available</p>';
          return;
        }
        
        list.innerHTML = data.files.map(file => {
          const expiresIn = Math.round(file.time_remaining_ms / 60000);
          const isExpiring = expiresIn < 15;
          return \`
            <div class="list-item">
              <div class="list-item-content">
                <div class="list-item-title">\${file.filename} \${file.is_downloaded ? '<span class="text-success">✓</span>' : ''}</div>
                <div class="list-item-subtitle">Course: \${file.course_id} · <span class="\${isExpiring ? 'text-danger' : ''}">Expires in \${expiresIn} min</span></div>
              </div>
              <div class="list-item-actions">
                <a href="/files/\${file.id}" class="btn btn-primary btn-sm" download>⬇ Download</a>
                <button class="btn btn-danger btn-sm" onclick="deleteFile('\${file.id}')">🗑</button>
              </div>
            </div>
          \`;
        }).join('');
      } catch (error) {
        list.innerHTML = '<p class="text-danger">Error loading files</p>';
      }
    }
    
    async function deleteFile(fileId) {
      if (!confirm('Delete this file?')) return;
      try {
        await fetch('/files/' + fileId, { method: 'DELETE' });
        loadFiles();
      } catch (error) {
        alert('Error deleting file');
      }
    }
    
    async function uploadAndUnmask() {
      const fileInput = document.getElementById('upload-file');
      const courseId = parseInt(document.getElementById('file-course-select').value, 10);
      const statusDiv = document.getElementById('upload-status');
      
      const file = fileInput.files[0];
      if (!file) { statusDiv.innerHTML = '<span class="text-danger">Please select a file</span>'; return; }
      if (!courseId) { statusDiv.innerHTML = '<span class="text-danger">Please select a course</span>'; return; }
      
      statusDiv.innerHTML = '<span class="text-muted">Uploading...</span>';
      
      const reader = new FileReader();
      reader.onload = async (e) => {
        const base64 = e.target.result.split(',')[1];
        try {
          const res = await fetch('/files/upload', {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({ content: base64, filename: file.name, course_id: courseId, is_base64: true })
          });
          
          if (res.ok) {
            const data = await res.json();
            statusDiv.innerHTML = '<span class="text-success">✓ Uploaded! <a href="' + data.download_url + '" download>Download unmasked file</a></span>';
            fileInput.value = '';
            loadFiles();
          } else {
            const err = await res.json();
            statusDiv.innerHTML = '<span class="text-danger">Error: ' + (err.error || 'Upload failed') + '</span>';
          }
        } catch (error) {
          statusDiv.innerHTML = '<span class="text-danger">Error: ' + error.message + '</span>';
        }
      };
      reader.readAsDataURL(file);
    }
    
    async function uploadAndMask() {
      const fileInput = document.getElementById('upload-file');
      const courseId = parseInt(document.getElementById('file-course-select').value, 10);
      const statusDiv = document.getElementById('upload-status');
      
      const file = fileInput.files[0];
      if (!file) { statusDiv.innerHTML = '<span class="text-danger">Please select a file</span>'; return; }
      if (!courseId) { statusDiv.innerHTML = '<span class="text-danger">Please select a course</span>'; return; }
      
      statusDiv.innerHTML = '<span class="text-muted">Masking file...</span>';
      
      const formData = new FormData();
      formData.append('file', file);
      formData.append('course_id', courseId.toString());
      
      try {
        const res = await fetch('/files/mask', {
          method: 'POST',
          body: formData
        });
        
        if (res.ok) {
          const blob = await res.blob();
          const url = URL.createObjectURL(blob);
          const a = document.createElement('a');
          a.href = url;
          a.download = 'masked-' + file.name;
          a.click();
          URL.revokeObjectURL(url);
          statusDiv.innerHTML = '<span class="text-success">✓ File masked and downloaded</span>';
          fileInput.value = '';
        } else {
          const err = await res.json();
          statusDiv.innerHTML = '<span class="text-danger">Error: ' + err.error + '</span>';
        }
      } catch (error) {
        statusDiv.innerHTML = '<span class="text-danger">Error: ' + error.message + '</span>';
      }
    }
    
    // ==================== PII MASK/UNMASK ====================
    async function maskText() {
      const input = document.getElementById('unmasked-text').value;
      const courseId = parseInt(document.getElementById('pii-course-select').value, 10);
      const statusDiv = document.getElementById('pii-status');
      
      if (!input.trim()) { statusDiv.innerHTML = '<span class="text-danger">Please enter text to mask</span>'; return; }
      if (!courseId) { statusDiv.innerHTML = '<span class="text-danger">Please select a course</span>'; return; }
      
      statusDiv.innerHTML = '<span class="text-muted">Masking...</span>';
      
      try {
        const res = await fetch('/api/pii/mask', {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({ text: input, course_id: courseId })
        });
        
        const data = await res.json();
        if (res.ok) {
          document.getElementById('masked-text').value = data.masked;
          statusDiv.innerHTML = '<span class="text-success">✓ Masked: ' + data.stats.names + ' names, ' + data.stats.emails + ' emails, ' + data.stats.ids + ' IDs</span>';
        } else {
          statusDiv.innerHTML = '<span class="text-danger">Error: ' + data.error + '</span>';
        }
      } catch (error) {
        statusDiv.innerHTML = '<span class="text-danger">Error: ' + error.message + '</span>';
      }
    }
    
    async function unmaskText() {
      const input = document.getElementById('masked-text').value;
      const courseId = parseInt(document.getElementById('pii-course-select').value, 10);
      const statusDiv = document.getElementById('pii-status');
      
      if (!input.trim()) { statusDiv.innerHTML = '<span class="text-danger">Please enter text to unmask</span>'; return; }
      if (!courseId) { statusDiv.innerHTML = '<span class="text-danger">Please select a course</span>'; return; }
      
      statusDiv.innerHTML = '<span class="text-muted">Unmasking...</span>';
      
      try {
        const res = await fetch('/api/pii/unmask', {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({ text: input, course_id: courseId })
        });
        
        const data = await res.json();
        if (res.ok) {
          document.getElementById('unmasked-text').value = data.unmasked;
          statusDiv.innerHTML = '<span class="text-success">✓ Unmasked: ' + data.stats.names + ' names, ' + data.stats.emails + ' emails, ' + data.stats.ids + ' IDs</span>';
        } else {
          statusDiv.innerHTML = '<span class="text-danger">Error: ' + data.error + '</span>';
        }
      } catch (error) {
        statusDiv.innerHTML = '<span class="text-danger">Error: ' + error.message + '</span>';
      }
    }
    
    function copyMasked() {
      const text = document.getElementById('masked-text').value;
      if (text) { navigator.clipboard.writeText(text); document.getElementById('pii-status').innerHTML = '<span class="text-success">✓ Copied masked text</span>'; }
    }
    
    function copyUnmasked() {
      const text = document.getElementById('unmasked-text').value;
      if (text) { navigator.clipboard.writeText(text); document.getElementById('pii-status').innerHTML = '<span class="text-success">✓ Copied unmasked text</span>'; }
    }
    
    // ==================== INIT ====================
    checkBrowserStatus();
    setInterval(checkBrowserStatus, 10000);
    showConfig('cursor');
  </script>
</body>
</html>
`;
}

// Start server
const port = parseInt(process.env.PORT || '3000');

console.log(`
╔═══════════════════════════════════════════════════════════════╗
║                   🎓 Moodle MCP Server                        ║
║                                                               ║
║  Hosted service for AI-powered Moodle interactions            ║
╚═══════════════════════════════════════════════════════════════╝

Starting server on port ${port}...
`);

const server = serve({
  fetch: app.fetch,
  port,
});

injectWebSocket(server);

console.log(`
✅ Server running at http://localhost:${port}
✅ WebSocket endpoint at ws://localhost:${port}/ws
✅ MCP endpoint at http://localhost:${port}/mcp

Environment:
- NODE_ENV: ${process.env.NODE_ENV || 'development'}
- DATABASE_URL: ${process.env.DATABASE_URL ? '✓ configured' : '✗ missing'}
- GOOGLE_CLIENT_ID: ${process.env.GOOGLE_CLIENT_ID ? '✓ configured' : '✗ missing'}
`);
