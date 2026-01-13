import { Hono } from 'hono';
import { cors } from 'hono/cors';
import { logger } from 'hono/logger';
import { serve } from '@hono/node-server';
import { createNodeWebSocket } from '@hono/node-ws';
import authRoutes from './routes/auth.js';
import apiRoutes from './routes/api.js';
import mcpRoutes from './routes/mcp.js';
import { connectionManager } from './bridge/connection-manager.js';

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
    version: '1.0.0',
    connections: stats.totalConnections,
    mode: process.env.NODE_ENV || 'development',
  });
});

// Development mode endpoints (only available when NODE_ENV !== 'production')
if (process.env.NODE_ENV !== 'production') {
  const { createAccessToken, generateApiKey, hashApiKey } = await import('./auth/jwt.js');
  const { db, users, apiKeys } = await import('./db/index.js');
  const { eq } = await import('drizzle-orm');

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

// MCP routes
app.route('/mcp', mcpRoutes);

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

// Landing page HTML
app.get('/', (c) => {
  return c.html(landingPageHtml);
});

// Dashboard page
app.get('/dashboard', (c) => {
  return c.html(dashboardPageHtml);
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
        <a href="https://github.com/yourusername/moodle-mcp" target="_blank">GitHub</a>
        <a href="/auth/google" class="btn btn-primary">Sign in with Google</a>
      </nav>
    </header>
    
    <section class="hero">
      <h1>Use AI to <span>Navigate Moodle</span></h1>
      <p>Connect Claude, ChatGPT, Cursor, or any AI assistant to your Moodle courses. Create content, manage assignments, and interact with your LMS using natural language.</p>
      <div class="hero-buttons">
        <a href="/auth/google" class="btn btn-primary">Get Started Free</a>
        <a href="#how-it-works" class="btn btn-secondary">Learn More</a>
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
      <p>Moodle MCP is open source. Built for educators, by educators.</p>
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
        <a href="/extension/moodle-mcp-extension.zip" class="btn btn-secondary">Download Extension</a>
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
        <p style="color: var(--text-secondary); margin-bottom: 1rem;">Add this to your AI client's configuration:</p>
        
        <div class="code-block">
          <pre id="mcp-config"></pre>
        </div>
        
        <br />
        <button class="btn btn-secondary" onclick="copyConfig()">📋 Copy Configuration</button>
      </div>
    </div>
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
        
        // Get MCP config
        const configRes = await fetch('/api/mcp-config');
        const config = await configRes.json();
        document.getElementById('mcp-config').textContent = JSON.stringify(config.config, null, 2);
        
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
          alert('API Key Created!\\n\\n' + data.key + '\\n\\nSave this key now - it will not be shown again!');
          loadDashboard();
        } else {
          alert('Error: ' + (data.error || 'Failed to create key'));
        }
      } catch (error) {
        alert('Error creating API key');
      }
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
    
    function copyConfig() {
      const config = document.getElementById('mcp-config').textContent;
      navigator.clipboard.writeText(config);
      alert('Configuration copied to clipboard!');
    }
    
    async function logout() {
      await fetch('/auth/logout', { method: 'POST' });
      window.location.href = '/';
    }
    
    loadDashboard();
  </script>
</body>
</html>
`;
