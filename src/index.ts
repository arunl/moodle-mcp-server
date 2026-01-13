#!/usr/bin/env node

/**
 * Moodle MCP Server
 * 
 * An MCP (Model Context Protocol) server that provides access to Moodle LMS.
 * Allows AI assistants to interact with courses, assignments, grades, and more.
 * 
 * Features:
 * - Token-based authentication (standard Moodle web services)
 * - Session-based authentication (for SSO/university Moodle)
 * - Browser extension integration (auto-sync credentials)
 */

import { Server } from '@modelcontextprotocol/sdk/server/index.js';
import { StdioServerTransport } from '@modelcontextprotocol/sdk/server/stdio.js';
import {
  CallToolRequestSchema,
  ListToolsRequestSchema,
  Tool,
} from '@modelcontextprotocol/sdk/types.js';
import { createServer, IncomingMessage, ServerResponse } from 'http';
import { MoodleClient } from './moodle-client.js';
import { getBrowserBridge, BrowserBridge } from './browser-bridge.js';

// Browser bridge for two-way communication with extension
let browserBridge: BrowserBridge | null = null;
const WS_PORT = parseInt(process.env.MCP_WS_PORT || '3848', 10);

// Configuration from environment variables
let MOODLE_URL = process.env.MOODLE_URL;
const MOODLE_TOKEN = process.env.MOODLE_TOKEN;
const MOODLE_USERNAME = process.env.MOODLE_USERNAME;
const MOODLE_PASSWORD = process.env.MOODLE_PASSWORD;
const MOODLE_SERVICE = process.env.MOODLE_SERVICE || 'moodle_mobile_app';
// Session-based auth (for SSO/university Moodle where tokens are disabled)
let MOODLE_SESSION = process.env.MOODLE_SESSION;  // MoodleSession cookie
let MOODLE_SESSKEY = process.env.MOODLE_SESSKEY;  // Session key

// HTTP server port for browser extension communication
const HTTP_PORT = parseInt(process.env.MCP_HTTP_PORT || '3847', 10);
const ENABLE_HTTP = process.env.MCP_ENABLE_HTTP !== 'false'; // Enable by default

// Initialize Moodle client (will be updated when extension sends credentials)
let moodleClient: MoodleClient | null = null;

function initializeMoodleClient() {
  if (!MOODLE_URL) {
    console.error('Warning: MOODLE_URL not set. Waiting for browser extension...');
    return false;
  }

  const hasTokenAuth = MOODLE_TOKEN || (MOODLE_USERNAME && MOODLE_PASSWORD);
  const hasSessionAuth = MOODLE_SESSION && MOODLE_SESSKEY;

  if (!hasTokenAuth && !hasSessionAuth) {
    console.error('Warning: No authentication configured. Waiting for browser extension...');
    return false;
  }

  moodleClient = new MoodleClient({
    baseUrl: MOODLE_URL,
    token: MOODLE_TOKEN,
    username: MOODLE_USERNAME,
    password: MOODLE_PASSWORD,
    service: MOODLE_SERVICE,
    sessionCookie: MOODLE_SESSION,
    sessKey: MOODLE_SESSKEY,
  });

  // Log auth mode
  if (hasSessionAuth) {
    console.error('Moodle MCP Server: Using session-based authentication (SSO mode)');
  } else if (MOODLE_TOKEN) {
    console.error('Moodle MCP Server: Using token-based authentication');
  } else {
    console.error('Moodle MCP Server: Using username/password authentication');
  }

  return true;
}

// Try to initialize with environment variables
initializeMoodleClient();

// ============================================================================
// HTTP Server for Browser Extension Communication
// ============================================================================

