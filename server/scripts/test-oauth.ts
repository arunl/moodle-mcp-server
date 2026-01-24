/**
 * OAuth 2.1 Local Test Script
 * 
 * This script tests the OAuth flow locally by:
 * 1. Creating a test user (if needed)
 * 2. Generating an OAuth access token directly
 * 3. Making test requests to the MCP endpoint
 * 
 * Usage:
 *   npx tsx scripts/test-oauth.ts
 * 
 * Prerequisites:
 *   - Server must be running locally (npm run dev)
 *   - Database must have schema pushed (npm run db:push)
 */

import { db } from '../src/db/index.js';
import { users } from '../src/db/schema.js';
import { oauthAccessTokens } from '../src/oauth/schema.js';
import { generateToken, hashToken, TOKEN_EXPIRY } from '../src/oauth/utils.js';
import { eq } from 'drizzle-orm';

const SERVER_URL = process.env.SERVER_URL || 'http://localhost:3000';
const TEST_USER_EMAIL = 'oauth-test@example.com';

async function main() {
  console.log('🧪 OAuth 2.1 Local Test Script\n');

  // Step 1: Find or create test user
  console.log('1️⃣  Finding or creating test user...');
  let [user] = await db.select().from(users).where(eq(users.email, TEST_USER_EMAIL));
  
  if (!user) {
    console.log('   Creating new test user...');
    [user] = await db.insert(users).values({
      email: TEST_USER_EMAIL,
      name: 'OAuth Test User',
      googleId: 'oauth-test-google-id',
    }).returning();
    console.log(`   ✅ Created user: ${user.email} (ID: ${user.id})`);
  } else {
    console.log(`   ✅ Found existing user: ${user.email} (ID: ${user.id})`);
  }

  // Step 2: Generate OAuth access token
  console.log('\n2️⃣  Generating OAuth access token...');
  const accessToken = generateToken(32);
  const tokenHash = await hashToken(accessToken);

  // Delete any existing tokens for this user first
  await db.delete(oauthAccessTokens).where(eq(oauthAccessTokens.userId, user.id));

  // Insert new token
  await db.insert(oauthAccessTokens).values({
    token: tokenHash,
    userId: user.id,
    clientId: 'test-client',
    scopes: 'openid profile email mcp',
    expiresAt: new Date(Date.now() + TOKEN_EXPIRY.ACCESS_TOKEN),
  });

  console.log(`   ✅ Generated token: ${accessToken.substring(0, 16)}...`);
  console.log(`   ⏰ Expires in: ${TOKEN_EXPIRY.ACCESS_TOKEN / 1000 / 60} minutes`);

  // Step 3: Test MCP endpoint
  console.log('\n3️⃣  Testing MCP endpoint...');
  
  try {
    // Test tools/list request
    const response = await fetch(`${SERVER_URL}/mcp`, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        'Authorization': `Bearer ${accessToken}`,
      },
      body: JSON.stringify({
        jsonrpc: '2.0',
        id: 1,
        method: 'tools/list',
        params: {},
      }),
    });

    if (response.ok) {
      const data = await response.json();
      const toolCount = data.result?.tools?.length || 0;
      console.log(`   ✅ MCP endpoint responded! Found ${toolCount} tools.`);
      
      if (toolCount > 0) {
        console.log(`   📋 First 5 tools:`);
        data.result.tools.slice(0, 5).forEach((tool: any) => {
          console.log(`      - ${tool.name}`);
        });
      }
    } else {
      const error = await response.text();
      console.log(`   ❌ MCP endpoint returned ${response.status}: ${error}`);
    }
  } catch (error: any) {
    console.log(`   ❌ Failed to connect to server: ${error.message}`);
    console.log(`   💡 Make sure the server is running: npm run dev`);
  }

  // Step 4: Test userinfo endpoint
  console.log('\n4️⃣  Testing userinfo endpoint...');
  
  try {
    const response = await fetch(`${SERVER_URL}/oauth/userinfo`, {
      headers: {
        'Authorization': `Bearer ${accessToken}`,
      },
    });

    if (response.ok) {
      const data = await response.json();
      console.log(`   ✅ Userinfo endpoint responded!`);
      console.log(`   👤 User: ${data.name} (${data.email})`);
    } else {
      const error = await response.text();
      console.log(`   ❌ Userinfo endpoint returned ${response.status}: ${error}`);
    }
  } catch (error: any) {
    console.log(`   ❌ Failed to connect to server: ${error.message}`);
  }

  // Summary
  console.log('\n' + '='.repeat(60));
  console.log('📝 SUMMARY');
  console.log('='.repeat(60));
  console.log(`\nTo test manually, use this token:\n`);
  console.log(`  Authorization: Bearer ${accessToken}`);
  console.log(`\nExample curl command:\n`);
  console.log(`  curl -X POST ${SERVER_URL}/mcp \\`);
  console.log(`    -H "Content-Type: application/json" \\`);
  console.log(`    -H "Authorization: Bearer ${accessToken}" \\`);
  console.log(`    -d '{"jsonrpc":"2.0","id":1,"method":"tools/list","params":{}}'`);
  console.log('\n' + '='.repeat(60));

  // Keep the token in a file for easy access
  const fs = await import('fs');
  fs.writeFileSync('test-oauth-token.txt', accessToken);
  console.log(`\n💾 Token saved to: test-oauth-token.txt`);

  // Give time for database to close cleanly
  setTimeout(() => process.exit(0), 100);
}

main().catch((error) => {
  console.error('Error:', error);
  process.exit(1);
});
