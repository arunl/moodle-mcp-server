import { createClient } from '@libsql/client';

const client = createClient({
  url: process.env.DATABASE_URL || 'file:local.db',
  authToken: process.env.DATABASE_AUTH_TOKEN,
});

async function fixMissingIndex() {
  console.log('Creating missing index: unique_course_entry...');
  
  try {
    // Create the missing index if it doesn't exist
    await client.execute(`
      CREATE UNIQUE INDEX IF NOT EXISTS unique_course_entry 
      ON pii_courses (owner_user_id, course_id)
    `);
    console.log('✅ Index created successfully');
  } catch (error) {
    console.error('Error creating index:', error);
  }

  // Also create the new groups table while we're at it
  console.log('Creating pii_groups table if not exists...');
  try {
    await client.execute(`
      CREATE TABLE IF NOT EXISTS pii_groups (
        id INTEGER PRIMARY KEY AUTOINCREMENT,
        owner_user_id TEXT NOT NULL,
        course_id INTEGER NOT NULL,
        moodle_group_id INTEGER NOT NULL,
        group_name TEXT NOT NULL,
        description TEXT,
        created_at INTEGER DEFAULT (unixepoch()),
        updated_at INTEGER DEFAULT (unixepoch())
      )
    `);
    
    // Create indexes
    await client.execute(`
      CREATE UNIQUE INDEX IF NOT EXISTS unique_group_entry 
      ON pii_groups (owner_user_id, course_id, moodle_group_id)
    `);
    
    await client.execute(`
      CREATE INDEX IF NOT EXISTS group_course_idx 
      ON pii_groups (owner_user_id, course_id)
    `);
    
    console.log('✅ pii_groups table and indexes created successfully');
  } catch (error) {
    console.error('Error creating groups table:', error);
  }

  console.log('Done!');
}

fixMissingIndex();