function startHttpServer() {
  const server = createServer((req: IncomingMessage, res: ServerResponse) => {
    // CORS headers for browser extension
    res.setHeader('Access-Control-Allow-Origin', '*');
    res.setHeader('Access-Control-Allow-Methods', 'GET, POST, OPTIONS');
    res.setHeader('Access-Control-Allow-Headers', 'Content-Type');

    if (req.method === 'OPTIONS') {
      res.writeHead(204);
      res.end();
      return;
    }

    if (req.method === 'GET' && req.url === '/status') {
      // Health check endpoint
      res.writeHead(200, { 'Content-Type': 'application/json' });
      res.end(JSON.stringify({
        status: 'ok',
        hasCredentials: moodleClient !== null,
        moodleUrl: MOODLE_URL || null,
        timestamp: Date.now(),
      }));
      return;
    }

    if (req.method === 'POST' && req.url === '/session') {
      // Receive credentials from browser extension
      let body = '';
      req.on('data', (chunk) => { body += chunk; });
      req.on('end', () => {
        try {
          const data = JSON.parse(body);
          
          if (!data.moodleUrl || !data.sessionCookie || !data.sesskey) {
            res.writeHead(400, { 'Content-Type': 'application/json' });
            res.end(JSON.stringify({ error: 'Missing required fields: moodleUrl, sessionCookie, sesskey' }));
            return;
          }

          // Update credentials
          MOODLE_URL = data.moodleUrl;
          MOODLE_SESSION = data.sessionCookie;
          MOODLE_SESSKEY = data.sesskey;

          // Reinitialize client with new credentials
          moodleClient = new MoodleClient({
            baseUrl: MOODLE_URL!, // We just set this above from data.moodleUrl
            sessionCookie: MOODLE_SESSION,
            sessKey: MOODLE_SESSKEY,
          });

          console.error(`Moodle MCP Server: Credentials updated from browser extension`);
          console.error(`  URL: ${MOODLE_URL}`);
          console.error(`  Session updated at: ${new Date().toISOString()}`);

          res.writeHead(200, { 'Content-Type': 'application/json' });
          res.end(JSON.stringify({ 
            success: true, 
            message: 'Credentials updated successfully',
            moodleUrl: MOODLE_URL,
          }));
        } catch (e) {
          res.writeHead(400, { 'Content-Type': 'application/json' });
          res.end(JSON.stringify({ error: 'Invalid JSON' }));
        }
      });
      return;
    }

    // 404 for unknown routes
    res.writeHead(404, { 'Content-Type': 'application/json' });
    res.end(JSON.stringify({ error: 'Not found' }));
  });

  server.listen(HTTP_PORT, '127.0.0.1', () => {
    console.error(`Moodle MCP Server: HTTP API listening on http://127.0.0.1:${HTTP_PORT}`);
    console.error(`  - GET  /status  - Check server status`);
    console.error(`  - POST /session - Update credentials from browser extension`);
  });

  server.on('error', (err: NodeJS.ErrnoException) => {
    if (err.code === 'EADDRINUSE') {
      console.error(`Warning: Port ${HTTP_PORT} in use. HTTP API disabled.`);
      console.error(`  Another MCP server may be running, or set MCP_HTTP_PORT to use a different port.`);
    } else {
      console.error('HTTP server error:', err);
    }
  });

  return server;
}

// Start HTTP server if enabled
if (ENABLE_HTTP) {
  startHttpServer();
}

