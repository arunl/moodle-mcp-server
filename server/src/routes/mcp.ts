import { Hono } from 'hono';
import { streamSSE } from 'hono/streaming';
import { db, apiKeys, users } from '../db/index.js';
import { eq, and, isNull } from 'drizzle-orm';
import { hashApiKey } from '../auth/jwt.js';
import { connectionManager, BrowserCommand } from '../bridge/connection-manager.js';
import { moodleTools, generateCommandId } from '../mcp/tools.js';
import { oauthAccessTokens } from '../oauth/schema.js';
import { hashToken } from '../oauth/utils.js';
import {
  maskResult,
  unmaskArgs,
  updateRoster,
  setCourseContext,
  extractCourseId,
  shouldUpdateRoster,
  shouldUnmaskArgs,
  extractParticipantsFromResult,
} from '../pii/index.js';

/**
 * IMPORTANT: Moodle Content Security Policy (CSP) Limitations
 * 
 * Moodle blocks 'unsafe-eval' in its CSP, which means:
 * - evaluate_script and set_editor_content tools will FAIL on Moodle pages
 * - JavaScript injection via eval() is not possible
 * 
 * Workarounds implemented:
 * 1. Extraction logic moved to browser extension (background.js) using dedicated
 *    action types: extract_participants, extract_editing_status, extract_addable_sections,
 *    extract_forum_discussions
 * 2. For form interactions, use type_text with DOM selectors:
 *    - .editor_atto_content for rich text editors
 *    - #id_subject, #id_name etc. for form fields
 *    - #id_submitbutton for form submission
 * 3. Blur the editor before submitting (click another element) to sync content
 * 
 * See docs/BEST-PRACTICES.md for detailed guidance on working with Moodle's CSP.
 */

const mcp = new Hono();

// Middleware to verify API key
async function verifyApiKey(token: string): Promise<{ userId: string; email: string } | null> {
  const keyHash = await hashApiKey(token);

  const [apiKey] = await db
    .select({
      userId: apiKeys.userId,
      keyId: apiKeys.id,
    })
    .from(apiKeys)
    .where(and(eq(apiKeys.keyHash, keyHash), isNull(apiKeys.revokedAt)));

  if (!apiKey) {
    return null;
  }

  // Update last used
  await db
    .update(apiKeys)
    .set({ lastUsedAt: new Date() })
    .where(eq(apiKeys.id, apiKey.keyId));

  // Get user email
  const [user] = await db.select().from(users).where(eq(users.id, apiKey.userId));
  
  return user ? { userId: user.id, email: user.email } : null;
}

// Middleware to verify OAuth 2.1 access token (for ChatGPT)
async function verifyOAuthToken(token: string): Promise<{ userId: string; email: string } | null> {
  const tokenHash = await hashToken(token);

  const [storedToken] = await db
    .select()
    .from(oauthAccessTokens)
    .where(eq(oauthAccessTokens.token, tokenHash));

  if (!storedToken) {
    return null;
  }

  // Check expiration
  if (new Date() > storedToken.expiresAt) {
    // Token expired, delete it
    await db.delete(oauthAccessTokens).where(eq(oauthAccessTokens.token, tokenHash));
    return null;
  }

  // Get user email
  const [user] = await db.select().from(users).where(eq(users.id, storedToken.userId));
  
  return user ? { userId: user.id, email: user.email } : null;
}

// Unified auth verification - tries API key first, then OAuth token
async function verifyAuth(authHeader: string | undefined): Promise<{ userId: string; email: string } | null> {
  if (!authHeader?.startsWith('Bearer ')) {
    return null;
  }

  const token = authHeader.substring(7);

  // Try API key first (most common for Cursor/mcp-remote)
  const apiKeyAuth = await verifyApiKey(token);
  if (apiKeyAuth) {
    return apiKeyAuth;
  }

  // Try OAuth token (for ChatGPT)
  const oauthAuth = await verifyOAuthToken(token);
  if (oauthAuth) {
    return oauthAuth;
  }

  return null;
}

// MCP JSON-RPC handler
mcp.post('/', async (c) => {
  const auth = await verifyAuth(c.req.header('Authorization'));
  
  if (!auth) {
    return c.json({ error: 'Unauthorized' }, 401);
  }

  const request = await c.req.json();
  
  // Handle JSON-RPC request
  const response = await handleMcpRequest(request, auth.userId);
  
  // Notifications (no id) don't require a response in JSON-RPC spec,
  // but HTTP requires a response body. Return minimal valid JSON-RPC.
  if (response === null) {
    // Use null id for notifications (valid in JSON-RPC 2.0)
    return c.json({ jsonrpc: '2.0', id: null, result: 'ok' });
  }
  
  return c.json(response);
});

// MCP SSE endpoint
mcp.get('/sse', async (c) => {
  const auth = await verifyAuth(c.req.header('Authorization'));
  
  if (!auth) {
    return c.json({ error: 'Unauthorized' }, 401);
  }

  return streamSSE(c, async (stream) => {
    // Send initial connection message
    await stream.writeSSE({
      event: 'message',
      data: JSON.stringify({
        jsonrpc: '2.0',
        method: 'connection/ready',
        params: { userId: auth.userId },
      }),
    });

    // Keep connection alive
    const keepAlive = setInterval(async () => {
      try {
        await stream.writeSSE({
          event: 'ping',
          data: 'ping',
        });
      } catch {
        clearInterval(keepAlive);
      }
    }, 30000);

    // Handle incoming messages (for bidirectional SSE)
    // Note: True bidirectional requires separate POST endpoint
    
    // Clean up on close
    stream.onAbort(() => {
      clearInterval(keepAlive);
    });

    // Wait indefinitely (connection stays open)
    await new Promise(() => {});
  });
});

// Handle MCP JSON-RPC requests
async function handleMcpRequest(
  request: { jsonrpc: string; id?: number | string; method: string; params?: any },
  userId: string
): Promise<any> {
  const { id, method, params } = request;

  switch (method) {
    case 'initialize':
      return {
        jsonrpc: '2.0',
        id,
        result: {
          protocolVersion: '2024-11-05',
          capabilities: {
            tools: {},
          },
          serverInfo: {
            name: 'moodle-mcp',
            version: '1.0.0',
            description: 'Moodle LMS interaction via browser extension bridge',
            limitations: [
              'CSP Restriction: Moodle blocks arbitrary JavaScript execution. Use only the provided tools.',
              'Browser Required: A browser with the Moodle MCP extension must be connected.',
              'Single User: Each API key connects to one browser session at a time.',
            ],
            accessibility: [
              'All HTML content MUST follow WCAG 2.1 accessibility guidelines.',
              'Tables: Always use <caption> and <th scope="col/row"> for headers.',
              'Headings: Maintain proper hierarchy (h2→h3→h4), never skip levels.',
              'Links: Use descriptive text, indicate external links with "(opens in new tab)".',
              'Images: Always include meaningful alt text.',
              'Lists: Use semantic <ul>/<ol>, not manual bullets.',
              'Color: Never rely solely on color to convey meaning.',
              'Contrast: Text must have 4.5:1 minimum contrast ratio against background.',
              'Contrast: Use solid background colors, not gradients (gradients complicate contrast calculation).',
              'Contrast: Explicitly set color on ALL text elements including <strong>, <em>, <span> inside colored boxes.',
              'Contrast: White text (#ffffff) on dark backgrounds; dark text (#000000 or #2c3e50) on light backgrounds.',
            ],
          },
        },
      };

    case 'tools/list':
      return {
        jsonrpc: '2.0',
        id,
        result: {
          tools: moodleTools,
        },
      };

    case 'tools/call':
      return await handleToolCall(id, params, userId);

    case 'notifications/initialized':
      // Client notification, no response needed
      return null;

    default:
      return {
        jsonrpc: '2.0',
        id,
        error: {
          code: -32601,
          message: `Method not found: ${method}`,
        },
      };
  }
}

