/**
 * OAuth 2.1 Authorization Endpoint
 * 
 * Handles:
 * - GET /oauth/authorize — Validate params, redirect to Google login or show consent
 * - POST /oauth/authorize — Process consent decision, issue authorization code
 */

import { Hono } from 'hono';
import { setCookie, getCookie, deleteCookie } from 'hono/cookie';
import { eq } from 'drizzle-orm';
import { db } from '../db/index.js';
import { users } from '../db/schema.js';
import { verifyToken } from '../auth/jwt.js';
import { oauthCodes } from './schema.js';
import { generateToken, hashToken, TOKEN_EXPIRY } from './utils.js';

const authorize = new Hono();

/**
 * GET /oauth/authorize
 * 
 * ChatGPT redirects users here with:
 * - response_type=code
 * - client_id (optional)
 * - redirect_uri
 * - scope
 * - state
 * - code_challenge (PKCE)
 * - code_challenge_method=S256
 */
authorize.get('/authorize', async (c) => {
  // Try to get params from URL query first
  let {
    response_type,
    client_id,
    redirect_uri,
    scope,
    state,
    code_challenge,
    code_challenge_method,
  } = c.req.query();

  // If no query params, check if we're returning from Google login (params in cookie)
  if (!response_type && !redirect_uri) {
    const storedParams = getCookie(c, 'oauth_provider_params');
    if (storedParams) {
      try {
        const params = JSON.parse(storedParams);
        response_type = 'code'; // We only support code
        client_id = params.client_id;
        redirect_uri = params.redirect_uri;
        scope = params.scope;
        state = params.state;
        code_challenge = params.code_challenge;
        code_challenge_method = params.code_challenge_method;
      } catch {
        // Invalid cookie, continue with validation which will fail
      }
    }
  }

  // Validate required parameters
  if (response_type !== 'code') {
    return c.json({ 
      error: 'unsupported_response_type',
      error_description: 'Only "code" response type is supported',
    }, 400);
  }

  if (!redirect_uri) {
    return c.json({ 
      error: 'invalid_request',
      error_description: 'redirect_uri is required',
    }, 400);
  }

  // OAuth 2.1: PKCE is required
  if (!code_challenge || code_challenge_method !== 'S256') {
    return c.json({ 
      error: 'invalid_request',
      error_description: 'PKCE with S256 method is required',
    }, 400);
  }

  // Store OAuth params in cookie for after Google login (only if from URL)
  if (c.req.query().response_type) {
    const oauthParams = JSON.stringify({
      client_id: client_id || null,
      redirect_uri,
      scope: scope || 'mcp',
      state: state || '',
      code_challenge,
      code_challenge_method,
    });

    setCookie(c, 'oauth_provider_params', oauthParams, {
      path: '/',
      httpOnly: true,
      secure: process.env.NODE_ENV === 'production',
      maxAge: 60 * 10, // 10 minutes
      sameSite: 'Lax',
    });
  }

  // Check if user is already logged in
  let accessToken = getCookie(c, 'access_token');
  
  if (!accessToken) {
    // Dev mode bypass: auto-login without Google
    if (process.env.NODE_ENV !== 'production') {
      const devUser = await getOrCreateDevUser();
      if (devUser) {
        // Import JWT creation
        const { createAccessToken } = await import('../auth/jwt.js');
        accessToken = await createAccessToken(devUser.id, devUser.email, devUser.name || undefined);
        
        // Set cookie so subsequent requests are authenticated
        setCookie(c, 'access_token', accessToken, {
          path: '/',
          httpOnly: true,
          maxAge: 60 * 15,
          sameSite: 'Lax',
        });
        
        console.log(`[OAuth] Dev mode: auto-logged in as ${devUser.email}`);
      }
    }
    
    // Still no token? Redirect to Google
    if (!accessToken) {
      return c.redirect('/auth/google?oauth_provider=true');
    }
  }

  // User is logged in — verify token and show consent screen
  try {
    const payload = await verifyToken(accessToken);
    const [user] = await db
      .select()
      .from(users)
      .where(eq(users.id, payload.sub));

    if (!user) {
      // User not found, re-login
      return c.redirect('/auth/google?oauth_provider=true');
    }

    // Show consent screen
    return showConsentScreen(c, user, scope || 'mcp');
  } catch {
    // Token invalid, re-login
    return c.redirect('/auth/google?oauth_provider=true');
  }
});

/**
 * POST /oauth/authorize
 * 
 * User submitted consent form (Allow or Deny)
 */
authorize.post('/authorize', async (c) => {
  const body = await c.req.parseBody();
  const action = body.action as string;

  // Get stored OAuth params
  const paramsJson = getCookie(c, 'oauth_provider_params');
  if (!paramsJson) {
    return c.json({ 
      error: 'invalid_request',
      error_description: 'OAuth session expired',
    }, 400);
  }

  const params = JSON.parse(paramsJson);
  deleteCookie(c, 'oauth_provider_params', { path: '/' });

  // Handle denial
  if (action === 'deny') {
    const redirectUrl = new URL(params.redirect_uri);
    redirectUrl.searchParams.set('error', 'access_denied');
    redirectUrl.searchParams.set('error_description', 'User denied the request');
    if (params.state) {
      redirectUrl.searchParams.set('state', params.state);
    }
    return c.redirect(redirectUrl.toString());
  }

  // User approved — get current user
  const accessToken = getCookie(c, 'access_token');
  if (!accessToken) {
    return c.json({ error: 'unauthorized' }, 401);
  }

  let userId: string;
  try {
    const payload = await verifyToken(accessToken);
    userId = payload.sub;
  } catch {
    return c.json({ error: 'unauthorized' }, 401);
  }

  // Generate authorization code
  const code = generateToken(32);
  const codeHash = await hashToken(code);

  // Store code in database
  await db.insert(oauthCodes).values({
    code: codeHash,
    userId,
    clientId: params.client_id,
    redirectUri: params.redirect_uri,
    scopes: params.scope,
    codeChallenge: params.code_challenge,
    codeChallengeMethod: params.code_challenge_method,
    expiresAt: new Date(Date.now() + TOKEN_EXPIRY.CODE),
  });

  // Redirect back to ChatGPT with authorization code
  const redirectUrl = new URL(params.redirect_uri);
  redirectUrl.searchParams.set('code', code);
  if (params.state) {
    redirectUrl.searchParams.set('state', params.state);
  }

  return c.redirect(redirectUrl.toString());
});