// Define available tools
const tools: Tool[] = [
  {
    name: 'get_site_info',
    description: 'Get information about the Moodle site and the authenticated user. Returns site name, username, full name, user ID, and site URL.',
    inputSchema: {
      type: 'object',
      properties: {},
      required: [],
    },
  },
  {
    name: 'get_courses',
    description: 'Get all courses the user is enrolled in. Returns course names, IDs, progress, and other details.',
    inputSchema: {
      type: 'object',
      properties: {},
      required: [],
    },
  },
  {
    name: 'get_course_contents',
    description: 'Get the contents of a specific course including sections, modules, files, and activities.',
    inputSchema: {
      type: 'object',
      properties: {
        course_id: {
          type: 'number',
          description: 'The ID of the course to get contents for',
        },
      },
      required: ['course_id'],
    },
  },
  {
    name: 'get_assignments',
    description: 'Get assignments for one or more courses. Returns assignment names, due dates, descriptions, and submission requirements.',
    inputSchema: {
      type: 'object',
      properties: {
        course_ids: {
          type: 'array',
          items: { type: 'number' },
          description: 'Array of course IDs to get assignments for. If empty, gets assignments for all enrolled courses.',
        },
      },
      required: [],
    },
  },
  {
    name: 'get_assignment_status',
    description: 'Get the submission status for a specific assignment, including whether it has been submitted, graded, and any feedback.',
    inputSchema: {
      type: 'object',
      properties: {
        assignment_id: {
          type: 'number',
          description: 'The ID of the assignment',
        },
      },
      required: ['assignment_id'],
    },
  },
  {
    name: 'get_grades',
    description: 'Get all grades for a specific course. Returns grade items, scores, percentages, and feedback.',
    inputSchema: {
      type: 'object',
      properties: {
        course_id: {
          type: 'number',
          description: 'The ID of the course to get grades for',
        },
      },
      required: ['course_id'],
    },
  },
  {
    name: 'get_upcoming_deadlines',
    description: 'Get upcoming deadlines and events from the calendar. Returns assignments due, quizzes, and other time-sensitive items.',
    inputSchema: {
      type: 'object',
      properties: {
        course_id: {
          type: 'number',
          description: 'Optional: Filter deadlines for a specific course',
        },
        days_ahead: {
          type: 'number',
          description: 'Number of days ahead to look for deadlines (default: 30)',
        },
      },
      required: [],
    },
  },
  {
    name: 'get_calendar_events',
    description: 'Get calendar events within a date range. Includes course events, user events, and site events.',
    inputSchema: {
      type: 'object',
      properties: {
        days_ahead: {
          type: 'number',
          description: 'Number of days ahead to look for events (default: 30)',
        },
        course_ids: {
          type: 'array',
          items: { type: 'number' },
          description: 'Optional: Filter events for specific courses',
        },
      },
      required: [],
    },
  },
  {
    name: 'get_notifications',
    description: 'Get recent notifications and messages.',
    inputSchema: {
      type: 'object',
      properties: {
        limit: {
          type: 'number',
          description: 'Maximum number of notifications to return (default: 20)',
        },
      },
      required: [],
    },
  },
  {
    name: 'get_forum_discussions',
    description: 'Get discussions from a forum in a course.',
    inputSchema: {
      type: 'object',
      properties: {
        forum_id: {
          type: 'number',
          description: 'The ID of the forum',
        },
        page: {
          type: 'number',
          description: 'Page number for pagination (default: 0)',
        },
        per_page: {
          type: 'number',
          description: 'Number of discussions per page (default: 10)',
        },
      },
      required: ['forum_id'],
    },
  },
  {
    name: 'get_user_profile',
    description: 'Get the profile information for the authenticated user.',
    inputSchema: {
      type: 'object',
      properties: {},
      required: [],
    },
  },
  {
    name: 'search_courses',
    description: 'Search for courses by name or keyword.',
    inputSchema: {
      type: 'object',
      properties: {
        query: {
          type: 'string',
          description: 'Search query string',
        },
        page: {
          type: 'number',
          description: 'Page number for pagination (default: 0)',
        },
        per_page: {
          type: 'number',
          description: 'Number of results per page (default: 20)',
        },
      },
      required: ['query'],
    },
  },
  // ============================================================================
  // Browser-based tools (requires browser extension)
  // ============================================================================
  {
    name: 'browse_moodle',
    description: 'Navigate to a Moodle page and extract its content. Use this when API access is not available or when you need to access pages that are not exposed via API. Requires the browser extension to be installed and connected.',
    inputSchema: {
      type: 'object',
      properties: {
        url: {
          type: 'string',
          description: 'The full URL to navigate to (e.g., https://moodle.louisiana.edu/course/view.php?id=12345)',
        },
        path: {
          type: 'string',
          description: 'Alternative: A path relative to the Moodle base URL (e.g., /course/view.php?id=12345)',
        },
      },
      required: [],
    },
  },
  {
    name: 'click_moodle_element',
    description: 'Click an element on the current Moodle page. Use CSS selectors to identify the element.',
    inputSchema: {
      type: 'object',
      properties: {
        selector: {
          type: 'string',
          description: 'CSS selector for the element to click (e.g., "#settings-menu", ".btn-primary", "a[href*=edit]")',
        },
      },
      required: ['selector'],
    },
  },
  {
    name: 'extract_moodle_page',
    description: 'Extract data from the current Moodle page. Returns page title, URL, links, headings, and other structured data.',
    inputSchema: {
      type: 'object',
      properties: {
        include_html: {
          type: 'boolean',
          description: 'Include raw HTML content (default: false)',
        },
        include_text: {
          type: 'boolean',
          description: 'Include full text content (default: true)',
        },
        selectors: {
          type: 'array',
          items: { type: 'string' },
          description: 'Specific CSS selectors to extract (e.g., [".course-content", "#region-main"])',
        },
      },
      required: [],
    },
  },
  {
    name: 'get_browser_status',
    description: 'Check if the browser extension is connected and ready to receive commands.',
    inputSchema: {
      type: 'object',
      properties: {},
      required: [],
    },
  },
  {
    name: 'set_moodle_editor_content',
    description: `Set HTML content in a Moodle rich text editor (Atto editor). This tool handles the complexity of Moodle's editor by using JavaScript to directly set both the hidden textarea and the contenteditable div. Use this for creating or editing Moodle Book chapters, pages, labels, or any content with the Atto editor.

IMPORTANT: You must be on the edit page of the content you want to modify before calling this tool.

Example usage:
1. Navigate to the edit page (e.g., edit.php?cmid=123&id=456)
2. Call this tool with your HTML content
3. The tool will set the content and optionally save

Supports styled HTML including:
- Blockquotes with inline styles
- Colored backgrounds and borders
- Custom fonts and text formatting
- Tables and lists`,
    inputSchema: {
      type: 'object',
      properties: {
        html_content: {
          type: 'string',
          description: 'The HTML content to set in the editor. Can include inline styles for rich formatting.',
        },
        editor_selector: {
          type: 'string',
          description: 'CSS selector for the editor textarea (default: auto-detect Moodle Atto editor)',
        },
        auto_save: {
          type: 'boolean',
          description: 'Whether to automatically click the save button after setting content (default: false)',
        },
      },
      required: ['html_content'],
    },
  },
];

