/**
 * OAuth 2.1 Token Endpoint
 * 
 * Handles:
 * - POST /oauth/token — Exchange authorization code for tokens
 * - Refresh token grant
 */

import { Hono } from 'hono';
import { eq } from 'drizzle-orm';
import { db } from '../db/index.js';
import { oauthCodes, oauthAccessTokens, oauthRefreshTokens, oauthClients } from './schema.js';
import { generateToken, hashToken, verifyPKCE, TOKEN_EXPIRY } from './utils.js';

const token = new Hono();

/**
 * POST /oauth/token
 * 
 * Supports:
 * - grant_type=authorization_code (exchange code for tokens)
 * - grant_type=refresh_token (get new access token)
 */
token.post('/token', async (c) => {
  // Parse form body (OAuth spec requires application/x-www-form-urlencoded)
  const body = await c.req.parseBody();
  const grantType = body.grant_type as string;

  if (grantType === 'authorization_code') {
    return handleAuthorizationCodeGrant(c, body);
  }

  if (grantType === 'refresh_token') {
    return handleRefreshTokenGrant(c, body);
  }

  return c.json({
    error: 'unsupported_grant_type',
    error_description: 'Only authorization_code and refresh_token grants are supported',
  }, 400);
});

/**
 * Exchange authorization code for access token
 */
async function handleAuthorizationCodeGrant(c: any, body: any) {
  const code = body.code as string;
  const redirectUri = body.redirect_uri as string;
  const codeVerifier = body.code_verifier as string;
  const clientId = body.client_id as string | undefined;
  const clientSecret = body.client_secret as string | undefined;

  // Validate required parameters
  if (!code || !redirectUri || !codeVerifier) {
    return c.json({
      error: 'invalid_request',
      error_description: 'code, redirect_uri, and code_verifier are required',
    }, 400);
  }

  // If client_id is provided, validate client credentials
  if (clientId) {
    const [client] = await db
      .select()
      .from(oauthClients)
      .where(eq(oauthClients.clientId, clientId));

    if (!client) {
      return c.json({
        error: 'invalid_client',
        error_description: 'Client not found',
      }, 401);
    }

    // Validate client_secret if using client_secret_post auth method
    if (client.tokenEndpointAuthMethod === 'client_secret_post') {
      if (!clientSecret) {
        return c.json({
          error: 'invalid_client',
          error_description: 'client_secret is required',
        }, 401);
      }

      const secretHash = await hashToken(clientSecret);
      if (secretHash !== client.clientSecret) {
        return c.json({
          error: 'invalid_client',
          error_description: 'Invalid client_secret',
        }, 401);
      }
    }

    // Validate redirect_uri is registered for this client
    const allowedUris = JSON.parse(client.redirectUris);
    if (!allowedUris.includes(redirectUri)) {
      return c.json({
        error: 'invalid_grant',
        error_description: 'redirect_uri not registered for this client',
      }, 400);
    }
  }

  // Find the authorization code
  const codeHash = await hashToken(code);
  const [storedCode] = await db
    .select()
    .from(oauthCodes)
    .where(eq(oauthCodes.code, codeHash));

  if (!storedCode) {
    return c.json({
      error: 'invalid_grant',
      error_description: 'Authorization code not found or already used',
    }, 400);
  }

  // Check expiration
  if (new Date() > storedCode.expiresAt) {
    // Delete expired code
    await db.delete(oauthCodes).where(eq(oauthCodes.code, codeHash));
    return c.json({
      error: 'invalid_grant',
      error_description: 'Authorization code has expired',
    }, 400);
  }

  // Validate redirect_uri matches
  if (storedCode.redirectUri !== redirectUri) {
    return c.json({
      error: 'invalid_grant',
      error_description: 'redirect_uri does not match',
    }, 400);
  }

  // Validate client_id if provided (and stored)
  if (storedCode.clientId && clientId && storedCode.clientId !== clientId) {
    return c.json({
      error: 'invalid_grant',
      error_description: 'client_id does not match',
    }, 400);
  }

  // OAuth 2.1: Verify PKCE
  if (!verifyPKCE(codeVerifier, storedCode.codeChallenge, storedCode.codeChallengeMethod)) {
    return c.json({
      error: 'invalid_grant',
      error_description: 'PKCE verification failed',
    }, 400);
  }

  // Delete the used code (one-time use)
  await db.delete(oauthCodes).where(eq(oauthCodes.code, codeHash));

  // Generate tokens
  const accessToken = generateToken(32);
  const refreshToken = generateToken(32);

  // Store access token
  await db.insert(oauthAccessTokens).values({
    token: await hashToken(accessToken),
    userId: storedCode.userId,
    clientId: storedCode.clientId,
    scopes: storedCode.scopes,
    expiresAt: new Date(Date.now() + TOKEN_EXPIRY.ACCESS_TOKEN),
  });

  // Store refresh token
  await db.insert(oauthRefreshTokens).values({
    token: await hashToken(refreshToken),
    userId: storedCode.userId,
    clientId: storedCode.clientId,
    scopes: storedCode.scopes,
    expiresAt: new Date(Date.now() + TOKEN_EXPIRY.REFRESH_TOKEN),
  });

  return c.json({
    access_token: accessToken,
    token_type: 'Bearer',
    expires_in: TOKEN_EXPIRY.ACCESS_TOKEN / 1000, // seconds
    refresh_token: refreshToken,
    scope: storedCode.scopes,
  });
}

/**
 * Refresh access token (OAuth 2.1 requires rotation)
 */
async function handleRefreshTokenGrant(c: any, body: any) {
  const refreshToken = body.refresh_token as string;

  if (!refreshToken) {
    return c.json({
      error: 'invalid_request',
      error_description: 'refresh_token is required',
    }, 400);
  }

  // Find the refresh token
  const tokenHash = await hashToken(refreshToken);
  const [storedToken] = await db
    .select()
    .from(oauthRefreshTokens)
    .where(eq(oauthRefreshTokens.token, tokenHash));

  if (!storedToken) {
    return c.json({
      error: 'invalid_grant',
      error_description: 'Refresh token not found or already used',
    }, 400);
  }

  // Check expiration
  if (new Date() > storedToken.expiresAt) {
    await db.delete(oauthRefreshTokens).where(eq(oauthRefreshTokens.token, tokenHash));
    return c.json({
      error: 'invalid_grant',
      error_description: 'Refresh token has expired',
    }, 400);
  }

  // OAuth 2.1: Rotate refresh token (delete old, create new)
  await db.delete(oauthRefreshTokens).where(eq(oauthRefreshTokens.token, tokenHash));

  // Generate new tokens
  const newAccessToken = generateToken(32);
  const newRefreshToken = generateToken(32);

  // Store new access token
  await db.insert(oauthAccessTokens).values({
    token: await hashToken(newAccessToken),
    userId: storedToken.userId,
    clientId: storedToken.clientId,
    scopes: storedToken.scopes,
    expiresAt: new Date(Date.now() + TOKEN_EXPIRY.ACCESS_TOKEN),
  });

  // Store new refresh token
  await db.insert(oauthRefreshTokens).values({
    token: await hashToken(newRefreshToken),
    userId: storedToken.userId,
    clientId: storedToken.clientId,
    scopes: storedToken.scopes,
    expiresAt: new Date(Date.now() + TOKEN_EXPIRY.REFRESH_TOKEN),
  });

  return c.json({
    access_token: newAccessToken,
    token_type: 'Bearer',
    expires_in: TOKEN_EXPIRY.ACCESS_TOKEN / 1000,
    refresh_token: newRefreshToken,
    scope: storedToken.scopes,
  });
}

export default token;
