#!/usr/bin/env node

/**
 * Moodle MCP Server
 * 
 * An MCP (Model Context Protocol) server that provides access to Moodle LMS.
 * Allows AI assistants to interact with courses, assignments, grades, and more.
 */

import { Server } from '@modelcontextprotocol/sdk/server/index.js';
import { StdioServerTransport } from '@modelcontextprotocol/sdk/server/stdio.js';
import {
  CallToolRequestSchema,
  ListToolsRequestSchema,
  Tool,
} from '@modelcontextprotocol/sdk/types.js';
import { MoodleClient } from './moodle-client.js';

// Configuration from environment variables
const MOODLE_URL = process.env.MOODLE_URL;
const MOODLE_TOKEN = process.env.MOODLE_TOKEN;
const MOODLE_USERNAME = process.env.MOODLE_USERNAME;
const MOODLE_PASSWORD = process.env.MOODLE_PASSWORD;
const MOODLE_SERVICE = process.env.MOODLE_SERVICE || 'moodle_mobile_app';

if (!MOODLE_URL) {
  console.error('Error: MOODLE_URL environment variable is required');
  process.exit(1);
}

if (!MOODLE_TOKEN && (!MOODLE_USERNAME || !MOODLE_PASSWORD)) {
  console.error('Error: Either MOODLE_TOKEN or MOODLE_USERNAME/MOODLE_PASSWORD is required');
  process.exit(1);
}

// Initialize Moodle client
const moodleClient = new MoodleClient({
  baseUrl: MOODLE_URL,
  token: MOODLE_TOKEN,
  username: MOODLE_USERNAME,
  password: MOODLE_PASSWORD,
  service: MOODLE_SERVICE,
});

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
  const transport = new StdioServerTransport();
  await server.connect(transport);
  console.error('Moodle MCP Server started');
}

main().catch((error) => {
  console.error('Failed to start server:', error);
  process.exit(1);
});
