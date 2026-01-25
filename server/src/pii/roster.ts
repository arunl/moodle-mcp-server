import { db } from '../db/index.js';
import { piiRosters, type PiiRosterEntry, type NewPiiRosterEntry } from './schema.js';
import { eq, and } from 'drizzle-orm';

/**
 * Participant data from Moodle (as returned by list_participants tool)
 */
export interface MoodleParticipant {
  id: number;           // Moodle user ID
  name: string;         // Display name
  email: string;
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
    
    const entry: NewPiiRosterEntry = {
      ownerUserId,
      courseId,
      moodleUserId: participant.id,
      displayName: participant.name,
      email: participant.email,
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
    byEmail.set(entry.email.toLowerCase(), entry);
    if (entry.studentId) {
      byStudentId.set(entry.studentId.toUpperCase(), entry);
    }
    byMoodleId.set(entry.moodleUserId, entry);
  }
  
  return { byName, byEmail, byStudentId, byMoodleId };
}
