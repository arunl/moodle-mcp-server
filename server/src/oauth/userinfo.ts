/**
 * OAuth 2.1 UserInfo Endpoint
 * 
 * Returns user profile information for a valid access token.
 */

import { Hono } from 'hono';
import { eq } from 'drizzle-orm';
import { db } from '../db/index.js';
import { users } from '../db/schema.js';
import { oauthAccessTokens } from './schema.js';
import { hashToken } from './utils.js';

const userinfo = new Hono();

/**
 * GET /oauth/userinfo
 * 
 * Returns user profile for the authenticated token.
 * Requires Bearer token in Authorization header.
 */
userinfo.get('/userinfo', async (c) => {
  const authHeader = c.req.header('Authorization');
  
  if (!authHeader || !authHeader.startsWith('Bearer ')) {
    return c.json({
      error: 'invalid_token',
      error_description: 'Bearer token required',
    }, 401);
  }

  const token = authHeader.slice(7); // Remove "Bearer "
  const tokenHash = await hashToken(token);

  // Find token in database
  const [storedToken] = await db
    .select()
    .from(oauthAccessTokens)
    .where(eq(oauthAccessTokens.token, tokenHash));

  if (!storedToken) {
    return c.json({
      error: 'invalid_token',
      error_description: 'Token not found or revoked',
    }, 401);
  }

  // Check expiration
  if (new Date() > storedToken.expiresAt) {
    return c.json({
      error: 'invalid_token',
      error_description: 'Token has expired',
    }, 401);
  }

  // Get user info
  const [user] = await db
    .select()
    .from(users)
    .where(eq(users.id, storedToken.userId));

  if (!user) {
    return c.json({
      error: 'invalid_token',
      error_description: 'User not found',
    }, 401);
  }

  // Return user info (OpenID Connect standard claims)
  const response: Record<string, any> = {
    sub: String(user.id), // Subject identifier
  };

  // Include claims based on scopes
  const scopes = storedToken.scopes.split(' ');
  
  if (scopes.includes('profile') || scopes.includes('openid')) {
    response.name = user.name;
    response.picture = user.picture;
  }
  
  if (scopes.includes('email') || scopes.includes('openid')) {
    response.email = user.email;
  }

  return c.json(response);
});

export default userinfo;
