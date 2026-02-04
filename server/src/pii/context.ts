import { getRoster, syncRoster, getGroups, syncGroups, type MoodleParticipant, type MoodleGroup } from './roster.js';
import { maskStructuredData, unmaskStructuredData } from './mask.js';
import { type PiiRosterEntry } from './schema.js';
import { type PiiGroupEntry } from './group-schema.js';

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

// In-memory cache of groups (to avoid DB calls on every mask/unmask)
const groupCache = new Map<string, { groups: PiiGroupEntry[]; timestamp: number }>();

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
 * Get groups from cache or database
 */
async function getCachedGroups(userId: string, courseId: number): Promise<PiiGroupEntry[]> {
  const cacheKey = `${userId}:${courseId}`;
  const cached = groupCache.get(cacheKey);
  
  if (cached && Date.now() - cached.timestamp < CACHE_TTL_MS) {
    return cached.groups;
  }
  
  // Fetch from database
  const groups = await getGroups(userId, courseId);
  groupCache.set(cacheKey, { groups, timestamp: Date.now() });
  
  return groups;
}

/**
 * Invalidate roster cache for a user/course
 */
export function invalidateRosterCache(userId: string, courseId: number): void {
  const cacheKey = `${userId}:${courseId}`;
  rosterCache.delete(cacheKey);
}

/**
 * Invalidate group cache for a user/course
 */
export function invalidateGroupCache(userId: string, courseId: number): void {
  const cacheKey = `${userId}:${courseId}`;
  groupCache.delete(cacheKey);
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
 * Update groups when group data is extracted
 * Call this when get_course_content, group-related tools return data
 */
export async function updateGroups(
  userId: string,
  courseId: number,
  groups: MoodleGroup[]
): Promise<void> {
  await syncGroups(userId, courseId, groups);
  invalidateGroupCache(userId, courseId);
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
    return maskStructuredData(result, [], []);
  }
  
  const roster = await getCachedRoster(userId, courseId);
  const groups = await getCachedGroups(userId, courseId);
  console.log(`[PII] maskResult: courseId=${courseId}, roster size=${roster.length}, groups size=${groups.length}`);
  return maskStructuredData(result, roster, groups);
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
  
  console.log(`[PII] unmaskArgs: userId=${userId}, courseIdOverride=${courseIdOverride}, resolvedCourseId=${courseId}`);
  
  if (!courseId) {
    // No course context - can't unmask, return as-is
    console.log('[PII] unmaskArgs: No courseId, skipping unmask');
    return args;
  }
  
  const roster = await getCachedRoster(userId, courseId);
  const groups = await getCachedGroups(userId, courseId);
  console.log(`[PII] unmaskArgs: roster size=${roster.length}, groups size=${groups.length}`);
  
  if (roster.length > 0) {
    // Log sample of roster entries for debugging
    const sample = roster.slice(0, 3).map(e => `M${e.moodleUserId}=${e.displayName}`);
    console.log(`[PII] unmaskArgs: sample roster entries: ${sample.join(', ')}`);
  }
  
  const result = unmaskStructuredData(args, roster, groups) as Record<string, unknown>;
  
  // Check if any string fields changed
  const argsStr = JSON.stringify(args);
  const resultStr = JSON.stringify(result);
  if (argsStr !== resultStr) {
    console.log('[PII] unmaskArgs: Content was modified by unmask');
  } else {
    console.log('[PII] unmaskArgs: Content unchanged (no tokens matched or roster/groups empty)');
  }
  
  return result;
}

/**
 * Extract course ID from tool arguments
 * 
 * All course-specific tools MUST provide course_id. This function extracts it
 * and validates that it's present for tools that require it.
 * 
 * Tools that DON'T require course_id (course discovery / low-level primitives):
 * - get_browser_status, get_courses, browse_moodle
 * - click_element, type_text, wait_for_element, extract_page_content
 * - set_editor_content (uses course_id only for unmasking, optional)
 */
export function extractCourseId(toolName: string, args: Record<string, unknown>, userId?: string): number | undefined {
  const courseIdParam = args.course_id;
  if (typeof courseIdParam === 'number') {
    return courseIdParam;
  }
  
  // Tools that don't require course_id (discovery and low-level primitives)
  const toolsWithoutCourseRequirement = [
    'get_browser_status',
    'get_courses',
    'browse_moodle',
    'click_element',
    'type_text',
    'wait_for_element',
    'extract_page_content',
    'set_editor_content',  // Optional - only for unmasking
  ];
  
  if (!toolsWithoutCourseRequirement.includes(toolName)) {
    // This tool SHOULD have course_id but doesn't - log warning
    // In future, this could throw an error to enforce the requirement
    console.warn(`[PII] extractCourseId: Tool '${toolName}' called without course_id - PII masking will fail!`);
    
    // Try to use existing context as fallback (for backwards compatibility during transition)
    if (userId) {
      const existingContext = getCourseContext(userId);
      if (existingContext) {
        console.log(`[PII] extractCourseId: Using fallback context ${existingContext} for ${toolName}`);
        return existingContext;
      }
    }
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
