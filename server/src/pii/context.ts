import { getRoster, syncRoster, type MoodleParticipant } from './roster.js';
import { maskStructuredData, unmaskStructuredData } from './mask.js';
import { type PiiRosterEntry } from './schema.js';

/**
 * PII Context Manager
 * 
 * Tracks per-user course context and provides masking/unmasking for MCP tool calls.
 * 
 * Usage:
 * 1. When a tool extracts participant data, call updateRoster()
 * 2. When returning tool results to LLM, call maskResult()
 * 3. When processing tool args from LLM, call unmaskArgs()
 */

// In-memory cache of current course context per user
const userCourseContext = new Map<string, number>();

// In-memory cache of rosters (to avoid DB calls on every mask/unmask)
const rosterCache = new Map<string, { roster: PiiRosterEntry[]; timestamp: number }>();
const CACHE_TTL_MS = 5 * 60 * 1000; // 5 minutes

/**
 * Set the current course context for a user
 */
export function setCourseContext(userId: string, courseId: number): void {
  userCourseContext.set(userId, courseId);
}

/**
 * Get the current course context for a user
 */
export function getCourseContext(userId: string): number | undefined {
  return userCourseContext.get(userId);
}

/**
 * Clear course context for a user
 */
export function clearCourseContext(userId: string): void {
  userCourseContext.delete(userId);
}

/**
 * Get roster from cache or database
 */
async function getCachedRoster(userId: string, courseId: number): Promise<PiiRosterEntry[]> {
  const cacheKey = `${userId}:${courseId}`;
  const cached = rosterCache.get(cacheKey);
  
  if (cached && Date.now() - cached.timestamp < CACHE_TTL_MS) {
    return cached.roster;
  }
  
  // Fetch from database
  const roster = await getRoster(userId, courseId);
  rosterCache.set(cacheKey, { roster, timestamp: Date.now() });
  
  return roster;
}

/**
 * Invalidate roster cache for a user/course
 */
export function invalidateRosterCache(userId: string, courseId: number): void {
  const cacheKey = `${userId}:${courseId}`;
  rosterCache.delete(cacheKey);
}

/**
 * Update roster when participant data is extracted
 * Call this when list_participants, get_enrolled_users, etc. return data
 */
export async function updateRoster(
  userId: string,
  courseId: number,
  participants: MoodleParticipant[]
): Promise<void> {
  await syncRoster(userId, courseId, participants);
  invalidateRosterCache(userId, courseId);
  setCourseContext(userId, courseId);
}

/**
 * Mask tool result before sending to LLM
 */
export async function maskResult(
  userId: string,
  result: unknown,
  courseIdOverride?: number
): Promise<unknown> {
  const courseId = courseIdOverride ?? getCourseContext(userId);
  
  if (!courseId) {
    // No course context - apply one-way masking only (no roster lookup)
    console.log(`[PII] maskResult: no courseId, applying one-way masking only`);
    return maskStructuredData(result, []);
  }
  
  const roster = await getCachedRoster(userId, courseId);
  console.log(`[PII] maskResult: courseId=${courseId}, roster size=${roster.length}`);
  return maskStructuredData(result, roster);
}

/**
 * Unmask tool arguments before processing
 */
export async function unmaskArgs(
  userId: string,
  args: Record<string, unknown>,
  courseIdOverride?: number
): Promise<Record<string, unknown>> {
  const courseId = courseIdOverride ?? getCourseContext(userId);
  
  if (!courseId) {
    // No course context - can't unmask, return as-is
    return args;
  }
  
  const roster = await getCachedRoster(userId, courseId);
  return unmaskStructuredData(args, roster) as Record<string, unknown>;
}

/**
 * Extract course ID from tool arguments if present
 */
export function extractCourseId(toolName: string, args: Record<string, unknown>): number | undefined {
  // Tools that have course_id parameter
  const courseIdParam = args.course_id;
  if (typeof courseIdParam === 'number') {
    return courseIdParam;
  }
  
  return undefined;
}

/**
 * Check if a tool returns participant data that should update the roster
 */
export function shouldUpdateRoster(toolName: string): boolean {
  return [
    'list_participants',
    'get_enrolled_users',
    'analyze_forum',
    'analyze_feedback',
  ].includes(toolName);
}

/**
 * Check if a tool's args should be unmasked (contains content that might have mask tokens)
 */
export function shouldUnmaskArgs(toolName: string): boolean {
  return [
    'create_forum_post',
    'type_text',
    'set_editor_content',
    'create_assignment',
    'edit_assignment',
    'send_message',
    'bulk_send_message',
  ].includes(toolName);
}

/**
 * Extract participant data from tool result for roster sync
 */
export function extractParticipantsFromResult(
  toolName: string,
  result: unknown
): MoodleParticipant[] | null {
  if (!result || typeof result !== 'object') {
    return null;
  }
  
  const data = result as Record<string, unknown>;
  
  switch (toolName) {
    case 'list_participants':
    case 'get_enrolled_users':
      // Result has { participants: [...] }
      // Fields: name, userId (moodle ID), username (student ID like C00509352), role
      const participants = data.participants;
      if (Array.isArray(participants)) {
        return participants.map((p: Record<string, unknown>) => ({
          id: (p.userId ?? p.id) as number, // userId is the Moodle ID
          name: p.name as string,
          email: p.email as string | undefined,
          roles: p.role ? [p.role as string] : (p.roles as string[] | undefined),
          studentId: (p.username ?? p.studentId) as string | undefined, // username is C00XXXXXX
        }));
      }
      break;
      
    case 'analyze_forum':
    case 'analyze_feedback':
      // These might have participants embedded
      // For now, don't extract - let explicit list_participants handle it
      break;
  }
  
  return null;
}
