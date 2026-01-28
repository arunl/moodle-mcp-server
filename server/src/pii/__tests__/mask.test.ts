/**
 * Tests for PII masking and unmasking
 * 
 * Run with: npx tsx src/pii/__tests__/mask.test.ts
 */

import { maskPII, unmaskPII, maskStructuredData, unmaskStructuredData } from '../mask.js';
import { buildRosterLookup } from '../roster.js';
import {
  sampleRoster,
  ambiguousRoster,
  rawParticipantsOutput,
  rawForumPostContent,
  llmGeneratedContent,
} from './test-data.js';

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

function assertEqual(actual: any, expected: any, message?: string) {
  const actualStr = JSON.stringify(actual, null, 2);
  const expectedStr = JSON.stringify(expected, null, 2);
  if (actualStr !== expectedStr) {
    throw new Error(`${message || 'Assertion failed'}\n   Expected: ${expectedStr}\n   Actual: ${actualStr}`);
  }
}

function assertContains(actual: string, expected: string, message?: string) {
  if (!actual.includes(expected)) {
    throw new Error(`${message || 'String does not contain expected'}\n   Expected to contain: ${expected}\n   Actual: ${actual}`);
  }
}

function assertNotContains(actual: string, unexpected: string, message?: string) {
  if (actual.includes(unexpected)) {
    throw new Error(`${message || 'String contains unexpected'}\n   Should not contain: ${unexpected}\n   Actual: ${actual}`);
  }
}

// Build roster lookup from sample data (this is just for reference)
const _rosterLookup = buildRosterLookup(sampleRoster);

console.log('\n=== PII Masking Tests ===\n');

// ==================== Masking Tests ====================

test('Mask known name in string', () => {
  const input = 'Hello Jackson Smith, welcome!';
  const result = maskPII(input, sampleRoster);
  assertContains(result, 'M12345_name');
  assertNotContains(result, 'Jackson Smith');
});

test('Mask known email in string', () => {
  const input = 'Contact: jackson.smith@louisiana.edu';
  const result = maskPII(input, sampleRoster);
  assertContains(result, 'M12345_email');
  assertNotContains(result, 'jackson.smith@louisiana.edu');
});

test('Mask known student ID in string', () => {
  const input = 'Student ID: C00123456';
  const result = maskPII(input, sampleRoster);
  assertContains(result, 'M12345_CID');
  assertNotContains(result, 'C00123456');
});

test('Mask multiple known entities', () => {
  const result = maskPII(rawForumPostContent, sampleRoster);
  // Jackson Smith's info should be masked
  assertContains(result, 'M12345_name');
  assertContains(result, 'M12345_CID');
  assertContains(result, 'M12345_email');
  // Mary Johnson should be masked
  assertContains(result, 'M12346_name');
  // Original PII should not be present
  assertNotContains(result, 'Jackson Smith');
  assertNotContains(result, 'C00123456');
  assertNotContains(result, 'jackson.smith@louisiana.edu');
});

test('Mask participants list (object)', () => {
  const result = maskStructuredData(rawParticipantsOutput, sampleRoster) as typeof rawParticipantsOutput;
  // Check first participant (now uses underscore format)
  assertEqual(result.participants[0].name, 'M12345_name');
  assertEqual(result.participants[0].email, 'M12345_email');
  // Check second participant  
  assertEqual(result.participants[1].name, 'M12346_name');
  // Check non-PII fields preserved
  assertEqual(result.participants[0].id, 12345);
  assertEqual(result.page, 0);
});

test('Mask instructor/teacher names', () => {
  const input = 'Contact Arun Lakhotia for help.';
  const result = maskPII(input, sampleRoster);
  assertContains(result, 'M99999_name');
  assertNotContains(result, 'Arun Lakhotia');
});

// ==================== Unknown PII Tests ====================

test('Mask unknown student ID (one-way)', () => {
  const input = 'Student C00999888 is not enrolled.';
  const result = maskPII(input, sampleRoster);
  assertContains(result, 'C***888');
  assertNotContains(result, 'C00999888');
});

test('Mask unknown email (one-way)', () => {
  const input = 'Contact unknown.person@gmail.com for info.';
  const result = maskPII(input, sampleRoster);
  assertContains(result, 'unk**@gmail.com');
  assertNotContains(result, 'unknown.person@gmail.com');
});

