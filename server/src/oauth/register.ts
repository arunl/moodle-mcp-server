/**
 * OAuth 2.1 Dynamic Client Registration (RFC 7591)
 * 
 * Allows clients like ChatGPT to register themselves automatically.
 */

import { Hono } from 'hono';
import { db } from '../db/index.js';
import { oauthClients } from './schema.js';
import { generateToken, hashToken } from './utils.js';

const register = new Hono();

/**
 * POST /oauth/register
 * 
 * RFC 7591 Dynamic Client Registration endpoint.
 * Clients send metadata and receive client_id + client_secret.
 */
register.post('/register', async (c) => {
  const body = await c.req.json();
  
  // Extract client metadata from request
  const {
    client_name,
    redirect_uris,
    grant_types = ['authorization_code', 'refresh_token'],
    response_types = ['code'],
    token_endpoint_auth_method = 'client_secret_post',
  } = body;

  // Validate required fields
  if (!redirect_uris || !Array.isArray(redirect_uris) || redirect_uris.length === 0) {
    return c.json({
      error: 'invalid_client_metadata',
      error_description: 'redirect_uris is required and must be a non-empty array',
    }, 400);
  }

  // Validate redirect URIs (must be valid URLs)
  for (const uri of redirect_uris) {
    try {
      new URL(uri);
    } catch {
      return c.json({
        error: 'invalid_redirect_uri',
        error_description: `Invalid redirect URI: ${uri}`,
      }, 400);
    }
  }

  // Generate client credentials
  const clientId = `client_${generateToken(16)}`;
  const clientSecret = generateToken(32);
  const clientSecretHash = await hashToken(clientSecret);

  // Store client in database
  await db.insert(oauthClients).values({
    clientId,
    clientSecret: clientSecretHash,
    clientName: client_name || null,
    redirectUris: JSON.stringify(redirect_uris),
    grantTypes: JSON.stringify(grant_types),
    responseTypes: JSON.stringify(response_types),
    tokenEndpointAuthMethod: token_endpoint_auth_method,
  });

  console.log(`[OAuth] Registered new client: ${clientId} (${client_name || 'unnamed'})`);

  // Return client credentials (RFC 7591 response)
  return c.json({
    client_id: clientId,
    client_secret: clientSecret,
    client_name: client_name || undefined,
    redirect_uris,
    grant_types,
    response_types,
    token_endpoint_auth_method,
    client_id_issued_at: Math.floor(Date.now() / 1000),
    client_secret_expires_at: 0, // 0 = never expires
  }, 201);
});

export default register;
