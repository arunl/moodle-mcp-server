/**
 * PII Masking Module
 * 
 * Provides FERPA-compliant PII protection for LLM interactions.
 * 
 * Key concepts:
 * - Roster: Per-course mapping of Moodle users to their PII
 * - Masking (egress): Replace PII with tokens before sending to LLM
 * - Unmasking (ingress): Replace tokens with PII before posting to Moodle
 * 
 * Token format: M{moodleId}_{type} (underscore separator)
 * - M12345_name → "Jackson Smith"
 * - M12345_CID → "C00123456"
 * - M12345_email → "jackson.smith@louisiana.edu"
 * 
 * Legacy format (still supported for unmasking): M{moodleId}:{type}
 * Bare tokens (M12345) are also unmasked as names (for LLMs that strip suffixes)
 * 
 * One-way masks (for unknown PII):
 * - Names: "Jac*** Smi***" (if detectable via title prefix)
 * - Student IDs: "C***456" (last 3 digits visible)
 * - Emails: "jac**@louisiana.edu" (first 3 chars + domain)
 */

export * from './schema.js';
export * from './file-schema.js';
export * from './course-schema.js';
export * from './roster.js';
export * from './mask.js';
export * from './files.js';
export * from './context.js';
