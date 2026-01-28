/**
 * Test data for PII masking tests
 * 
 * This file contains sample data captured from production
 * along with expected masked/unmasked outputs.
 */

import type { PiiRosterEntry } from '../schema.js';

/**
 * Sample roster - simulates what would be in the database
 * These are FAKE names for testing, not real student data
 */
export const sampleRoster: PiiRosterEntry[] = [
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
  {
    id: 3,
    ownerUserId: 'test-owner',
    courseId: 56569,
    moodleUserId: 99999,
    displayName: 'Arun Lakhotia',
    studentId: null,
    email: 'arun.lakhotia@louisiana.edu',
    role: 'editingteacher',
    createdAt: new Date(),
    updatedAt: new Date(),
  },
  // Student with middle name - for testing FERPA bug fix
  // Bug: "Matheus Nery" should match roster entry "Matheus John Nery"
  {
    id: 4,
    ownerUserId: 'test-owner',
    courseId: 56569,
    moodleUserId: 21011,
    displayName: 'Matheus John Nery',
    studentId: 'C00789012',
    email: 'matheus.nery@louisiana.edu',
    role: 'student',
    createdAt: new Date(),
    updatedAt: new Date(),
  },
];

/**
 * Roster with ambiguous names - for testing ambiguity detection
 * Two different students both named "John Smith" (but with different middle names)
 */
export const ambiguousRoster: PiiRosterEntry[] = [
  {
    id: 1,
    ownerUserId: 'test-owner',
    courseId: 56570,
    moodleUserId: 30001,
    displayName: 'John Michael Smith',
    studentId: 'C00111111',
    email: 'john.m.smith@louisiana.edu',
    role: 'student',
    createdAt: new Date(),
    updatedAt: new Date(),
  },
  {
    id: 2,
    ownerUserId: 'test-owner',
    courseId: 56570,
    moodleUserId: 30002,
    displayName: 'John David Smith',
    studentId: 'C00222222',
    email: 'john.d.smith@louisiana.edu',
    role: 'student',
    createdAt: new Date(),
    updatedAt: new Date(),
  },
  // Unique student - should always mask correctly
  {
    id: 3,
    ownerUserId: 'test-owner',
    courseId: 56570,
    moodleUserId: 30003,
    displayName: 'Sarah Jane Connor',
    studentId: 'C00333333',
    email: 'sarah.connor@louisiana.edu',
    role: 'student',
    createdAt: new Date(),
    updatedAt: new Date(),
  },
];

/**
 * Sample list_participants output (raw from Moodle)
 */
export const rawParticipantsOutput = {
  page: 0,
  perpage: 100,
  participants: [
    {
      id: 12345,
      name: 'Jackson Smith',
      email: 'jackson.smith@louisiana.edu',
      role: 'Student',
      lastAccess: '2026-01-25 10:00:00',
    },
    {
      id: 12346,
      name: 'Mary Johnson',
      email: 'mary.johnson@louisiana.edu',
      role: 'Student',
      lastAccess: '2026-01-24 15:30:00',
    },
    {
      id: 99999,
      name: 'Arun Lakhotia',
      email: 'arun.lakhotia@louisiana.edu',
      role: 'Teacher',
      lastAccess: '2026-01-25 09:00:00',
    },
  ],
};

/**
 * Expected masked output for list_participants
 */
export const expectedMaskedParticipantsOutput = {
  page: 0,
  perpage: 100,
  participants: [
    {
      id: 12345,
      name: 'M12345:name',
      email: 'M12345:email',
      role: 'Student',
      lastAccess: '2026-01-25 10:00:00',
    },
    {
      id: 12346,
      name: 'M12346:name',
      email: 'M12346:email',
      role: 'Student',
      lastAccess: '2026-01-24 15:30:00',
    },
    {
      id: 99999,
      name: 'M99999:name',
      email: 'M99999:email',
      role: 'Teacher',
      lastAccess: '2026-01-25 09:00:00',
    },
  ],
};

/**
 * Sample forum post content (raw from Moodle)
 */
export const rawForumPostContent = `
Team Formation Post

Hi everyone! I'm Jackson Smith (C00123456) and I'm looking for team members.
I'd like to work with Mary Johnson if she's available.
Please contact me at jackson.smith@louisiana.edu.

Thanks,
Jackson
`;

/**
 * Expected masked forum post content
 */
export const expectedMaskedForumPostContent = `
Team Formation Post

Hi everyone! I'm M12345:name (M12345:CID) and I'm looking for team members.
I'd like to work with M12346:name if she's available.
Please contact me at M12345:email.

Thanks,
Jackson
`;

/**
 * Sample LLM-generated content with mask tokens (for unmasking test)
 */
export const llmGeneratedContent = {
  subject: 'Team Assignments',
  message: `
<p>Here are the team assignments:</p>
<ul>
  <li>Team 1: M12345:name (Lead), M12346:name (Developer)</li>
</ul>
<p>Please contact M12345:email for details.</p>
<p>Student ID for reference: M12345:CID</p>
`,
};

/**
 * Expected unmasked content (for posting to Moodle)
 */
export const expectedUnmaskedContent = {
  subject: 'Team Assignments',
  message: `
<p>Here are the team assignments:</p>
<ul>
  <li>Team 1: Jackson Smith (Lead), Mary Johnson (Developer)</li>
</ul>
<p>Please contact jackson.smith@louisiana.edu for details.</p>
<p>Student ID for reference: C00123456</p>
`,
};

/**
 * Test case for unknown PII (not in roster)
 */
export const contentWithUnknownPII = `
Please contact Dr. Unknown Professor at unknown@gmail.com.
Also, student C00999888 dropped the course.
`;

/**
 * Expected output for unknown PII (one-way masking)
 */
export const expectedUnknownPIIMasked = `
Please contact Dr. Unk*** Pro*** at unk**@gmail.com.
Also, student C***888 dropped the course.
`;
