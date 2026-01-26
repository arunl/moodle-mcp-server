import { createClient } from '@libsql/client';

const url = process.env.DATABASE_URL;
const authToken = process.env.DATABASE_AUTH_TOKEN;

console.log('DATABASE_URL:', url ? 'set' : 'NOT SET');
console.log('DATABASE_AUTH_TOKEN:', authToken ? 'set' : 'NOT SET');

if (!url || !authToken) {
  console.error('Missing DATABASE_URL or DATABASE_AUTH_TOKEN');
  process.exit(1);
}

const client = createClient({ url, authToken });

async function main() {
  console.log('Checking pii_courses table...');
  
  try {
    const result = await client.execute('SELECT * FROM pii_courses');
    console.log('Found', result.rows.length, 'entries:');
    for (const row of result.rows) {
      console.log(' -', JSON.stringify(row));
    }
  } catch (e) {
    console.error('Query error:', e);
  }
}

main();
