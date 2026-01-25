/**
 * OAuth 2.1 Discovery Endpoint
 * 
 * Returns server metadata at /.well-known/oauth-authorization-server
 * ChatGPT and other clients use this to discover endpoint URLs.
 */

import { Hono } from 'hono';

const discovery = new Hono();

discovery.get('/oauth-authorization-server', (c) => {
  const baseUrl = process.env.SERVER_URL || 'http://localhost:8080';
  
  return c.json({
    // Required metadata
    issuer: baseUrl,
    authorization_endpoint: `${baseUrl}/oauth/authorize`,
    token_endpoint: `${baseUrl}/oauth/token`,
    
    // RFC 7591 Dynamic Client Registration
    registration_endpoint: `${baseUrl}/oauth/register`,
    
    // Supported features
    response_types_supported: ['code'],
    grant_types_supported: ['authorization_code', 'refresh_token'],
    code_challenge_methods_supported: ['S256'], // PKCE required in OAuth 2.1
    token_endpoint_auth_methods_supported: ['none', 'client_secret_post'],
    
    // Scopes
    scopes_supported: ['openid', 'profile', 'email', 'mcp'],
    
    // Optional endpoints
    userinfo_endpoint: `${baseUrl}/oauth/userinfo`,
  });
});

export default discovery;
