import { Hono } from 'hono';
import { streamSSE } from 'hono/streaming';
import { db, apiKeys, users } from '../db/index.js';
import { eq, and, isNull } from 'drizzle-orm';
import { hashApiKey } from '../auth/jwt.js';
import { connectionManager, BrowserCommand } from '../bridge/connection-manager.js';
import { moodleTools, generateCommandId } from '../mcp/tools.js';

// Note: Moodle-specific extraction logic has been moved to the browser extension
// (background.js) to avoid CSP issues with eval(). The server now uses dedicated
// action types: extract_participants, extract_editing_status, extract_addable_sections,
// extract_forum_discussions

const mcp = new Hono();

// Middleware to verify API key
async function verifyApiKey(authHeader: string | undefined): Promise<{ userId: string; email: string } | null> {
  if (!authHeader?.startsWith('Bearer ')) {
    return null;
  }

  const key = authHeader.substring(7);
  const keyHash = await hashApiKey(key);

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

// MCP JSON-RPC handler
mcp.post('/', async (c) => {
  const auth = await verifyApiKey(c.req.header('Authorization'));
  
  if (!auth) {
    return c.json({ error: 'Unauthorized' }, 401);
  }

  const request = await c.req.json();
  
  // Handle JSON-RPC request
  const response = await handleMcpRequest(request, auth.userId);
  
  return c.json(response);
});

// MCP SSE endpoint
mcp.get('/sse', async (c) => {
  const auth = await verifyApiKey(c.req.header('Authorization'));
  
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
  const { name, arguments: args = {} } = params;

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
        result = await sendBrowserCommand(userId, 'navigate', { url: args.url });
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
        result = await sendBrowserCommand(userId, 'evaluate', {
          script: createEditorScript(args.html_content, args.editor_id),
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

      case 'evaluate_script':
        result = await sendBrowserCommand(userId, 'evaluate', {
          script: args.script,
        });
        break;

      // -----------------------------
      // Moodle macros (v0) - built from primitives
      // -----------------------------
      case 'open_course':
        await sendBrowserCommand(userId, 'navigate', { url: `/course/view.php?id=${args.course_id}` });
        await sendBrowserCommand(userId, 'wait', { selector: 'body', timeout: 10000 });
        result = await sendBrowserCommand(userId, 'evaluate', {
          script: `(() => ({ url: location.href, title: document.title }))()`,
        });
        break;

      case 'open_participants':
        await sendBrowserCommand(userId, 'navigate', { url: `/user/index.php?id=${args.course_id}` });
        await sendBrowserCommand(userId, 'wait', { selector: 'table#participants, table.generaltable', timeout: 10000 });
        result = await sendBrowserCommand(userId, 'extract', {});
        break;

      case 'list_participants':
        await sendBrowserCommand(userId, 'navigate', {
          url: `/user/index.php?id=${args.course_id}&page=${args.page ?? 0}`,
        });
        await sendBrowserCommand(userId, 'wait', { selector: 'table#participants, table.generaltable', timeout: 10000 });
        // Use CSP-safe dedicated handler instead of evaluate
        result = await sendBrowserCommand(userId, 'extract_participants', {});
        result = { page: args.page ?? 0, ...result };
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
        await sendBrowserCommand(userId, 'wait', { selector: 'table.forumheaderlist, [data-region="discussion-list"]', timeout: 10000 });
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
        await sendBrowserCommand(userId, 'wait', { selector: '.course-listitem, .coursebox', timeout: 5000 });
        result = await sendBrowserCommand(userId, 'extract', {
          selectors: {
            courses: '.course-listitem, .coursebox',
          },
        });
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

    return {
      jsonrpc: '2.0',
      id,
      result: {
        content: [
          {
            type: 'text',
            text: JSON.stringify(result, null, 2),
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
