import { drizzle } from 'drizzle-orm/libsql';
import { createClient } from '@libsql/client';
import * as schema from './schema.js';

// Create Turso/LibSQL client
const client = createClient({
  url: process.env.DATABASE_URL || 'file:local.db',
  authToken: process.env.DATABASE_AUTH_TOKEN,
});

// Create drizzle instance
export const db = drizzle(client, { schema });

// Export schema for use elsewhere
export * from './schema.js';
