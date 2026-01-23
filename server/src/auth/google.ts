import { Google } from 'arctic';

// Initialize Google OAuth client
export const google = new Google(
  process.env.GOOGLE_CLIENT_ID!,
  process.env.GOOGLE_CLIENT_SECRET!,
  `${process.env.SERVER_URL}/auth/google/callback`
);

// Google user info response type
export interface GoogleUser {
  sub: string; // Google user ID
  email: string;
  email_verified: boolean;
  name: string;
  picture: string;
}

// Fetch user info from Google
export async function getGoogleUser(accessToken: string): Promise<GoogleUser> {
  const response = await fetch('https://openidconnect.googleapis.com/v1/userinfo', {
    headers: {
      Authorization: `Bearer ${accessToken}`,
    },
  });

  if (!response.ok) {
    throw new Error('Failed to fetch Google user info');
  }

  return response.json() as Promise<GoogleUser>;
}
