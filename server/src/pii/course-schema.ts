import { sqliteTable, text, integer, uniqueIndex } from 'drizzle-orm/sqlite-core';
import { sql } from 'drizzle-orm';

/**
 * PII Courses - stores course metadata for the file upload dropdown
 * 
 * This table maps Moodle course IDs to their names.
 * Populated when list_participants is called.
 */
export const piiCourses = sqliteTable('pii_courses', {
  id: integer('id').primaryKey({ autoIncrement: true }),
  
  // Owner - the MCP user (instructor) who owns this course entry
  ownerUserId: text('owner_user_id').notNull(),
  
  // Course info
  courseId: integer('course_id').notNull(),
  courseName: text('course_name').notNull(), // e.g., "CMPS453-001-202640 Artificial Intelligence"
  
  // Timestamps
  createdAt: integer('created_at', { mode: 'timestamp' }).default(sql`CURRENT_TIMESTAMP`),
  updatedAt: integer('updated_at', { mode: 'timestamp' }).default(sql`CURRENT_TIMESTAMP`),
  
}, (table) => ({
  // Unique constraint: one entry per owner + course
  uniqueCourseEntry: uniqueIndex('unique_course_entry').on(
    table.ownerUserId,
    table.courseId
  ),
}));

export type PiiCourse = typeof piiCourses.$inferSelect;
export type NewPiiCourse = typeof piiCourses.$inferInsert;
