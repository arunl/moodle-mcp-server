import { type PiiRosterEntry } from './schema.js';
import { buildRosterLookup } from './roster.js';

// Re-export for convenience
export { buildRosterLookup };

/**
 * Mask token format: M{moodleId}_{type}
 * Examples: M12345_name, M12345_CID, M12345_email
 * 
 * Uses underscore separator instead of colon because some LLMs strip colons
 * thinking they're key-value separators.
 */
const MASK_TOKEN_PATTERN = /M(\d+)_(name|CID|email)/g;

/**
 * Legacy mask token format with colon separator (for backward compatibility)
 * Examples: M12345:name, M12345:CID, M12345:email
 */
const LEGACY_MASK_TOKEN_PATTERN = /M(\d+):(name|CID|email)/g;

/**
 * Bare mask token format: M{moodleId} without type suffix
 * Some LLMs strip the _name/_CID/_email suffix, so we also match bare tokens
 * These are treated as names by default
 */
const BARE_MASK_TOKEN_PATTERN = /\bM(\d{3,6})\b(?![_:])/g;

/**
 * Pattern for student IDs (C followed by 7-8 digits)
 */
const STUDENT_ID_PATTERN = /\bC\d{7,8}\b/gi;

/**
 * Pattern for email addresses
 */
const EMAIL_PATTERN = /\b[\w.-]+@[\w.-]+\.\w+\b/gi;

/**
 * Pattern for names following title prefixes
 */
const TITLE_NAME_PATTERN = /\b(Dr|Mr|Mrs|Ms|Prof|Professor)\.?\s+([A-Z][a-z]+(?:\s+[A-Z][a-z]+)*)/g;

/**
 * Mask a name (one-way, for unknown names)
 * "Jackson Smith" → "Jac*** Smi***"
 */
function maskNameOneWay(name: string): string {
  return name
    .split(/\s+/)
    .map(part => {
      if (part.length <= 3) {
        return part + '***';
      }
      return part.slice(0, 3) + '***';
    })
    .join(' ');
}

/**
 * Mask a student ID (one-way, for unknown IDs)
 * "C00123456" → "C***456"
 */
function maskStudentIdOneWay(studentId: string): string {
  return 'C***' + studentId.slice(-3);
}

/**
 * Mask an email (one-way, for unknown emails)
 * "jackson.smith@louisiana.edu" → "jac**@louisiana.edu"
 */
function maskEmailOneWay(email: string): string {
  const [local, domain] = email.split('@');
  if (!domain) return email; // Invalid email format
  const prefix = local.slice(0, 3);
  return `${prefix}**@${domain}`;
}

/**
 * Parse a display name into first and last name parts
 * Handles: "First Last", "First Middle Last", etc.
 */
function parseNameParts(displayName: string): { first: string; last: string; middle?: string } | null {
  const parts = displayName.trim().split(/\s+/);
  if (parts.length < 2) return null;
  
  return {
    first: parts[0],
    last: parts[parts.length - 1],
    middle: parts.length > 2 ? parts.slice(1, -1).join(' ') : undefined
  };
}

/**
 * Generate name patterns for different formats
 * Returns patterns sorted by length (longest first)
 */
function generateNamePatterns(entry: PiiRosterEntry): string[] {
  const patterns: string[] = [];
  const displayName = entry.displayName;
  
  // Always include the original display name
  patterns.push(escapeRegex(displayName));
  
  // Parse into parts to generate variations
  const parts = parseNameParts(displayName);
  if (parts) {
    const { first, last, middle } = parts;
    
    // "Last, First" format
    patterns.push(escapeRegex(`${last}, ${first}`));
    
    // "Last, First Middle" format (if middle name exists)
    if (middle) {
      patterns.push(escapeRegex(`${last}, ${first} ${middle}`));
    }
    
    // "Last First" format (no comma, sometimes used)
    patterns.push(escapeRegex(`${last} ${first}`));
  }
  
  // Sort by length descending (match longer patterns first)
  return patterns.sort((a, b) => b.length - a.length);
}

/**
 * Mask PII in text before sending to LLM (egress)
 * 
 * Strategy:
 * 1. Replace KNOWN PII with reversible tokens (M#####:type)
 * 2. Replace UNKNOWN PII with one-way masks
 * 
 * @param text - The text to mask
 * @param roster - The roster entries for the current course
 * @returns Masked text
 */
