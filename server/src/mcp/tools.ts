// MCP Tool definitions for Moodle interactions
export const moodleTools = [
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
- By text content: button:contains("Submit")
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
- Tables (if any)
- Form fields (if any)
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
          },
        },
      },
      required: [],
    },
  },
  {
    name: 'set_editor_content',
    description: `Set HTML content in a Moodle rich text editor (Atto/TinyMCE).
    
This tool handles the complexity of Moodle's editor by using JavaScript to directly set both the hidden textarea and the contenteditable div.

Use this for creating or editing:
- Moodle Book chapters
- Forum posts
- Assignment descriptions
- Page resources
- Labels
- Any content area with a rich text editor`,
    inputSchema: {
      type: 'object',
      properties: {
        html_content: {
          type: 'string',
          description: 'The HTML content to set in the editor.',
        },
        editor_id: {
          type: 'string',
          description: 'Optional: The ID of the editor textarea (e.g., "id_content_editor"). If not provided, will find the first editor on the page.',
        },
        auto_save: {
          type: 'boolean',
          description: 'Whether to automatically click the save button after setting content.',
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
    
Use this for complex operations that aren't covered by other tools.
The script should return a value that will be sent back as the result.

Example:
- Get course ID: "return document.body.dataset.courseId"
- Count items: "return document.querySelectorAll('.activity').length"`,
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
