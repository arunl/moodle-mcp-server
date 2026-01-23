# Moodle MCP Best Practices

This document captures lessons learned and best practices when using the Moodle MCP tools.

## Content Security Policy (CSP) Limitations

Moodle enforces strict Content Security Policy that blocks `unsafe-eval`. This affects how the MCP tools can interact with Moodle pages.

### Tools That Will NOT Work on Moodle Pages

The following tools will **always fail** with CSP errors on Moodle:

- `evaluate_script` - Blocked because it uses `eval()`
- `set_editor_content` - Blocked because it injects JavaScript

**Error you'll see:**
```
Evaluating a string as JavaScript violates the following Content Security Policy directive 
because 'unsafe-eval' is not an allowed source of script...
```

### Recommended Approach for Form Interactions

Instead of JavaScript-based tools, use direct DOM manipulation tools:

#### 1. Typing into the Atto Rich Text Editor

```
Tool: type_text
Selector: .editor_atto_content
```

The Atto editor uses a `contenteditable` div with class `.editor_atto_content`. Type directly into this element.

#### 2. Typing into Form Fields

```
Tool: type_text
Selector: #id_subject (for forum subject)
Selector: #id_name (for activity names)
```

Use standard form field IDs which follow Moodle's naming convention `#id_<fieldname>`.

#### 3. Submitting Forms

**Important:** Before clicking submit, blur the editor to sync content to the underlying textarea:

```
1. type_text into .editor_atto_content
2. click_element on #id_subject (or any other element to blur the editor)
3. click_element on #id_submitbutton
```

The blur step is critical because the Atto editor syncs its contenteditable content to the hidden textarea on blur events.

### Forum Posting Workflow

The recommended workflow for posting to forums:

```
1. Try create_forum_post tool first (simplest)
2. If it fails, use manual approach:
   a. browse_moodle to /mod/forum/post.php?forum={forum_id}
   b. type_text with #id_subject for the subject
   c. type_text with .editor_atto_content for the message body
   d. click_element on #id_subject (to blur and sync editor)
   e. click_element on #id_submitbutton
   f. Verify success by checking for "Your post was successfully added" message
```

### Tools That Work Reliably

These tools work well on Moodle pages:

| Tool | Purpose |
|------|---------|
| `browse_moodle` | Navigate to any Moodle page |
| `extract_page_content` | Read page text, links, headings |
| `click_element` | Click buttons, links, form elements |
| `type_text` | Fill form fields and editors |
| `wait_for_element` | Wait for page elements to load |
| `find_activity` | Search for activities in a course |
| `list_participants` | Get enrolled users |
| `analyze_forum` | Get forum participation stats |
| `analyze_feedback` | Get feedback/survey responses |

## Moodle Element Selectors Reference

### Common Form Elements

| Element | Selector |
|---------|----------|
| Subject field | `#id_subject` |
| Name field | `#id_name` |
| Description editor | `.editor_atto_content` |
| Submit button | `#id_submitbutton` |
| Cancel button | `#id_cancel` |

### Forum Elements

| Element | Selector |
|---------|----------|
| Discussion list | `[data-region="discussion-list"]` |
| Forum post | `.forumpost` |
| Add discussion | `#collapseAddForm` or link containing "Add discussion" |

### Date Fields

For date fields, use the `set_activity_date` tool which handles Moodle's date picker complexity automatically.

## Debugging Tips

1. **Check the current URL** using `extract_page_content` - the URL is included in the response
2. **Look for error messages** in the extracted text content
3. **Wait for elements** before interacting - Moodle pages can be slow to load
4. **Refresh the form page** if a submission fails - Moodle may have stale session tokens