export function maskPII(text: string, roster: PiiRosterEntry[]): string {
  if (!text || roster.length === 0) {
    // No roster loaded - apply one-way masking only
    return maskUnknownPII(text);
  }
  
  const lookup = buildRosterLookup(roster);
  let masked = text;
  
  // Sort roster by name length (longest first) to avoid partial matches
  const sortedByNameLength = [...roster].sort(
    (a, b) => b.displayName.length - a.displayName.length
  );
  
  // IMPORTANT: Order matters! Replace longer/more specific patterns first:
  // 1. Emails (longest, may contain student IDs as substrings)
  // 2. Names (medium length, multiple format variations)
  // 3. Student IDs (shortest, may be substrings of emails)
  
  // 1. Replace KNOWN emails with reversible tokens FIRST
  // (emails like c00509352@louisiana.edu contain the student ID)
  for (const entry of roster) {
    if (entry.email) {
      const emailPattern = new RegExp(escapeRegex(entry.email), 'gi');
      masked = masked.replace(emailPattern, `M${entry.moodleUserId}_email`);
    }
  }
  
  // 2. Replace KNOWN names with reversible tokens (multiple formats)
  // Handle: "First Last", "Last, First", "Last First"
  for (const entry of sortedByNameLength) {
    const patterns = generateNamePatterns(entry);
    for (const pattern of patterns) {
      const nameRegex = new RegExp(pattern, 'gi');
      masked = masked.replace(nameRegex, `M${entry.moodleUserId}_name`);
    }
  }
  
  // 3. Replace KNOWN student IDs with reversible tokens LAST
  // (student IDs might be substrings of already-masked emails)
  for (const entry of roster) {
    if (entry.studentId) {
      const cidPattern = new RegExp(escapeRegex(entry.studentId), 'gi');
      masked = masked.replace(cidPattern, `M${entry.moodleUserId}_CID`);
    }
  }
  
  // 4. Apply one-way masking to remaining PII
  masked = maskUnknownPII(masked);
  
  return masked;
}

/**
 * Mask PII that's not in the roster (one-way, non-reversible)
 */
function maskUnknownPII(text: string): string {
  if (!text) return text;
  
  let masked = text;
  
  // 1. Mask names following title prefixes (Dr., Prof., etc.)
  masked = masked.replace(TITLE_NAME_PATTERN, (match, title, name) => {
    // Check if this looks like it was already masked
    if (name.includes('M') && (name.includes('_') || name.includes(':'))) {
      return match; // Already a token
    }
    return `${title}. ${maskNameOneWay(name)}`;
  });
  
  // 2. Mask remaining student IDs (not already tokenized)
  masked = masked.replace(STUDENT_ID_PATTERN, (cid) => {
    // Check if it's part of a token (M#####_CID pattern nearby)
    return maskStudentIdOneWay(cid);
  });
  
  // 3. Mask remaining emails (not already tokenized)
  masked = masked.replace(EMAIL_PATTERN, (email) => {
    // Check if it looks like a token
    if (email.includes('_email') || email.includes(':email')) {
      return email; // Already a token reference
    }
    return maskEmailOneWay(email);
  });
  
  return masked;
}

/**
 * Unmask PII tokens before posting to Moodle (ingress)
 * 
 * Reverses:
 * - Full tokens (new format): M#####_type (name, CID, email)
 * - Full tokens (legacy format): M#####:type (name, CID, email)
 * - Bare tokens: M##### (treated as names - some LLMs strip the suffix)
 * 
 * One-way masks (Jac***, C***456, jac**@domain) stay as-is
 * 
 * @param text - The text to unmask
 * @param roster - The roster entries for the current course
 * @returns Unmasked text
 */
