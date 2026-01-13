import { pgTable, uuid, varchar, timestamp, text, boolean } from 'drizzle-orm/pg-core';

// Users table - stores registered users
export const users = pgTable('users', {
  id: uuid('id').primaryKey().defaultRandom(),
  email: varchar('email', { length: 255 }).notNull().unique(),
  name: varchar('name', { length: 255 }),
  picture: varchar('picture', { length: 500 }),
  googleId: varchar('google_id', { length: 255 }).unique(),
  createdAt: timestamp('created_at').defaultNow().notNull(),
  updatedAt: timestamp('updated_at').defaultNow().notNull(),
});

// API Keys table - for MCP client authentication
export const apiKeys = pgTable('api_keys', {
  id: uuid('id').primaryKey().defaultRandom(),
  userId: uuid('user_id').references(() => users.id, { onDelete: 'cascade' }).notNull(),
  keyHash: varchar('key_hash', { length: 64 }).notNull(), // SHA-256 hash
  keyPrefix: varchar('key_prefix', { length: 12 }).notNull(), // "mcp_" + first 8 chars
  name: varchar('name', { length: 100 }).default('Default'),
  createdAt: timestamp('created_at').defaultNow().notNull(),
  lastUsedAt: timestamp('last_used_at'),
  revokedAt: timestamp('revoked_at'),
});

// Browser Sessions - tracks connected browser extensions
export const browserSessions = pgTable('browser_sessions', {
  id: uuid('id').primaryKey().defaultRandom(),
  userId: uuid('user_id').references(() => users.id, { onDelete: 'cascade' }).notNull(),
  connectionId: varchar('connection_id', { length: 100 }).notNull(), // WebSocket connection ID
  moodleUrl: varchar('moodle_url', { length: 500 }),
  userAgent: varchar('user_agent', { length: 500 }),
  connectedAt: timestamp('connected_at').defaultNow().notNull(),
  lastPingAt: timestamp('last_ping_at'),
  disconnectedAt: timestamp('disconnected_at'),
});

// Refresh Tokens - for browser extension auth
export const refreshTokens = pgTable('refresh_tokens', {
  id: uuid('id').primaryKey().defaultRandom(),
  userId: uuid('user_id').references(() => users.id, { onDelete: 'cascade' }).notNull(),
  tokenHash: varchar('token_hash', { length: 64 }).notNull(),
  expiresAt: timestamp('expires_at').notNull(),
  createdAt: timestamp('created_at').defaultNow().notNull(),
  revokedAt: timestamp('revoked_at'),
});

// Types for TypeScript
export type User = typeof users.$inferSelect;
export type NewUser = typeof users.$inferInsert;
export type ApiKey = typeof apiKeys.$inferSelect;
export type NewApiKey = typeof apiKeys.$inferInsert;
export type BrowserSession = typeof browserSessions.$inferSelect;
export type NewBrowserSession = typeof browserSessions.$inferInsert;
