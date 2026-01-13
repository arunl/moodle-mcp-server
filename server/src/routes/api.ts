import { Hono } from 'hono';
import { getCookie } from 'hono/cookie';
import { verifyToken, generateApiKey, hashApiKey } from '../auth/jwt.js';
import { db, users, apiKeys } from '../db/index.js';
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
  const { name = 'Default' } = await c.req.json().catch(() => ({}));

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

  const serverUrl = process.env.SERVER_URL || 'https://moodle-mcp.example.com';

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

export default api;