export function unmaskPII(text: string, roster: PiiRosterEntry[]): string {
  if (!text || roster.length === 0) {
    return text;
  }
  
  const lookup = buildRosterLookup(roster);
  
  // Helper function to unmask a token by type
  const unmaskToken = (match: string, moodleIdStr: string, type: string) => {
    const moodleId = parseInt(moodleIdStr, 10);
    const entry = lookup.byMoodleId.get(moodleId);
    
    if (!entry) {
      // Entry not in roster - can't unmask, leave token
      return match;
    }
    
    switch (type) {
      case 'name':
        return entry.displayName;
      case 'CID':
        return entry.studentId || match; // Return token if no student ID
      case 'email':
        return entry.email || match; // Return token if no email
      default:
        return match;
    }
  };
  
  // First pass: unmask new format tokens (M12345_name, M12345_CID, etc.)
  let result = text.replace(MASK_TOKEN_PATTERN, unmaskToken);
  
  // Second pass: unmask legacy format tokens (M12345:name, M12345:CID, etc.)
  result = result.replace(LEGACY_MASK_TOKEN_PATTERN, unmaskToken);
  
  // Third pass: unmask bare tokens without type suffix (M12345)
  // Some LLMs strip the _name/_CID/_email suffix, so treat bare tokens as names
  result = result.replace(BARE_MASK_TOKEN_PATTERN, (match, moodleIdStr) => {
    const moodleId = parseInt(moodleIdStr, 10);
    const entry = lookup.byMoodleId.get(moodleId);
    
    if (!entry) {
      // Entry not in roster - can't unmask, leave token
      return match;
    }
    
    // Bare tokens default to name
    return entry.displayName;
  });
  
  return result;
}

/**
 * Check if text contains any mask tokens (new or legacy format)
 */
export function containsMaskTokens(text: string): boolean {
  return MASK_TOKEN_PATTERN.test(text) || LEGACY_MASK_TOKEN_PATTERN.test(text) || BARE_MASK_TOKEN_PATTERN.test(text);
}

/**
 * Extract all Moodle IDs referenced in mask tokens (new, legacy, and bare formats)
 */
export function extractMoodleIds(text: string): number[] {
  const ids: number[] = [];
  let match;
  
  // Check new format (underscore)
  const newPattern = new RegExp(MASK_TOKEN_PATTERN.source, 'g');
  while ((match = newPattern.exec(text)) !== null) {
    ids.push(parseInt(match[1], 10));
  }
  
  // Check legacy format (colon)
  const legacyPattern = new RegExp(LEGACY_MASK_TOKEN_PATTERN.source, 'g');
  while ((match = legacyPattern.exec(text)) !== null) {
    ids.push(parseInt(match[1], 10));
  }
  
  // Check bare format
  const barePattern = new RegExp(BARE_MASK_TOKEN_PATTERN.source, 'g');
  while ((match = barePattern.exec(text)) !== null) {
    ids.push(parseInt(match[1], 10));
  }
  
  return [...new Set(ids)]; // Deduplicate
}

/**
 * Escape special regex characters in a string
 */
function escapeRegex(str: string): string {
  return str.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
}

/**
 * Mask structured data (objects/arrays) recursively
 * Also masks object keys (e.g., when names are used as keys like in replierCounts)
 */
export function maskStructuredData(data: unknown, roster: PiiRosterEntry[]): unknown {
  if (data === null || data === undefined) {
    return data;
  }
  
  if (typeof data === 'string') {
    return maskPII(data, roster);
  }
  
  if (Array.isArray(data)) {
    return data.map(item => maskStructuredData(item, roster));
  }
  
  if (typeof data === 'object') {
    const masked: Record<string, unknown> = {};
    for (const [key, value] of Object.entries(data)) {
      // Mask both keys AND values - names can appear as object keys (e.g., replierCounts)
      const maskedKey = maskPII(key, roster);
      masked[maskedKey] = maskStructuredData(value, roster);
    }
    return masked;
  }
  
  return data;
}

/**
 * Unmask structured data (objects/arrays) recursively
 * Also unmasks object keys (for consistency with maskStructuredData)
 */
export function unmaskStructuredData(data: unknown, roster: PiiRosterEntry[]): unknown {
  if (data === null || data === undefined) {
    return data;
  }
  
  if (typeof data === 'string') {
    return unmaskPII(data, roster);
  }
  
  if (Array.isArray(data)) {
    return data.map(item => unmaskStructuredData(item, roster));
  }
  
  if (typeof data === 'object') {
    const unmasked: Record<string, unknown> = {};
    for (const [key, value] of Object.entries(data)) {
      // Unmask both keys AND values
      const unmaskedKey = unmaskPII(key, roster);
      unmasked[unmaskedKey] = unmaskStructuredData(value, roster);
    }
    return unmasked;
  }
  
  return data;
}
