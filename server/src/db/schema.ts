import { sqliteTable, text, integer } from 'drizzle-orm/sqlite-core';

// Users table - stores registered users
export const users = sqliteTable('users', {
  id: text('id').primaryKey().$defaultFn(() => crypto.randomUUID()),
  email: text('email').notNull().unique(),
  name: text('name'),
  picture: text('picture'),
  googleId: text('google_id').unique(),
  createdAt: integer('created_at', { mode: 'timestamp' }).$defaultFn(() => new Date()),
  updatedAt: integer('updated_at', { mode: 'timestamp' }).$defaultFn(() => new Date()),
});

// API Keys table - for MCP client authentication
export const apiKeys = sqliteTable('api_keys', {
  id: text('id').primaryKey().$defaultFn(() => crypto.randomUUID()),
  userId: text('user_id').references(() => users.id, { onDelete: 'cascade' }).notNull(),
  keyHash: text('key_hash').notNull(), // SHA-256 hash
  keyPrefix: text('key_prefix').notNull(), // "mcp_" + first 8 chars
  name: text('name').default('Default'),
  createdAt: integer('created_at', { mode: 'timestamp' }).$defaultFn(() => new Date()),
  lastUsedAt: integer('last_used_at', { mode: 'timestamp' }),
  revokedAt: integer('revoked_at', { mode: 'timestamp' }),
});

// Browser Sessions - tracks connected browser extensions
export const browserSessions = sqliteTable('browser_sessions', {
  id: text('id').primaryKey().$defaultFn(() => crypto.randomUUID()),
  userId: text('user_id').references(() => users.id, { onDelete: 'cascade' }).notNull(),
  connectionId: text('connection_id').notNull(),
  moodleUrl: text('moodle_url'),
  userAgent: text('user_agent'),
  connectedAt: integer('connected_at', { mode: 'timestamp' }).$defaultFn(() => new Date()),
  lastPingAt: integer('last_ping_at', { mode: 'timestamp' }),
  disconnectedAt: integer('disconnected_at', { mode: 'timestamp' }),
});

// Refresh Tokens - for browser extension auth
export const refreshTokens = sqliteTable('refresh_tokens', {
  id: text('id').primaryKey().$defaultFn(() => crypto.randomUUID()),
  userId: text('user_id').references(() => users.id, { onDelete: 'cascade' }).notNull(),
  tokenHash: text('token_hash').notNull(),
  expiresAt: integer('expires_at', { mode: 'timestamp' }).notNull(),
  createdAt: integer('created_at', { mode: 'timestamp' }).$defaultFn(() => new Date()),
  revokedAt: integer('revoked_at', { mode: 'timestamp' }),
});

// Types for TypeScript
export type User = typeof users.$inferSelect;
export type NewUser = typeof users.$inferInsert;
export type ApiKey = typeof apiKeys.$inferSelect;
export type NewApiKey = typeof apiKeys.$inferInsert;
export type BrowserSession = typeof browserSessions.$inferSelect;
export type NewBrowserSession = typeof browserSessions.$inferInsert;
