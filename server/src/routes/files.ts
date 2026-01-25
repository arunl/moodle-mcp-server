/**
 * File Download Routes
 * 
 * Handles:
 * - POST /files/upload - LLM uploads a masked file
 * - GET /files/:id - User downloads the unmasked file
 * - GET /files/:id/status - Check file status
 * 
 * Flow:
 * 1. LLM generates content with masked PII (M12345:name, etc.)
 * 2. LLM calls upload endpoint with masked CSV/DOCX/etc.
 * 3. Server stores file and returns download URL
 * 4. User clicks download link
 * 5. Server unmasks PII using roster and serves file
 */

import { Hono } from 'hono';
import { db } from '../db/index.js';
import { piiFiles } from '../pii/file-schema.js';
import { piiRosters } from '../pii/schema.js';
import { unmaskFile } from '../pii/files.js';
import { eq, and, lt, sql } from 'drizzle-orm';
import { randomBytes } from 'crypto';

const files = new Hono();

// File expiration time (1 hour)
const FILE_EXPIRY_MS = 60 * 60 * 1000;

// Max file size (10 MB)
const MAX_FILE_SIZE = 10 * 1024 * 1024;

/**
 * Generate a secure random token for file ID
 */
function generateFileId(): string {
  return randomBytes(16).toString('hex');
}

/**
 * Upload a masked file
 * 
 * POST /files/upload
 * Body: multipart/form-data with:
 *   - file: The file to upload
 *   - course_id: Course ID for roster lookup
 *   - filename: Optional custom filename
 * 
 * Or JSON body:
 *   - content: Base64-encoded file content
 *   - filename: Filename with extension
 *   - course_id: Course ID for roster lookup
 */
files.post('/upload', async (c) => {
  // Get user from X-User-Id header (API) or cookie (dashboard)
  let userId = c.req.header('X-User-Id');
  
  // If no X-User-Id header, try cookie-based auth (for dashboard uploads)
  if (!userId) {
    const { getCookie } = await import('hono/cookie');
    const { verifyToken } = await import('../auth/jwt.js');
    
    const accessToken = getCookie(c, 'access_token');
    if (accessToken) {
      try {
        const payload = await verifyToken(accessToken);
        if (payload?.sub) {
          userId = payload.sub;
        }
      } catch {
        // Token invalid, continue to check other auth methods
      }
    }
  }
  
  if (!userId) {
    return c.json({ error: 'Unauthorized' }, 401);
  }
  
  const contentType = c.req.header('Content-Type') || '';
  
  let fileContent: Buffer;
  let filename: string;
  let courseId: number;
  
  if (contentType.includes('multipart/form-data')) {
    // Handle multipart form upload
    const formData = await c.req.formData();
    const file = formData.get('file') as File | null;
    const courseIdStr = formData.get('course_id') as string | null;
    const customFilename = formData.get('filename') as string | null;
    
    if (!file || !courseIdStr) {
      return c.json({ error: 'Missing file or course_id' }, 400);
    }
    
    courseId = parseInt(courseIdStr, 10);
    filename = customFilename || file.name;
    fileContent = Buffer.from(await file.arrayBuffer());
    
  } else {
    // Handle JSON body with base64 content
    const body = await c.req.json<{
      content: string;
      filename: string;
      course_id: number;
    }>();
    
    if (!body.content || !body.filename || !body.course_id) {
      return c.json({ error: 'Missing content, filename, or course_id' }, 400);
    }
    
    courseId = body.course_id;
    filename = body.filename;
    fileContent = Buffer.from(body.content, 'base64');
  }
  
  // Validate file size
  if (fileContent.length > MAX_FILE_SIZE) {
    return c.json({ error: 'File too large (max 10 MB)' }, 400);
  }
  
  // Detect MIME type from filename
  const ext = filename.toLowerCase().split('.').pop();
  const mimeTypes: Record<string, string> = {
    csv: 'text/csv',
    tsv: 'text/tab-separated-values',
    txt: 'text/plain',
    docx: 'application/vnd.openxmlformats-officedocument.wordprocessingml.document',
    xlsx: 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet',
    pptx: 'application/vnd.openxmlformats-officedocument.presentationml.presentation',
  };
  const mimeType = mimeTypes[ext || ''] || 'application/octet-stream';
  
  // Generate file ID and expiration
  const fileId = generateFileId();
  const expiresAt = new Date(Date.now() + FILE_EXPIRY_MS);
  
  // Store the file
  await db.insert(piiFiles).values({
    id: fileId,
    ownerUserId: userId,
    courseId,
    filename,
    mimeType,
    content: fileContent,
    isUnmasked: false,
    expiresAt,
  });
  
  // Build download URL
  const baseUrl = c.req.header('X-Forwarded-Proto') === 'https' 
    ? `https://${c.req.header('Host')}`
    : `http://${c.req.header('Host')}`;
  
  const downloadUrl = `${baseUrl}/files/${fileId}`;
  
  return c.json({
    success: true,
    file_id: fileId,
    download_url: downloadUrl,
    expires_at: expiresAt.toISOString(),
    filename,
  });
});