// Handle tool calls
async function handleToolCall(
  id: number | string | undefined,
  params: { name: string; arguments?: Record<string, any> },
  userId: string
): Promise<any> {
  const { name, arguments: rawArgs = {} } = params;

  // Check browser connection
  if (!connectionManager.isUserConnected(userId) && name !== 'get_browser_status') {
    return {
      jsonrpc: '2.0',
      id,
      result: {
        content: [
          {
            type: 'text',
            text: JSON.stringify({
              error: 'Browser extension not connected',
              instructions: [
                '1. Make sure the Moodle MCP browser extension is installed',
                '2. Log into the extension with your account',
                '3. Ensure the extension shows "Connected" status',
                '4. Navigate to your Moodle site in the browser',
              ],
            }, null, 2),
          },
        ],
        isError: true,
      },
    };
  }

  try {
    // Extract course ID from args and set context for PII masking
    const courseId = extractCourseId(name, rawArgs);
    if (courseId) {
      setCourseContext(userId, courseId);
    }

    // Unmask args if this tool might contain LLM-generated content with mask tokens
    const args = shouldUnmaskArgs(name) 
      ? await unmaskArgs(userId, rawArgs, courseId)
      : rawArgs;

    let result: any;

    switch (name) {
      case 'get_browser_status':
        result = {
          connected: connectionManager.isUserConnected(userId),
          message: connectionManager.isUserConnected(userId)
            ? 'Browser extension is connected and ready'
            : 'Browser extension is not connected',
        };
        break;

      case 'browse_moodle':
        result = await sendBrowserCommand(userId, 'navigate', { 
          url: args.url,
          force: args.force || false,
        });
        break;

      case 'click_element':
        result = await sendBrowserCommand(userId, 'click', {
          selector: args.selector,
          description: args.description,
        });
        break;

      case 'type_text':
        result = await sendBrowserCommand(userId, 'type', {
          selector: args.selector,
          text: args.text,
          clearFirst: args.clear_first ?? true,
        });
        break;

      case 'extract_page_content':
        result = await sendBrowserCommand(userId, 'extract', {
          selectors: args.selectors,
        });
        break;

      case 'set_editor_content':
        // Use the CSP-safe setEditor action instead of evaluate
        result = await sendBrowserCommand(userId, 'setEditor', {
          htmlContent: args.html_content,
          editorId: args.editor_id,
        });
        
        if (args.auto_save && result?.success) {
          await sendBrowserCommand(userId, 'click', {
            selector: 'button[type="submit"], input[type="submit"]',
            description: 'Save button',
          });
        }
        break;

      case 'wait_for_element':
        result = await sendBrowserCommand(userId, 'wait', {
          selector: args.selector,
          timeout: args.timeout ?? 10000,
        });
        break;


      // -----------------------------
      // Moodle macros (v0) - built from primitives
      // -----------------------------
      case 'open_course':
        await sendBrowserCommand(userId, 'navigate', { url: `/course/view.php?id=${args.course_id}` });
        await sendBrowserCommand(userId, 'wait', { selector: 'body', timeout: 10000 });
        // Use extract instead of evaluate to avoid CSP issues
        result = await sendBrowserCommand(userId, 'extract', {});
        result = { url: result?.url, title: result?.title, courseId: args.course_id };
        break;

      case 'open_participants':
        await sendBrowserCommand(userId, 'navigate', { url: `/user/index.php?id=${args.course_id}` });
        await sendBrowserCommand(userId, 'wait', { selector: 'table#participants, table.generaltable', timeout: 10000 });
        result = await sendBrowserCommand(userId, 'extract', {});
        break;

      case 'list_participants':
        const perpage = args.perpage ?? 5000; // Default to 5000 to get all participants
        // Include treset=1 to clear any saved filters that might limit results
        await sendBrowserCommand(userId, 'navigate', {
          url: `/user/index.php?id=${args.course_id}&perpage=${perpage}&page=${args.page ?? 0}&treset=1`,
        });
        await sendBrowserCommand(userId, 'wait', { selector: 'table#participants, table.generaltable', timeout: 10000 });
        // Use CSP-safe dedicated handler instead of evaluate
        result = await sendBrowserCommand(userId, 'extract_participants', {});
        result = { page: args.page ?? 0, perpage, ...result };
        break;

      case 'enable_editing':
        // First navigate to course to get sesskey
        await sendBrowserCommand(userId, 'navigate', {
          url: `/course/view.php?id=${args.course_id}`,
        });
        await sendBrowserCommand(userId, 'wait', { selector: 'body', timeout: 5000 });
        
        // Get sesskey for edit action
        const editSesskey = await sendBrowserCommand(userId, 'extract_sesskey', {});
        if (editSesskey?.sesskey) {
          // Enable editing with sesskey
          await sendBrowserCommand(userId, 'navigate', {
            url: `/course/view.php?id=${args.course_id}&sesskey=${editSesskey.sesskey}&edit=on`,
          });
          await sendBrowserCommand(userId, 'wait', { selector: 'body', timeout: 5000 });
        }
        
        // Use CSP-safe dedicated handler to check status
        result = await sendBrowserCommand(userId, 'extract_editing_status', {});
        break;

      case 'list_addable_sections':
        await sendBrowserCommand(userId, 'wait', {
          selector: 'button.section-modchooser[data-sectionid]',
          timeout: 10000,
        });
        // Use CSP-safe dedicated handler instead of evaluate
        result = await sendBrowserCommand(userId, 'extract_addable_sections', {});
        break;

      case 'forum_list_discussions':
        await sendBrowserCommand(userId, 'navigate', { url: `/mod/forum/view.php?id=${args.forum_view_id}` });
        // Wait for any forum-related element (different Moodle versions use different selectors)
        await sendBrowserCommand(userId, 'wait', { 
          selector: 'table.forumheaderlist, [data-region="discussion-list"], .forumpost, a[href*="discuss.php?d="]', 
          timeout: 10000 
        });
        // Use CSP-safe dedicated handler instead of evaluate
        result = await sendBrowserCommand(userId, 'extract_forum_discussions', {});
        result = { forumViewId: args.forum_view_id, ...result };
        break;

      case 'book_export_word':
        // This opens Moodle's export endpoint. Download handling is browser-side.
        await sendBrowserCommand(userId, 'navigate', {
          url: `/mod/book/tool/wordimport/index.php?id=${args.book_cmid}&action=export`,
        });
        await sendBrowserCommand(userId, 'wait', { selector: 'body', timeout: 10000 });
        result = {
          exportUrl: `/mod/book/tool/wordimport/index.php?id=${args.book_cmid}&action=export`,
        };
        break;

      case 'get_courses':
        // Navigate to courses page and extract
        await sendBrowserCommand(userId, 'navigate', { url: '/my/courses.php' });
        // Wait for any course-related element (different Moodle versions use different selectors)
        await sendBrowserCommand(userId, 'wait', { 
          selector: '.course-listitem, .coursebox, [data-region="course-content"], a[href*="course/view.php"]', 
          timeout: 5000 
        });
        // Use dedicated handler to extract courses
        result = await sendBrowserCommand(userId, 'extract_courses', {});
        break;

      case 'get_course_content':
        await sendBrowserCommand(userId, 'navigate', { url: `/course/view.php?id=${args.course_id}` });
        await sendBrowserCommand(userId, 'wait', { selector: '.section', timeout: 5000 });
        result = await sendBrowserCommand(userId, 'extract', {});
        break;

      case 'get_enrolled_users':
        await sendBrowserCommand(userId, 'navigate', {
          url: `/user/index.php?id=${args.course_id}`,
        });
        await sendBrowserCommand(userId, 'wait', { selector: '.userlist, table.users', timeout: 5000 });
        result = await sendBrowserCommand(userId, 'extract', {});
        break;

      // -----------------------------
      // Section/Topic CRUD operations
      // -----------------------------
      case 'get_course_sections':
        // Enable editing mode to see edit links
        await sendBrowserCommand(userId, 'navigate', {
          url: `/course/view.php?id=${args.course_id}&notifyeditingon=1`,
        });
        await sendBrowserCommand(userId, 'wait', { selector: '.section', timeout: 5000 });
        // Extract section info using CSP-safe handler
        result = await sendBrowserCommand(userId, 'extract_course_sections', {});
        break;

      case 'edit_section':
        // Navigate to section edit page
        await sendBrowserCommand(userId, 'navigate', {
          url: `/course/editsection.php?id=${args.section_id}`,
        });
        await sendBrowserCommand(userId, 'wait', { selector: 'form', timeout: 5000 });
        
        // Enable custom name by clicking the checkbox
        await sendBrowserCommand(userId, 'click', {
          selector: 'input[name="name_customize"], input[id*="name"][type="checkbox"]',
        });
        
        // Type the new section name
        await sendBrowserCommand(userId, 'type', {
          selector: 'input[name="name_value"], input[id*="name_value"]',
          text: args.name,
          clearFirst: true,
        });
        
        // If summary provided, set it in the editor
        if (args.summary) {
          await sendBrowserCommand(userId, 'setEditor', {
            htmlContent: args.summary,
          });
        }
        
        // Click save
        await sendBrowserCommand(userId, 'click', {
          selector: 'input[type="submit"][value="Save changes"], button[type="submit"], #id_submitbutton',
        });
        await sendBrowserCommand(userId, 'wait', { selector: '.section', timeout: 5000 });
        result = { success: true, sectionId: args.section_id, name: args.name };
        break;

      case 'add_section':
        // Enable editing mode
        await sendBrowserCommand(userId, 'navigate', {
          url: `/course/view.php?id=${args.course_id}&notifyeditingon=1`,
        });
        await sendBrowserCommand(userId, 'wait', { selector: '.section', timeout: 5000 });
        
        // Click "Add topics" link (may vary by Moodle theme/version)
        const addCount = args.count || 1;
        for (let i = 0; i < addCount; i++) {
          await sendBrowserCommand(userId, 'click', {
            selector: 'a[data-action="addSection"], .add-sections a, a.add-sections, [data-action="increaseSections"]',
          });
          // Wait briefly for section to be added
          await new Promise(resolve => setTimeout(resolve, 500));
        }
        result = { success: true, courseId: args.course_id, sectionsAdded: addCount };
        break;

      case 'delete_section':
        if (!args.confirm) {
          result = { error: 'Deletion requires confirm=true to prevent accidental data loss.' };
          break;
        }
        
        // First get sesskey from current page
        const sectionSessKeyResult = await sendBrowserCommand(userId, 'extract_sesskey', {});
        const sectionSesskey = sectionSessKeyResult?.sesskey;
        
        if (!sectionSesskey) {
          result = { error: 'Could not extract session key. Make sure you are logged in.' };
          break;
        }
        
        // Navigate to section delete confirmation with sesskey
        await sendBrowserCommand(userId, 'navigate', {
          url: `/course/editsection.php?id=${args.section_id}&sr=0&delete=1&sesskey=${sectionSesskey}`,
        });
        await sendBrowserCommand(userId, 'wait', { selector: '.buttons form', timeout: 5000 });
        
        // Click the "Yes" confirm button (btn-primary), not the "No" cancel button
        await sendBrowserCommand(userId, 'click', {
          selector: 'button.btn-primary[type="submit"], .singlebutton form[method="post"] button[type="submit"]',
        });
        await sendBrowserCommand(userId, 'wait', { selector: '.section', timeout: 5000 });
        result = { success: true, sectionId: args.section_id, deleted: true };
        break;

      case 'hide_section':
        // Navigate to course with editing enabled
        await sendBrowserCommand(userId, 'navigate', {
          url: `/course/view.php?id=${args.course_id}&notifyeditingon=1`,
        });
        await sendBrowserCommand(userId, 'wait', { selector: '.section', timeout: 5000 });
        
        // Find and click the hide/show toggle for the section
        const visibilityAction = args.hidden ? 'sectionHide' : 'sectionShow';
        await sendBrowserCommand(userId, 'click', {
          selector: `[data-sectionid="${args.section_id}"] [data-action="${visibilityAction}"], .section-${args.section_id} [data-action="${visibilityAction}"]`,
        });
        result = { success: true, sectionId: args.section_id, hidden: args.hidden };
        break;

      case 'move_section':
        // Moving sections typically requires drag-and-drop or AJAX
        // Use the move dropdown if available
        await sendBrowserCommand(userId, 'navigate', {
          url: `/course/view.php?id=${args.course_id}&notifyeditingon=1`,
        });
        await sendBrowserCommand(userId, 'wait', { selector: '.section', timeout: 5000 });
        
        // Click the move icon/dropdown for the section
        await sendBrowserCommand(userId, 'click', {
          selector: `[data-sectionid="${args.section_id}"] [data-action="moveSection"], .section [data-action="moveSection"]`,
        });
        // Select position - this varies by Moodle version
        result = { 
          note: 'Section move initiated. Manual position selection may be required.',
          sectionId: args.section_id, 
          targetPosition: args.position 
        };
        break;

      // -----------------------------
      // Assignment CRUD operations
      // -----------------------------
      case 'list_assignments':
        await sendBrowserCommand(userId, 'navigate', {
          url: `/mod/assign/index.php?id=${args.course_id}`,
        });
        await sendBrowserCommand(userId, 'wait', { selector: 'table', timeout: 5000 });
        result = await sendBrowserCommand(userId, 'extract_assignments', {});
        break;

      case 'get_assignment':
        await sendBrowserCommand(userId, 'navigate', {
          url: `/mod/assign/view.php?id=${args.assignment_id}`,
        });
        await sendBrowserCommand(userId, 'wait', { selector: '.activity-header, .assign-submission', timeout: 5000 });
        result = await sendBrowserCommand(userId, 'extract_assignment_details', {});
        break;

      case 'get_assignment_submissions':
        await sendBrowserCommand(userId, 'navigate', {
          url: `/mod/assign/view.php?id=${args.assignment_id}&action=grading`,
        });
        await sendBrowserCommand(userId, 'wait', { selector: 'table', timeout: 5000 });
        result = await sendBrowserCommand(userId, 'extract_submissions', { filter: args.filter || 'all' });
        break;

      case 'create_assignment':
        // Navigate to add assignment form
        await sendBrowserCommand(userId, 'navigate', {
          url: `/course/modedit.php?add=assign&course=${args.course_id}&section=${args.section_num}&return=0`,
        });
        await sendBrowserCommand(userId, 'wait', { selector: 'form', timeout: 5000 });
        
        // Fill in assignment name
        await sendBrowserCommand(userId, 'type', {
          selector: '#id_name',
          text: args.name,
          clearFirst: true,
        });
        
        // Fill in description if provided
        if (args.description) {
          await sendBrowserCommand(userId, 'setEditor', {
            htmlContent: args.description,
            editorId: 'id_introeditor',
          });
        }
        
        // Set due date if provided - use the dedicated handler for Moodle date fields
        if (args.due_date) {
          await sendBrowserCommand(userId, 'set_moodle_date', {
            fieldPrefix: 'id_duedate',
            dateString: args.due_date,
            enableCheckbox: true,
          });
        }
        
        // Set max grade if provided - need to expand Grade section first
        if (args.max_grade !== undefined) {
          // Click to expand Grade section if collapsed
          await sendBrowserCommand(userId, 'click', {
            selector: '#id_gradeheader .fheader, a[data-toggle="collapse"][href="#id_gradeheader"], #id_grade_header',
          }).catch(() => {}); // Ignore if already expanded
          
          // Small delay to let section expand
          await new Promise(resolve => setTimeout(resolve, 300));
          
          // Set max grade - Moodle uses a select dropdown for grade type and text for points
          await sendBrowserCommand(userId, 'type', {
            selector: '#id_grade_modgrade_point, #id_grade\\[modgrade_point\\], input[name="grade[modgrade_point]"]',
            text: String(args.max_grade),
            clearFirst: true,
          });
        }
        
        // Submit the form
        await sendBrowserCommand(userId, 'click', {
          selector: '#id_submitbutton, input[type="submit"][value="Save and return to course"]',
        });
        await sendBrowserCommand(userId, 'wait', { selector: '.section', timeout: 10000 });
        result = { success: true, name: args.name, courseId: args.course_id, maxGrade: args.max_grade };
        break;

      case 'edit_assignment':
        // Navigate to edit form
        await sendBrowserCommand(userId, 'navigate', {
          url: `/course/modedit.php?update=${args.assignment_id}`,
        });
        await sendBrowserCommand(userId, 'wait', { selector: 'form', timeout: 5000 });
        
        // Update name if provided
        if (args.name) {
          await sendBrowserCommand(userId, 'type', {
            selector: '#id_name',
            text: args.name,
            clearFirst: true,
          });
        }
        
        // Update description if provided
        if (args.description) {
          await sendBrowserCommand(userId, 'setEditor', {
            htmlContent: args.description,
            editorId: 'id_introeditor',
          });
        }
        
        // Update due date if provided - use dedicated handler
        if (args.due_date) {
          await sendBrowserCommand(userId, 'set_moodle_date', {
            fieldPrefix: 'id_duedate',
            dateString: args.due_date,
            enableCheckbox: true,
          });
        }
        
        // Update max grade if provided
        if (args.max_grade !== undefined) {
          // Click to expand Grade section if collapsed
          await sendBrowserCommand(userId, 'click', {
            selector: '#id_gradeheader .fheader, a[data-toggle="collapse"][href="#id_gradeheader"], #id_grade_header',
          }).catch(() => {});
          
          await new Promise(resolve => setTimeout(resolve, 300));
          
          await sendBrowserCommand(userId, 'type', {
            selector: '#id_grade_modgrade_point, #id_grade\\[modgrade_point\\], input[name="grade[modgrade_point]"]',
            text: String(args.max_grade),
            clearFirst: true,
          });
        }
        
        // Submit the form
        await sendBrowserCommand(userId, 'click', {
          selector: '#id_submitbutton, input[type="submit"][value="Save and return to course"]',
        });
        await sendBrowserCommand(userId, 'wait', { selector: '.section', timeout: 10000 });
        result = { success: true, assignmentId: args.assignment_id };
        break;

      case 'delete_assignment':
        if (!args.confirm) {
          result = { error: 'Deletion requires confirm=true to prevent accidental data loss.' };
          break;
        }
        
        // First, get the course ID from the assignment page and enable editing
        await sendBrowserCommand(userId, 'navigate', {
          url: `/mod/assign/view.php?id=${args.assignment_id}`,
        });
        await sendBrowserCommand(userId, 'wait', { selector: 'body', timeout: 5000 });
        
        // Extract sesskey and course ID from the page
        const deleteSesskeyResult = await sendBrowserCommand(userId, 'extract_sesskey', {});
        const deleteSesskey = deleteSesskeyResult?.sesskey;
        
        if (!deleteSesskey) {
          result = { error: 'Could not extract session key. Make sure you are logged in.' };
          break;
        }
        
        // Extract course ID from the page for enabling editing
        const courseIdResult = await sendBrowserCommand(userId, 'extract_course_id', {});
        const courseId = courseIdResult?.courseId;
        
        if (courseId) {
          // Enable editing mode first (requires sesskey)
          await sendBrowserCommand(userId, 'navigate', {
            url: `/course/view.php?id=${courseId}&sesskey=${deleteSesskey}&edit=on`,
          });
          await sendBrowserCommand(userId, 'wait', { selector: 'body', timeout: 5000 });
          
          // Re-extract sesskey after navigation (might have changed)
          const newSesskeyResult = await sendBrowserCommand(userId, 'extract_sesskey', {});
          const newSesskey = newSesskeyResult?.sesskey || deleteSesskey;
          
          // Navigate to delete page with sesskey
          await sendBrowserCommand(userId, 'navigate', {
            url: `/course/mod.php?sr=0&delete=${args.assignment_id}&sesskey=${newSesskey}`,
          });
        } else {
          // Fallback: try delete directly
          await sendBrowserCommand(userId, 'navigate', {
            url: `/course/mod.php?sr=0&delete=${args.assignment_id}&sesskey=${deleteSesskey}`,
          });
        }
        
        await sendBrowserCommand(userId, 'wait', { selector: '.buttons form', timeout: 5000 });
        
        // Click the "Yes" confirm button (btn-primary), not the "No" cancel button (btn-secondary)
        await sendBrowserCommand(userId, 'click', {
          selector: 'button.btn-primary[type="submit"], .singlebutton form[method="post"] button[type="submit"]',
        });
        await sendBrowserCommand(userId, 'wait', { selector: '.section, .course-content', timeout: 5000 });
        result = { success: true, assignmentId: args.assignment_id, deleted: true };
        break;

      case 'extend_assignment_deadline':
        // Navigate to assignment grading with user filter
        await sendBrowserCommand(userId, 'navigate', {
          url: `/mod/assign/view.php?id=${args.assignment_id}&action=grading`,
        });
        await sendBrowserCommand(userId, 'wait', { selector: 'table', timeout: 5000 });
        
        // Click on the specific user's extension option
        // This varies by Moodle version - may need to click user row then extension
        await sendBrowserCommand(userId, 'click', {
          selector: `[data-userid="${args.user_id}"] [data-action="grantextension"], tr[data-userid="${args.user_id}"] .action-extension`,
        });
        
        // Set new due date
        const extDate = new Date(args.new_due_date);
        await sendBrowserCommand(userId, 'type', {
          selector: '#id_extensionduedate_day, [name="extensionduedate[day]"]',
          text: String(extDate.getDate()),
        });
        await sendBrowserCommand(userId, 'type', {
          selector: '#id_extensionduedate_month, [name="extensionduedate[month]"]',
          text: String(extDate.getMonth() + 1),
        });
        await sendBrowserCommand(userId, 'type', {
          selector: '#id_extensionduedate_year, [name="extensionduedate[year]"]',
          text: String(extDate.getFullYear()),
        });
        
        await sendBrowserCommand(userId, 'click', {
          selector: 'input[type="submit"]',
        });
        result = { success: true, assignmentId: args.assignment_id, userId: args.user_id, newDueDate: args.new_due_date };
        break;

      // -----------------------------
      // Generic Activity Tools
      // -----------------------------
      case 'find_activity':
        // Navigate to the course page
        await sendBrowserCommand(userId, 'navigate', {
          url: `/course/view.php?id=${args.course_id}`,
        });
        await sendBrowserCommand(userId, 'wait', { selector: '.course-content, .section', timeout: 5000 });
        
        // Extract activities with optional filters
        result = await sendBrowserCommand(userId, 'extract_activities', {
          namePattern: args.name_pattern,
          activityType: args.activity_type,
          sectionNum: args.section_num,
        });
        break;

      case 'edit_activity':
        // Navigate to the edit page for any activity type
        await sendBrowserCommand(userId, 'navigate', {
          url: `/course/modedit.php?update=${args.activity_id}`,
        });
        await sendBrowserCommand(userId, 'wait', { selector: 'form', timeout: 5000 });
        result = { 
          success: true, 
          activityId: args.activity_id,
          message: 'Edit page loaded. Use set_activity_date, type_text, click_element to modify settings, then save_activity.',
        };
        break;

      case 'set_activity_date':
        // Set a date field on the current activity edit form
        result = await sendBrowserCommand(userId, 'set_activity_date', {
          fieldName: args.field_name,
          date: args.date,
          enabled: args.enabled !== false,
        });
        break;

      case 'save_activity':
        // Click the appropriate save button
        const saveSelector = args.return_to_course !== false
          ? '#id_submitbutton, input[type="submit"][value*="Save and return"], button[type="submit"]:first-of-type'
          : '#id_submitbutton2, input[type="submit"][value*="Save and display"]';
        
        await sendBrowserCommand(userId, 'click', { selector: saveSelector });
        await sendBrowserCommand(userId, 'wait', { selector: '.course-content, .section, .activity-header', timeout: 10000 });
        result = { success: true, message: 'Activity saved' };
        break;

      case 'create_forum_post':
        // Determine the forum ID - either provided directly or extracted from cmid
        let forumIdToUse = args.forum_id;
        
        if (!forumIdToUse && args.forum_cmid) {
          // Navigate to forum view page to extract the internal forum ID
          await sendBrowserCommand(userId, 'navigate', {
            url: `/mod/forum/view.php?id=${args.forum_cmid}`,
            force: true,
          });
          await sendBrowserCommand(userId, 'wait', { 
            selector: 'a[href*="discuss.php"], a[href*="post.php"]', 
            timeout: 10000 
          });
          
          // Extract forum ID from the page
          const forumExtract = await sendBrowserCommand(userId, 'extract_forum_discussions', {});
          forumIdToUse = forumExtract?.data?.forumId;
          
          if (!forumIdToUse) {
            result = { success: false, error: 'Could not extract forum_id from the forum page. Please provide forum_id directly.' };
            break;
          }
        }
        
        if (!forumIdToUse) {
          result = { success: false, error: 'Either forum_id or forum_cmid must be provided.' };
          break;
        }
        
        // Navigate to new discussion page (use force to dismiss any unsaved changes dialogs)
        await sendBrowserCommand(userId, 'navigate', {
          url: `/mod/forum/post.php?forum=${forumIdToUse}`,
          force: true,
        });
        await sendBrowserCommand(userId, 'wait', { selector: '#id_subject', timeout: 10000 });
        
        // Fill in subject
        await sendBrowserCommand(userId, 'type', {
          selector: '#id_subject',
          text: args.subject,
          clearFirst: true,
        });
        
        // Fill in message using setEditor (CSP-safe)
        await sendBrowserCommand(userId, 'setEditor', {
          htmlContent: args.message,
          editorId: 'id_message',
        });
        
        // Submit the form
        await sendBrowserCommand(userId, 'click', {
          selector: '#id_submitbutton',
        });
        await sendBrowserCommand(userId, 'wait', { selector: '.forumpost, .discussion-list', timeout: 10000 });
        
        result = { success: true, forumId: forumIdToUse, subject: args.subject };
        break;

      case 'get_forum_discussion':
        // Navigate to the discussion page
        await sendBrowserCommand(userId, 'navigate', {
          url: `/mod/forum/discuss.php?d=${args.discussion_id}`,
          force: true,
        });
        await sendBrowserCommand(userId, 'wait', { selector: '.forumpost, .forum-post, [data-region="post"]', timeout: 10000 });
        
        // Extract all posts with their content
        const discussionContent = await sendBrowserCommand(userId, 'extract_discussion_replies', {});
        
        result = {
          discussionId: args.discussion_id,
          ...discussionContent?.data,
        };
        break;

      case 'find_forum_discussion':
        // Navigate to forum page
        await sendBrowserCommand(userId, 'navigate', {
          url: `/mod/forum/view.php?id=${args.forum_cmid}`,
          force: true,
        });
        await sendBrowserCommand(userId, 'wait', { selector: 'a[href*="discuss.php"]', timeout: 10000 });
        
        // Extract all discussions
        const findDiscussionsResult = await sendBrowserCommand(userId, 'extract_forum_discussions', {});
        let foundDiscussions = findDiscussionsResult?.discussions || [];
        
        // Filter by subject pattern
        if (args.subject_pattern) {
          const subjectPattern = args.subject_pattern.toLowerCase();
          foundDiscussions = foundDiscussions.filter((d: { title: string }) => 
            d.title?.toLowerCase().includes(subjectPattern)
          );
        }
        
        // Filter by author
        if (args.author) {
          const authorPattern = args.author.toLowerCase();
          foundDiscussions = foundDiscussions.filter((d: { author: string }) => 
            d.author?.toLowerCase().includes(authorPattern)
          );
        }
        
        // Apply limit
        const findLimit = args.limit || 10;
        foundDiscussions = foundDiscussions.slice(0, findLimit);
        
        result = {
          forumCmid: args.forum_cmid,
          searchCriteria: {
            subjectPattern: args.subject_pattern || null,
            author: args.author || null,
          },
          matches: foundDiscussions,
          matchCount: foundDiscussions.length,
        };
        break;

      case 'delete_forum_discussion':
        if (!args.confirm) {
          result = { error: 'Deletion requires confirm=true to prevent accidental data loss.' };
          break;
        }
        
        // Navigate to the discussion page to extract post ID and sesskey
        await sendBrowserCommand(userId, 'navigate', {
          url: `/mod/forum/discuss.php?d=${args.discussion_id}`,
          force: true,
        });
        await sendBrowserCommand(userId, 'wait', { selector: '.forumpost, .forum-post', timeout: 10000 });
        
        // Extract the first post's ID (needed for delete URL - different from discussion ID)
        const postIdResult = await sendBrowserCommand(userId, 'extract_first_post_id', {});
        if (!postIdResult?.postId) {
          result = { error: 'Could not find post ID. Make sure this is a valid discussion page.' };
          break;
        }
        
        // Extract sesskey from the page (required for delete confirmation)
        const forumSesskeyResult = await sendBrowserCommand(userId, 'extract_sesskey', {});
        if (!forumSesskeyResult?.sesskey) {
          result = { error: 'Could not extract sesskey. User may not have permission to delete.' };
          break;
        }
        
        // Navigate directly to delete URL with confirm=1 and sesskey
        // This bypasses the confirmation modal click which can be unreliable
        // See docs/BEST-PRACTICES.md for rationale
        await sendBrowserCommand(userId, 'navigate', {
          url: `/mod/forum/post.php?delete=${postIdResult.postId}&confirm=1&sesskey=${forumSesskeyResult.sesskey}`,
        });
        
        // Wait for redirect to forum view (indicates successful deletion)
        try {
          await sendBrowserCommand(userId, 'wait', { selector: '.forumpost, .forum-discussion-list, [data-region="discussion-list"]', timeout: 5000 });
        } catch {
          // If we can't find forum content, check if we got a success notification
        }
        
        result = { success: true, discussionId: args.discussion_id, postId: postIdResult.postId, deleted: true };
        break;

      case 'analyze_forum':
        // Navigate to forum page
        await sendBrowserCommand(userId, 'navigate', {
          url: `/mod/forum/view.php?id=${args.forum_cmid}`,
        });
        // Wait for any discussion link or forum content to appear
        await sendBrowserCommand(userId, 'wait', { selector: 'a[href*="discuss.php"], .forumpost, [data-region="discussion-list"], .forum-discussion-list', timeout: 10000 });
        
        // Extract discussions from the forum page
        const forumResult = await sendBrowserCommand(userId, 'extract_forum_discussions', {});
        console.log('[analyze_forum] forumResult:', JSON.stringify(forumResult, null, 2));
        // Result comes directly without 'data' wrapper from browser command
        const discussions: Array<{
          id: number;
          title: string;
          author: string;
          replyCount: number;
          url: string;
        }> = forumResult?.discussions || forumResult?.data?.discussions || [];
        
        // Track who started discussions and reply counts
        const discussionStarters = new Set<string>();
        const excludeSet = new Set<string>((args.exclude_users || []).map((u: string) => u.toLowerCase()));
        
        // Collect all discussion authors (filtered)
        discussions.forEach((d) => {
          if (d.author && !excludeSet.has(d.author.toLowerCase())) {
            discussionStarters.add(d.author);
          }
        });
        
        // For each discussion with replies, extract reply details
        const replierCounts: Record<string, number> = {};
        const replierToOthersCounts: Record<string, number> = {}; // Replies to posts NOT started by the replier
        
        // Process discussions with replies (limit to first 20 to avoid timeout)
        const discussionsWithReplies = discussions.filter(d => d.replyCount > 0).slice(0, 20);
        
        for (const discussion of discussionsWithReplies) {
          // Navigate to discussion
          await sendBrowserCommand(userId, 'navigate', { url: discussion.url });
          await sendBrowserCommand(userId, 'wait', { selector: '.forumpost, .forum-post', timeout: 10000 });
          
          // Extract replies
          const replyResult = await sendBrowserCommand(userId, 'extract_discussion_replies', {});
          // Result may come directly or inside 'data' wrapper
          const replyData = replyResult?.data || replyResult || {};
          
          // Count replies by user (excluding discussion starter for "replies to others")
          const discussionStarter = replyData.discussionStarter;
          const posts = replyData.posts || [];
          
          posts.forEach((post: { author: string; isOriginal: boolean }, index: number) => {
            if (index === 0) return; // Skip original post
            if (!post.author) return;
            if (excludeSet.has(post.author.toLowerCase())) return;
            
            // Total replies by this person
            replierCounts[post.author] = (replierCounts[post.author] || 0) + 1;
            
            // Replies to others (not their own discussion)
            if (post.author.toLowerCase() !== discussionStarter?.toLowerCase()) {
              replierToOthersCounts[post.author] = (replierToOthersCounts[post.author] || 0) + 1;
            }
          });
        }
        
        // Get enrolled students if course_id provided
        let enrolledStudents: string[] = [];
        let nonParticipants: string[] = [];
        
        if (args.course_id) {
          // Navigate to participants page (include treset=1 to clear any saved filters)
          await sendBrowserCommand(userId, 'navigate', {
            url: `/user/index.php?id=${args.course_id}&perpage=5000&treset=1`,
          });
          await sendBrowserCommand(userId, 'wait', { selector: 'table', timeout: 10000 });
          
          const participantsResult = await sendBrowserCommand(userId, 'extract_participants', {});
          // Result may come directly or inside 'data' wrapper
          const participants = participantsResult?.participants || participantsResult?.data?.participants || [];
          
          enrolledStudents = participants
            .filter((p: { role?: string; name: string }) => 
              p.role?.toLowerCase() === 'student' && !excludeSet.has(p.name.toLowerCase())
            )
            .map((p: { name: string }) => p.name);
          
          // Find students who didn't post a discussion
          const participantSet = new Set<string>(discussionStarters);
          const replierSet = new Set<string>(Object.keys(replierCounts));
          
          nonParticipants = enrolledStudents.filter(
            (s) => !participantSet.has(s) && !replierSet.has(s)
          );
        }
        
        // Sort top repliers (by replies to others' posts)
        const topRepliers = Object.entries(replierToOthersCounts)
          .sort((a, b) => b[1] - a[1])
          .slice(0, 10)
          .map(([name, count]) => ({ name, repliesToOthers: count }));
        
        result = {
          forumCmid: args.forum_cmid,
          totalDiscussions: discussions.length,
          discussionStarters: Array.from(discussionStarters),
          discussionStarterCount: discussionStarters.size,
          replierCounts,
          repliesToOthersCounts: replierToOthersCounts,
          topRepliers,
          enrolledStudentCount: enrolledStudents.length,
          nonParticipants,
          nonParticipantCount: nonParticipants.length,
          discussions: discussions.slice(0, 50), // Limit for response size
        };
        break;

      case 'bulk_shift_deadlines':
        // Get list of assignments
        await sendBrowserCommand(userId, 'navigate', {
          url: `/mod/assign/index.php?id=${args.course_id}`,
        });
        await sendBrowserCommand(userId, 'wait', { selector: 'table', timeout: 10000 });
        
        const assignmentsData = await sendBrowserCommand(userId, 'extract_assignments', {});
        const allAssignments = assignmentsData?.assignments || [];
        
        // Filter by name pattern
        const pattern = new RegExp(args.name_pattern, 'i');
        const matchingAssignments = allAssignments.filter((a: { name: string; dueDate: string }) => 
          pattern.test(a.name) && a.dueDate && a.dueDate !== '-'
        );
        
        if (matchingAssignments.length === 0) {
          result = { 
            error: `No assignments matching "${args.name_pattern}" with due dates found.`,
            totalAssignments: allAssignments.length,
          };
          break;
        }
        
        // Parse dates and calculate new dates
        const changes = matchingAssignments.map((a: { id: number; name: string; dueDate: string }) => {
          // Parse the date string (e.g., "Monday, January 19, 2026, 6:30 PM")
          const currentDate = new Date(a.dueDate.replace(/,/g, ''));
          const newDate = new Date(currentDate);
          newDate.setDate(newDate.getDate() + args.days);
          
          return {
            id: a.id,
            name: a.name,
            currentDueDate: a.dueDate,
            newDueDate: newDate.toISOString(),
            newDueDateFormatted: newDate.toLocaleString('en-US', {
              weekday: 'long',
              year: 'numeric',
              month: 'long',
              day: 'numeric',
              hour: 'numeric',
              minute: '2-digit',
              hour12: true,
            }),
          };
        });
        
        if (!args.confirm) {
          // Preview mode
          result = {
            preview: true,
            message: `Found ${changes.length} assignments to update. Set confirm=true to apply changes.`,
            daysToShift: args.days,
            changes,
          };
          break;
        }
        
        // Apply changes
        const results: { id: number; name: string; success: boolean; error?: string }[] = [];
        for (const change of changes) {
          try {
            // Navigate to assignment edit page
            await sendBrowserCommand(userId, 'navigate', {
              url: `/course/modedit.php?update=${change.id}`,
            });
            await sendBrowserCommand(userId, 'wait', { selector: '#id_duedate_day', timeout: 10000 });
            
            // Set the new due date
            await sendBrowserCommand(userId, 'set_moodle_date', {
              fieldPrefix: 'id_duedate',
              dateString: change.newDueDate,
              enableCheckbox: true,
            });
            
            // Save
            await sendBrowserCommand(userId, 'click', {
              selector: '#id_submitbutton',
            });
            await sendBrowserCommand(userId, 'wait', { selector: '.course-content, .section', timeout: 10000 });
            
            results.push({ id: change.id, name: change.name, success: true });
          } catch (err) {
            results.push({ 
              id: change.id, 
              name: change.name, 
              success: false, 
              error: err instanceof Error ? err.message : 'Unknown error',
            });
          }
        }
        
        result = {
          success: true,
          message: `Updated ${results.filter(r => r.success).length} of ${results.length} assignments.`,
          daysShifted: args.days,
          results,
        };
        break;

      case 'analyze_feedback':
        // First, get enrolled STUDENTS to filter results properly
        // (Moodle's feedback lists include admins, managers, instructors etc.)
        await sendBrowserCommand(userId, 'navigate', {
          url: `/user/index.php?id=${args.course_id}&perpage=5000&treset=1`,
        });
        await sendBrowserCommand(userId, 'wait', { selector: 'table', timeout: 10000 });
        
        const fbParticipantsResult = await sendBrowserCommand(userId, 'extract_participants', {});
        const fbAllParticipants = fbParticipantsResult?.participants || [];
        
        // Build a set of student names (lowercase for comparison)
        const feedbackExcludeSet = new Set<string>((args.exclude_users || []).map((u: string) => u.toLowerCase()));
        const studentSet = new Map<string, { name: string; userId: number }>();
        fbAllParticipants.forEach((p: { name: string; userId: number; role: string }) => {
          if (p.role?.toLowerCase() === 'student' && !feedbackExcludeSet.has(p.name?.toLowerCase())) {
            studentSet.set(p.name?.toLowerCase(), { name: p.name, userId: p.userId });
          }
        });
        
        // Navigate to feedback responses page (showall=1 to get all entries)
        await sendBrowserCommand(userId, 'navigate', {
          url: `/mod/feedback/show_entries.php?id=${args.feedback_cmid}&showall=1`,
        });
        await sendBrowserCommand(userId, 'wait', { selector: 'table', timeout: 10000 });
        
        // Extract feedback responses (respondents)
        const feedbackResult = await sendBrowserCommand(userId, 'extract_feedback_responses', {});
        const feedbackResponses: Array<{
          name: string;
          date: string;
          userId?: number;
          anonymous: boolean;
        }> = feedbackResult?.responses || [];
        
        // Filter to only include STUDENTS and track who responded
        const respondentNameSet = new Set<string>();
        const respondentList = feedbackResponses
          .filter((r) => r.name && !r.anonymous && studentSet.has(r.name.toLowerCase()))
          .map((r) => {
            respondentNameSet.add(r.name.toLowerCase());
            return { 
              name: r.name, 
              userId: r.userId || studentSet.get(r.name.toLowerCase())?.userId, 
              date: r.date 
            };
          });
        
        // Compute non-respondents as: enrolled students - respondents
        // This is more reliable than Moodle's buggy non-respondents view
        const filteredNonRespondents: Array<{ name: string; userId: number }> = [];
        studentSet.forEach((student, nameLower) => {
          if (!respondentNameSet.has(nameLower)) {
            filteredNonRespondents.push(student);
          }
        });
        
        const totalStudents = studentSet.size;
        
        result = {
          feedbackCmid: args.feedback_cmid,
          totalEnrolledStudents: totalStudents,
          totalResponses: respondentList.length,
          respondents: respondentList,
          respondentCount: respondentList.length,
          nonRespondents: filteredNonRespondents,
          nonRespondentCount: filteredNonRespondents.length,
          responseRate: totalStudents > 0 
            ? `${Math.round((respondentList.length / totalStudents) * 100)}%`
            : 'N/A',
        };
        break;

      case 'send_message':
        // Navigate to the messaging page for this user
        const targetUserId = args.user_id;
        const messageText = args.message;
        
        // Moodle messaging URL - go directly to message compose
        await sendBrowserCommand(userId, 'navigate', {
          url: `/message/index.php?id=${targetUserId}`,
        });
        
        // Wait for the messaging interface to load
        await sendBrowserCommand(userId, 'wait', { 
          selector: '[data-region="send-message-txt"], textarea[data-region="send-message"], .message-app', 
          timeout: 10000 
        });
        
        // Small delay for UI to fully initialize
        await new Promise(resolve => setTimeout(resolve, 1000));
        
        // Try to type in the message input
        const msgResult = await sendBrowserCommand(userId, 'send_moodle_message', {
          message: messageText,
          userId: targetUserId,
        });
        
        if (msgResult?.success) {
          result = {
            success: true,
            userId: targetUserId,
            message: 'Message sent successfully',
          };
        } else {
          result = {
            success: false,
            userId: targetUserId,
            error: msgResult?.error || 'Failed to send message',
          };
        }
        break;

      case 'bulk_send_message':
        const userIds: number[] = args.user_ids;
        const bulkMessage = args.message;
        const sendResults: Array<{ userId: number; success: boolean; error?: string }> = [];
        
        for (const uid of userIds) {
          try {
            // Navigate to messaging page for this user
            await sendBrowserCommand(userId, 'navigate', {
              url: `/message/index.php?id=${uid}`,
            });
            
            await sendBrowserCommand(userId, 'wait', { 
              selector: '[data-region="send-message-txt"], textarea[data-region="send-message"], .message-app', 
              timeout: 10000 
            });
            
            await new Promise(resolve => setTimeout(resolve, 1000));
            
            const sendResult = await sendBrowserCommand(userId, 'send_moodle_message', {
              message: bulkMessage,
              userId: uid,
            });
            
            sendResults.push({
              userId: uid,
              success: sendResult?.success || false,
              error: sendResult?.error,
            });
            
            // Small delay between messages to avoid rate limiting
            await new Promise(resolve => setTimeout(resolve, 500));
          } catch (err) {
            sendResults.push({
              userId: uid,
              success: false,
              error: err instanceof Error ? err.message : 'Unknown error',
            });
          }
        }
        
        const successCount = sendResults.filter(r => r.success).length;
        const failCount = sendResults.filter(r => !r.success).length;
        
        result = {
          totalUsers: userIds.length,
          successCount,
          failCount,
          results: sendResults,
        };
        break;

      case 'create_download_file':
        // Import file handling
        const { piiFiles } = await import('../pii/file-schema.js');
        const { randomBytes } = await import('crypto');
        
        const fileContent = args.is_base64 
          ? Buffer.from(args.content, 'base64')
          : Buffer.from(args.content, 'utf-8');
        
        const filename = args.filename;
        const fileCourseId = args.course_id;
        
        // Detect MIME type from filename
        const ext = filename.toLowerCase().split('.').pop();
        const mimeTypes: Record<string, string> = {
          csv: 'text/csv',
          tsv: 'text/tab-separated-values',
          txt: 'text/plain',
          docx: 'application/vnd.openxmlformats-officedocument.wordprocessingml.document',
          xlsx: 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet',
          pptx: 'application/vnd.openxmlformats-officedocument.presentationml.presentation',
        };
        const mimeType = mimeTypes[ext || ''] || 'application/octet-stream';
        
        // Generate file ID and expiration (1 hour)
        const fileId = randomBytes(16).toString('hex');
        const expiresAt = new Date(Date.now() + 60 * 60 * 1000);
        
        // Store the file
        await db.insert(piiFiles).values({
          id: fileId,
          ownerUserId: userId,
          courseId: fileCourseId,
          filename,
          mimeType,
          content: fileContent,
          isUnmasked: false,
          expiresAt,
        });
        
        // Build download URL (will be unmasked when accessed)
        const serverUrl = process.env.SERVER_URL || 'https://moodle-mcp-server.fly.dev';
        const downloadUrl = `${serverUrl}/files/${fileId}`;
        
        result = {
          success: true,
          file_id: fileId,
          download_url: downloadUrl,
          expires_at: expiresAt.toISOString(),
          filename,
          note: 'File will be unmasked with real student names when downloaded',
        };
        break;

      default:
        return {
          jsonrpc: '2.0',
          id,
          error: {
            code: -32601,
            message: `Unknown tool: ${name}`,
          },
        };
    }

    // Update roster if this tool returns participant data
    if (shouldUpdateRoster(name) && result) {
      const participants = extractParticipantsFromResult(name, result);
      if (participants && participants.length > 0 && courseId) {
        await updateRoster(userId, courseId, participants);
      }
    }

    // Mask PII in result before sending to LLM
    const maskedResult = await maskResult(userId, result, courseId);

    return {
      jsonrpc: '2.0',
      id,
      result: {
        content: [
          {
            type: 'text',
            text: JSON.stringify(maskedResult, null, 2),
          },
        ],
      },
    };
  } catch (error) {
    return {
      jsonrpc: '2.0',
      id,
      result: {
        content: [
          {
            type: 'text',
            text: JSON.stringify({
              error: error instanceof Error ? error.message : 'Unknown error',
            }, null, 2),
          },
        ],
        isError: true,
      },
    };
  }
}

