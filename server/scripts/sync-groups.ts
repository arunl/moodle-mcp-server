import { createClient } from '@libsql/client';

const client = createClient({
  url: process.env.DATABASE_URL || 'file:local.db',
  authToken: process.env.DATABASE_AUTH_TOKEN,
});

// CMPS453 Course ID
const COURSE_ID = 56569;

// Owner user ID - get this from your pii_rosters table
// Run: SELECT DISTINCT owner_user_id FROM pii_rosters WHERE course_id = 56569;
const OWNER_USER_ID = process.env.OWNER_USER_ID || 'YOUR_OWNER_USER_ID';

// Groups for CMPS453 - UPDATE THESE WITH REAL MOODLE GROUP IDs
// To find group IDs: In Moodle, go to Groups, click on a group, click "Edit group settings"
// The URL will show: /group/group.php?id=XXXXX&courseid=56569 - XXXXX is the group ID
const GROUPS = [
  { id: 0, name: 'ABET Access' },  // Replace 0 with real ID
  { id: 0, name: 'Team 01-Webre' },
  { id: 0, name: 'Team 02-Addeo' },
  { id: 0, name: 'Team 03-Dauphiney' },
  { id: 0, name: 'Team 04-Soileau' },
  { id: 0, name: 'Team 05-Miller' },
  { id: 0, name: 'Team 06-Tran' },
  { id: 0, name: 'Team 07-Hanks' },
  { id: 0, name: 'Team 08-Compeaux' },
  { id: 0, name: 'Team 09-Le' },
  { id: 0, name: 'Team 10-Mos' },
  { id: 0, name: 'Team x2' },
  { id: 0, name: 'Team x3' },
  { id: 0, name: 'Team x4' },
  { id: 0, name: 'Team x5' },
  { id: 0, name: 'Team x6' },
  { id: 0, name: 'Team Z - TBD' },
  { id: 0, name: 'X - ODS Time and Half' },
];

async function syncGroups() {
  console.log('Syncing groups for course', COURSE_ID);
  console.log('Owner user ID:', OWNER_USER_ID);
  
  if (OWNER_USER_ID === 'YOUR_OWNER_USER_ID') {
    console.error('\n❌ Please set OWNER_USER_ID environment variable or update the script');
    console.log('\nTo find your owner_user_id, run:');
    console.log('  SELECT DISTINCT owner_user_id FROM pii_rosters WHERE course_id = 56569;');
    return;
  }
  
  const groupsToSync = GROUPS.filter(g => g.id !== 0);
  
  if (groupsToSync.length === 0) {
    console.error('\n❌ No groups with valid IDs found. Please update the GROUPS array with real Moodle group IDs.');
    console.log('\nTo find group IDs:');
    console.log('1. Go to Moodle → Course → Participants → Groups');
    console.log('2. Select a group from the list');
    console.log('3. Click "Edit group settings"');
    console.log('4. Look at the URL: /group/group.php?id=XXXXX - XXXXX is the group ID');
    return;
  }
  
  const now = Math.floor(Date.now() / 1000);
  
  for (const group of groupsToSync) {
    console.log(`  Syncing: ${group.name} (ID: ${group.id})`);
    
    try {
      await client.execute({
        sql: `INSERT INTO pii_groups (owner_user_id, course_id, moodle_group_id, group_name, created_at, updated_at)
              VALUES (?, ?, ?, ?, ?, ?)
              ON CONFLICT (owner_user_id, course_id, moodle_group_id) 
              DO UPDATE SET group_name = ?, updated_at = ?`,
        args: [OWNER_USER_ID, COURSE_ID, group.id, group.name, now, now, group.name, now],
      });
    } catch (error) {
      console.error(`  Error syncing ${group.name}:`, error);
    }
  }
  
  console.log('\n✅ Groups synced successfully!');
  
  // Verify
  const result = await client.execute({
    sql: 'SELECT * FROM pii_groups WHERE course_id = ?',
    args: [COURSE_ID],
  });
  console.log(`\nTotal groups in database for course ${COURSE_ID}: ${result.rows.length}`);
  for (const row of result.rows) {
    console.log(`  G${row.moodle_group_id}_name = "${row.group_name}"`);
  }
}

syncGroups().catch(console.error);