/**
 * Get courses from the user's roster
 * 
 * GET /files/courses
 * Requires cookie auth (from dashboard)
 * 
 * Returns distinct courses that the user has roster data for.
 * NOTE: This route MUST be defined before /:id to avoid being caught by the wildcard
 */
files.get('/courses', async (c) => {
  const { getCookie } = await import('hono/cookie');
  const { verifyToken } = await import('../auth/jwt.js');
  
  const accessToken = getCookie(c, 'access_token');
  if (!accessToken) {
    return c.json({ error: 'Unauthorized' }, 401);
  }
  
  try {
    const payload = await verifyToken(accessToken);
    if (!payload || !payload.sub) {
      return c.json({ error: 'Invalid token' }, 401);
    }
    
    const userId = payload.sub;
    
    // Get distinct course IDs from the roster
    const courses = await db
      .selectDistinct({
        courseId: piiRosters.courseId,
      })
      .from(piiRosters)
      .where(eq(piiRosters.ownerUserId, userId));
    
    return c.json({ 
      courses: courses.map(c => ({ 
        id: c.courseId,
        // We don't have course names stored - the dashboard could fetch from Moodle
        name: `Course ${c.courseId}` 
      }))
    });
  } catch (error) {
    console.error('Error listing courses:', error);
    return c.json({ error: 'Failed to list courses' }, 500);
  }
});

/**
 * List all files for the authenticated user
 * 
 * GET /files/list
 * Requires cookie auth (from dashboard)
 * 
 * NOTE: This route MUST be defined before /:id to avoid being caught by the wildcard
 */
files.get('/list', async (c) => {
  // Get userId from cookie-based auth (dashboard uses cookies)
  const { getCookie } = await import('hono/cookie');
  const { verifyToken } = await import('../auth/jwt.js');
  
  const accessToken = getCookie(c, 'access_token');
  if (!accessToken) {
    console.log('[files/list] No access_token cookie found');
    return c.json({ error: 'Unauthorized' }, 401);
  }
  
  try {
    const payload = await verifyToken(accessToken);
    if (!payload || !payload.sub) {
      return c.json({ error: 'Invalid token' }, 401);
    }
    
    const userId = payload.sub;
    
    // Get all non-expired files for this user
    const userFiles = await db
      .select({
        id: piiFiles.id,
        filename: piiFiles.filename,
        mimeType: piiFiles.mimeType,
        courseId: piiFiles.courseId,
        isUnmasked: piiFiles.isUnmasked,
        expiresAt: piiFiles.expiresAt,
        createdAt: piiFiles.createdAt,
        downloadedAt: piiFiles.downloadedAt,
      })
      .from(piiFiles)
      .where(eq(piiFiles.ownerUserId, userId));
    
    // Filter out expired and format for response
    const now = new Date();
    const activeFiles = userFiles
      .filter(f => f.expiresAt > now)
      .map(f => ({
        id: f.id,
        filename: f.filename,
        mime_type: f.mimeType,
        course_id: f.courseId,
        is_downloaded: f.isUnmasked,
        expires_at: f.expiresAt.toISOString(),
        created_at: f.createdAt?.toISOString(),
        downloaded_at: f.downloadedAt?.toISOString(),
        time_remaining_ms: f.expiresAt.getTime() - now.getTime(),
      }));
    
    return c.json({ files: activeFiles });
  } catch (error) {
    console.error('Error listing files:', error);
    return c.json({ error: 'Failed to list files' }, 500);
  }
});