// Helper function to format dates
function formatDate(timestamp: number): string {
  if (!timestamp) return 'N/A';
  return new Date(timestamp * 1000).toLocaleString();
}

// Helper function to format course data
function formatCourse(course: {
  id: number;
  fullname: string;
  shortname: string;
  progress?: number;
  startdate?: number;
  enddate?: number;
}): object {
  return {
    id: course.id,
    name: course.fullname,
    shortName: course.shortname,
    progress: course.progress !== undefined ? `${Math.round(course.progress)}%` : 'N/A',
    startDate: course.startdate ? formatDate(course.startdate) : 'N/A',
    endDate: course.enddate ? formatDate(course.enddate) : 'N/A',
  };
}

// Helper function to format assignment data
function formatAssignment(assignment: {
  id: number;
  name: string;
  duedate: number;
  intro: string;
  allowsubmissionsfromdate: number;
  cutoffdate: number;
}): object {
  return {
    id: assignment.id,
    name: assignment.name,
    dueDate: formatDate(assignment.duedate),
    description: assignment.intro?.replace(/<[^>]*>/g, '').substring(0, 500) || 'No description',
    opensAt: formatDate(assignment.allowsubmissionsfromdate),
    closesAt: assignment.cutoffdate ? formatDate(assignment.cutoffdate) : 'N/A',
  };
}

// Helper function to format grade data
function formatGradeItem(item: {
  itemname: string;
  gradeformatted: string;
  percentageformatted: string;
  feedback: string;
  grademax: number;
}): object {
  return {
    name: item.itemname || 'Course Total',
    grade: item.gradeformatted || 'N/A',
    percentage: item.percentageformatted || 'N/A',
    maxGrade: item.grademax,
    feedback: item.feedback?.replace(/<[^>]*>/g, '').substring(0, 200) || '',
  };
}

// Helper function to format event data
function formatEvent(event: {
  id: number;
  name: string;
  timestart: number;
  timeduration: number;
  modulename: string;
  course?: { fullname: string };
  description: string;
}): object {
  return {
    id: event.id,
    name: event.name,
    startTime: formatDate(event.timestart),
    duration: event.timeduration ? `${Math.round(event.timeduration / 60)} minutes` : 'N/A',
    type: event.modulename || 'event',
    course: event.course?.fullname || 'N/A',
    description: event.description?.replace(/<[^>]*>/g, '').substring(0, 200) || '',
  };
}

