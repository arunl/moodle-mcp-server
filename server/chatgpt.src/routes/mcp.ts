import { Hono } from 'hono';
import { streamSSE } from 'hono/streaming';
import { db, apiKeys, users } from '../db/index.js';
import { eq, and, isNull } from 'drizzle-orm';
import { hashApiKey } from '../auth/jwt.js';
import { connectionManager, BrowserCommand } from '../bridge/connection-manager.js';
import { moodleTools, generateCommandId } from '../mcp/tools.js';

// -----------------------------
// Macro helper scripts (run in browser context)
// -----------------------------
function parseParticipantsScript(): string {
  return `(() => {
    const table = document.querySelector('table#participants');
    if (!table) return { totalRows: undefined, participants: [] };

    const totalRowsAttr = table.getAttribute('data-table-total-rows');
    const totalRows = totalRowsAttr ? Number(totalRowsAttr) : undefined;

    const headerCells = Array.from(table.querySelectorAll('thead th'));
    const headerText = headerCells.map(th => (th.textContent || '').trim().toLowerCase());
    const idxName = headerText.findIndex(t => t.includes('name'));
    const idxEmail = headerText.findIndex(t => t.includes('email'));
    const idxRoles = headerText.findIndex(t => t.includes('roles'));
    const idxGroups = headerText.findIndex(t => t.includes('groups'));
    const idxLastAccess = headerText.findIndex(t => t.includes('last access'));

    const rows = Array.from(table.querySelectorAll('tbody tr'));
    const participants = rows.map(tr => {
      const tds = Array.from(tr.querySelectorAll('td'));
      const getCellText = (i) => (i >= 0 && tds[i]) ? (tds[i].textContent || '').trim() : undefined;

      let name;
      let profileUrl;
      if (idxName >= 0 && tds[idxName]) {
        const a = tds[idxName].querySelector('a');
        name = (a?.textContent || tds[idxName].textContent || '').trim() || undefined;
        profileUrl = a?.href;
      }

      const email = getCellText(idxEmail);
      const rolesText = getCellText(idxRoles);
      const groupsText = getCellText(idxGroups);
      const lastAccess = getCellText(idxLastAccess);

      const roles = rolesText ? rolesText.split(',').map(s => s.trim()).filter(Boolean) : undefined;
      const groups = groupsText ? groupsText.split(',').map(s => s.trim()).filter(Boolean) : undefined;

      return { name, profileUrl, email, roles, groups, lastAccess };
    });

    return { totalRows, participants };
  })()`;
}

function parseForumDiscussionsScript(): string {
  return `(() => {
    const rows = Array.from(document.querySelectorAll('tr[data-region="discussion-list-item"]'));
    const discussions = rows.map(row => {
      const id = row.getAttribute('data-discussionid');
      const a = row.querySelector('th.topic a');
      const title = (a?.textContent || '').trim();
      const url = a?.href;
      return {
        discussionId: id ? Number(id) : undefined,
        title,
        url,
      };
    }).filter(d => d.discussionId && d.url);
    return { discussions };
  })()`;
}

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
        await sendBrowserCommand(userId, 'wait', { selector: 'table#participants', timeout: 10000 });
        result = await sendBrowserCommand(userId, 'evaluate', {
          script: `(() => ({ url: location.href, title: document.title }))()`,
        });
        break;

      case 'list_participants':
        await sendBrowserCommand(userId, 'navigate', {
          url: `/user/index.php?id=${args.course_id}&page=${args.page ?? 0}`,
        });
        await sendBrowserCommand(userId, 'wait', { selector: 'table#participants', timeout: 10000 });
        result = await sendBrowserCommand(userId, 'evaluate', { script: parseParticipantsScript() });
        result = { page: args.page ?? 0, ...result };
        break;

      case 'enable_editing':
        await sendBrowserCommand(userId, 'navigate', {
          url: `/course/view.php?id=${args.course_id}&notifyeditingon=1`,
        });
        await sendBrowserCommand(userId, 'wait', { selector: 'body', timeout: 10000 });
        result = await sendBrowserCommand(userId, 'evaluate', {
          script: `(() => ({ enabled: !!document.querySelector('button.section-modchooser[data-action="open-chooser"]'), url: location.href }))()`,
        });
        break;

      case 'list_addable_sections':
        await sendBrowserCommand(userId, 'wait', {
          selector: 'button.section-modchooser[data-sectionid]',
          timeout: 10000,
        });
        result = await sendBrowserCommand(userId, 'evaluate', {
          script: `(() => {
            const buttons = Array.from(document.querySelectorAll('button.section-modchooser[data-sectionid]'));
            const sections = buttons
              .map(b => Number(b.getAttribute('data-sectionid')))
              .filter(n => Number.isFinite(n));
            return { sections: Array.from(new Set(sections)) };
          })()`,
        });
        break;

      case 'forum_list_discussions':
        await sendBrowserCommand(userId, 'navigate', { url: `/mod/forum/view.php?id=${args.forum_view_id}` });
        await sendBrowserCommand(userId, 'wait', { selector: 'tr[data-region="discussion-list-item"]', timeout: 10000 });
        result = await sendBrowserCommand(userId, 'evaluate', { script: parseForumDiscussionsScript() });
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
