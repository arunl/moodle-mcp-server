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

// Landing page HTML
app.get('/', (c) => {
  const accessToken = getCookie(c, 'access_token');
  // If logged in, redirect to dashboard
  if (accessToken) {
    return c.redirect('/dashboard');
  }
  
  // Generate dynamic buttons based on configuration
  const navButtons = [];
  const heroButtons = [];
  
  if (hasGoogleOAuth) {
    navButtons.push('<a href="/auth/google" class="btn btn-primary">Sign in with Google</a>');
    heroButtons.push('<a href="/auth/google" class="btn btn-primary">Get Started Free</a>');
  } else {
    navButtons.push('<span class="btn btn-primary" style="opacity:0.5;cursor:not-allowed;" title="Google OAuth not configured">Sign in with Google</span>');
  }
  
  if (isDevMode) {
    navButtons.push('<a href="/dev" class="btn btn-secondary">🔧 Dev Login</a>');
    heroButtons.push('<a href="/dev" class="btn btn-secondary">🔧 Dev Login</a>');
  }
  
  if (heroButtons.length === 0) {
    heroButtons.push('<span class="btn btn-primary" style="opacity:0.5;cursor:not-allowed;">No login methods configured</span>');
  }
  
  heroButtons.push('<a href="#how-it-works" class="btn btn-secondary">Learn More</a>');
  
  // Inject buttons into template
  const pageHtml = landingPageHtml
    .replace('<!-- NAV_BUTTONS -->', navButtons.join('\n        '))
    .replace('<!-- HERO_BUTTONS -->', heroButtons.join('\n        '));
  
  return c.html(pageHtml);
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
    const dashboardWithUser = dashboardPageHtml.replace(
      '<!-- USER_INFO_PLACEHOLDER -->',
      `<div style="display: flex; align-items: center; gap: 1rem; margin-bottom: 1.5rem;">
        ${user.picture ? `<img src="${user.picture}" alt="Profile" style="width: 48px; height: 48px; border-radius: 50%;">` : ''}
        <div>
          <div style="font-weight: 600; font-size: 1.1rem;">${user.name || 'User'}</div>
          <div style="color: #a0a0b0; font-size: 0.9rem;">${user.email}</div>
        </div>
        <a href="/auth/logout" style="margin-left: auto; color: #ef4444; text-decoration: none; font-size: 0.9rem;">Sign Out</a>
      </div>`
    );
    return c.html(dashboardWithUser);
  } catch (error) {
    // Token invalid, clear and redirect
    deleteCookie(c, 'access_token');
    deleteCookie(c, 'refresh_token');
    return c.redirect('/');
  }
});

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

