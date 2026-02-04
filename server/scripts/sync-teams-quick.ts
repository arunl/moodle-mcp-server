import { createClient } from '@libsql/client';

const client = createClient({
  url: process.env.DATABASE_URL!,
  authToken: process.env.DATABASE_AUTH_TOKEN,
});

async function main() {
  // Get owner_user_id from existing roster
  const ownerResult = await client.execute(
    "SELECT DISTINCT owner_user_id FROM pii_rosters WHERE course_id = 56569 LIMIT 1"
  );

  if (ownerResult.rows.length === 0) {
    console.error("No roster found for course 56569. Please sync participants first.");
    process.exit(1);
  }

  const ownerUserId = ownerResult.rows[0].owner_user_id as string;
  console.log("Owner user ID:", ownerUserId);

  // Teams from CMPS453 - using sequential IDs
  const teams = [
    { id: 1001, name: "Team 01-Webre" },
    { id: 1002, name: "Team 02-Addeo" },
    { id: 1003, name: "Team 03-Dauphiney" },
    { id: 1004, name: "Team 04-Soileau" },
    { id: 1005, name: "Team 05-Miller" },
    { id: 1006, name: "Team 06-Tran" },
    { id: 1007, name: "Team 07-Hanks" },
    { id: 1008, name: "Team 08-Compeaux" },
    { id: 1009, name: "Team 09-Le" },
    { id: 1010, name: "Team 10-Mos" },
  ];

  const now = Math.floor(Date.now() / 1000);

  for (const team of teams) {
    // First try to delete existing entry, then insert fresh
    await client.execute({
      sql: `DELETE FROM pii_groups WHERE owner_user_id = ? AND course_id = 56569 AND moodle_group_id = ?`,
      args: [ownerUserId, team.id],
    });
    await client.execute({
      sql: `INSERT INTO pii_groups (owner_user_id, course_id, moodle_group_id, group_name, created_at, updated_at)
            VALUES (?, 56569, ?, ?, ?, ?)`,
      args: [ownerUserId, team.id, team.name, now, now],
    });
    console.log("Synced:", team.name);
  }

  // Verify
  const result = await client.execute("SELECT * FROM pii_groups WHERE course_id = 56569");
  console.log("\nGroups in database:", result.rows.length);
  for (const row of result.rows) {
    console.log(`  G${row.moodle_group_id}_name = "${row.group_name}"`);
  }
}

main().catch(console.error);
