/**
 * OAuth 2.1 Provider Database Schema
 * 
 * Tables for OAuth clients, authorization codes, access tokens, and refresh tokens.
 * 
 * Note: user_id references users.id but we don't use Drizzle's .references()
 * here to avoid circular import issues with drizzle-kit.
 */

import { sqliteTable, text, integer } from 'drizzle-orm/sqlite-core';

// OAuth clients (registered via RFC 7591 Dynamic Client Registration)
export const oauthClients = sqliteTable('oauth_clients', {
  clientId: text('client_id').primaryKey(),
  clientSecret: text('client_secret').notNull(), // hashed
  clientName: text('client_name'),
  redirectUris: text('redirect_uris').notNull(), // JSON array
  grantTypes: text('grant_types').notNull(), // JSON array
  responseTypes: text('response_types').notNull(), // JSON array
  tokenEndpointAuthMethod: text('token_endpoint_auth_method').default('client_secret_post'),
  createdAt: integer('created_at', { mode: 'timestamp' }).$defaultFn(() => new Date()),
});

// Authorization codes (short-lived, exchanged for tokens)
export const oauthCodes = sqliteTable('oauth_codes', {
  code: text('code').primaryKey(), // hashed
  userId: text('user_id').notNull(), // references users.id
  clientId: text('client_id'), // optional - ChatGPT may not provide
  redirectUri: text('redirect_uri').notNull(),
  scopes: text('scopes').notNull(),
  codeChallenge: text('code_challenge').notNull(), // PKCE required in OAuth 2.1
  codeChallengeMethod: text('code_challenge_method').notNull(), // S256
  expiresAt: integer('expires_at', { mode: 'timestamp' }).notNull(),
  createdAt: integer('created_at', { mode: 'timestamp' }).$defaultFn(() => new Date()),
});

// Access tokens issued to OAuth clients
export const oauthAccessTokens = sqliteTable('oauth_access_tokens', {
  token: text('token').primaryKey(), // hashed
  userId: text('user_id').notNull(), // references users.id
  clientId: text('client_id'),
  scopes: text('scopes').notNull(),
  expiresAt: integer('expires_at', { mode: 'timestamp' }).notNull(),
  createdAt: integer('created_at', { mode: 'timestamp' }).$defaultFn(() => new Date()),
});

// Refresh tokens (OAuth 2.1 requires rotation)
export const oauthRefreshTokens = sqliteTable('oauth_refresh_tokens', {
  token: text('token').primaryKey(), // hashed
  userId: text('user_id').notNull(), // references users.id
  clientId: text('client_id'),
  scopes: text('scopes').notNull(),
  expiresAt: integer('expires_at', { mode: 'timestamp' }).notNull(),
  createdAt: integer('created_at', { mode: 'timestamp' }).$defaultFn(() => new Date()),
});
