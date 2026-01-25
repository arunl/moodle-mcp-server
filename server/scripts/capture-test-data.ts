/**
 * Capture test data from production MCP server
 * 
 * This script queries the production server with real tools
 * and saves the responses as test fixtures.
 * 
 * Usage: npm run capture:test-data
 * 
 * Configuration (in order of priority):
 * 1. Environment variables: MCP_SERVER_URL, MCP_API_KEY
 * 2. .cursor/mcp.json in project root
 * 
 * IMPORTANT: This captures REAL student data.
 * The captured data should NOT be committed to the repository.
 * It's used locally for testing the masking logic.
 */

import * as fs from 'fs';
import * as path from 'path';
import { fileURLToPath } from 'url';

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

// Try to load config from .cursor/mcp.json
function loadMcpConfig(): { serverUrl?: string; apiKey?: string } {
  const mcpJsonPath = path.join(__dirname, '..', '..', '.cursor', 'mcp.json');
  try {
    if (fs.existsSync(mcpJsonPath)) {
      const config = JSON.parse(fs.readFileSync(mcpJsonPath, 'utf-8'));
      const moodleHosted = config.mcpServers?.['moodle-hosted'];
      if (moodleHosted?.env) {
        return {
          serverUrl: moodleHosted.env.MCP_SERVER_URL,
          apiKey: moodleHosted.env.MCP_API_KEY,
        };
      }
    }
  } catch (e) {
    // Ignore errors reading mcp.json
  }
  return {};
}

const mcpConfig = loadMcpConfig();
const SERVER_URL = process.env.MCP_SERVER_URL || mcpConfig.serverUrl || 'https://moodle-mcp-server.fly.dev';
const API_KEY = process.env.MCP_API_KEY || mcpConfig.apiKey;
const COURSE_ID = 56569; // Test course

if (!API_KEY) {
  console.error('❌ API key not found');
  console.log('Options:');
  console.log('  1. Set environment variable: $env:MCP_API_KEY="your-api-key"');
  console.log('  2. Configure in .cursor/mcp.json');
  process.exit(1);
}

console.log(`🔗 Server: ${SERVER_URL}`);
console.log(`🔑 API Key: ${API_KEY.slice(0, 8)}...${API_KEY.slice(-4)}\n`);

interface MCPResponse {
  jsonrpc: string;
  id: number;
  result?: {
    content: Array<{ type: string; text: string }>;
  };
  error?: { message: string };
}

async function callMCPTool(toolName: string, args: Record<string, any>): Promise<any> {
  const response = await fetch(`${SERVER_URL}/mcp`, {
    method: 'POST',
    headers: {
      'Content-Type': 'application/json',
      'Authorization': `Bearer ${API_KEY}`,
    },
    body: JSON.stringify({
      jsonrpc: '2.0',
      id: Date.now(),
      method: 'tools/call',
      params: {
        name: toolName,
        arguments: args,
      },
    }),
  });

  if (!response.ok) {
    throw new Error(`HTTP ${response.status}: ${await response.text()}`);
  }

  const data = await response.json() as MCPResponse;
  
  if (data.error) {
    throw new Error(data.error.message);
  }

  // Extract the text content from the MCP response format
  const textContent = data.result?.content?.find(c => c.type === 'text');
  if (textContent) {
    try {
      return JSON.parse(textContent.text);
    } catch {
      return textContent.text;
    }
  }

  return data.result;
}

async function main() {
  const outputDir = path.join(__dirname, '..', 'src', 'pii', '__tests__', 'fixtures');
  
  // Create fixtures directory
  if (!fs.existsSync(outputDir)) {
    fs.mkdirSync(outputDir, { recursive: true });
  }

  console.log('📡 Capturing test data from production...\n');

  try {
    // 1. Capture list_participants
    console.log('1️⃣ Capturing participants list...');
    const participants = await callMCPTool('list_participants', { course_id: COURSE_ID });
    fs.writeFileSync(
      path.join(outputDir, 'participants.json'),
      JSON.stringify(participants, null, 2)
    );
    console.log(`   ✅ Saved ${participants?.participants?.length || 0} participants\n`);

    // 2. Capture forum discussions (Team Formation forum)
    console.log('2️⃣ Capturing forum discussions...');
    // First find the forum
    const activities = await callMCPTool('find_activity', { 
      course_id: COURSE_ID, 
      name_pattern: 'Team Formation',
      activity_type: 'forum'
    });
    
    if (activities?.activities?.length > 0) {
      const forumCmid = activities.activities[0].id;
      const discussions = await callMCPTool('forum_list_discussions', { forum_view_id: forumCmid });
      fs.writeFileSync(
        path.join(outputDir, 'forum-discussions.json'),
        JSON.stringify(discussions, null, 2)
      );
      console.log(`   ✅ Saved ${discussions?.discussions?.length || 0} discussions\n`);

      // 3. Capture a sample discussion content
      if (discussions?.discussions?.length > 0) {
        console.log('3️⃣ Capturing sample discussion content...');
        const firstDiscussion = discussions.discussions[0];
        const discussionContent = await callMCPTool('get_forum_discussion', { 
          discussion_id: firstDiscussion.id 
        });
        fs.writeFileSync(
          path.join(outputDir, 'discussion-content.json'),
          JSON.stringify(discussionContent, null, 2)
        );
        console.log(`   ✅ Saved discussion "${firstDiscussion.title}"\n`);
      }
    } else {
      console.log('   ⚠️ No Team Formation forum found\n');
    }

    // 4. Capture analyze_forum output
    console.log('4️⃣ Capturing forum analysis...');
    if (activities?.activities?.length > 0) {
      const analysis = await callMCPTool('analyze_forum', { 
        forum_cmid: activities.activities[0].id,
        course_id: COURSE_ID
      });
      fs.writeFileSync(
        path.join(outputDir, 'forum-analysis.json'),
        JSON.stringify(analysis, null, 2)
      );
      console.log(`   ✅ Saved forum analysis\n`);
    }

    console.log('✅ Test data captured successfully!');
    console.log(`📁 Output directory: ${outputDir}`);
    console.log('\n⚠️ IMPORTANT: Do NOT commit these files to git!');
    console.log('   They contain real student PII for local testing only.');

  } catch (error) {
    console.error('❌ Error capturing test data:', error);
    process.exit(1);
  }
}

main();
