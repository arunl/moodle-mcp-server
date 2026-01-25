// MCP Tool definitions for Moodle interactions
//
// IMPORTANT: Content Security Policy (CSP) Limitations
// =====================================================
// Moodle pages have strict CSP that blocks eval() and new Function().
// This means:
// - NO arbitrary JavaScript execution on Moodle pages
// - NO evaluate_script or similar dynamic code execution
// - All extraction/manipulation must use dedicated handlers in the browser extension
//
// If you need new functionality:
// 1. Add a dedicated handler in browser-extension/background.js
// 2. Add corresponding action type in connection-manager.ts BrowserCommand interface
// 3. Add the tool definition here and handler in routes/mcp.ts
//
// Available extraction handlers (CSP-safe):
// - extract: Basic page content (title, headings, links, text)
// - extract_participants: Parse participants table
// - extract_forum_discussions: Parse forum discussion list
// - extract_discussion_replies: Parse replies in a discussion
// - extract_feedback_responses: Parse feedback submissions
// - extract_activities: Find activities in a course
// - extract_assignments: List assignments
// - extract_course_sections: Get section IDs and names
// - setEditor: Set rich text editor content
// - set_moodle_date: Set date fields on forms
//
export const moodleTools = [
  // -----------------------------
  // Core / Bridge primitives
  // -----------------------------
  {
    name: 'get_browser_status',
    description: `Check if the browser extension is connected and ready to interact with Moodle.

IMPORTANT - Content Security Policy (CSP) Limitations:
Moodle pages have strict CSP that blocks arbitrary JavaScript execution.
- Do NOT try to execute custom JavaScript code on Moodle pages
- Use ONLY the dedicated tools provided (extract_page_content, find_activity, analyze_forum, etc.)
- If you need new extraction logic, it must be added to the browser extension first`,
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
        force: {
          type: 'boolean',
          description: 'If true, dismiss any "unsaved changes" dialogs before navigating. Use this when you need to navigate away from a partially edited form.',
          default: false,
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
Use this for Book chapters, Forum posts, Assignment descriptions, Labels, etc.

ACCESSIBILITY REQUIREMENTS - All HTML content MUST follow these guidelines:
1. TABLES: Always include <caption> for table title, use <th scope="col"> for column headers, 
   use <th scope="row"> for row headers. Never use tables for layout.
2. HEADINGS: Use proper heading hierarchy (h2, h3, h4). Don't skip levels.
3. LINKS: Use descriptive link text, not "click here" or "read more". 
   For external links, indicate they open in new tab: "Guide (opens in new tab)"
4. IMAGES: Always include meaningful alt text. Use alt="" for decorative images.
5. LISTS: Use <ul>/<ol> for lists, not manual bullets or numbers.
6. COLOR & CONTRAST: Don't rely solely on color to convey meaning. Text must have sufficient 
   contrast against background (4.5:1 ratio minimum). When using colored backgrounds:
   - Use solid colors, not gradients (gradients complicate contrast calculation)
   - Explicitly set text color on ALL elements including <strong>, <em>, <span>
   - White text (#ffffff) on dark backgrounds, dark text (#000000 or #2c3e50) on light backgrounds
   - Test: if background is light, text must be dark; if background is dark, text must be white
7. STRUCTURE: Use semantic HTML (<strong> not <b>, <em> not <i>).`,
    inputSchema: {
      type: 'object',
      properties: {
        html_content: {
          type: 'string',
          description: 'The HTML content to set in the editor. MUST follow accessibility guidelines in tool description.',
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
    description: `List discussions for a forum by its view id (mod/forum/view.php?id=...).
    
Returns:
- discussions: Array of {id, title, author, replyCount, url}
- forumId: The internal forum ID (for use with create_forum_post)
- forumViewId: The cmid you provided`,
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
    
This tool navigates to the forum's new discussion page, fills in the subject and message, and submits the post.

You can provide EITHER:
- forum_id: The internal forum ID (from forum_list_discussions or post.php URLs)
- forum_cmid: The course module ID (from view.php?id=... URLs) - the tool will auto-extract the forum_id

ACCESSIBILITY REQUIREMENTS for message content:
1. TABLES: Include <caption>, use <th scope="col/row"> for headers
2. HEADINGS: Use h3/h4 (h2 is post title), maintain hierarchy
3. LINKS: Descriptive text, indicate external links "(opens in new tab)"
4. LISTS: Use <ul>/<ol>, not manual bullets
5. COLOR & CONTRAST: Don't rely on color alone to convey meaning. For colored backgrounds:
   - Use solid colors (not gradients) for predictable contrast
   - Set explicit text color on ALL elements including <strong>, <em>
   - Minimum 4.5:1 contrast ratio (white text on dark bg, dark text on light bg)

Example with accessible table:
<table>
  <caption>Team Assignments</caption>
  <thead><tr><th scope="col">Team</th><th scope="col">Members</th></tr></thead>
  <tbody><tr><th scope="row">Alpha</th><td>John, Jane</td></tr></tbody>
</table>`,
    inputSchema: {
      type: 'object',
      properties: {
        forum_id: {
          type: 'number',
          description: 'The internal forum ID (from post.php?forum=... URLs). Optional if forum_cmid is provided.',
        },
        forum_cmid: {
          type: 'number',
          description: 'The course module ID (from view.php?id=... URLs). If provided without forum_id, the tool will navigate to the forum and extract the internal forum_id automatically.',
        },
        subject: {
          type: 'string',
          description: 'The subject/title of the discussion.',
        },
        message: {
          type: 'string',
          description: 'The message content (HTML). MUST follow accessibility guidelines above.',
        },
      },
      required: ['subject', 'message'],
    },
  },
  {
    name: 'find_forum_discussion',
    description: `Search for a discussion in a forum by subject or author.

Returns matching discussions with their IDs, which can then be used with delete_forum_discussion.

Examples:
- find_forum_discussion(forum_cmid=2618458, subject_pattern="TEST")
- find_forum_discussion(forum_cmid=2618458, author="Arun Lakhotia")
- find_forum_discussion(forum_cmid=2618458, subject_pattern="Announcement", limit=5)`,
    inputSchema: {
      type: 'object',
      properties: {
        forum_cmid: {
          type: 'number',
          description: 'The forum cmid (from mod/forum/view.php?id=...).',
        },
        subject_pattern: {
          type: 'string',
          description: 'Text to search for in discussion subjects (case-insensitive).',
        },
        author: {
          type: 'string',
          description: 'Filter by author name (case-insensitive).',
        },
        limit: {
          type: 'number',
          description: 'Maximum number of results to return. Defaults to 10.',
          default: 10,
        },
      },
      required: ['forum_cmid'],
    },
  },
  {
    name: 'get_forum_discussion',
    description: `Get the full content of a forum discussion including all posts and replies.
    
Returns:
- Discussion title and ID
- All posts with author, date, and full text content
- Post hierarchy (original post vs replies)
- Useful for reading team formations, introductions, or any discussion content

Example: get_forum_discussion(discussion_id=1234567)`,
    inputSchema: {
      type: 'object',
      properties: {
        discussion_id: {
          type: 'number',
          description: 'The discussion ID (d parameter from mod/forum/discuss.php?d=...). Use forum_list_discussions or find_forum_discussion to find this.',
        },
      },
      required: ['discussion_id'],
    },
  },
  {
    name: 'delete_forum_discussion',
    description: `Delete a forum discussion/post.
    
WARNING: This will permanently delete the discussion and all its replies.

Use find_forum_discussion first to get the discussion_id from a subject search.
Requires confirm=true to execute.`,
    inputSchema: {
      type: 'object',
      properties: {
        discussion_id: {
          type: 'number',
          description: 'The discussion ID (d parameter from mod/forum/discuss.php?d=...). Use find_forum_discussion to find this from a subject.',
        },
        confirm: {
          type: 'boolean',
          description: 'Must be true to confirm deletion.',
          default: false,
        },
      },
      required: ['discussion_id', 'confirm'],
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

  // -----------------------------
  // File Export (PII Unmasking)
  // -----------------------------
  {
    name: 'create_download_file',
    description: `Create a downloadable file with unmasked PII.

When you generate reports, team lists, or other documents containing student information,
use this tool to create a downloadable file. The file will be stored on the server with
masked PII, and when the instructor downloads it, the PII will be automatically unmasked.

Supported formats:
- CSV: text/csv - Comma-separated values
- TSV: text/tab-separated-values - Tab-separated values
- TXT: text/plain - Plain text
- DOCX: application/vnd.openxmlformats-officedocument.wordprocessingml.document
- XLSX: application/vnd.openxmlformats-officedocument.spreadsheetml.sheet
- PPTX: application/vnd.openxmlformats-officedocument.presentationml.presentation

The content should contain mask tokens (e.g., M12345:name, M12345:email, M12345:CID)
which will be replaced with actual names when the instructor downloads the file.

Example usage:
1. Generate a CSV with team assignments using masked names
2. Call this tool with the CSV content
3. The tool returns a download URL
4. Share the URL with the instructor

Returns: { download_url, file_id, expires_at, filename }`,
    inputSchema: {
      type: 'object',
      properties: {
        content: {
          type: 'string',
          description: 'The file content (text for CSV/TXT, base64 for binary formats like DOCX/XLSX/PPTX).',
        },
        filename: {
          type: 'string',
          description: 'The filename with extension (e.g., "team-assignments.csv", "report.docx").',
        },
        course_id: {
          type: 'number',
          description: 'The course ID for roster lookup (required for PII unmasking).',
        },
        is_base64: {
          type: 'boolean',
          description: 'Set to true if content is base64-encoded (required for binary formats). Default: false.',
        },
      },
      required: ['content', 'filename', 'course_id'],
    },
  },
];

// Generate unique command ID
export function generateCommandId(): string {
  return `cmd_${Date.now()}_${Math.random().toString(36).substring(2, 9)}`;
}
