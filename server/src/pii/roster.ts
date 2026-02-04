import { db } from '../db/index.js';
import { piiRosters, type PiiRosterEntry, type NewPiiRosterEntry } from './schema.js';
import { piiCourses, type PiiCourse } from './course-schema.js';
import { piiGroups, type PiiGroupEntry, type NewPiiGroupEntry } from './group-schema.js';
import { eq, and } from 'drizzle-orm';

/**
 * Participant data from Moodle (as returned by list_participants tool)
 */
export interface MoodleParticipant {
  id: number;           // Moodle user ID
  name: string;         // Display name
  email?: string;       // May not be available from all tools
  roles?: string[];     // e.g., ['Student', 'Non-editing teacher']
  lastAccess?: string;
  studentId?: string;   // C######## if available
}

/**
 * Sync roster for a course from participant data
 * Called when list_participants or get_enrolled_users returns data
 */
export async function syncRoster(
  ownerUserId: string,
  courseId: number,
  participants: MoodleParticipant[]
): Promise<void> {
  const now = new Date();
  
  for (const participant of participants) {
    // Skip participants without required fields (email is optional)
    if (!participant.id || !participant.name) {
      console.warn(`Skipping participant with missing id or name:`, participant);
      continue;
    }
    // Determine role (use first role or default to 'student')
    const role = participant.roles?.[0]?.toLowerCase() || 'student';
    
    // Extract student ID if present (pattern: C followed by digits)
    let studentId = participant.studentId;
    if (!studentId) {
      // Try to extract from name or other fields if institution uses it
      const cidMatch = participant.name.match(/\b(C\d{7,8})\b/i);
      if (cidMatch) {
        studentId = cidMatch[1].toUpperCase();
      }
    }
    
    // Construct email from student ID if not provided (common pattern: c00123456@louisiana.edu)
    let email = participant.email;
    if (!email && studentId) {
      email = `${studentId.toLowerCase()}@louisiana.edu`;
    }
    
    const entry: NewPiiRosterEntry = {
      ownerUserId,
      courseId,
      moodleUserId: participant.id,
      displayName: participant.name,
      email: email || null,
      studentId: studentId || null,
      role,
      updatedAt: now,
    };
    
    // Upsert: insert or update on conflict
    await db
      .insert(piiRosters)
      .values(entry)
      .onConflictDoUpdate({
        target: [piiRosters.ownerUserId, piiRosters.courseId, piiRosters.moodleUserId],
        set: {
          displayName: entry.displayName,
          email: entry.email,
          studentId: entry.studentId,
          role: entry.role,
          updatedAt: now,
        },
      });
  }
}

/**
 * Get roster for a specific course
 */
export async function getRoster(
  ownerUserId: string,
  courseId: number
): Promise<PiiRosterEntry[]> {
  return db
    .select()
    .from(piiRosters)
    .where(
      and(
        eq(piiRosters.ownerUserId, ownerUserId),
        eq(piiRosters.courseId, courseId)
      )
    );
}

/**
 * Get all rosters for a user (across all courses)
 */
export async function getAllRosters(ownerUserId: string): Promise<PiiRosterEntry[]> {
  return db
    .select()
    .from(piiRosters)
    .where(eq(piiRosters.ownerUserId, ownerUserId));
}

/**
 * Find roster entry by Moodle user ID
 */
export async function findByMoodleId(
  ownerUserId: string,
  courseId: number,
  moodleUserId: number
): Promise<PiiRosterEntry | undefined> {
  const results = await db
    .select()
    .from(piiRosters)
    .where(
      and(
        eq(piiRosters.ownerUserId, ownerUserId),
        eq(piiRosters.courseId, courseId),
        eq(piiRosters.moodleUserId, moodleUserId)
      )
    );
  return results[0];
}

/**
 * Clear roster for a course (useful for full refresh)
 */
export async function clearRoster(
  ownerUserId: string,
  courseId: number
): Promise<void> {
  await db
    .delete(piiRosters)
    .where(
      and(
        eq(piiRosters.ownerUserId, ownerUserId),
        eq(piiRosters.courseId, courseId)
      )
    );
}

/**
 * Build a lookup map for efficient masking
 * Returns maps for name → entry, email → entry, studentId → entry
 */
export function buildRosterLookup(roster: PiiRosterEntry[]): {
  byName: Map<string, PiiRosterEntry>;
  byEmail: Map<string, PiiRosterEntry>;
  byStudentId: Map<string, PiiRosterEntry>;
  byMoodleId: Map<number, PiiRosterEntry>;
} {
  const byName = new Map<string, PiiRosterEntry>();
  const byEmail = new Map<string, PiiRosterEntry>();
  const byStudentId = new Map<string, PiiRosterEntry>();
  const byMoodleId = new Map<number, PiiRosterEntry>();
  
  for (const entry of roster) {
    byName.set(entry.displayName.toLowerCase(), entry);
    if (entry.email) {
      byEmail.set(entry.email.toLowerCase(), entry);
    }
    if (entry.studentId) {
      byStudentId.set(entry.studentId.toUpperCase(), entry);
    }
    byMoodleId.set(entry.moodleUserId, entry);
  }
  
  return { byName, byEmail, byStudentId, byMoodleId };
}

