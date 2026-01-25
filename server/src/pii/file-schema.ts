/**
 * Database schema for PII file downloads
 * 
 * Stores masked files uploaded by LLMs, which are then
 * unmasked and made available for download.
 */

import { sqliteTable, text, integer, blob } from 'drizzle-orm/sqlite-core';
import { sql } from 'drizzle-orm';

/**
 * Pending file downloads
 * 
 * Files are stored temporarily (1 hour expiry by default)
 * and deleted after download or expiration.
 */
export const piiFiles = sqliteTable('pii_files', {
  // Unique download token (used in URL)
  id: text('id').primaryKey(),
  
  // Owner - the MCP user who created this file
  ownerUserId: text('owner_user_id').notNull(),
  
  // Course context (for roster lookup)
  courseId: integer('course_id').notNull(),
  
  // File metadata
  filename: text('filename').notNull(),
  mimeType: text('mime_type').notNull(),
  
  // File content (masked - will be unmasked on download)
  content: blob('content', { mode: 'buffer' }).notNull(),
  
  // Whether the file has been unmasked yet
  isUnmasked: integer('is_unmasked', { mode: 'boolean' }).default(false),
  
  // Expiration (files auto-delete after this time)
  expiresAt: integer('expires_at', { mode: 'timestamp' }).notNull(),
  
  // Timestamps
  createdAt: integer('created_at', { mode: 'timestamp' }).default(sql`CURRENT_TIMESTAMP`),
  downloadedAt: integer('downloaded_at', { mode: 'timestamp' }),
});

export type PiiFile = typeof piiFiles.$inferSelect;
export type NewPiiFile = typeof piiFiles.$inferInsert;
