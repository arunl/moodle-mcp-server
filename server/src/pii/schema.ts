import { sqliteTable, text, integer, uniqueIndex } from 'drizzle-orm/sqlite-core';
import { sql } from 'drizzle-orm';

/**
 * PII Roster - stores student/participant info for masking
 * 
 * This table maps Moodle user IDs to their PII (name, email, student ID).
 * Used for:
 * - Masking PII before sending to LLMs (egress)
 * - Unmasking PII when posting back to Moodle (ingress)
 */
export const piiRosters = sqliteTable('pii_rosters', {
  id: integer('id').primaryKey({ autoIncrement: true }),
  
  // Owner - the MCP user (instructor) who owns this roster entry
  ownerUserId: text('owner_user_id').notNull(),
  
  // Course context
  courseId: integer('course_id').notNull(),
  
  // Moodle user ID - the stable anchor for masking (M#####)
  moodleUserId: integer('moodle_user_id').notNull(),
  
  // PII fields
  displayName: text('display_name').notNull(),
  studentId: text('student_id'), // C######## - nullable for non-students
  email: text('email').notNull(),
  
  // Role in course (student, editingteacher, teacher, etc.)
  role: text('role').default('student'),
  
  // Timestamps
  createdAt: integer('created_at', { mode: 'timestamp' }).default(sql`CURRENT_TIMESTAMP`),
  updatedAt: integer('updated_at', { mode: 'timestamp' }).default(sql`CURRENT_TIMESTAMP`),
  
}, (table) => ({
  // Unique constraint: one entry per owner + course + moodle user
  uniqueRosterEntry: uniqueIndex('unique_roster_entry').on(
    table.ownerUserId,
    table.courseId,
    table.moodleUserId
  ),
  // Index for efficient lookups by course
  courseIdx: uniqueIndex('roster_course_idx').on(table.ownerUserId, table.courseId),
}));

// Type for roster entries
export type PiiRosterEntry = typeof piiRosters.$inferSelect;
export type NewPiiRosterEntry = typeof piiRosters.$inferInsert;
