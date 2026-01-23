import { Hono } from 'hono';
import { setCookie, getCookie, deleteCookie } from 'hono/cookie';
import { google, getGoogleUser } from '../auth/google.js';
import { createAccessToken, createRefreshToken, verifyToken, hashApiKey } from '../auth/jwt.js';
import { db, users, refreshTokens } from '../db/index.js';
import { eq } from 'drizzle-orm';
import { generateState, generateCodeVerifier } from 'arctic';

const auth = new Hono();

// Initiate Google OAuth flow
auth.get('/google', async (c) => {
  const state = generateState();
  const codeVerifier = generateCodeVerifier();
  const isExtension = c.req.query('extension') === 'true';
  const isOAuthProvider = c.req.query('oauth_provider') === 'true';
  
  const url = google.createAuthorizationURL(state, codeVerifier, ['openid', 'email', 'profile']);
  
  // Store state and verifier in cookies
  setCookie(c, 'oauth_state', state, {
    path: '/',
    httpOnly: true,
    secure: process.env.NODE_ENV === 'production',
    maxAge: 60 * 10, // 10 minutes
    sameSite: 'Lax',
  });
  
  setCookie(c, 'code_verifier', codeVerifier, {
    path: '/',
    httpOnly: true,
    secure: process.env.NODE_ENV === 'production',
    maxAge: 60 * 10,
    sameSite: 'Lax',
  });
  
  // Clear any stale flow cookies first
  deleteCookie(c, 'oauth_extension', { path: '/' });
  deleteCookie(c, 'oauth_provider_flow', { path: '/' });
  
  if (isExtension) {
    setCookie(c, 'oauth_extension', 'true', {
      path: '/',
      httpOnly: true,
      secure: process.env.NODE_ENV === 'production',
      maxAge: 60 * 10,
      sameSite: 'Lax',
    });
  }
  
  if (isOAuthProvider) {
    // OAuth 2.1 provider flow (ChatGPT integration)
    setCookie(c, 'oauth_provider_flow', 'true', {
      path: '/',
      httpOnly: true,
      secure: process.env.NODE_ENV === 'production',
      maxAge: 60 * 10,
      sameSite: 'Lax',
    });
  }

  return c.redirect(url.toString());
});

// Google OAuth callback
auth.get('/google/callback', async (c) => {
  const code = c.req.query('code');
  const state = c.req.query('state');
  const storedState = getCookie(c, 'oauth_state');
  const codeVerifier = getCookie(c, 'code_verifier');
  
  // Clear OAuth cookies
  deleteCookie(c, 'oauth_state');
  deleteCookie(c, 'code_verifier');

  // Validate state
  if (!code || !state || state !== storedState || !codeVerifier) {
    return c.json({ error: 'Invalid OAuth callback' }, 400);
  }

  try {
    // Exchange code for tokens
    const tokens = await google.validateAuthorizationCode(code, codeVerifier);
    const googleUser = await getGoogleUser(tokens.accessToken());

    // Find or create user
    let [user] = await db
      .select()
      .from(users)
      .where(eq(users.googleId, googleUser.sub));

    if (!user) {
      // Create new user
      [user] = await db
        .insert(users)
        .values({
          email: googleUser.email,
          name: googleUser.name,
          picture: googleUser.picture,
          googleId: googleUser.sub,
        })
        .returning();
      
      console.log(`[Auth] New user registered: ${user.email}`);
    } else {
      // Update existing user info
      await db
        .update(users)
        .set({
          name: googleUser.name,
          picture: googleUser.picture,
          updatedAt: new Date(),
        })
        .where(eq(users.id, user.id));
    }

    // Create tokens
    const accessToken = await createAccessToken(user.id, user.email, user.name || undefined);
    const refreshToken = await createRefreshToken(user.id);

    // Store refresh token hash
    const refreshTokenHash = await hashApiKey(refreshToken);
    await db.insert(refreshTokens).values({
      userId: user.id,
      tokenHash: refreshTokenHash,
      expiresAt: new Date(Date.now() + 30 * 24 * 60 * 60 * 1000), // 30 days
    });

    // Check if this is an extension login
    const isExtension = getCookie(c, 'oauth_extension') === 'true';
    deleteCookie(c, 'oauth_extension');
    
    // Always set cookies (needed for /extension-check to work)
    setCookie(c, 'access_token', accessToken, {
      path: '/',
      httpOnly: true,
      secure: process.env.NODE_ENV === 'production',
      maxAge: 60 * 15, // 15 minutes
      sameSite: 'Lax',
    });

    setCookie(c, 'refresh_token', refreshToken, {
      path: '/',
      httpOnly: true,
      secure: process.env.NODE_ENV === 'production',
      maxAge: 60 * 60 * 24 * 30, // 30 days
      sameSite: 'Lax',
    });
    
    if (isExtension) {
      // Return HTML page that tells user to close the window
      // Extension will poll /extension-check to get tokens via cookies
      const html = `
<!DOCTYPE html>
<html>
<head>
  <title>Login Successful - Moodle MCP</title>
  <style>
    body {
      font-family: -apple-system, BlinkMacSystemFont, 'Segoe UI', Roboto, sans-serif;
      background: #0a0a0f;
      color: #f0f0f5;
      display: flex;
      flex-direction: column;
      align-items: center;
      justify-content: center;
      height: 100vh;
      margin: 0;
    }
    .success { color: #10b981; font-size: 3rem; }
    h1 { margin: 1rem 0 0.5rem; }
    p { color: #a0a0b0; }
  </style>
</head>
<body>
  <div class="success">✓</div>
  <h1>Login Successful!</h1>
  <p>You can close this window now.</p>
  <p style="font-size: 0.8rem; margin-top: 1rem;">The extension will automatically connect.</p>
  <script>
    // Auto-close after 3 seconds
    setTimeout(() => window.close(), 3000);
  </script>
</body>
</html>`;
      return c.html(html);
    }
    
    // Check if this is an OAuth 2.1 provider flow (ChatGPT integration)
    const isOAuthProvider = getCookie(c, 'oauth_provider_flow') === 'true';
    deleteCookie(c, 'oauth_provider_flow');
    
    if (isOAuthProvider) {
      // Redirect back to OAuth authorize endpoint to show consent screen
      // The oauth_provider_params cookie contains the original OAuth request
      return c.redirect('/oauth/authorize');
    }

    // Redirect to dashboard (cookies already set above)
    return c.redirect('/dashboard');
  } catch (error) {
    console.error('[Auth] OAuth error:', error);
    return c.json({ error: 'Authentication failed' }, 500);
  }
});

