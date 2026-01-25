/**
 * Tests for file unmasking
 * 
 * Run with: npx tsx src/pii/__tests__/files.test.ts
 */

import { unmaskFile, generateUnmaskedCSV, parseAndUnmaskCSV } from '../files.js';
import type { PiiRosterEntry } from '../schema.js';

// Test utilities
let passed = 0;
let failed = 0;

function test(name: string, fn: () => void | Promise<void>) {
  Promise.resolve()
    .then(() => fn())
    .then(() => {
      console.log(`✅ ${name}`);
      passed++;
    })
    .catch((error) => {
      console.log(`❌ ${name}`);
      console.log(`   Error: ${error}`);
      failed++;
    });
}

function assertEqual(actual: any, expected: any, message?: string) {
  const actualStr = JSON.stringify(actual);
  const expectedStr = JSON.stringify(expected);
  if (actualStr !== expectedStr) {
    throw new Error(`${message || 'Assertion failed'}\n   Expected: ${expectedStr}\n   Actual: ${actualStr}`);
  }
}

function assertContains(actual: string, expected: string, message?: string) {
  if (!actual.includes(expected)) {
    throw new Error(`${message || 'String does not contain expected'}\n   Expected to contain: ${expected}\n   Actual: ${actual.slice(0, 200)}...`);
  }
}

function assertNotContains(actual: string, unexpected: string, message?: string) {
  if (actual.includes(unexpected)) {
    throw new Error(`${message || 'String contains unexpected'}\n   Should not contain: ${unexpected}`);
  }
}

// Sample roster for testing
const sampleRoster: PiiRosterEntry[] = [
  {
    id: 1,
    ownerUserId: 'test-owner',
    courseId: 56569,
    moodleUserId: 12345,
    displayName: 'Jackson Smith',
    studentId: 'C00123456',
    email: 'jackson.smith@louisiana.edu',
    role: 'student',
    createdAt: new Date(),
    updatedAt: new Date(),
  },
  {
    id: 2,
    ownerUserId: 'test-owner',
    courseId: 56569,
    moodleUserId: 12346,
    displayName: 'Mary Johnson',
    studentId: 'C00654321',
    email: 'mary.johnson@louisiana.edu',
    role: 'student',
    createdAt: new Date(),
    updatedAt: new Date(),
  },
];

console.log('\n=== File Unmasking Tests ===\n');

// ==================== CSV Tests ====================

test('Unmask CSV file', async () => {
  const maskedCSV = `Name,Email,Student ID
M12345:name,M12345:email,M12345:CID
M12346:name,M12346:email,M12346:CID`;
  
  const buffer = Buffer.from(maskedCSV, 'utf-8');
  const result = await unmaskFile(buffer, 'students.csv', sampleRoster);
  
  const content = result.buffer.toString('utf-8');
  
  assertContains(content, 'Jackson Smith');
  assertContains(content, 'Mary Johnson');
  assertContains(content, 'jackson.smith@louisiana.edu');
  assertContains(content, 'C00123456');
  assertNotContains(content, 'M12345:name');
  assertEqual(result.mimeType, 'text/csv');
});

test('Generate unmasked CSV', () => {
  const headers = ['Team', 'Lead', 'Email'];
  const rows = [
    ['Team 1', 'M12345:name', 'M12345:email'],
    ['Team 2', 'M12346:name', 'M12346:email'],
  ];
  
  const csv = generateUnmaskedCSV(headers, rows, sampleRoster);
  
  assertContains(csv, 'Jackson Smith');
  assertContains(csv, 'Mary Johnson');
  assertContains(csv, 'jackson.smith@louisiana.edu');
  assertNotContains(csv, 'M12345:name');
});

test('Parse and unmask CSV', () => {
  const maskedCSV = `Name,Role
M12345:name,Lead
M12346:name,Developer`;
  
  const { headers, rows } = parseAndUnmaskCSV(maskedCSV, sampleRoster);
  
  assertEqual(headers, ['Name', 'Role']);
  assertEqual(rows[0][0], 'Jackson Smith');
  assertEqual(rows[1][0], 'Mary Johnson');
});

// ==================== Text File Tests ====================

test('Unmask TXT file', async () => {
  const maskedTxt = `Team Assignments
================
Team Lead: M12345:name (M12345:email)
Developer: M12346:name (M12346:email)`;
  
  const buffer = Buffer.from(maskedTxt, 'utf-8');
  const result = await unmaskFile(buffer, 'teams.txt', sampleRoster);
  
  const content = result.buffer.toString('utf-8');
  
  assertContains(content, 'Jackson Smith');
  assertContains(content, 'jackson.smith@louisiana.edu');
  assertEqual(result.mimeType, 'text/plain');
});

// ==================== Unknown Format Tests ====================

test('Unknown file format passes through', async () => {
  const content = 'Binary content here';
  const buffer = Buffer.from(content, 'utf-8');
  const result = await unmaskFile(buffer, 'data.bin', sampleRoster);
  
  assertEqual(result.mimeType, 'application/octet-stream');
});

// ==================== Summary ====================

// Give time for async tests to complete
setTimeout(() => {
  console.log('\n=== Test Summary ===');
  console.log(`Passed: ${passed}`);
  console.log(`Failed: ${failed}`);
  console.log(`Total: ${passed + failed}\n`);
  
  if (failed > 0) {
    process.exit(1);
  }
}, 1000);
