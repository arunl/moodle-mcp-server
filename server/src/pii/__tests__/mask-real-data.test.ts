/**
 * Tests for PII masking using REAL captured data
 * 
 * Run with: npx tsx src/pii/__tests__/mask-real-data.test.ts
 * 
 * Prerequisites:
 * - Run `npm run capture:test-data` first to capture real data
 * - Fixtures must exist in __tests__/fixtures/
 */

import * as fs from 'fs';
import * as path from 'path';
import { fileURLToPath } from 'url';
import { maskPII, unmaskPII, maskStructuredData, unmaskStructuredData } from '../mask.js';
import type { PiiRosterEntry } from '../schema.js';

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

// Test utilities
let passed = 0;
let failed = 0;

function test(name: string, fn: () => void) {
  try {
    fn();
    console.log(`✅ ${name}`);
    passed++;
  } catch (error) {
    console.log(`❌ ${name}`);
    console.log(`   Error: ${error}`);
    failed++;
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

// Load fixtures
const fixturesDir = path.join(__dirname, 'fixtures');

function loadFixture<T>(filename: string): T | null {
  const filepath = path.join(fixturesDir, filename);
  if (!fs.existsSync(filepath)) {
    console.log(`⚠️ Fixture not found: ${filename}`);
    return null;
  }
  return JSON.parse(fs.readFileSync(filepath, 'utf-8'));
}

// Convert captured participants to roster format
interface CapturedParticipant {
  name: string;
  profileUrl: string;
  role: string;
  userId: number;
  username: string; // This is the student ID (C#####)
}

interface CapturedParticipantsResponse {
  page: number;
  perpage: number;
  participants: CapturedParticipant[];
}

function participantsToRoster(participants: CapturedParticipant[]): PiiRosterEntry[] {
  return participants.map((p, index) => ({
    id: index + 1,
    ownerUserId: 'test-owner',
    courseId: 56569,
    moodleUserId: p.userId,
    displayName: p.name,
    studentId: p.username.toUpperCase(), // C##### format
    email: `${p.username}@louisiana.edu`, // Infer email from username
    role: p.role.toLowerCase(),
    createdAt: new Date(),
    updatedAt: new Date(),
  }));
}

// ==================== Main Tests ====================

console.log('\n=== PII Masking Tests (Real Data) ===\n');

// Load participants
const participantsData = loadFixture<CapturedParticipantsResponse>('participants.json');

if (!participantsData) {
  console.log('❌ No participants fixture found. Run `npm run capture:test-data` first.');
  process.exit(1);
}

const roster = participantsToRoster(participantsData.participants);
console.log(`📋 Loaded ${roster.length} participants\n`);

// Get a sample student for testing
const sampleStudent = roster.find(r => r.role === 'student');
if (!sampleStudent) {
  console.log('❌ No students in roster');
  process.exit(1);
}

console.log(`🧪 Using sample student: ${sampleStudent.displayName} (${sampleStudent.studentId})\n`);

// ==================== Masking Tests ====================

test('Mask real student name', () => {
  const input = `Hello ${sampleStudent.displayName}, welcome to the course!`;
  const result = maskPII(input, roster);
  assertContains(result, `M${sampleStudent.moodleUserId}:name`);
  assertNotContains(result, sampleStudent.displayName);
});

test('Mask real student ID (username)', () => {
  const input = `Student ID: ${sampleStudent.studentId}`;
  const result = maskPII(input, roster);
  assertContains(result, `M${sampleStudent.moodleUserId}:CID`);
  assertNotContains(result, sampleStudent.studentId!);
});

test('Mask real student email', () => {
  const input = `Contact: ${sampleStudent.email}`;
  const result = maskPII(input, roster);
  assertContains(result, `M${sampleStudent.moodleUserId}:email`);
  assertNotContains(result, sampleStudent.email);
});

test('Mask participants list preserves structure', () => {
  const masked = maskStructuredData(participantsData, roster) as CapturedParticipantsResponse;
  
  // Check structure preserved
  if (masked.page !== 0) throw new Error('page field not preserved');
  if (masked.participants.length !== participantsData.participants.length) {
    throw new Error('participants count changed');
  }
  
  // Check names are masked
  const firstMasked = masked.participants[0];
  if (!firstMasked.name.startsWith('M') || !firstMasked.name.includes(':name')) {
    throw new Error(`Name not masked: ${firstMasked.name}`);
  }
});

test('No real names leak in masked participants', () => {
  const masked = maskStructuredData(participantsData, roster) as CapturedParticipantsResponse;
  const maskedJson = JSON.stringify(masked);
  
  // Check that no real names appear
  for (const student of roster.slice(0, 10)) { // Check first 10
    assertNotContains(maskedJson, student.displayName, `Name leaked: ${student.displayName}`);
  }
});

test('No real student IDs leak in masked data', () => {
  const masked = maskStructuredData(participantsData, roster) as CapturedParticipantsResponse;
  const maskedJson = JSON.stringify(masked);
  
  // Check that no real student IDs appear
  for (const student of roster.slice(0, 10)) {
    if (student.studentId) {
      assertNotContains(maskedJson, student.studentId, `Student ID leaked: ${student.studentId}`);
    }
  }
});

// ==================== Discussion Content Tests ====================

const discussionData = loadFixture<any>('discussion-content.json');

if (discussionData) {
  test('Mask discussion content', () => {
    const maskedDiscussion = maskStructuredData(discussionData, roster);
    const maskedJson = JSON.stringify(maskedDiscussion);
    
    // Check for mask tokens (any type)
    const hasTokens = maskedJson.includes(':name') || 
                      maskedJson.includes(':email') || 
                      maskedJson.includes(':CID');
    if (!hasTokens) {
      // Not a failure - discussion might not contain roster members
      console.log('   ℹ️ No PII tokens generated - discussion may not contain roster members');
    }
  });

  test('Discussion content has no PII leaks', () => {
    const maskedDiscussion = maskStructuredData(discussionData, roster);
    const maskedJson = JSON.stringify(maskedDiscussion);
    
    // Spot check - no full names from roster should appear
    let leaks = 0;
    for (const student of roster) {
      if (maskedJson.includes(student.displayName)) {
        console.log(`   ⚠️ Possible leak: ${student.displayName}`);
        leaks++;
      }
    }
    if (leaks > 0) {
      throw new Error(`Found ${leaks} possible PII leaks`);
    }
  });
}

// ==================== Unmasking Tests ====================

test('Round-trip: mask then unmask returns original name', () => {
  const original = `Hello ${sampleStudent.displayName}!`;
  const masked = maskPII(original, roster);
  const unmasked = unmaskPII(masked, roster);
  
  if (unmasked !== original) {
    throw new Error(`Round-trip failed:\n   Original: ${original}\n   Masked: ${masked}\n   Unmasked: ${unmasked}`);
  }
});

test('Round-trip: mask then unmask returns original student ID', () => {
  const original = `ID: ${sampleStudent.studentId}`;
  const masked = maskPII(original, roster);
  const unmasked = unmaskPII(masked, roster);
  
  if (unmasked !== original) {
    throw new Error(`Round-trip failed:\n   Original: ${original}\n   Masked: ${masked}\n   Unmasked: ${unmasked}`);
  }
});

test('Unmask LLM-style response', () => {
  // Simulate what an LLM might generate after seeing masked data
  const llmResponse = `
Team Assignments:
- Team Lead: M${sampleStudent.moodleUserId}:name
- Contact: M${sampleStudent.moodleUserId}:email
- Student ID: M${sampleStudent.moodleUserId}:CID
`;
  
  const unmasked = unmaskPII(llmResponse, roster);
  
  assertContains(unmasked, sampleStudent.displayName);
  assertContains(unmasked, sampleStudent.email);
  if (sampleStudent.studentId) {
    assertContains(unmasked, sampleStudent.studentId);
  }
});

// ==================== Forum Analysis Tests ====================

const analysisData = loadFixture<any>('forum-analysis.json');

if (analysisData) {
  test('Mask forum analysis', () => {
    const maskedAnalysis = maskStructuredData(analysisData, roster);
    const maskedJson = JSON.stringify(maskedAnalysis);
    
    // Should have tokens
    if (!maskedJson.includes(':name')) {
      console.log('   ⚠️ No name tokens found - analysis might not have names');
    }
  });
}

// ==================== Summary ====================

console.log('\n=== Test Summary ===');
console.log(`Passed: ${passed}`);
console.log(`Failed: ${failed}`);
console.log(`Total: ${passed + failed}\n`);

if (failed > 0) {
  process.exit(1);
}
