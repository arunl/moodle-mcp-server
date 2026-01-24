/**
 * OAuth 2.1 Flow Test Script
 * 
 * This script tests the complete OAuth flow as a simulated client:
 * 1. Fetches discovery endpoint
 * 2. Shows the authorization URL (you visit manually)
 * 3. Exchanges authorization code for tokens
 * 
 * Usage:
 *   npx tsx scripts/test-oauth-flow.ts [authorization_code]
 * 
 * Flow:
 *   1. Run script without args → get authorization URL
 *   2. Visit URL in browser → log in → approve → get redirected with code
 *   3. Run script with code → exchange for tokens
 */

import crypto from 'crypto';

const SERVER_URL = process.env.SERVER_URL || 'http://localhost:3000';
const REDIRECT_URI = 'http://localhost:3000/callback'; // Fake callback URL
const CLIENT_ID = 'test-client'; // Optional

// Generate PKCE challenge
function generatePKCE() {
  const verifier = crypto.randomBytes(32).toString('base64url');
  const challenge = crypto.createHash('sha256').update(verifier).digest('base64url');
  return { verifier, challenge };
}

async function main() {
  const authCode = process.argv[2];

  console.log('🔐 OAuth 2.1 Flow Test\n');

  // Step 1: Fetch discovery endpoint
  console.log('1️⃣  Fetching discovery endpoint...');
  try {
    const response = await fetch(`${SERVER_URL}/.well-known/oauth-authorization-server`);
    if (!response.ok) {
      console.log(`   ❌ Discovery failed: ${response.status}`);
      process.exit(1);
    }
    const discovery = await response.json();
    console.log('   ✅ Discovery successful!');
    console.log(`   📍 Authorization: ${discovery.authorization_endpoint}`);
    console.log(`   📍 Token: ${discovery.token_endpoint}`);
    console.log(`   📍 Userinfo: ${discovery.userinfo_endpoint}`);
  } catch (error: any) {
    console.log(`   ❌ Failed to connect: ${error.message}`);
    console.log(`   💡 Make sure the server is running: npm run dev`);
    process.exit(1);
  }

  if (!authCode) {
    // Step 2: Generate authorization URL
    console.log('\n2️⃣  Generating authorization URL...');
    
    const { verifier, challenge } = generatePKCE();
    const state = crypto.randomBytes(16).toString('hex');

    const params = new URLSearchParams({
      response_type: 'code',
      client_id: CLIENT_ID,
      redirect_uri: REDIRECT_URI,
      scope: 'openid profile email mcp',
      state,
      code_challenge: challenge,
      code_challenge_method: 'S256',
    });

    const authUrl = `${SERVER_URL}/oauth/authorize?${params}`;

    console.log('\n' + '='.repeat(60));
    console.log('📋 NEXT STEPS');
    console.log('='.repeat(60));
    console.log('\n1. Visit this URL in your browser:\n');
    console.log(`   ${authUrl}\n`);
    console.log('2. Log in with Google and approve the request');
    console.log('3. You\'ll be redirected to a URL like:');
    console.log(`   ${REDIRECT_URI}?code=XXXX&state=${state}`);
    console.log('\n4. Copy the "code" value and run:\n');
    console.log(`   npx tsx scripts/test-oauth-flow.ts CODE_HERE\n`);
    console.log('5. Save this PKCE verifier (needed for step 4):');
    console.log(`   ${verifier}`);
    console.log('\n' + '='.repeat(60));

    // Save verifier to file for convenience
    const fs = await import('fs');
    fs.writeFileSync('test-pkce-verifier.txt', verifier);
    console.log(`\n💾 PKCE verifier saved to: test-pkce-verifier.txt`);

  } else {
    // Step 3: Exchange code for tokens
    console.log('\n3️⃣  Exchanging authorization code for tokens...');

    // Read PKCE verifier from file
    const fs = await import('fs');
    let verifier: string;
    try {
      verifier = fs.readFileSync('test-pkce-verifier.txt', 'utf-8').trim();
      console.log(`   📁 Loaded PKCE verifier from file`);
    } catch {
      console.log('   ❌ Could not read test-pkce-verifier.txt');
      console.log('   💡 Run the script without arguments first to generate a new flow');
      process.exit(1);
    }

    const tokenParams = new URLSearchParams({
      grant_type: 'authorization_code',
      code: authCode,
      redirect_uri: REDIRECT_URI,
      client_id: CLIENT_ID,
      code_verifier: verifier,
    });

    try {
      const response = await fetch(`${SERVER_URL}/oauth/token`, {
        method: 'POST',
        headers: {
          'Content-Type': 'application/x-www-form-urlencoded',
        },
        body: tokenParams,
      });

      const data = await response.json();

      if (!response.ok) {
        console.log(`   ❌ Token exchange failed: ${response.status}`);
        console.log(`   Error: ${data.error} - ${data.error_description}`);
        process.exit(1);
      }

      console.log('   ✅ Token exchange successful!');
      console.log(`\n   Access Token: ${data.access_token.substring(0, 20)}...`);
      console.log(`   Refresh Token: ${data.refresh_token.substring(0, 20)}...`);
      console.log(`   Expires In: ${data.expires_in} seconds`);
      console.log(`   Scope: ${data.scope}`);

      // Test MCP endpoint with the token
      console.log('\n4️⃣  Testing MCP endpoint with token...');
      const mcpResponse = await fetch(`${SERVER_URL}/mcp`, {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          'Authorization': `Bearer ${data.access_token}`,
        },
        body: JSON.stringify({
          jsonrpc: '2.0',
          id: 1,
          method: 'tools/list',
          params: {},
        }),
      });

      if (mcpResponse.ok) {
        const mcpData = await mcpResponse.json();
        const toolCount = mcpData.result?.tools?.length || 0;
        console.log(`   ✅ MCP endpoint works! Found ${toolCount} tools.`);
      } else {
        console.log(`   ❌ MCP request failed: ${mcpResponse.status}`);
      }

      // Save tokens to file
      fs.writeFileSync('test-oauth-token.txt', data.access_token);
      console.log(`\n💾 Access token saved to: test-oauth-token.txt`);

      // Cleanup
      fs.unlinkSync('test-pkce-verifier.txt');

    } catch (error: any) {
      console.log(`   ❌ Failed: ${error.message}`);
      setTimeout(() => process.exit(1), 100);
      return;
    }
  }

  setTimeout(() => process.exit(0), 100);
}

main().catch((error) => {
  console.error('Error:', error);
  setTimeout(() => process.exit(1), 100);
});
