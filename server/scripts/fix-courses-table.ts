/**
 * Fix the pii_courses table by dropping and recreating it
 * 
 * Run with: DATABASE_URL=... DATABASE_AUTH_TOKEN=... npx tsx scripts/fix-courses-table.ts
 */

import { createClient } from '@libsql/client';

const url = process.env.DATABASE_URL;
const authToken = process.env.DATABASE_AUTH_TOKEN;

if (!url || !authToken) {
  console.error('Error: DATABASE_URL and DATABASE_AUTH_TOKEN must be set');
  process.exit(1);
}

const client = createClient({ url, authToken });

async function main() {
  console.log('Dropping pii_courses table...');
  
  try {
    await client.execute('DROP TABLE IF EXISTS pii_courses');
    console.log('✓ Table dropped');
  } catch (e) {
    console.log('Table might not exist:', e);
  }
  
  console.log('Creating pii_courses table...');
  
  await client.execute(`
    CREATE TABLE pii_courses (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      owner_user_id TEXT NOT NULL,
      course_id INTEGER NOT NULL,
      course_name TEXT NOT NULL,
      created_at INTEGER DEFAULT (CAST(strftime('%s', 'now') AS INTEGER)),
      updated_at INTEGER DEFAULT (CAST(strftime('%s', 'now') AS INTEGER))
    )
  `);
  console.log('✓ Table created');
  
  await client.execute(`
    CREATE UNIQUE INDEX unique_course_entry ON pii_courses (owner_user_id, course_id)
  `);
  console.log('✓ Index created');
  
  console.log('Done!');
}

main().catch(console.error);
