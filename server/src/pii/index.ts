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
 * Token format: M{moodleId}:{type}
 * - M12345:name → "Jackson Smith"
 * - M12345:CID → "C00123456"
 * - M12345:email → "jackson.smith@louisiana.edu"
 * 
 * One-way masks (for unknown PII):
 * - Names: "Jac*** Smi***" (if detectable via title prefix)
 * - Student IDs: "C***456" (last 3 digits visible)
 * - Emails: "jac**@louisiana.edu" (first 3 chars + domain)
 */

export * from './schema.js';
export * from './roster.js';
export * from './mask.js';
export * from './context.js';
