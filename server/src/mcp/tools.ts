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
        perpage: { type: 'number', description: 'Number of participants per page. Use 5000 to get all participants at once. Defaults to 5000.', default: 5000 },
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
  // Section/Topic CRUD operations
  // -----------------------------
  {
    name: 'get_course_sections',
    description: `Get all section IDs and names from a course.
    
Returns a list of sections with their IDs (for use with edit_section) and current names.
Requires editing mode to be enabled to see edit links.`,
    inputSchema: {
      type: 'object',
      properties: {
        course_id: { type: 'number', description: 'The Moodle course ID.' },
      },
      required: ['course_id'],
    },
  },
  {
    name: 'edit_section',
    description: `Edit a course section/topic name and optionally its summary.
    
Navigate to the section edit page, set the custom name, and save.
Use this to rename course topics to match your syllabus.

Example: edit_section(section_id=1224362, name="Week 2: Understanding Users")`,
    inputSchema: {
      type: 'object',
      properties: {
        section_id: { type: 'number', description: 'The Moodle section ID (from editsection.php?id=...).' },
        name: { type: 'string', description: 'The new section/topic name.' },
        summary: { type: 'string', description: 'Optional HTML summary/description for the section.' },
      },
      required: ['section_id', 'name'],
    },
  },
  {
    name: 'add_section',
    description: `Add a new section/topic to a course.
    
Navigates to the course with editing enabled and clicks "Add topics" to create new sections.
Note: Moodle adds sections at the end of the course.`,
    inputSchema: {
      type: 'object',
      properties: {
        course_id: { type: 'number', description: 'The Moodle course ID.' },
        count: { type: 'number', description: 'Number of sections to add. Defaults to 1.', default: 1 },
      },
      required: ['course_id'],
    },
  },
  {
    name: 'delete_section',
    description: `Delete a course section/topic.
    
WARNING: This will delete the section and ALL activities within it.
Navigates to the section and clicks the delete option.`,
    inputSchema: {
      type: 'object',
      properties: {
        section_id: { type: 'number', description: 'The Moodle section ID to delete.' },
        confirm: { type: 'boolean', description: 'Must be true to confirm deletion.', default: false },
      },
      required: ['section_id', 'confirm'],
    },
  },
  {
    name: 'hide_section',
    description: `Hide or show a course section/topic from students.`,
    inputSchema: {
      type: 'object',
      properties: {
        course_id: { type: 'number', description: 'The Moodle course ID.' },
        section_id: { type: 'number', description: 'The Moodle section ID.' },
        hidden: { type: 'boolean', description: 'True to hide, false to show.' },
      },
      required: ['course_id', 'section_id', 'hidden'],
    },
  },
  {
    name: 'move_section',
    description: `Move a section to a different position in the course.`,
    inputSchema: {
      type: 'object',
      properties: {
        course_id: { type: 'number', description: 'The Moodle course ID.' },
        section_id: { type: 'number', description: 'The Moodle section ID to move.' },
        position: { type: 'number', description: 'The new position (1-based index).' },
      },
      required: ['course_id', 'section_id', 'position'],
    },
  },

  // -----------------------------
  // Assignment CRUD operations
  // -----------------------------
  {
    name: 'list_assignments',
    description: `List all assignments in a course with due dates and submission counts.
    
Returns assignment names, due dates, submission counts, and grading status.`,
    inputSchema: {
      type: 'object',
      properties: {
        course_id: { type: 'number', description: 'The Moodle course ID.' },
      },
      required: ['course_id'],
    },
  },
  {
    name: 'get_assignment',
    description: `Get details of a specific assignment including description and settings.`,
    inputSchema: {
      type: 'object',
      properties: {
        assignment_id: { type: 'number', description: 'The assignment cmid (from mod/assign/view.php?id=...).' },
      },
      required: ['assignment_id'],
    },
  },
  {
    name: 'get_assignment_submissions',
    description: `Get the list of submissions for an assignment.
    
Returns student names, submission status, grades, and feedback.
Useful for grading overview.`,
    inputSchema: {
      type: 'object',
      properties: {
        assignment_id: { type: 'number', description: 'The assignment cmid.' },
        filter: { 
          type: 'string', 
          description: 'Filter submissions: "all", "submitted", "needs_grading", "not_submitted". Defaults to "all".',
          default: 'all',
        },
      },
      required: ['assignment_id'],
    },
  },
  {
    name: 'create_assignment',
    description: `Create a new assignment in a course section.
    
Opens the assignment creation form and fills in the details.`,
    inputSchema: {
      type: 'object',
      properties: {
        course_id: { type: 'number', description: 'The Moodle course ID.' },
        section_num: { type: 'number', description: 'The section number (0-based) to add the assignment to.' },
        name: { type: 'string', description: 'The assignment name/title.' },
        description: { type: 'string', description: 'HTML description/instructions for the assignment.' },
        due_date: { type: 'string', description: 'Due date in ISO format (e.g., "2026-02-15T23:55:00").' },
        max_grade: { type: 'number', description: 'Maximum grade points. Defaults to 100.', default: 100 },
      },
      required: ['course_id', 'section_num', 'name'],
    },
  },
  {
    name: 'edit_assignment',
    description: `Edit an existing assignment's settings.
    
Can update name, description, due date, max grade, and other settings.`,
    inputSchema: {
      type: 'object',
      properties: {
        assignment_id: { type: 'number', description: 'The assignment cmid to edit.' },
        name: { type: 'string', description: 'New assignment name (optional).' },
        description: { type: 'string', description: 'New HTML description (optional).' },
        due_date: { type: 'string', description: 'New due date in ISO format (optional).' },
        max_grade: { type: 'number', description: 'New maximum grade points (optional).' },
      },
      required: ['assignment_id'],
    },
  },
  {
    name: 'delete_assignment',
    description: `Delete an assignment from the course.
    
WARNING: This will delete all submissions and grades for this assignment.`,
    inputSchema: {
      type: 'object',
      properties: {
        assignment_id: { type: 'number', description: 'The assignment cmid to delete.' },
        confirm: { type: 'boolean', description: 'Must be true to confirm deletion.', default: false },
      },
      required: ['assignment_id', 'confirm'],
    },
  },
  {
    name: 'extend_assignment_deadline',
    description: `Grant a deadline extension to a specific student.
    
Useful for accommodations or late requests.`,
    inputSchema: {
      type: 'object',
      properties: {
        assignment_id: { type: 'number', description: 'The assignment cmid.' },
        user_id: { type: 'number', description: 'The Moodle user ID to grant extension to.' },
        new_due_date: { type: 'string', description: 'New due date for this student in ISO format.' },
      },
      required: ['assignment_id', 'user_id', 'new_due_date'],
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

  // -----------------------------
  // Generic Activity Tools
  // -----------------------------
  {
    name: 'find_activity',
    description: `Search for activities in a course by name pattern.
    
Returns matching activities with their IDs, names, types, section, and URLs.
Useful for finding any activity (assignment, feedback, quiz, forum, etc.) before editing.

Examples:
- find_activity(course_id=56569, name_pattern="Tinder")
- find_activity(course_id=56569, activity_type="feedback")
- find_activity(course_id=56569, name_pattern="Quiz", activity_type="quiz")`,
    inputSchema: {
      type: 'object',
      properties: {
        course_id: {
          type: 'number',
          description: 'The Moodle course ID.',
        },
        name_pattern: {
          type: 'string',
          description: 'Optional text to search for in activity names (case-insensitive).',
        },
        activity_type: {
          type: 'string',
          description: 'Optional activity type filter: assign, feedback, quiz, forum, book, page, url, resource, etc.',
        },
        section_num: {
          type: 'number',
          description: 'Optional section number to limit search (0 = General, 1 = Topic 1, etc.).',
        },
      },
      required: ['course_id'],
    },
  },
  {
    name: 'edit_activity',
    description: `Open the edit settings page for any activity type.
    
Works for assignments, feedback, quizzes, forums, books, pages, URLs, etc.
After calling this, you can use click_element, type_text, and set_activity_date to modify settings.`,
    inputSchema: {
      type: 'object',
      properties: {
        activity_id: {
          type: 'number',
          description: 'The activity cmid (from find_activity or activity URLs like mod/assign/view.php?id=...).',
        },
      },
      required: ['activity_id'],
    },
  },
  {
    name: 'set_activity_date',
    description: `Set a date field on a Moodle activity edit form.
    
Automatically handles different date field naming conventions across activity types:
- Assignments: duedate, allowsubmissionsfromdate, cutoffdate
- Feedback: timeopen, timeclose
- Quizzes: timeopen, timeclose
- Forums: duedate

Also handles enabling the date checkbox if needed.`,
    inputSchema: {
      type: 'object',
      properties: {
        field_name: {
          type: 'string',
          description: 'The date field name: duedate, timeopen, timeclose, cutoffdate, allowsubmissionsfromdate, etc.',
        },
        date: {
          type: 'string',
          description: 'The date/time in ISO 8601 format (e.g., "2026-01-19T23:55:00").',
        },
        enabled: {
          type: 'boolean',
          description: 'Whether to enable the date (default: true). Set to false to disable/clear the date.',
          default: true,
        },
      },
      required: ['field_name', 'date'],
    },
  },
  {
    name: 'save_activity',
    description: `Save the current activity edit form.
    
Clicks the "Save and return to course" or "Save and display" button.`,
    inputSchema: {
      type: 'object',
      properties: {
        return_to_course: {
          type: 'boolean',
          description: 'If true, clicks "Save and return to course". If false, clicks "Save and display". Default: true.',
          default: true,
        },
      },
      required: [],
    },
  },
  
  // Bulk operations
  {
    name: 'bulk_shift_deadlines',
    description: `Shift due dates for multiple assignments matching a pattern.
    
Finds all assignments matching the name pattern and shifts their due dates by the specified number of days.
Returns a preview of changes before applying them unless confirm=true.`,
    inputSchema: {
      type: 'object',
      properties: {
        course_id: {
          type: 'number',
          description: 'The Moodle course ID.',
        },
        name_pattern: {
          type: 'string',
          description: 'Regex pattern to match assignment names (e.g., "HW#" or "Quiz").',
        },
        days: {
          type: 'number',
          description: 'Number of days to shift (positive = later, negative = earlier).',
        },
        confirm: {
          type: 'boolean',
          description: 'If true, applies the changes. If false (default), returns a preview.',
          default: false,
        },
      },
      required: ['course_id', 'name_pattern', 'days'],
    },
  },
  
  // Forum tools
  {
    name: 'create_forum_post',
    description: `Create a new discussion/announcement in a Moodle forum.
    
This tool navigates to the forum's new discussion page, fills in the subject and message, and submits the post.`,
    inputSchema: {
      type: 'object',
      properties: {
        forum_id: {
          type: 'number',
          description: 'The internal forum ID (not cmid). You can find this from the forum_list_discussions tool or from forum URLs.',
        },
        subject: {
          type: 'string',
          description: 'The subject/title of the discussion.',
        },
        message: {
          type: 'string',
          description: 'The message content. Can include HTML formatting.',
        },
      },
      required: ['forum_id', 'subject', 'message'],
    },
  },
  {
    name: 'analyze_forum',
    description: `Analyze a forum to get participation statistics.
    
Returns:
- List of all discussions with author and reply count
- Students who started a discussion (posted introduction)
- Students who only replied (didn't start a discussion)
- Reply counts per student (excluding replies to their own posts)
- Top responders (students with most replies to others)
- Students who haven't participated at all (requires course_id)

Useful for tracking participation in introduction forums, Q&A forums, etc.`,
    inputSchema: {
      type: 'object',
      properties: {
        forum_cmid: {
          type: 'number',
          description: 'The forum cmid (from mod/forum/view.php?id=...).',
        },
        course_id: {
          type: 'number',
          description: 'Optional: Course ID to cross-reference with enrolled students and find non-participants.',
        },
        exclude_users: {
          type: 'array',
          items: { type: 'string' },
          description: 'Optional: Names to exclude from analysis (e.g., instructor names).',
        },
      },
      required: ['forum_cmid'],
    },
  },
  {
    name: 'analyze_feedback',
    description: `Analyze a Moodle feedback activity to see who has/hasn't responded.
    
Returns:
- List of students who submitted responses (with timestamps)
- List of students who haven't responded yet (non-respondents)
- Total response count and response rate

Useful for tracking completion of surveys, course evaluations, or any feedback activity.

Example: analyze_feedback(feedback_cmid=2760576, course_id=56569)`,
    inputSchema: {
      type: 'object',
      properties: {
        feedback_cmid: {
          type: 'number',
          description: 'The feedback activity cmid (from mod/feedback/view.php?id=...).',
        },
        course_id: {
          type: 'number',
          description: 'The course ID to cross-reference with enrolled students and find non-respondents.',
        },
        exclude_users: {
          type: 'array',
          items: { type: 'string' },
          description: 'Optional: Names to exclude from analysis (e.g., instructor names).',
        },
      },
      required: ['feedback_cmid', 'course_id'],
    },
  },
  
  // === MESSAGING TOOLS ===
  {
    name: 'send_message',
    description: `Send a direct message to a Moodle user.
    
This navigates to the user's profile, opens the message dialog, and sends a message.
Useful for reminders, feedback, or reaching out to individual students.

Example: send_message(user_id=34538, message="Hi! Please post your self-introduction.")`,
    inputSchema: {
      type: 'object',
      properties: {
        user_id: {
          type: 'number',
          description: 'The Moodle user ID (from participant list or user profile URL).',
        },
        message: {
          type: 'string',
          description: 'The message content to send.',
        },
        course_id: {
          type: 'number',
          description: 'Optional: Course ID for context (helps with navigation).',
        },
      },
      required: ['user_id', 'message'],
    },
  },
  {
    name: 'bulk_send_message',
    description: `Send the same message to multiple Moodle users.
    
Iterates through a list of user IDs and sends each one the same message.
Returns a summary of successful and failed sends.

Example: bulk_send_message(user_ids=[123, 456, 789], message="Reminder: Please post your introduction!")`,
    inputSchema: {
      type: 'object',
      properties: {
        user_ids: {
          type: 'array',
          items: { type: 'number' },
          description: 'Array of Moodle user IDs to message.',
        },
        message: {
          type: 'string',
          description: 'The message content to send to all users.',
        },
        course_id: {
          type: 'number',
          description: 'Optional: Course ID for context.',
        },
      },
      required: ['user_ids', 'message'],
    },
  },
];

// Generate unique command ID
export function generateCommandId(): string {
  return `cmd_${Date.now()}_${Math.random().toString(36).substring(2, 9)}`;
}