test('Mask unknown name with title (one-way)', () => {
  const input = 'Ask Dr. Unknown Professor for help.';
  const result = maskPII(input, sampleRoster);
  // Should partially mask the name but keep title
  assertContains(result, 'Dr.');
  assertNotContains(result, 'Unknown Professor');
});

// ==================== Unmasking Tests ====================

test('Unmask name token', () => {
  const input = 'Hello M12345:name!';
  const result = unmaskPII(input, sampleRoster);
  assertEqual(result, 'Hello Jackson Smith!');
});

test('Unmask email token', () => {
  const input = 'Email: M12345:email';
  const result = unmaskPII(input, sampleRoster);
  assertEqual(result, 'Email: jackson.smith@louisiana.edu');
});

test('Unmask student ID token', () => {
  const input = 'ID: M12345:CID';
  const result = unmaskPII(input, sampleRoster);
  assertEqual(result, 'ID: C00123456');
});

test('Unmask LLM-generated content (object)', () => {
  const result = unmaskStructuredData(llmGeneratedContent, sampleRoster) as typeof llmGeneratedContent;
  // Names should be unmasked
  assertContains(result.message, 'Jackson Smith');
  assertContains(result.message, 'Mary Johnson');
  // Email should be unmasked
  assertContains(result.message, 'jackson.smith@louisiana.edu');
  // Student ID should be unmasked
  assertContains(result.message, 'C00123456');
  // Tokens should not be present
  assertNotContains(result.message, 'M12345:name');
  assertNotContains(result.message, 'M12346:name');
});

test('Unmask does not affect one-way masked content', () => {
  // One-way masked content (like C***888) cannot be unmasked
  const input = 'Student C***888 and unk**@gmail.com';
  const result = unmaskPII(input, sampleRoster);
  // Should remain unchanged
  assertEqual(result, input);
});

test('Unmask unknown token passes through', () => {
  const input = 'Unknown user M99998:name not in roster.';
  const result = unmaskPII(input, sampleRoster);
  // Token should remain since ID 99998 is not in roster
  assertEqual(result, input);
});

// ==================== Edge Cases ====================

test('Empty input returns empty', () => {
  assertEqual(maskPII('', sampleRoster), '');
  assertEqual(unmaskPII('', sampleRoster), '');
});

test('Null input handles gracefully', () => {
  // maskPII with null should return null-safe
  const masked = maskPII(null as any, sampleRoster);
  assertEqual(masked, null);
});

test('Array input is processed recursively', () => {
  const input = ['Jackson Smith', 'Mary Johnson'];
  const result = maskStructuredData(input, sampleRoster);
  assertEqual(result, ['M12345_name', 'M12346_name']);
});

test('Case insensitivity - names are matched case-insensitive', () => {
  // The current implementation uses case-insensitive matching
  const input = 'JACKSON SMITH should match';
  const result = maskPII(input, sampleRoster);
  assertContains(result, 'M12345_name');
});

test('Partial name should not match', () => {
  const input = 'Jackson is here but Smith is not';
  const result = maskPII(input, sampleRoster);
  // Should not mask partial names - only full "Jackson Smith"
  assertNotContains(result, 'M12345:name');
});

// ==================== Middle Name Tests (FERPA Bug Fix) ====================

test('FERPA: First+Last should mask when roster has First Middle Last', () => {
  // This is THE critical FERPA bug fix
  // Roster has "Matheus John Nery" but user types "Matheus Nery"
  const input = 'Member (Flex): Matheus Nery';
  const result = maskPII(input, sampleRoster);
  assertContains(result, 'M21011_name');
  assertNotContains(result, 'Matheus Nery');
});

test('FERPA: Full name with middle should still mask', () => {
  const input = 'Contact Matheus John Nery for info';
  const result = maskPII(input, sampleRoster);
  assertContains(result, 'M21011_name');
  assertNotContains(result, 'Matheus John Nery');
});

test('FERPA: Last, First should mask when roster has middle name', () => {
  const input = 'Team member: Nery, Matheus';
  const result = maskPII(input, sampleRoster);
  assertContains(result, 'M21011_name');
  assertNotContains(result, 'Nery, Matheus');
});

test('FERPA: First M. Last should mask (middle initial with period)', () => {
  const input = 'Contact Matheus J. Nery';
  const result = maskPII(input, sampleRoster);
  assertContains(result, 'M21011_name');
  assertNotContains(result, 'Matheus J. Nery');
});

