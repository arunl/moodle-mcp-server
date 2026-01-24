/**
 * OAuth 2.1 Provider Utilities
 * 
 * Token generation, hashing, and PKCE verification.
 */

import crypto from 'crypto';

/**
 * Generate a cryptographically secure random token
 */
export function generateToken(bytes: number = 32): string {
  return crypto.randomBytes(bytes).toString('hex');
}

/**
 * Hash a token for storage (we never store tokens in plain text)
 */
export async function hashToken(token: string): Promise<string> {
  return crypto.createHash('sha256').update(token).digest('hex');
}

/**
 * Verify PKCE code_verifier against stored code_challenge
 * 
 * OAuth 2.1 requires S256 method:
 * code_challenge = BASE64URL(SHA256(code_verifier))
 */
export function verifyPKCE(codeVerifier: string, codeChallenge: string, method: string): boolean {
  if (method !== 'S256') {
    // OAuth 2.1 only allows S256
    return false;
  }
  
  const expectedChallenge = crypto
    .createHash('sha256')
    .update(codeVerifier)
    .digest('base64url');
  
  return expectedChallenge === codeChallenge;
}

/**
 * Token expiration times
 */
export const TOKEN_EXPIRY = {
  CODE: 10 * 60 * 1000,           // 10 minutes
  ACCESS_TOKEN: 60 * 60 * 1000,   // 1 hour
  REFRESH_TOKEN: 30 * 24 * 60 * 60 * 1000, // 30 days
};