// Landing page HTML template
const landingPageHtml = `
<!DOCTYPE html>
<html lang="en">
<head>
  <meta charset="UTF-8">
  <meta name="viewport" content="width=device-width, initial-scale=1.0">
  <title>Moodle MCP - AI-Powered Moodle Access</title>
  <link href="https://fonts.googleapis.com/css2?family=Space+Grotesk:wght@400;500;600;700&family=JetBrains+Mono:wght@400;500&display=swap" rel="stylesheet">
  <style>
    :root {
      --bg-primary: #0a0a0f;
      --bg-secondary: #12121a;
      --bg-card: #1a1a24;
      --text-primary: #f0f0f5;
      --text-secondary: #a0a0b0;
      --accent: #ff6b35;
      --accent-secondary: #f7c948;
      --success: #10b981;
      --border: rgba(255,255,255,0.1);
    }
    
    * { margin: 0; padding: 0; box-sizing: border-box; }
    
    body {
      font-family: 'Space Grotesk', sans-serif;
      background: var(--bg-primary);
      color: var(--text-primary);
      min-height: 100vh;
      overflow-x: hidden;
    }
    
    .bg-pattern {
      position: fixed;
      inset: 0;
      background: 
        radial-gradient(ellipse at 20% 20%, rgba(255,107,53,0.15) 0%, transparent 50%),
        radial-gradient(ellipse at 80% 80%, rgba(247,201,72,0.1) 0%, transparent 50%),
        radial-gradient(circle at 50% 50%, rgba(255,255,255,0.02) 0%, transparent 100%);
      pointer-events: none;
    }
    
    .container {
      max-width: 1200px;
      margin: 0 auto;
      padding: 0 2rem;
      position: relative;
      z-index: 1;
    }
    
    header {
      padding: 2rem 0;
      display: flex;
      justify-content: space-between;
      align-items: center;
    }
    
    .logo {
      font-size: 1.5rem;
      font-weight: 700;
      display: flex;
      align-items: center;
      gap: 0.5rem;
    }
    
    .logo span {
      color: var(--accent);
    }
    
    .nav-links {
      display: flex;
      gap: 2rem;
      align-items: center;
    }
    
    .nav-links a {
      color: var(--text-secondary);
      text-decoration: none;
      transition: color 0.2s;
    }
    
    .nav-links a:hover {
      color: var(--text-primary);
    }
    
    .btn {
      padding: 0.75rem 1.5rem;
      border-radius: 8px;
      font-weight: 500;
      text-decoration: none;
      display: inline-flex;
      align-items: center;
      gap: 0.5rem;
      transition: all 0.2s;
      cursor: pointer;
      border: none;
      font-family: inherit;
      font-size: 1rem;
    }
    
    .btn-primary {
      background: linear-gradient(135deg, var(--accent), #ff8c5a);
      color: white;
    }
    
    .btn-primary:hover {
      transform: translateY(-2px);
      box-shadow: 0 10px 30px rgba(255,107,53,0.3);
    }
    
    .btn-secondary {
      background: var(--bg-card);
      color: var(--text-primary);
      border: 1px solid var(--border);
    }
    
    .btn-secondary:hover {
      background: var(--bg-secondary);
    }
    
    .hero {
      padding: 6rem 0;
      text-align: center;
    }
    
    .hero h1 {
      font-size: 4rem;
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
      font-size: 1.25rem;
      color: var(--text-secondary);
      max-width: 600px;
      margin: 0 auto 2rem;
    }
    
    .hero-buttons {
      display: flex;
      gap: 1rem;
      justify-content: center;
    }
    
    .features {
      padding: 4rem 0;
      display: grid;
      grid-template-columns: repeat(auto-fit, minmax(300px, 1fr));
      gap: 2rem;
    }
    
    .feature-card {
      background: var(--bg-card);
      border: 1px solid var(--border);
      border-radius: 16px;
      padding: 2rem;
      transition: all 0.3s;
    }
    
    .feature-card:hover {
      transform: translateY(-5px);
      border-color: var(--accent);
    }
    
    .feature-icon {
      font-size: 2.5rem;
      margin-bottom: 1rem;
    }
    
    .feature-card h3 {
      font-size: 1.25rem;
      margin-bottom: 0.75rem;
    }
    
    .feature-card p {
      color: var(--text-secondary);
      line-height: 1.6;
    }
    
    .how-it-works {
      padding: 4rem 0;
    }
    
    .how-it-works h2 {
      text-align: center;
      font-size: 2.5rem;
      margin-bottom: 3rem;
    }
    
    .steps {
      display: grid;
      grid-template-columns: repeat(auto-fit, minmax(250px, 1fr));
      gap: 2rem;
    }
    
    .step {
      text-align: center;
      padding: 2rem;
    }
    
    .step-number {
      width: 50px;
      height: 50px;
      background: linear-gradient(135deg, var(--accent), var(--accent-secondary));
      border-radius: 50%;
      display: flex;
      align-items: center;
      justify-content: center;
      font-weight: 700;
      font-size: 1.25rem;
      margin: 0 auto 1rem;
    }
    
    .step h3 {
      margin-bottom: 0.5rem;
    }
    
    .step p {
      color: var(--text-secondary);
    }
    
    .code-block {
      background: var(--bg-secondary);
      border: 1px solid var(--border);
      border-radius: 12px;
      padding: 1.5rem;
      margin: 2rem 0;
      overflow-x: auto;
    }
    
    .code-block pre {
      font-family: 'JetBrains Mono', monospace;
      font-size: 0.875rem;
      color: var(--text-secondary);
    }
    
    footer {
      padding: 3rem 0;
      text-align: center;
      color: var(--text-secondary);
      border-top: 1px solid var(--border);
      margin-top: 4rem;
    }
    footer .version-info {
      display: flex;
      justify-content: center;
      gap: 0.5rem;
      margin-top: 0.5rem;
      font-size: 0.75rem;
      font-family: 'SF Mono', Monaco, 'Cascadia Code', monospace;
    }
    footer .version-info .version {
      color: #10b981;
    }
    footer .version-info .separator {
      color: var(--text-secondary);
    }
    footer .version-info .commit {
      color: #8b5cf6;
      cursor: help;
    }
    footer .version-info .build-date {
      color: #6b7280;
    }
  </style>
</head>
<body>
  <div class="bg-pattern"></div>
  
  <div class="container">
    <header>
      <div class="logo">
        🎓 Moodle<span>MCP</span>
      </div>
      <nav class="nav-links">
        <a href="#features">Features</a>
        <a href="#how-it-works">How it Works</a>
        <a href="/docs">Documentation</a>
        <!-- NAV_BUTTONS -->
      </nav>
    </header>
    
    <section class="hero">
      <h1>Use AI to <span>Navigate Moodle</span></h1>
      <p>Connect Claude, ChatGPT, Cursor, or any AI assistant to your Moodle courses. Create content, manage assignments, and interact with your LMS using natural language.</p>
      <div class="hero-buttons">
        <!-- HERO_BUTTONS -->
      </div>
    </section>
    
    <section class="features" id="features">
      <div class="feature-card">
        <div class="feature-icon">🔐</div>
        <h3>Secure by Design</h3>
        <p>Your Moodle credentials never leave your browser. The server only routes commands—all interactions happen locally.</p>
      </div>
      <div class="feature-card">
        <div class="feature-icon">🌐</div>
        <h3>Works with Any Moodle</h3>
        <p>Whether your institution uses SSO, LDAP, or standard auth—if you can log in, you can use it with AI.</p>
      </div>
      <div class="feature-card">
        <div class="feature-icon">🤖</div>
        <h3>AI Client Agnostic</h3>
        <p>Works with Claude Desktop, ChatGPT, Cursor, and any MCP-compatible AI assistant.</p>
      </div>
      <div class="feature-card">
        <div class="feature-icon">📚</div>
        <h3>Course Management</h3>
        <p>Create Moodle Books, set up assignments, manage grades, and more—all through natural conversation.</p>
      </div>
      <div class="feature-card">
        <div class="feature-icon">⚡</div>
        <h3>Real-Time Sync</h3>
        <p>Browser extension maintains live connection. Actions execute instantly in your logged-in session.</p>
      </div>
      <div class="feature-card">
        <div class="feature-icon">🎨</div>
        <h3>Rich Content</h3>
        <p>Generate beautiful HTML content for your courses. The AI handles formatting and styling automatically.</p>
      </div>
    </section>
    
    <section class="how-it-works" id="how-it-works">
      <h2>How It Works</h2>
      <div class="steps">
        <div class="step">
          <div class="step-number">1</div>
          <h3>Sign Up</h3>
          <p>Create an account with Google. Get your API key instantly.</p>
        </div>
        <div class="step">
          <div class="step-number">2</div>
          <h3>Install Extension</h3>
          <p>Add the browser extension and log in with your account.</p>
        </div>
        <div class="step">
          <div class="step-number">3</div>
          <h3>Configure AI</h3>
          <p>Add the MCP server to your AI client configuration.</p>
        </div>
        <div class="step">
          <div class="step-number">4</div>
          <h3>Start Using</h3>
          <p>Log into Moodle and start talking to your AI assistant!</p>
        </div>
      </div>
      
      <div class="code-block">
        <pre>// Add to your AI client's MCP configuration
{
  "mcpServers": {
    "moodle": {
      "transport": {
        "type": "sse",
        "url": "${process.env.SERVER_URL || 'https://moodle-mcp.example.com'}/mcp/sse"
      },
      "headers": {
        "Authorization": "Bearer YOUR_API_KEY"
      }
    }
  }
}</pre>
      </div>
    </section>
    
    <footer>
      <p>Moodle MCP · Built for educators, by educators.</p>
      <div class="version-info">
        <span class="version">v${versionInfo.version}</span>
        <span class="separator">·</span>
        <span class="commit" title="Commit: ${versionInfo.commitFull}">${versionInfo.commit}</span>
        ${versionInfo.buildDate ? `<span class="separator">·</span><span class="build-date" title="Build date">${new Date(versionInfo.buildDate).toLocaleDateString()}</span>` : ''}
      </div>
    </footer>
  </div>
</body>
</html>
`;