// Get current user info
auth.get('/me', async (c) => {
  const accessToken = getCookie(c, 'access_token');
  
  if (!accessToken) {
    return c.json({ error: 'Not authenticated' }, 401);
  }

  try {
    const payload = await verifyToken(accessToken);
    const [user] = await db
      .select()
      .from(users)
      .where(eq(users.id, payload.sub));

    if (!user) {
      return c.json({ error: 'User not found' }, 404);
    }

    return c.json({
      id: user.id,
      email: user.email,
      name: user.name,
      picture: user.picture,
    });
  } catch (error) {
    return c.json({ error: 'Invalid token' }, 401);
  }
});

// Logout (POST - API)
auth.post('/logout', async (c) => {
  deleteCookie(c, 'access_token');
  deleteCookie(c, 'refresh_token');
  return c.json({ success: true });
});

// Logout (GET - redirect, for links)
auth.get('/logout', async (c) => {
  deleteCookie(c, 'access_token');
  deleteCookie(c, 'refresh_token');
  return c.redirect('/');
});

// Check if browser extension is connected for this user
auth.get('/browser-status', async (c) => {
  const accessToken = getCookie(c, 'access_token');
  
  if (!accessToken) {
    return c.json({ connected: false, authenticated: false }, 200);
  }

  try {
    const payload = await verifyToken(accessToken);
    
    // Import connection manager to check if user has active connection
    const { connectionManager } = await import('../bridge/connection-manager.js');
    const isConnected = connectionManager.isUserConnected(payload.sub);
    
    return c.json({ 
      connected: isConnected, 
      authenticated: true,
      userId: payload.sub 
    });
  } catch (error) {
    return c.json({ connected: false, authenticated: false }, 200);
  }
});

// Extension auth check - returns tokens from cookies for extension to grab
auth.get('/extension-check', async (c) => {
  const accessToken = getCookie(c, 'access_token');
  const refreshToken = getCookie(c, 'refresh_token');
  
  if (!accessToken) {
    return c.json({ authenticated: false }, 200);
  }

  try {
    const payload = await verifyToken(accessToken);
    const [user] = await db
      .select()
      .from(users)
      .where(eq(users.id, payload.sub));

    if (!user) {
      return c.json({ authenticated: false }, 200);
    }

    return c.json({
      authenticated: true,
      accessToken,
      refreshToken,
      user: {
        id: user.id,
        email: user.email,
        name: user.name,
        picture: user.picture,
      }
    });
  } catch (error) {
    return c.json({ authenticated: false }, 200);
  }
});

// Token exchange endpoint for browser extension
auth.post('/token', async (c) => {
  const { grant_type, code, refresh_token } = await c.req.json();

  if (grant_type === 'authorization_code') {
    // This would be used for extension OAuth flow
    // For now, redirect to web OAuth
    return c.json({ error: 'Use web OAuth flow' }, 400);
  }

  if (grant_type === 'refresh_token' && refresh_token) {
    try {
      const payload = await verifyToken(refresh_token);
      
      if (payload.type !== 'refresh') {
        return c.json({ error: 'Invalid token type' }, 400);
      }

      const [user] = await db
        .select()
        .from(users)
        .where(eq(users.id, payload.sub));

      if (!user) {
        return c.json({ error: 'User not found' }, 404);
      }

      const newAccessToken = await createAccessToken(user.id, user.email, user.name || undefined);
      
      return c.json({
        access_token: newAccessToken,
        token_type: 'Bearer',
        expires_in: 900, // 15 minutes
      });
    } catch (error) {
      return c.json({ error: 'Invalid refresh token' }, 401);
    }
  }

  return c.json({ error: 'Invalid grant type' }, 400);
});

export default auth;