// Send command to browser extension
async function sendBrowserCommand(
  userId: string,
  action: BrowserCommand['action'],
  params: Record<string, unknown>
): Promise<any> {
  const command: BrowserCommand = {
    id: generateCommandId(),
    action,
    params,
  };

  return connectionManager.sendCommand(userId, command);
}

// Create JavaScript to set Moodle editor content
function createEditorScript(htmlContent: string, editorId?: string): string {
  // Escape the HTML content for embedding in JavaScript
  const escapedContent = htmlContent.replace(/`/g, '\\`').replace(/\$/g, '\\$');
  
  return `
    (() => {
      const htmlContent = \`${escapedContent}\`;
      
      // Find the editor textarea
      let textarea = ${editorId ? `document.getElementById('${editorId}')` : 'null'};
      if (!textarea) {
        const textareas = document.querySelectorAll('textarea[id*="content"], textarea[name*="content"]');
        for (const ta of textareas) {
          if (ta.id.includes('editor') || ta.name.includes('editor')) {
            textarea = ta;
            break;
          }
        }
      }
      
      // Set textarea value
      if (textarea) {
        textarea.value = htmlContent;
        textarea.dispatchEvent(new Event('change', { bubbles: true }));
        textarea.dispatchEvent(new Event('input', { bubbles: true }));
      }
      
      // Set contenteditable div
      const editableDiv = document.querySelector('[contenteditable="true"]');
      if (editableDiv) {
        editableDiv.innerHTML = htmlContent;
      }
      
      return { success: true, message: 'Content set successfully' };
    })()
  `;
}

export default mcp;