/**
 * Render consent screen HTML
 */
function showConsentScreen(c: any, user: any, scope: string) {
  const scopes = scope.split(' ').filter(Boolean);
  const scopeDescriptions: Record<string, string> = {
    'openid': 'Verify your identity',
    'profile': 'Access your name and profile picture',
    'email': 'Access your email address',
    'mcp': 'Control Moodle on your behalf',
    'mcp:read': 'Read data from Moodle',
    'mcp:write': 'Make changes in Moodle',
  };

  const scopeList = scopes
    .map(s => `<li>${scopeDescriptions[s] || s}</li>`)
    .join('');

  const html = `
<!DOCTYPE html>
<html>
<head>
  <title>Authorize - Moodle MCP</title>
  <meta name="viewport" content="width=device-width, initial-scale=1">
  <style>
    * { box-sizing: border-box; margin: 0; padding: 0; }
    body {
      font-family: -apple-system, BlinkMacSystemFont, 'Segoe UI', Roboto, sans-serif;
      background: linear-gradient(135deg, #0a0a0f 0%, #1a1a2e 100%);
      color: #f0f0f5;
      min-height: 100vh;
      display: flex;
      align-items: center;
      justify-content: center;
      padding: 20px;
    }
    .card {
      background: rgba(255, 255, 255, 0.05);
      border: 1px solid rgba(255, 255, 255, 0.1);
      border-radius: 16px;
      padding: 32px;
      max-width: 420px;
      width: 100%;
    }
    .header {
      text-align: center;
      margin-bottom: 24px;
    }
    .logo { font-size: 48px; margin-bottom: 8px; }
    h1 { font-size: 24px; font-weight: 600; }
    .user-info {
      display: flex;
      align-items: center;
      gap: 12px;
      padding: 16px;
      background: rgba(255, 255, 255, 0.05);
      border-radius: 8px;
      margin-bottom: 24px;
    }
    .user-info img {
      width: 48px;
      height: 48px;
      border-radius: 50%;
    }
    .user-info .name { font-weight: 500; }
    .user-info .email { font-size: 14px; color: #a0a0b0; }
    .permissions {
      margin-bottom: 24px;
    }
    .permissions h3 {
      font-size: 14px;
      color: #a0a0b0;
      margin-bottom: 12px;
      text-transform: uppercase;
      letter-spacing: 0.5px;
    }
    .permissions ul {
      list-style: none;
    }
    .permissions li {
      padding: 8px 0;
      padding-left: 24px;
      position: relative;
    }
    .permissions li::before {
      content: '✓';
      position: absolute;
      left: 0;
      color: #10b981;
    }
    .buttons {
      display: flex;
      gap: 12px;
    }
    button {
      flex: 1;
      padding: 14px 24px;
      border-radius: 8px;
      font-size: 16px;
      font-weight: 500;
      cursor: pointer;
      transition: all 0.2s;
    }
    .allow {
      background: #10b981;
      border: none;
      color: white;
    }
    .allow:hover { background: #059669; }
    .deny {
      background: transparent;
      border: 1px solid rgba(255, 255, 255, 0.2);
      color: #f0f0f5;
    }
    .deny:hover { background: rgba(255, 255, 255, 0.05); }
    .client-info {
      text-align: center;
      margin-bottom: 20px;
      padding: 12px;
      background: rgba(59, 130, 246, 0.1);
      border-radius: 8px;
      border: 1px solid rgba(59, 130, 246, 0.2);
    }
    .client-info strong { color: #3b82f6; }
  </style>
</head>
<body>
  <div class="card">
    <div class="header">
      <div class="logo">🎓</div>
      <h1>Authorize Access</h1>
    </div>
    
    <div class="client-info">
      <strong>ChatGPT</strong> wants to access your Moodle MCP account
    </div>
    
    <div class="user-info">
      <img src="${user.picture || 'https://via.placeholder.com/48'}" alt="${user.name}">
      <div>
        <div class="name">${user.name}</div>
        <div class="email">${user.email}</div>
      </div>
    </div>
    
    <div class="permissions">
      <h3>This will allow ChatGPT to:</h3>
      <ul>${scopeList}</ul>
    </div>
    
    <form method="POST" action="/oauth/authorize">
      <div class="buttons">
        <button type="submit" name="action" value="deny" class="deny">Deny</button>
        <button type="submit" name="action" value="allow" class="allow">Allow</button>
      </div>
    </form>
  </div>
</body>
</html>`;

  return c.html(html);
}

/**
 * Dev mode helper: get or create a dev user for testing OAuth flow
 */
async function getOrCreateDevUser() {
  const DEV_EMAIL = 'oauth-dev@localhost';
  
  let [user] = await db.select().from(users).where(eq(users.email, DEV_EMAIL));
  
  if (!user) {
    [user] = await db.insert(users).values({
      email: DEV_EMAIL,
      name: 'OAuth Dev User',
      googleId: 'oauth-dev-bypass',
    }).returning();
  }
  
  return user;
}

export default authorize;
