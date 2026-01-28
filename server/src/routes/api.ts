import { Hono } from 'hono';
import { getCookie } from 'hono/cookie';
import { verifyToken, generateApiKey, hashApiKey } from '../auth/jwt.js';
import { db, users, apiKeys } from '../db/index.js';
import { piiRosters } from '../pii/schema.js';
import { maskPII, unmaskPII, maskStructuredData, unmaskStructuredData } from '../pii/mask.js';
import { maskFile, unmaskFile } from '../pii/files.js';
import { getUserCourses } from '../pii/roster.js';
import { eq, and, isNull } from 'drizzle-orm';

const api = new Hono();

// Middleware to verify authentication
api.use('/*', async (c, next) => {
  const accessToken = getCookie(c, 'access_token');
  
  if (!accessToken) {
    return c.json({ error: 'Not authenticated' }, 401);
  }

  try {
    const payload = await verifyToken(accessToken);
    c.set('userId', payload.sub);
    c.set('userEmail', payload.email);
    await next();
  } catch (error) {
    return c.json({ error: 'Invalid token' }, 401);
  }
});

// List API keys
api.get('/keys', async (c) => {
  const userId = c.get('userId');

  const keys = await db
    .select({
      id: apiKeys.id,
      name: apiKeys.name,
      keyPrefix: apiKeys.keyPrefix,
      createdAt: apiKeys.createdAt,
      lastUsedAt: apiKeys.lastUsedAt,
    })
    .from(apiKeys)
    .where(and(eq(apiKeys.userId, userId), isNull(apiKeys.revokedAt)));

  return c.json({ keys });
});

// Create new API key
api.post('/keys', async (c) => {
  const userId = c.get('userId');
  const body = await c.req.json().catch(() => ({})) as { name?: string };
  const name = body.name || 'Default';

  // Check key limit (5 per user)
  const existingKeys = await db
    .select()
    .from(apiKeys)
    .where(and(eq(apiKeys.userId, userId), isNull(apiKeys.revokedAt)));

  if (existingKeys.length >= 5) {
    return c.json({ error: 'Maximum 5 API keys allowed. Please revoke an existing key first.' }, 400);
  }

  // Generate new key
  const key = generateApiKey();
  const keyHash = await hashApiKey(key);
  const keyPrefix = key.substring(0, 12); // "mcp_" + 8 chars

  const [newKey] = await db
    .insert(apiKeys)
    .values({
      userId,
      keyHash,
      keyPrefix,
      name,
    })
    .returning();

  // Return the full key only once - it won't be retrievable later
  return c.json({
    id: newKey.id,
    key, // Full key - show only once!
    keyPrefix: newKey.keyPrefix,
    name: newKey.name,
    createdAt: newKey.createdAt,
    message: 'Save this API key now - it will not be shown again!',
  });
});

// Revoke API key
api.delete('/keys/:keyId', async (c) => {
  const userId = c.get('userId');
  const keyId = c.req.param('keyId');

  const [key] = await db
    .update(apiKeys)
    .set({ revokedAt: new Date() })
    .where(and(eq(apiKeys.id, keyId), eq(apiKeys.userId, userId)))
    .returning();

  if (!key) {
    return c.json({ error: 'API key not found' }, 404);
  }

  return c.json({ success: true, message: 'API key revoked' });
});

// Get MCP configuration for client
api.get('/mcp-config', async (c) => {
  const userId = c.get('userId');
  const userEmail = c.get('userEmail');

  // Get user's first active API key
  const [key] = await db
    .select()
    .from(apiKeys)
    .where(and(eq(apiKeys.userId, userId), isNull(apiKeys.revokedAt)))
    .limit(1);

  const serverUrl = process.env.SERVER_URL || 'https://mcpconnector.io';

  const config = {
    note: 'Add this to your AI client MCP configuration',
    config: {
      mcpServers: {
        moodle: {
          transport: {
            type: 'sse',
            url: `${serverUrl}/mcp/sse`,
          },
          headers: {
            Authorization: key ? `Bearer ${key.keyPrefix}...` : 'Bearer YOUR_API_KEY',
          },
        },
      },
    },
    instructions: [
      '1. Copy the configuration above',
      '2. Replace YOUR_API_KEY with your actual API key',
      '3. Add to your AI client (Claude Desktop, Cursor, etc.)',
      '4. Make sure the browser extension is connected',
    ],
    hasApiKey: !!key,
    apiKeyPrefix: key?.keyPrefix,
  };

  return c.json(config);
});