// Dashboard page HTML template
const dashboardPageHtml = `
<!DOCTYPE html>
<html lang="en">
<head>
  <meta charset="UTF-8">
  <meta name="viewport" content="width=device-width, initial-scale=1.0">
  <title>Dashboard - Moodle MCP</title>
  <link href="https://fonts.googleapis.com/css2?family=Space+Grotesk:wght@400;500;600;700&family=JetBrains+Mono:wght@400;500&display=swap" rel="stylesheet">
  <style>
    :root {
      --bg-primary: #0a0a0f;
      --bg-secondary: #12121a;
      --bg-card: #1a1a24;
      --text-primary: #f0f0f5;
      --text-secondary: #a0a0b0;
      --accent: #ff6b35;
      --accent-secondary: #f7c948;
      --success: #10b981;
      --danger: #ef4444;
      --border: rgba(255,255,255,0.1);
    }
    
    * { margin: 0; padding: 0; box-sizing: border-box; }
    
    body {
      font-family: 'Space Grotesk', sans-serif;
      background: var(--bg-primary);
      color: var(--text-primary);
      min-height: 100vh;
    }
    
    .container {
      max-width: 900px;
      margin: 0 auto;
      padding: 2rem;
    }
    
    header {
      display: flex;
      justify-content: space-between;
      align-items: center;
      margin-bottom: 3rem;
      padding-bottom: 1rem;
      border-bottom: 1px solid var(--border);
    }
    
    .logo {
      font-size: 1.5rem;
      font-weight: 700;
    }
    
    .logo span { color: var(--accent); }
    
    .user-info {
      display: flex;
      align-items: center;
      gap: 1rem;
    }
    
    .user-info img {
      width: 40px;
      height: 40px;
      border-radius: 50%;
    }
    
    .card {
      background: var(--bg-card);
      border: 1px solid var(--border);
      border-radius: 16px;
      padding: 2rem;
      margin-bottom: 2rem;
    }
    
    .card h2 {
      font-size: 1.25rem;
      margin-bottom: 1rem;
      display: flex;
      align-items: center;
      gap: 0.5rem;
    }
    
    .btn {
      padding: 0.75rem 1.5rem;
      border-radius: 8px;
      font-weight: 500;
      cursor: pointer;
      border: none;
      font-family: inherit;
      font-size: 1rem;
      transition: all 0.2s;
    }
    
    .btn-primary {
      background: linear-gradient(135deg, var(--accent), #ff8c5a);
      color: white;
    }
    
    .btn-primary:hover {
      transform: translateY(-2px);
    }
    
    .btn-danger {
      background: var(--danger);
      color: white;
    }
    
    .btn-secondary {
      background: var(--bg-secondary);
      color: var(--text-primary);
      border: 1px solid var(--border);
    }
    
    .api-key {
      display: flex;
      justify-content: space-between;
      align-items: center;
      padding: 1rem;
      background: var(--bg-secondary);
      border-radius: 8px;
      margin-bottom: 1rem;
    }
    
    .api-key-value {
      font-family: 'JetBrains Mono', monospace;
      color: var(--text-secondary);
    }
    
    .code-block {
      background: var(--bg-secondary);
      border: 1px solid var(--border);
      border-radius: 8px;
      padding: 1rem;
      overflow-x: auto;
    }
    
    .code-block pre {
      font-family: 'JetBrains Mono', monospace;
      font-size: 0.875rem;
      color: var(--text-secondary);
    }
    
    .status {
      display: inline-flex;
      align-items: center;
      gap: 0.5rem;
      padding: 0.25rem 0.75rem;
      border-radius: 100px;
      font-size: 0.875rem;
    }
    
    .status-connected {
      background: rgba(16, 185, 129, 0.2);
      color: var(--success);
    }
    
    .status-disconnected {
      background: rgba(239, 68, 68, 0.2);
      color: var(--danger);
    }
    
    #loading {
      text-align: center;
      padding: 4rem;
      color: var(--text-secondary);
    }
    
    .hidden { display: none; }
  </style>
</head>
<body>
  <div class="container">
    <div id="loading">Loading...</div>
    
    <div id="content" class="hidden">
      <!-- USER_INFO_PLACEHOLDER -->
      <header>
        <div class="logo">🎓 Moodle<span>MCP</span></div>
        <div class="user-info">
          <span id="user-name"></span>
          <img id="user-picture" src="" alt="Profile" />
          <button class="btn btn-secondary" onclick="logout()">Logout</button>
        </div>
      </header>
      
      <div class="card">
        <h2>🔌 Browser Extension Status</h2>
        <p>Install the browser extension and log in to connect your Moodle session.</p>
        <br />
        <div id="browser-status">
          <span class="status status-disconnected">● Disconnected</span>
        </div>
        <br />
        <details style="margin-top: 1rem;">
          <summary style="cursor: pointer; color: #f97316;">📦 Install Extension</summary>
          <div style="margin-top: 0.75rem; padding: 1rem; background: var(--bg-secondary); border-radius: 8px;">
            <p style="font-size: 0.9rem; margin-bottom: 0.75rem;"><strong>Option 1:</strong> Download from releases (coming soon)</p>
            <p style="font-size: 0.9rem; margin-bottom: 0.75rem;"><strong>Option 2:</strong> Manual install:</p>
            <ol style="padding-left: 1.5rem; font-size: 0.85rem; color: var(--text-secondary);">
              <li>Get the <code>browser-extension</code> folder from the project</li>
              <li>Open Chrome → <code>chrome://extensions/</code></li>
              <li>Enable "Developer mode" (top right)</li>
              <li>Click "Load unpacked" → select folder</li>
              <li>Click extension icon and sign in</li>
            </ol>
          </div>
        </details>
      </div>
      
      <div class="card">
        <h2>🔑 API Keys</h2>
        <p style="color: var(--text-secondary); margin-bottom: 1rem;">Use API keys to authenticate your AI client with this service.</p>
        
        <div id="api-keys-list">
          <!-- Keys will be loaded here -->
        </div>
        
        <button class="btn btn-primary" onclick="createApiKey()">+ Create New Key</button>
      </div>
      
      <div class="card">
        <h2>⚙️ MCP Configuration</h2>
        <p style="color: var(--text-secondary); margin-bottom: 1rem;">Choose your AI client:</p>
        
        <div style="display: flex; gap: 0.5rem; margin-bottom: 1rem;">
          <button class="btn btn-secondary" onclick="showConfig('claude')" id="btn-claude" style="flex:1; opacity: 0.6;">Claude Desktop</button>
          <button class="btn btn-secondary" onclick="showConfig('cursor')" id="btn-cursor" style="flex:1; background: var(--accent); opacity: 1;">Cursor IDE</button>
        </div>
        
        <div class="code-block">
          <pre id="mcp-config"></pre>
        </div>
        
        <div id="cursor-note" style="margin-top: 1rem; padding: 0.75rem; background: rgba(255,107,53,0.1); border-radius: 8px; font-size: 0.85rem;">
          <strong>Note:</strong> Cursor requires the <code>mcp-remote</code> bridge. 
          <a href="https://github.com/arunlakhotia/moodle-mcp/tree/main/mcp-remote" target="_blank" style="color: var(--accent);">Download it here</a>, 
          then update the path in the config above.
        </div>
        
        <div id="claude-note" class="hidden" style="margin-top: 1rem; padding: 0.75rem; background: rgba(16,185,129,0.1); border-radius: 8px; font-size: 0.85rem;">
          <strong>Config location:</strong><br/>
          macOS: <code>~/Library/Application Support/Claude/claude_desktop_config.json</code><br/>
          Windows: <code>%APPDATA%\\Claude\\claude_desktop_config.json</code>
        </div>
        
        <br />
        <button class="btn btn-secondary" onclick="copyConfig()">📋 Copy Configuration</button>
      </div>
      
      <div class="card">
        <h2>📁 Generated Files</h2>
        <p style="color: var(--text-secondary); margin-bottom: 1rem;">Files generated by AI with unmasked PII. Download before they expire.</p>
        
        <div id="files-list">
          <p style="color: var(--text-secondary); font-style: italic;">No files available</p>
        </div>
        
        <div style="display:flex;gap:0.5rem;margin-top:1rem;flex-wrap:wrap;align-items:center;">
          <button class="btn btn-secondary" onclick="loadFiles()">🔄 Refresh</button>
          <button class="btn btn-secondary" onclick="toggleUploadForm()">📤 Upload File</button>
        </div>
        
        <div id="upload-form" style="display:none;margin-top:1rem;padding:1rem;background:var(--bg-secondary);border-radius:8px;">
          <h4 style="margin:0 0 0.75rem 0;">Upload Masked File</h4>
          <p style="color:var(--text-secondary);font-size:0.85rem;margin-bottom:1rem;">
            Upload a file containing masked PII tokens (M####:name, M####:email, etc.). 
            The file will be unmasked when downloaded.
          </p>
          <div style="display:flex;flex-direction:column;gap:0.75rem;">
            <div>
              <label style="display:block;font-size:0.85rem;color:var(--text-secondary);margin-bottom:0.25rem;">File (CSV, TXT, DOCX, XLSX, PPTX)</label>
              <input type="file" id="upload-file" accept=".csv,.txt,.tsv,.docx,.xlsx,.pptx" 
                style="width:100%;padding:0.5rem;background:var(--bg-primary);border:1px solid var(--border);border-radius:6px;color:var(--text-primary);" />
            </div>
            <div>
              <label style="display:block;font-size:0.85rem;color:var(--text-secondary);margin-bottom:0.25rem;">Course ID</label>
              <input type="number" id="upload-course-id" placeholder="e.g., 56569" 
                style="width:100%;padding:0.5rem;background:var(--bg-primary);border:1px solid var(--border);border-radius:6px;color:var(--text-primary);" />
            </div>
            <div style="display:flex;gap:0.5rem;">
              <button class="btn btn-primary" onclick="uploadFile()">Upload</button>
              <button class="btn btn-secondary" onclick="toggleUploadForm()">Cancel</button>
            </div>
            <div id="upload-status" style="font-size:0.85rem;"></div>
          </div>
        </div>
      </div>
    </div>
    
    <footer style="margin-top: 3rem; padding-top: 1.5rem; border-top: 1px solid var(--border); text-align: center;">
      <p style="color: var(--text-secondary); font-size: 0.85rem;">Moodle MCP · Built for educators, by educators.</p>
      <div style="display: flex; justify-content: center; gap: 0.5rem; margin-top: 0.5rem; font-size: 0.75rem; font-family: 'JetBrains Mono', monospace;">
        <span style="color: #10b981;">v${versionInfo.version}</span>
        <span style="color: var(--text-secondary);">·</span>
        <span style="color: #8b5cf6;" title="Commit: ${versionInfo.commitFull}">${versionInfo.commit}</span>
        ${versionInfo.buildDate ? `<span style="color: var(--text-secondary);">·</span><span style="color: #6b7280;" title="Build date">${new Date(versionInfo.buildDate).toLocaleDateString()}</span>` : ''}
      </div>
    </footer>
  </div>
  
  <script>
    async function loadDashboard() {
      try {
        // Get user info
        const userRes = await fetch('/auth/me');
        if (!userRes.ok) {
          window.location.href = '/';
          return;
        }
        const user = await userRes.json();
        
        document.getElementById('user-name').textContent = user.name || user.email;
        if (user.picture) {
          document.getElementById('user-picture').src = user.picture;
        }
        
        // Get API keys
        const keysRes = await fetch('/api/keys');
        const { keys } = await keysRes.json();
        
        const keysList = document.getElementById('api-keys-list');
        if (keys.length === 0) {
          keysList.innerHTML = '<p style="color: var(--text-secondary)">No API keys yet. Create one to get started.</p><br/>';
        } else {
          keysList.innerHTML = keys.map(key => \`
            <div class="api-key">
              <div>
                <strong>\${key.name}</strong><br/>
                <span class="api-key-value">\${key.keyPrefix}...</span>
              </div>
              <button class="btn btn-danger" onclick="revokeKey('\${key.id}')">Revoke</button>
            </div>
          \`).join('');
        }
        
        // Set up MCP config display
        showConfig('cursor'); // Default to Cursor
        
        // Load files list
        loadFiles();
        
        // Show content
        document.getElementById('loading').classList.add('hidden');
        document.getElementById('content').classList.remove('hidden');
      } catch (error) {
        console.error('Error loading dashboard:', error);
        document.getElementById('loading').textContent = 'Error loading dashboard. Please try again.';
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
          showConfig(currentConfigType); // Refresh config with new key
          loadDashboard();
        } else {
          alert('Error: ' + (data.error || 'Failed to create key'));
        }
      } catch (error) {
        alert('Error creating API key');
      }
    }
    
    function showApiKeyModal(key) {
      const modal = document.createElement('div');
      modal.style.cssText = 'position:fixed;inset:0;background:rgba(0,0,0,0.8);display:flex;align-items:center;justify-content:center;z-index:1000;cursor:pointer;';
      modal.innerHTML = \`
        <div style="background:var(--bg-card);border:1px solid var(--border);border-radius:16px;padding:2rem;max-width:500px;width:90%;cursor:default;" onclick="event.stopPropagation();">
          <h3 style="color:var(--success);margin-bottom:1rem;">✓ API Key Created!</h3>
          <p style="color:var(--text-secondary);margin-bottom:1rem;font-size:0.9rem;">Save this key now - it will not be shown again!</p>
          <div style="background:var(--bg-secondary);border:1px solid var(--border);border-radius:8px;padding:1rem;margin-bottom:1rem;">
            <code style="font-family:'JetBrains Mono',monospace;font-size:0.8rem;word-break:break-all;user-select:all;cursor:text;">\${key}</code>
          </div>
          <div style="display:flex;gap:1rem;">
            <button onclick="navigator.clipboard.writeText('\${key}');this.textContent='Copied!';this.style.background='var(--success)';" class="btn btn-primary" style="flex:1;">📋 Copy Key</button>
            <button onclick="this.closest('[style*=\\"position:fixed\\"]').remove();" class="btn btn-secondary" style="flex:1;">Close</button>
          </div>
        </div>
      \`;
      // Click outside (on overlay) to close
      modal.onclick = () => modal.remove();
      document.body.appendChild(modal);
    }
    
    async function revokeKey(keyId) {
      if (!confirm('Are you sure you want to revoke this API key?')) return;
      
      try {
        await fetch('/api/keys/' + keyId, { method: 'DELETE' });
        loadDashboard();
      } catch (error) {
        alert('Error revoking key');
      }
    }
    
    // File management functions
    async function loadFiles() {
      try {
        const res = await fetch('/files/list');
        if (!res.ok) {
          console.error('Failed to load files');
          return;
        }
        
        const data = await res.json();
        const filesList = document.getElementById('files-list');
        
        if (!data.files || data.files.length === 0) {
          filesList.innerHTML = '<p style="color: var(--text-secondary); font-style: italic;">No files available</p>';
          return;
        }
        
        filesList.innerHTML = data.files.map(file => {
          const expiresIn = Math.round(file.time_remaining_ms / 60000); // minutes
          const isExpiringSoon = expiresIn < 15;
          const statusIcon = file.is_downloaded ? '✓' : '○';
          const statusColor = file.is_downloaded ? 'var(--success)' : 'var(--text-secondary)';
          
          return \`
            <div class="api-key-item" style="display:flex;justify-content:space-between;align-items:center;padding:0.75rem;background:var(--bg-secondary);border-radius:8px;margin-bottom:0.5rem;">
              <div style="flex:1;">
                <strong>\${file.filename}</strong>
                <span style="color:\${statusColor};margin-left:0.5rem;">\${statusIcon}</span>
                <br/>
                <span style="font-size:0.8rem;color:var(--text-secondary);">
                  Course: \${file.course_id} · 
                  <span style="color:\${isExpiringSoon ? 'var(--danger)' : 'var(--text-secondary)'}">
                    Expires in \${expiresIn} min
                  </span>
                  \${file.downloaded_at ? ' · Downloaded' : ''}
                </span>
              </div>
              <div style="display:flex;gap:0.5rem;">
                <a href="/files/\${file.id}" class="btn btn-primary" style="text-decoration:none;padding:0.4rem 0.75rem;font-size:0.85rem;" download>⬇ Download</a>
                <button class="btn btn-danger" style="padding:0.4rem 0.75rem;font-size:0.85rem;" onclick="deleteFile('\${file.id}')">🗑</button>
              </div>
            </div>
          \`;
        }).join('');
      } catch (error) {
        console.error('Error loading files:', error);
      }
    }
    
    async function deleteFile(fileId) {
      if (!confirm('Delete this file?')) return;
      
      try {
        const res = await fetch('/files/' + fileId, { method: 'DELETE' });
        if (res.ok) {
          loadFiles();
        } else {
          alert('Failed to delete file');
        }
      } catch (error) {
        alert('Error deleting file');
      }
    }
    
    function toggleUploadForm() {
      const form = document.getElementById('upload-form');
      form.style.display = form.style.display === 'none' ? 'block' : 'none';
      document.getElementById('upload-status').innerHTML = '';
    }
    
    async function uploadFile() {
      const fileInput = document.getElementById('upload-file');
      const courseIdInput = document.getElementById('upload-course-id');
      const statusDiv = document.getElementById('upload-status');
      
      const file = fileInput.files[0];
      const courseId = parseInt(courseIdInput.value, 10);
      
      if (!file) {
        statusDiv.innerHTML = '<span style="color:var(--danger)">Please select a file</span>';
        return;
      }
      
      if (!courseId) {
        statusDiv.innerHTML = '<span style="color:var(--danger)">Please enter a course ID</span>';
        return;
      }
      
      statusDiv.innerHTML = '<span style="color:var(--text-secondary)">Uploading...</span>';
      
      try {
        // Read file as base64
        const reader = new FileReader();
        reader.onload = async (e) => {
          const base64 = e.target.result.split(',')[1]; // Remove data:xxx;base64, prefix
          
          const res = await fetch('/files/upload', {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({
              content: base64,
              filename: file.name,
              course_id: courseId,
              is_base64: true
            })
          });
          
          if (res.ok) {
            const data = await res.json();
            statusDiv.innerHTML = \`
              <span style="color:var(--success)">✓ Uploaded successfully!</span><br/>
              <a href="\${data.download_url}" style="color:var(--primary);" download>Download unmasked file</a>
            \`;
            fileInput.value = '';
            loadFiles();
          } else {
            const err = await res.json();
            statusDiv.innerHTML = \`<span style="color:var(--danger)">Error: \${err.error || 'Upload failed'}</span>\`;
          }
        };
        reader.onerror = () => {
          statusDiv.innerHTML = '<span style="color:var(--danger)">Error reading file</span>';
        };
        reader.readAsDataURL(file);
      } catch (error) {
        statusDiv.innerHTML = \`<span style="color:var(--danger)">Error: \${error.message}</span>\`;
      }
    }
    
    function copyConfig() {
      const config = document.getElementById('mcp-config').textContent;
      navigator.clipboard.writeText(config);
      alert('Configuration copied to clipboard!');
    }
    
    let currentConfigType = 'cursor';
    let serverUrl = window.location.origin;
    let userApiKey = 'YOUR_API_KEY';
    
    function showConfig(type) {
      currentConfigType = type;
      const configEl = document.getElementById('mcp-config');
      const cursorNote = document.getElementById('cursor-note');
      const claudeNote = document.getElementById('claude-note');
      const btnCursor = document.getElementById('btn-cursor');
      const btnClaude = document.getElementById('btn-claude');
      
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
        cursorNote.classList.remove('hidden');
        claudeNote.classList.add('hidden');
        btnCursor.style.opacity = '1';
        btnCursor.style.background = 'var(--accent)';
        btnClaude.style.opacity = '0.6';
        btnClaude.style.background = 'var(--bg-secondary)';
      } else {
        configEl.textContent = JSON.stringify({
          mcpServers: {
            moodle: {
              transport: {
                type: "sse",
                url: serverUrl + "/mcp/sse"
              },
              headers: {
                Authorization: "Bearer " + userApiKey
              }
            }
          }
        }, null, 2);
        cursorNote.classList.add('hidden');
        claudeNote.classList.remove('hidden');
        btnClaude.style.opacity = '1';
        btnClaude.style.background = 'var(--accent)';
        btnCursor.style.opacity = '0.6';
        btnCursor.style.background = 'var(--bg-secondary)';
      }
    }
    
    async function logout() {
      await fetch('/auth/logout', { method: 'POST' });
      window.location.href = '/';
    }
    
    async function checkBrowserStatus() {
      try {
        const res = await fetch('/auth/browser-status');
        const data = await res.json();
        const statusEl = document.getElementById('browser-status');
        if (data.connected) {
          statusEl.innerHTML = '<span class="status status-connected">● Connected</span>';
        } else {
          statusEl.innerHTML = '<span class="status status-disconnected">● Disconnected</span>';
        }
      } catch (e) {
        console.error('Error checking browser status:', e);
      }
    }
    
    loadDashboard();
    checkBrowserStatus();
    // Poll browser status every 10 seconds (balance between responsiveness and server load)
    setInterval(checkBrowserStatus, 10000);
    // Refresh files list every 30 seconds to update expiration times
    setInterval(loadFiles, 30000);
  </script>
</body>
</html>
`;
