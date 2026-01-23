import * as jose from 'jose';

const JWT_SECRET = new TextEncoder().encode(process.env.JWT_SECRET || 'dev-secret-change-in-production');
const JWT_ISSUER = 'moodle-mcp';
const JWT_AUDIENCE = 'moodle-mcp-client';

// Access token expires in 15 minutes
const ACCESS_TOKEN_EXPIRY = '15m';
// Refresh token expires in 30 days
const REFRESH_TOKEN_EXPIRY = '30d';

export interface TokenPayload {
  sub: string; // User ID
  email: string;
  name?: string;
  type: 'access' | 'refresh';
}

// Create an access token
export async function createAccessToken(userId: string, email: string, name?: string): Promise<string> {
  return new jose.SignJWT({ email, name, type: 'access' })
    .setProtectedHeader({ alg: 'HS256' })
    .setIssuedAt()
    .setIssuer(JWT_ISSUER)
    .setAudience(JWT_AUDIENCE)
    .setSubject(userId)
    .setExpirationTime(ACCESS_TOKEN_EXPIRY)
    .sign(JWT_SECRET);
}

// Create a refresh token
export async function createRefreshToken(userId: string): Promise<string> {
  return new jose.SignJWT({ type: 'refresh' })
    .setProtectedHeader({ alg: 'HS256' })
    .setIssuedAt()
    .setIssuer(JWT_ISSUER)
    .setAudience(JWT_AUDIENCE)
    .setSubject(userId)
    .setExpirationTime(REFRESH_TOKEN_EXPIRY)
    .sign(JWT_SECRET);
}

// Verify and decode a token
export async function verifyToken(token: string): Promise<TokenPayload> {
  const { payload } = await jose.jwtVerify(token, JWT_SECRET, {
    issuer: JWT_ISSUER,
    audience: JWT_AUDIENCE,
  });

  return {
    sub: payload.sub!,
    email: payload.email as string,
    name: payload.name as string | undefined,
    type: payload.type as 'access' | 'refresh',
  };
}

// Generate a random API key
export function generateApiKey(): string {
  const bytes = new Uint8Array(32);
  crypto.getRandomValues(bytes);
  const key = Array.from(bytes)
    .map((b) => b.toString(16).padStart(2, '0'))
    .join('');
  return `mcp_${key}`;
}

// Hash an API key for storage
export async function hashApiKey(key: string): Promise<string> {
  const encoder = new TextEncoder();
  const data = encoder.encode(key);
  const hashBuffer = await crypto.subtle.digest('SHA-256', data);
  const hashArray = Array.from(new Uint8Array(hashBuffer));
  return hashArray.map((b) => b.toString(16).padStart(2, '0')).join('');
}