test('FERPA: First M Last should mask (middle initial without period)', () => {
  const input = 'Contact Matheus J Nery';
  const result = maskPII(input, sampleRoster);
  assertContains(result, 'M21011_name');
  assertNotContains(result, 'Matheus J Nery');
});

test('FERPA: F. Last should mask (first initial)', () => {
  const input = 'Ask M. Nery for help';
  const result = maskPII(input, sampleRoster);
  assertContains(result, 'M21011_name');
  assertNotContains(result, 'M. Nery');
});

test('FERPA: Last, F. should mask (first initial with comma)', () => {
  const input = 'Team: Nery, M.';
  const result = maskPII(input, sampleRoster);
  assertContains(result, 'M21011_name');
  assertNotContains(result, 'Nery, M.');
});

test('FERPA: Works for names without middle names too', () => {
  // "Jackson Smith" has no middle name - should still work
  const input = 'Contact J. Smith for info';
  const result = maskPII(input, sampleRoster);
  assertContains(result, 'M12345_name');
  assertNotContains(result, 'J. Smith');
});

// ==================== Ambiguity Detection Tests ====================

test('Ambiguity: Full name with middle is unique and masks correctly', () => {
  // "John Michael Smith" is unique (only one person has that full name)
  const input = 'Contact John Michael Smith for details.';
  const result = maskPII(input, ambiguousRoster);
  assertContains(result, 'M30001_name');
  assertNotContains(result, 'John Michael Smith');
});

test('Ambiguity: Different full name with middle also masks correctly', () => {
  // "John David Smith" is also unique
  const input = 'Contact John David Smith for details.';
  const result = maskPII(input, ambiguousRoster);
  assertContains(result, 'M30002_name');
  assertNotContains(result, 'John David Smith');
});

test('Ambiguity: "John Smith" is ambiguous and skipped (not masked)', () => {
  // "John Smith" matches both John Michael Smith AND John David Smith
  // Should NOT be masked because it's ambiguous
  const input = 'Contact John Smith for details.';
  const result = maskPII(input, ambiguousRoster);
  // The name should remain (one-way masking may apply, but reversible masking should not)
  assertNotContains(result, 'M30001_name');
  assertNotContains(result, 'M30002_name');
  // Original name may be one-way masked or remain as-is (depending on title prefix)
});

test('Ambiguity: "J. Smith" is ambiguous and skipped', () => {
  // First initial + last name is highly ambiguous with two John Smiths
  const input = 'Contact J. Smith for help.';
  const result = maskPII(input, ambiguousRoster);
  assertNotContains(result, 'M30001_name');
  assertNotContains(result, 'M30002_name');
});

test('Ambiguity: Unique student masks correctly even with ambiguous roster', () => {
  // Sarah Jane Connor is unique - should always mask correctly
  const input = 'Contact Sarah Connor for info.';
  const result = maskPII(input, ambiguousRoster);
  assertContains(result, 'M30003_name');
  assertNotContains(result, 'Sarah Connor');
});

test('Ambiguity: Emails are still unique and mask correctly', () => {
  // Even if names are ambiguous, emails should be unique
  const input = 'Email john.m.smith@louisiana.edu or john.d.smith@louisiana.edu';
  const result = maskPII(input, ambiguousRoster);
  assertContains(result, 'M30001_email');
  assertContains(result, 'M30002_email');
});

test('Ambiguity: Student IDs are unique and mask correctly', () => {
  // Student IDs should always be unique
  const input = 'Students C00111111 and C00222222 enrolled.';
  const result = maskPII(input, ambiguousRoster);
  assertContains(result, 'M30001_CID');
  assertContains(result, 'M30002_CID');
});

// ==================== Round-trip Test ====================

test('Round-trip: mask then unmask returns original', () => {
  const original = 'Hello Jackson Smith (C00123456), email: jackson.smith@louisiana.edu';
  const masked = maskPII(original, sampleRoster);
  const unmasked = unmaskPII(masked, sampleRoster);
  assertEqual(unmasked, original);
});

// ==================== Summary ====================

console.log('\n=== Test Summary ===');
console.log(`Passed: ${passed}`);
console.log(`Failed: ${failed}`);
console.log(`Total: ${passed + failed}\n`);

if (failed > 0) {
  process.exit(1);
}