/**
 * Store or update course name
 * Called when list_participants extracts course info
 */
export async function upsertCourseName(
  ownerUserId: string,
  courseId: number,
  courseName: string
): Promise<void> {
  const now = new Date();
  
  await db
    .insert(piiCourses)
    .values({
      ownerUserId,
      courseId,
      courseName,
      updatedAt: now,
    })
    .onConflictDoUpdate({
      target: [piiCourses.ownerUserId, piiCourses.courseId],
      set: {
        courseName,
        updatedAt: now,
      },
    });
}

/**
 * Get all courses for a user (for dropdown selectors)
 */
export async function getUserCourses(ownerUserId: string): Promise<PiiCourse[]> {
  return db
    .select()
    .from(piiCourses)
    .where(eq(piiCourses.ownerUserId, ownerUserId));
}

/**
 * Get course name by ID
 */
export async function getCourseName(
  ownerUserId: string,
  courseId: number
): Promise<string | null> {
  const results = await db
    .select()
    .from(piiCourses)
    .where(
      and(
        eq(piiCourses.ownerUserId, ownerUserId),
        eq(piiCourses.courseId, courseId)
      )
    );
  return results[0]?.courseName || null;
}

// ============================================================================
// Group/Team Management
// ============================================================================

/**
 * Group data from Moodle (as returned by group-related tools)
 */
export interface MoodleGroup {
  id: number;           // Moodle group ID
  name: string;         // Group name (e.g., "Team 01-Webre")
  description?: string;
}

/**
 * Sync groups for a course from group data
 * Called when get_course_content or group-related tools return data
 */
export async function syncGroups(
  ownerUserId: string,
  courseId: number,
  groups: MoodleGroup[]
): Promise<void> {
  const now = new Date();
  
  for (const group of groups) {
    if (!group.id || !group.name) {
      console.warn(`Skipping group with missing id or name:`, group);
      continue;
    }
    
    const entry: NewPiiGroupEntry = {
      ownerUserId,
      courseId,
      moodleGroupId: group.id,
      groupName: group.name,
      description: group.description || null,
      updatedAt: now,
    };
    
    // Upsert: insert or update on conflict
    await db
      .insert(piiGroups)
      .values(entry)
      .onConflictDoUpdate({
        target: [piiGroups.ownerUserId, piiGroups.courseId, piiGroups.moodleGroupId],
        set: {
          groupName: entry.groupName,
          description: entry.description,
          updatedAt: now,
        },
      });
  }
}

/**
 * Get groups for a specific course
 */
export async function getGroups(
  ownerUserId: string,
  courseId: number
): Promise<PiiGroupEntry[]> {
  return db
    .select()
    .from(piiGroups)
    .where(
      and(
        eq(piiGroups.ownerUserId, ownerUserId),
        eq(piiGroups.courseId, courseId)
      )
    );
}

/**
 * Find group by Moodle group ID
 */
export async function findGroupByMoodleId(
  ownerUserId: string,
  courseId: number,
  moodleGroupId: number
): Promise<PiiGroupEntry | undefined> {
  const results = await db
    .select()
    .from(piiGroups)
    .where(
      and(
        eq(piiGroups.ownerUserId, ownerUserId),
        eq(piiGroups.courseId, courseId),
        eq(piiGroups.moodleGroupId, moodleGroupId)
      )
    );
  return results[0];
}

/**
 * Clear groups for a course (useful for full refresh)
 */
export async function clearGroups(
  ownerUserId: string,
  courseId: number
): Promise<void> {
  await db
    .delete(piiGroups)
    .where(
      and(
        eq(piiGroups.ownerUserId, ownerUserId),
        eq(piiGroups.courseId, courseId)
      )
    );
}

/**
 * Build a lookup map for efficient group masking
 * Returns maps for groupName → entry, moodleGroupId → entry
 */
export function buildGroupLookup(groups: PiiGroupEntry[]): {
  byName: Map<string, PiiGroupEntry>;
  byMoodleId: Map<number, PiiGroupEntry>;
} {
  const byName = new Map<string, PiiGroupEntry>();
  const byMoodleId = new Map<number, PiiGroupEntry>();
  
  for (const entry of groups) {
    byName.set(entry.groupName.toLowerCase(), entry);
    byMoodleId.set(entry.moodleGroupId, entry);
  }
  
  return { byName, byMoodleId };
}