/**
 * Download an unmasked file
 * 
 * GET /files/:id
 * 
 * The file is unmasked on-demand using the course roster.
 */
files.get('/:id', async (c) => {
  const fileId = c.req.param('id');
  
  // Find the file
  const [file] = await db
    .select()
    .from(piiFiles)
    .where(eq(piiFiles.id, fileId));
  
  if (!file) {
    return c.json({ error: 'File not found' }, 404);
  }
  
  // Check expiration
  if (file.expiresAt < new Date()) {
    // Delete expired file
    await db.delete(piiFiles).where(eq(piiFiles.id, fileId));
    return c.json({ error: 'File expired' }, 410);
  }
  
  // Get roster for unmasking
  const roster = await db
    .select()
    .from(piiRosters)
    .where(
      and(
        eq(piiRosters.ownerUserId, file.ownerUserId),
        eq(piiRosters.courseId, file.courseId)
      )
    );
  
  // Unmask the file
  const unmasked = await unmaskFile(file.content, file.filename, roster);
  
  // Update download timestamp
  await db
    .update(piiFiles)
    .set({ 
      downloadedAt: new Date(),
      isUnmasked: true,
    })
    .where(eq(piiFiles.id, fileId));
  
  // Return file as response with proper headers
  return new Response(unmasked.buffer, {
    headers: {
      'Content-Type': unmasked.mimeType,
      'Content-Disposition': `attachment; filename="${unmasked.filename}"`,
      'Content-Length': unmasked.buffer.length.toString(),
    },
  });
});

/**
 * Check file status
 * 
 * GET /files/:id/status
 */
files.get('/:id/status', async (c) => {
  const fileId = c.req.param('id');
  
  const [file] = await db
    .select({
      id: piiFiles.id,
      filename: piiFiles.filename,
      mimeType: piiFiles.mimeType,
      isUnmasked: piiFiles.isUnmasked,
      expiresAt: piiFiles.expiresAt,
      createdAt: piiFiles.createdAt,
      downloadedAt: piiFiles.downloadedAt,
    })
    .from(piiFiles)
    .where(eq(piiFiles.id, fileId));
  
  if (!file) {
    return c.json({ error: 'File not found' }, 404);
  }
  
  const isExpired = file.expiresAt < new Date();
  
  return c.json({
    id: file.id,
    filename: file.filename,
    mime_type: file.mimeType,
    is_unmasked: file.isUnmasked,
    is_expired: isExpired,
    expires_at: file.expiresAt.toISOString(),
    created_at: file.createdAt?.toISOString(),
    downloaded_at: file.downloadedAt?.toISOString(),
  });
});

/**
 * Delete a file
 * 
 * DELETE /files/:id
 * Requires cookie auth (owner only)
 */
files.delete('/:id', async (c) => {
  const fileId = c.req.param('id');
  
  // Get userId from cookie-based auth
  const { getCookie } = await import('hono/cookie');
  const { verifyToken } = await import('../auth/jwt.js');
  
  const accessToken = getCookie(c, 'access_token');
  if (!accessToken) {
    return c.json({ error: 'Unauthorized' }, 401);
  }
  
  try {
    const payload = await verifyToken(accessToken);
    if (!payload || !payload.sub) {
      return c.json({ error: 'Invalid token' }, 401);
    }
    
    const userId = payload.sub;
    
    // Find the file and verify ownership
    const [file] = await db
      .select()
      .from(piiFiles)
      .where(eq(piiFiles.id, fileId));
    
    if (!file) {
      return c.json({ error: 'File not found' }, 404);
    }
    
    if (file.ownerUserId !== userId) {
      return c.json({ error: 'Forbidden' }, 403);
    }
    
    // Delete the file
    await db.delete(piiFiles).where(eq(piiFiles.id, fileId));
    
    return c.json({ success: true, message: 'File deleted' });
  } catch (error) {
    console.error('Error deleting file:', error);
    return c.json({ error: 'Failed to delete file' }, 500);
  }
});

/**
 * Cleanup expired files (called periodically)
 */
export async function cleanupExpiredFiles(): Promise<number> {
  const result = await db
    .delete(piiFiles)
    .where(lt(piiFiles.expiresAt, new Date()));
  
  return result.rowsAffected || 0;
}

export default files;
