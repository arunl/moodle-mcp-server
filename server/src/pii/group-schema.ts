import { sqliteTable, text, integer, uniqueIndex, index } from 'drizzle-orm/sqlite-core';
import { sql } from 'drizzle-orm';

/**
 * PII Groups - stores group/team names for masking
 * 
 * Team names often contain PII (e.g., "Team 01-Webre" contains a last name).
 * Rather than trying to detect PII within names, we mask entire group names.
 * 
 * Token format: G{groupId}_name
 * Example: "Team 01-Webre" → "G12345_name"
 */
export const piiGroups = sqliteTable('pii_groups', {
  id: integer('id').primaryKey({ autoIncrement: true }),
  
  // Owner - the MCP user (instructor) who owns this group entry
  ownerUserId: text('owner_user_id').notNull(),
  
  // Course context
  courseId: integer('course_id').notNull(),
  
  // Moodle group ID - the stable anchor for masking (G#####)
  moodleGroupId: integer('moodle_group_id').notNull(),
  
  // Group name (potentially contains PII)
  groupName: text('group_name').notNull(),
  
  // Optional description
  description: text('description'),
  
  // Timestamps
  createdAt: integer('created_at', { mode: 'timestamp' }).default(sql`CURRENT_TIMESTAMP`),
  updatedAt: integer('updated_at', { mode: 'timestamp' }).default(sql`CURRENT_TIMESTAMP`),
  
}, (table) => ({
  // Unique constraint: one entry per owner + course + moodle group
  uniqueGroupEntry: uniqueIndex('unique_group_entry').on(
    table.ownerUserId,
    table.courseId,
    table.moodleGroupId
  ),
  // Index for efficient lookups by course
  courseIdx: index('group_course_idx').on(table.ownerUserId, table.courseId),
}));

// Types
export type PiiGroupEntry = typeof piiGroups.$inferSelect;
export type NewPiiGroupEntry = typeof piiGroups.$inferInsert;
