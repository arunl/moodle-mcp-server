// MCP Tool definitions for Moodle interactions
export const moodleTools = [
  // -----------------------------
  // Core / Bridge primitives
  // -----------------------------
  {
    name: 'get_browser_status',
    description: 'Check if the browser extension is connected and ready to interact with Moodle.',
    inputSchema: {
      type: 'object',
      properties: {},
      required: [],
    },
  },
  {
    name: 'browse_moodle',
    description: `Navigate the browser to a Moodle URL. This allows you to visit any page within the user's Moodle instance.
    
Examples:
- Navigate to course list: /my/courses.php
- Navigate to a specific course: /course/view.php?id=12345
- Navigate to gradebook: /grade/report/grader/index.php?id=12345`,
    inputSchema: {
      type: 'object',
      properties: {
        url: {
          type: 'string',
          description: 'The URL to navigate to. Can be a full URL or a path relative to the Moodle base URL.',
        },
      },
      required: ['url'],
    },
  },
  {
    name: 'click_element',
    description: `Click an element on the current Moodle page.
    
Use CSS selectors to identify elements. Common patterns:
- By ID: #element-id
- By class: .class-name
- By attribute: [data-action="edit"]
- Combine: a.nav-link[href*="course"]`,
    inputSchema: {
      type: 'object',
      properties: {
        selector: {
          type: 'string',
          description: 'CSS selector for the element to click.',
        },
        description: {
          type: 'string',
          description: 'Human-readable description of what you are clicking (for logging).',
        },
      },
      required: ['selector'],
    },
  },
  {
    name: 'type_text',
    description: 'Type text into an input field or textarea on the current page.',
    inputSchema: {
      type: 'object',
      properties: {
        selector: {
          type: 'string',
          description: 'CSS selector for the input element.',
        },
        text: {
          type: 'string',
          description: 'The text to type into the element.',
        },
        clear_first: {
          type: 'boolean',
          description: 'Whether to clear the field before typing. Defaults to true.',
          default: true,
        },
      },
      required: ['selector', 'text'],
    },
  },
  {
    name: 'extract_page_content',
    description: `Extract structured content from the current Moodle page.
    
Returns:
- Page title
- Main content text
- Links (with text and URLs)
- Headings hierarchy`,
    inputSchema: {
      type: 'object',
      properties: {
        selectors: {
          type: 'object',
          description: 'Optional custom selectors to extract specific content.',
          properties: {
            content: {
              type: 'string',
              description: 'Selector for main content area.',
            },
            links: {
              type: 'string',
              description: 'Selector for links to extract.',
            },
            courses: {
              type: 'string',
              description: 'Selector to extract course items.',
            },
          },
        },
      },
      required: [],
    },
  },
  {
    name: 'set_editor_content',
    description: `Set HTML content in a Moodle rich text editor (Atto/TinyMCE).
    
This tool uses JavaScript to directly set the underlying textarea and the visible contenteditable region.
Use this for Book chapters, Forum posts, Assignment descriptions, Labels, etc.`,
    inputSchema: {
      type: 'object',
      properties: {
        html_content: {
          type: 'string',
          description: 'The HTML content to set in the editor.',
        },
        editor_id: {
          type: 'string',
          description: 'Optional: The ID of the editor textarea (e.g., "id_content_editor"). If omitted, finds the first plausible editor on the page.',
        },
        auto_save: {
          type: 'boolean',
          description: 'Whether to automatically click a submit button after setting content.',
          default: false,
        },
      },
      required: ['html_content'],
    },
  },
  {
    name: 'wait_for_element',
    description: 'Wait for an element to appear on the page before continuing.',
    inputSchema: {
      type: 'object',
      properties: {
        selector: {
          type: 'string',
          description: 'CSS selector for the element to wait for.',
        },
        timeout: {
          type: 'number',
          description: 'Maximum time to wait in milliseconds. Defaults to 10000 (10 seconds).',
          default: 10000,
        },
      },
      required: ['selector'],
    },
  },
  {
    name: 'evaluate_script',
    description: `Execute custom JavaScript in the browser context.
    
Use this for complex operations not covered by other tools. The script should return a value.
Example: "return document.querySelectorAll('.activity').length"`,
    inputSchema: {
      type: 'object',
      properties: {
        script: {
          type: 'string',
          description: 'JavaScript code to execute. Should use "return" to return a value.',
        },
      },
      required: ['script'],
    },
  },

  // -----------------------------
  // Moodle macros (v0) - implemented on server via primitives
  // -----------------------------
  {
    name: 'open_course',
    description: 'Open a Moodle course home page by course ID (course/view.php?id=...).',
    inputSchema: {
      type: 'object',
      properties: {
        course_id: { type: 'number', description: 'The Moodle course ID.' },
      },
      required: ['course_id'],
    },
  },
  {
    name: 'open_participants',
    description: 'Open the Participants page for a given course (user/index.php?id=...).',
    inputSchema: {
      type: 'object',
      properties: {
        course_id: { type: 'number', description: 'The Moodle course ID.' },
      },
      required: ['course_id'],
    },
  },
  {
    name: 'list_participants',
    description: 'Return a structured list of participants enrolled in a course by parsing the Participants table.',
    inputSchema: {
      type: 'object',
      properties: {
        course_id: { type: 'number', description: 'The Moodle course ID.' },
        page: { type: 'number', description: 'Participants pagination page (0-based). Defaults to 0.', default: 0 },
      },
      required: ['course_id'],
    },
  },
  {
    name: 'enable_editing',
    description: 'Enable editing mode for a course (course/view.php?id=...&notifyeditingon=1).',
    inputSchema: {
      type: 'object',
      properties: {
        course_id: { type: 'number', description: 'The Moodle course ID.' },
      },
      required: ['course_id'],
    },
  },
  {
    name: 'list_addable_sections',
    description: 'List section IDs in the current course page that expose an "Add an activity or resource" button (requires editing enabled).',
    inputSchema: {
      type: 'object',
      properties: {},
      required: [],
    },
  },
  {
    name: 'forum_list_discussions',
    description: 'List discussions (topic title + discussion id + URL) for a forum by its view id (mod/forum/view.php?id=...).',
    inputSchema: {
      type: 'object',
      properties: {
        forum_view_id: { type: 'number', description: 'The id parameter for mod/forum/view.php?id=... (forum cmid).' },
      },
      required: ['forum_view_id'],
    },
  },
  {
    name: 'book_export_word',
    description: 'Open the "Export book to Microsoft Word" flow for a Book by its cmid (mod/book/tool/wordimport/index.php?id=...&action=export).',
    inputSchema: {
      type: 'object',
      properties: {
        book_cmid: { type: 'number', description: 'The book cmid (id on mod/book/view.php?id=...).' },
      },
      required: ['book_cmid'],
    },
  },

  // -----------------------------
  // Existing higher-level tools
  // -----------------------------
  {
    name: 'get_courses',
    description: `Get a list of the user's Moodle courses.
    
This navigates to the courses page and extracts all visible courses with their names, IDs, and links.`,
    inputSchema: {
      type: 'object',
      properties: {
        include_hidden: {
          type: 'boolean',
          description: 'Whether to include hidden courses (requires instructor access).',
          default: false,
        },
      },
      required: [],
    },
  },
  {
    name: 'get_course_content',
    description: `Get the content/activities of a specific course.
    
Returns sections, activities, and resources in the course.`,
    inputSchema: {
      type: 'object',
      properties: {
        course_id: {
          type: 'number',
          description: 'The Moodle course ID.',
        },
      },
      required: ['course_id'],
    },
  },
  {
    name: 'get_enrolled_users',
    description: `Get the list of users enrolled in a course.
    
Requires instructor access to the course.`,
    inputSchema: {
      type: 'object',
      properties: {
        course_id: {
          type: 'number',
          description: 'The Moodle course ID.',
        },
      },
      required: ['course_id'],
    },
  },
];

// Generate unique command ID
export function generateCommandId(): string {
  return `cmd_${Date.now()}_${Math.random().toString(36).substring(2, 9)}`;
}