// Create server instance
const server = new Server(
  {
    name: 'moodle-mcp-server',
    version: '1.0.0',
  },
  {
    capabilities: {
      tools: {},
    },
  }
);

// Handle list tools request
server.setRequestHandler(ListToolsRequestSchema, async () => {
  return { tools };
});

// Handle tool execution
server.setRequestHandler(CallToolRequestSchema, async (request) => {
  const { name, arguments: args } = request.params;

  try {
    // Check if client is initialized
    if (!moodleClient) {
      throw new Error(
        'Moodle client not initialized. Please either:\n' +
        '1. Set MOODLE_URL and MOODLE_SESSION/MOODLE_SESSKEY environment variables, or\n' +
        '2. Install the browser extension and log into Moodle to auto-sync credentials.\n' +
        `   HTTP API is listening on http://127.0.0.1:${HTTP_PORT}`
      );
    }

    // Authenticate if needed (username/password flow)
    if (!MOODLE_TOKEN && MOODLE_USERNAME && MOODLE_PASSWORD) {
      await moodleClient.authenticate(MOODLE_USERNAME, MOODLE_PASSWORD);
    }

    switch (name) {
      case 'get_site_info': {
        const siteInfo = await moodleClient.getSiteInfo();
        return {
          content: [
            {
              type: 'text',
              text: JSON.stringify({
                siteName: siteInfo.sitename,
                siteUrl: siteInfo.siteurl,
                user: {
                  id: siteInfo.userid,
                  username: siteInfo.username,
                  fullName: siteInfo.fullname,
                },
              }, null, 2),
            },
          ],
        };
      }

      case 'get_courses': {
        const courses = await moodleClient.getCourses();
        return {
          content: [
            {
              type: 'text',
              text: JSON.stringify({
                totalCourses: courses.length,
                courses: courses.map(formatCourse),
              }, null, 2),
            },
          ],
        };
      }

      case 'get_course_contents': {
        const courseId = args?.course_id as number;
        if (!courseId) {
          throw new Error('course_id is required');
        }
        const contents = await moodleClient.getCourseContents(courseId);
        return {
          content: [
            {
              type: 'text',
              text: JSON.stringify({
                sections: contents.map((section) => ({
                  id: section.id,
                  name: section.name,
                  summary: section.summary?.replace(/<[^>]*>/g, '').substring(0, 200) || '',
                  modules: section.modules.map((mod) => ({
                    id: mod.id,
                    name: mod.name,
                    type: mod.modname,
                    url: mod.url || 'N/A',
                    hasFiles: (mod.contents?.length || 0) > 0,
                  })),
                })),
              }, null, 2),
            },
          ],
        };
      }

      case 'get_assignments': {
        let courseIds = args?.course_ids as number[] | undefined;
        
        // If no course IDs provided, get all enrolled courses
        if (!courseIds || courseIds.length === 0) {
          const courses = await moodleClient.getCourses();
          courseIds = courses.map((c) => c.id);
        }
        
        const result = await moodleClient.getAssignments(courseIds);
        return {
          content: [
            {
              type: 'text',
              text: JSON.stringify({
                courses: result.courses.map((course) => ({
                  courseId: course.id,
                  courseName: course.fullname,
                  assignments: course.assignments.map(formatAssignment),
                })),
              }, null, 2),
            },
          ],
        };
      }

      case 'get_assignment_status': {
        const assignmentId = args?.assignment_id as number;
        if (!assignmentId) {
          throw new Error('assignment_id is required');
        }
        const status = await moodleClient.getAssignmentSubmissionStatus(assignmentId);
        return {
          content: [
            {
              type: 'text',
              text: JSON.stringify({
                submissionStatus: status.lastattempt?.submission?.status || 'not submitted',
                canSubmit: status.lastattempt?.cansubmit || false,
                canEdit: status.lastattempt?.canedit || false,
                isLocked: status.lastattempt?.locked || false,
                isGraded: status.lastattempt?.graded || false,
                gradingStatus: status.lastattempt?.gradingstatus || 'N/A',
                grade: status.feedback?.gradefordisplay || 'Not graded',
                gradedDate: status.feedback?.gradeddate ? formatDate(status.feedback.gradeddate) : 'N/A',
              }, null, 2),
            },
          ],
        };
      }

      case 'get_grades': {
        const courseId = args?.course_id as number;
        if (!courseId) {
          throw new Error('course_id is required');
        }
        const grades = await moodleClient.getGrades(courseId);
        const userGrade = grades.usergrades[0];
        return {
          content: [
            {
              type: 'text',
              text: JSON.stringify({
                courseId: userGrade?.courseid,
                userName: userGrade?.userfullname,
                gradeItems: userGrade?.gradeitems.map(formatGradeItem) || [],
              }, null, 2),
            },
          ],
        };
      }

      case 'get_upcoming_deadlines': {
        const courseId = args?.course_id as number | undefined;
        const events = await moodleClient.getUpcomingEvents(courseId);
        return {
          content: [
            {
              type: 'text',
              text: JSON.stringify({
                totalEvents: events.events.length,
                deadlines: events.events.map(formatEvent),
              }, null, 2),
            },
          ],
        };
      }

      case 'get_calendar_events': {
        const daysAhead = (args?.days_ahead as number) || 30;
        const courseIds = args?.course_ids as number[] | undefined;
        const now = Math.floor(Date.now() / 1000);
        const events = await moodleClient.getCalendarEvents({
          timestart: now,
          timeend: now + daysAhead * 24 * 60 * 60,
          courseids: courseIds,
        });
        return {
          content: [
            {
              type: 'text',
              text: JSON.stringify({
                totalEvents: events.events.length,
                events: events.events.map(formatEvent),
              }, null, 2),
            },
          ],
        };
      }

      case 'get_notifications': {
        const limit = (args?.limit as number) || 20;
        const notifications = await moodleClient.getNotifications(undefined, limit);
        return {
          content: [
            {
              type: 'text',
              text: JSON.stringify({
                notifications: notifications.notifications.map((n) => ({
                  id: n.id,
                  subject: n.subject,
                  message: n.smallmessage || n.text?.substring(0, 200),
                  time: n.timecreatedpretty,
                  read: n.read,
                  url: n.contexturl,
                })),
              }, null, 2),
            },
          ],
        };
      }

      case 'get_forum_discussions': {
        const forumId = args?.forum_id as number;
        if (!forumId) {
          throw new Error('forum_id is required');
        }
        const page = (args?.page as number) || 0;
        const perPage = (args?.per_page as number) || 10;
        const discussions = await moodleClient.getForumDiscussions(forumId, 'timemodified', 'DESC', page, perPage);
        return {
          content: [
            {
              type: 'text',
              text: JSON.stringify({
                discussions: discussions.discussions.map((d) => ({
                  id: d.id,
                  subject: d.subject,
                  author: d.userfullname,
                  created: formatDate(d.created),
                  modified: formatDate(d.modified),
                  numReplies: d.numreplies,
                  pinned: d.pinned,
                  locked: d.locked,
                  message: d.message?.replace(/<[^>]*>/g, '').substring(0, 300) || '',
                })),
              }, null, 2),
            },
          ],
        };
      }

      case 'get_user_profile': {
        const users = await moodleClient.getUserProfile();
        const user = users[0];
        return {
          content: [
            {
              type: 'text',
              text: JSON.stringify({
                id: user.id,
                username: user.username,
                fullName: user.fullname,
                firstName: user.firstname,
                lastName: user.lastname,
                email: user.email,
                department: user.department,
                lastAccess: formatDate(user.lastaccess),
                profileImageUrl: user.profileimageurl,
              }, null, 2),
            },
          ],
        };
      }

      case 'search_courses': {
        const query = args?.query as string;
        if (!query) {
          throw new Error('query is required');
        }
        const page = (args?.page as number) || 0;
        const perPage = (args?.per_page as number) || 20;
        const results = await moodleClient.searchCourses(query, page, perPage);
        return {
          content: [
            {
              type: 'text',
              text: JSON.stringify({
                totalResults: results.total,
                courses: results.courses.map(formatCourse),
              }, null, 2),
            },
          ],
        };
      }

      // ========================================================================
      // Browser-based tools
      // ========================================================================
      case 'browse_moodle': {
        if (!browserBridge || !browserBridge.isConnected()) {
          return {
            content: [
              {
                type: 'text',
                text: JSON.stringify({
                  error: 'Browser extension not connected',
                  help: 'Please ensure the Moodle MCP browser extension is installed and you have a Moodle tab open.',
                  wsStatus: browserBridge?.getStatus() || { running: false },
                }, null, 2),
              },
            ],
            isError: true,
          };
        }

        let targetUrl = args?.url as string;
        if (!targetUrl && args?.path) {
          targetUrl = `${MOODLE_URL}${args.path}`;
        }
        if (!targetUrl) {
          throw new Error('Either url or path is required');
        }

        const navResult = await browserBridge.navigate(targetUrl);
        return {
          content: [
            {
              type: 'text',
              text: JSON.stringify(navResult.success ? navResult.data : { error: navResult.error }, null, 2),
            },
          ],
          isError: !navResult.success,
        };
      }

      case 'click_moodle_element': {
        if (!browserBridge || !browserBridge.isConnected()) {
          return {
            content: [
              {
                type: 'text',
                text: JSON.stringify({
                  error: 'Browser extension not connected',
                  help: 'Please ensure the Moodle MCP browser extension is installed.',
                }, null, 2),
              },
            ],
            isError: true,
          };
        }

        const selector = args?.selector as string;
        if (!selector) {
          throw new Error('selector is required');
        }

        const clickResult = await browserBridge.click(selector);
        return {
          content: [
            {
              type: 'text',
              text: JSON.stringify(clickResult.success ? clickResult.data : { error: clickResult.error }, null, 2),
            },
          ],
          isError: !clickResult.success,
        };
      }

      case 'extract_moodle_page': {
        if (!browserBridge || !browserBridge.isConnected()) {
          return {
            content: [
              {
                type: 'text',
                text: JSON.stringify({
                  error: 'Browser extension not connected',
                  help: 'Please ensure the Moodle MCP browser extension is installed.',
                }, null, 2),
              },
            ],
            isError: true,
          };
        }

        const extractResult = await browserBridge.extract({
          includeHtml: args?.include_html as boolean,
          includeText: args?.include_text as boolean,
          selectors: args?.selectors as string[],
        });
        return {
          content: [
            {
              type: 'text',
              text: JSON.stringify(extractResult.success ? extractResult.data : { error: extractResult.error }, null, 2),
            },
          ],
          isError: !extractResult.success,
        };
      }

      case 'get_browser_status': {
        const status = browserBridge?.getStatus() || { running: false, connected: false, clientCount: 0 };
        return {
          content: [
            {
              type: 'text',
              text: JSON.stringify({
                browserBridge: status,
                moodleUrl: MOODLE_URL || 'Not configured',
                hasSession: !!(MOODLE_SESSION && MOODLE_SESSKEY),
              }, null, 2),
            },
          ],
        };
      }

      case 'set_moodle_editor_content': {
        if (!browserBridge || !browserBridge.isConnected()) {
          return {
            content: [
              {
                type: 'text',
                text: JSON.stringify({
                  error: 'Browser extension not connected',
                  help: 'Please ensure the Moodle MCP browser extension is installed and connected.',
                }, null, 2),
              },
            ],
            isError: true,
          };
        }

        const htmlContent = args?.html_content as string;
        if (!htmlContent) {
          throw new Error('html_content is required');
        }

        const autoSave = args?.auto_save as boolean || false;

        // JavaScript to set content in Moodle's Atto editor
        // This handles both the hidden textarea and the contenteditable div
        const setEditorScript = `
          (function() {
            const htmlContent = ${JSON.stringify(htmlContent)};
            
            // Find the hidden textarea (Moodle uses this to store the actual content)
            const textareas = document.querySelectorAll('textarea[id*="content"], textarea[name*="content"]');
            let textarea = null;
            for (const ta of textareas) {
              if (ta.id.includes('editor') || ta.name.includes('editor')) {
                textarea = ta;
                break;
              }
            }
            if (!textarea) {
              textarea = document.querySelector('textarea.editor_atto_content') || 
                         document.querySelector('#id_content_editor') ||
                         document.querySelector('textarea[name="content_editor[text]"]');
            }
            
            if (!textarea) {
              return { success: false, error: 'Could not find editor textarea. Make sure you are on an edit page.' };
            }
            
            // Set the textarea value
            textarea.value = htmlContent;
            
            // Also update the contenteditable div (Atto's visual editor)
            const editableDiv = document.querySelector('[contenteditable="true"]');
            if (editableDiv) {
              editableDiv.innerHTML = htmlContent;
            }
            
            // Trigger change events
            textarea.dispatchEvent(new Event('change', { bubbles: true }));
            textarea.dispatchEvent(new Event('input', { bubbles: true }));
            
            return { 
              success: true, 
              message: 'Content set successfully',
              textareaId: textarea.id,
              editableDivFound: !!editableDiv
            };
          })();
        `;

        const result = await browserBridge.evaluate(setEditorScript);

        // Cast result data to expected shape
        const resultData = result.data as { success?: boolean; error?: string; message?: string } | undefined;

        if (!result.success) {
          return {
            content: [
              {
                type: 'text',
                text: JSON.stringify({ error: result.error || 'Failed to execute script' }, null, 2),
              },
            ],
            isError: true,
          };
        }

        // If auto_save is true, click the save button
        if (autoSave && resultData?.success) {
          const saveScript = `
            (function() {
              const saveBtn = document.querySelector('button[type="submit"]:not([name="cancel"])') ||
                              document.querySelector('input[type="submit"][name="submitbutton"]') ||
                              document.querySelector('#id_submitbutton') ||
                              document.querySelector('button:contains("Save")');
              
              if (!saveBtn) {
                // Try to find by button text
                const buttons = document.querySelectorAll('button, input[type="submit"]');
                for (const btn of buttons) {
                  if (btn.textContent?.toLowerCase().includes('save') || 
                      btn.value?.toLowerCase().includes('save')) {
                    btn.click();
                    return { success: true, message: 'Clicked save button' };
                  }
                }
                return { success: false, error: 'Could not find save button' };
              }
              
              saveBtn.click();
              return { success: true, message: 'Clicked save button' };
            })();
          `;
          const saveResult = await browserBridge.evaluate(saveScript);
          return {
            content: [
              {
                type: 'text',
                text: JSON.stringify({
                  contentSet: result.data,
                  saveAttempt: saveResult.data,
                }, null, 2),
              },
            ],
            isError: !saveResult.success,
          };
        }

        return {
          content: [
            {
              type: 'text',
              text: JSON.stringify(resultData, null, 2),
            },
          ],
          isError: !resultData?.success,
        };
      }

      default:
        throw new Error(`Unknown tool: ${name}`);
    }
  } catch (error) {
    const errorMessage = error instanceof Error ? error.message : String(error);
    return {
      content: [
        {
          type: 'text',
          text: JSON.stringify({ error: errorMessage }, null, 2),
        },
      ],
      isError: true,
    };
  }
});

// Start the server
async function main() {
  // Start browser bridge for two-way communication with extension
  browserBridge = getBrowserBridge(WS_PORT);
  try {
    await browserBridge.start();
    console.error(`Browser bridge started on ws://127.0.0.1:${WS_PORT}`);
  } catch (e) {
    console.error(`Warning: Could not start browser bridge: ${e}`);
    // Continue anyway - the bridge is optional
  }

  // Start MCP server
  const transport = new StdioServerTransport();
  await server.connect(transport);
  console.error('Moodle MCP Server started');
  
  // Log status
  if (browserBridge?.isConnected()) {
    console.error('Browser extension connected - full functionality available');
  } else {
    console.error('Waiting for browser extension connection...');
    console.error('Install the extension from browser-extension/ and open a Moodle tab');
  }
}

main().catch((error) => {
  console.error('Failed to start server:', error);
  process.exit(1);
});