// ==================== PII Mask/Unmask API ====================

/**
 * Mask text containing PII
 * 
 * POST /api/pii/mask
 * Body: { text: string, course_id: number }
 * Returns: { masked: string, stats: { names: number, emails: number, ids: number } }
 */
api.post('/pii/mask', async (c) => {
  const userId = c.get('userId');
  const body = await c.req.json<{ text: string; course_id: number }>();
  
  if (!body.text || !body.course_id) {
    return c.json({ error: 'Missing text or course_id' }, 400);
  }
  
  // Get roster for this course
  const roster = await db
    .select()
    .from(piiRosters)
    .where(
      and(
        eq(piiRosters.ownerUserId, userId),
        eq(piiRosters.courseId, body.course_id)
      )
    );
  
  if (roster.length === 0) {
    return c.json({ 
      error: 'No roster found for this course. Please load participants first.',
      masked: body.text,
      stats: { names: 0, emails: 0, ids: 0, ambiguous: 0 }
    }, 400);
  }
  
  const masked = maskPII(body.text, roster);
  
  // Count replacements (approximate - count tokens in result)
  const nameCount = (masked.match(/M\d+_name/g) || []).length;
  const emailCount = (masked.match(/M\d+_email/g) || []).length;
  const idCount = (masked.match(/M\d+_CID/g) || []).length;
  
  return c.json({
    masked,
    original_length: body.text.length,
    masked_length: masked.length,
    stats: {
      names: nameCount,
      emails: emailCount,
      ids: idCount,
    }
  });
});

/**
 * Unmask text containing mask tokens
 * 
 * POST /api/pii/unmask
 * Body: { text: string, course_id: number }
 * Returns: { unmasked: string, stats: { names: number, emails: number, ids: number } }
 */
api.post('/pii/unmask', async (c) => {
  const userId = c.get('userId');
  const body = await c.req.json<{ text: string; course_id: number }>();
  
  if (!body.text || !body.course_id) {
    return c.json({ error: 'Missing text or course_id' }, 400);
  }
  
  // Get roster for this course
  const roster = await db
    .select()
    .from(piiRosters)
    .where(
      and(
        eq(piiRosters.ownerUserId, userId),
        eq(piiRosters.courseId, body.course_id)
      )
    );
  
  if (roster.length === 0) {
    return c.json({ 
      error: 'No roster found for this course. Please load participants first.',
      unmasked: body.text,
      stats: { names: 0, emails: 0, ids: 0 }
    }, 400);
  }
  
  const unmasked = unmaskPII(body.text, roster);
  
  // Count tokens that were in the original
  const nameCount = (body.text.match(/M\d+[_:]name/g) || []).length;
  const emailCount = (body.text.match(/M\d+[_:]email/g) || []).length;
  const idCount = (body.text.match(/M\d+[_:]CID/g) || []).length;
  
  return c.json({
    unmasked,
    original_length: body.text.length,
    unmasked_length: unmasked.length,
    stats: {
      names: nameCount,
      emails: emailCount,
      ids: idCount,
    }
  });
});

/**
 * Get roster patterns for review
 * 
 * GET /api/pii/patterns/:course_id
 * Returns list of name patterns and which students they match
 */
api.get('/pii/patterns/:course_id', async (c) => {
  const userId = c.get('userId');
  const courseId = parseInt(c.req.param('course_id'), 10);
  
  if (!courseId) {
    return c.json({ error: 'Invalid course_id' }, 400);
  }
  
  // Get roster
  const roster = await db
    .select()
    .from(piiRosters)
    .where(
      and(
        eq(piiRosters.ownerUserId, userId),
        eq(piiRosters.courseId, courseId)
      )
    );
  
  if (roster.length === 0) {
    return c.json({ error: 'No roster found' }, 404);
  }
  
  // Build pattern summary
  const patterns = roster.map(entry => ({
    moodle_id: entry.moodleUserId,
    display_name: entry.displayName,
    email: entry.email,
    student_id: entry.studentId,
    role: entry.role,
    token: `M${entry.moodleUserId}_name`,
  }));
  
  return c.json({
    course_id: courseId,
    roster_size: roster.length,
    patterns,
  });
});

export default api;
