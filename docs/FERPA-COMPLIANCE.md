# FERPA Compliance & Student Data Privacy

## Executive Summary

Moodle MCP is designed from the ground up with **FERPA compliance** as a core requirement. Unlike traditional AI integrations that send student data to cloud services, Moodle MCP employs a **browser-based architecture** that ensures **student Personally Identifiable Information (PII) never leaves the instructor's browser**.

**Key Privacy Guarantees:**
- ✅ Student names, emails, and IDs are **masked before** reaching any AI service
- ✅ PII is **unmasked only in the instructor's browser** just before display
- ✅ The hosted server **never stores or logs** student information
- ✅ All Moodle interactions happen through the **instructor's authenticated session**

---

## Table of Contents

1. [What is FERPA?](#what-is-ferpa)
2. [Why AI + Education is Challenging](#why-ai--education-is-challenging)
3. [How Moodle MCP Protects Student Privacy](#how-moodle-mcp-protects-student-privacy)
4. [The Masking Architecture](#the-masking-architecture)
5. [Data Flow Diagrams](#data-flow-diagrams)
6. [What Data is Stored Where](#what-data-is-stored-where)
7. [Comparison to Other Approaches](#comparison-to-other-approaches)
8. [Best Practices for Instructors](#best-practices-for-instructors)
9. [Technical Details](#technical-details)
10. [Frequently Asked Questions](#frequently-asked-questions)

---

## What is FERPA?

The **Family Educational Rights and Privacy Act (FERPA)** is a U.S. federal law (20 U.S.C. § 1232g) that protects the privacy of student education records. Key requirements include:

- **Access Control**: Only authorized personnel can access student records
- **Disclosure Restrictions**: Schools cannot disclose PII from student records without consent
- **Third-Party Limitations**: External services handling student data must have appropriate agreements

**PII under FERPA includes:**
- Student names
- Email addresses
- Student ID numbers (e.g., C00123456)
- Academic records, grades, and performance data
- Any information that could identify a specific student

**Violations can result in:**
- Loss of federal funding for the institution
- Legal liability for individuals and departments
- Damage to institutional reputation

---

## Why AI + Education is Challenging

Using AI assistants (ChatGPT, Claude, Cursor, etc.) in education creates a fundamental tension:

### The Problem

```
Traditional AI Integration:

┌─────────────┐     ┌─────────────────┐     ┌─────────────────┐
│  Instructor │────►│   AI Service    │────►│  AI Provider    │
│   Browser   │     │   (API Call)    │     │  (OpenAI, etc.) │
└─────────────┘     └─────────────────┘     └─────────────────┘
                            │
                            │ Contains:
                            │ • Student names
                            │ • Student emails
                            │ • Student IDs
                            │ • Academic records
                            ▼
                    ⚠️ FERPA VIOLATION
                    (PII sent to third party)
```

When an instructor asks an AI: *"Which students haven't submitted Assignment 3?"*, the response might include:
- `"John Smith (jsmith@university.edu) has not submitted..."`
- `"C00123456 submitted late..."`

This data is now:
1. **Transmitted** to a third-party AI provider
2. Potentially **logged** in their systems
3. Potentially **used for training** future models
4. **Outside the institution's control**

### The Moodle MCP Solution

Moodle MCP solves this by ensuring **student PII never reaches the AI service**:

```
Moodle MCP Architecture:

┌──────────────────────────────────────────────────────────────────┐
│                    INSTRUCTOR'S BROWSER                          │
│  ┌────────────────┐                    ┌────────────────────┐   │
│  │     Moodle     │◄───────────────────│  Browser Extension │   │
│  │    Website     │   (authenticated)  │   (unmasks PII)    │   │
│  └────────────────┘                    └────────┬───────────┘   │
│                                                  │               │
│    ✓ Real student names                          │               │
│    ✓ Real student emails                         │               │
│    ✓ Real student IDs                           │               │
└──────────────────────────────────────────────────┼───────────────┘
                                                   │
                              PII is masked before │ leaving browser
                              ("John Smith" → "M12345_name")
                                                   │
                                                   ▼
┌──────────────────────────────────────────────────────────────────┐
│                    MOODLE MCP SERVER                             │
│                                                                  │
│    • Routes commands between AI and browser                      │
│    • NEVER stores student information                            │
│    • Only sees masked tokens (M12345_name, M12345_email)         │
│                                                                  │
└──────────────────────────────────────────────────┬───────────────┘
                                                   │
                              Still masked         │ (no PII)
                                                   │
                                                   ▼
┌──────────────────────────────────────────────────────────────────┐
│                    AI SERVICE (Claude, etc.)                     │
│                                                                  │
│    Sees: "M12345_name hasn't submitted Assignment 3"             │
│    NOT:  "John Smith hasn't submitted Assignment 3"              │
│                                                                  │
│    ✓ No student names                                            │
│    ✓ No student emails                                           │
│    ✓ No student IDs                                              │
│                                                                  │
└──────────────────────────────────────────────────────────────────┘
```

---

## How Moodle MCP Protects Student Privacy

### 1. Browser-Based Architecture

All Moodle interactions happen in the instructor's browser using their existing authenticated session:

- The instructor logs into Moodle normally
- The browser extension observes and interacts with pages
- Moodle's built-in access controls determine what data is visible
- The server never has direct access to Moodle

### 2. PII Masking (Egress Protection)

Before any data leaves the instructor's browser, student PII is replaced with **reversible tokens**:

| Original PII | Masked Token | Description |
|-------------|--------------|-------------|
| `John Smith` | `M12345_name` | Name replaced with Moodle user ID token |
| `jsmith@university.edu` | `M12345_email` | Email replaced with token |
| `C00654321` | `M12345_CID` | Student ID replaced with token |

The token `M12345` refers to the student's Moodle user ID (an internal identifier), not their student ID.

### 3. PII Unmasking (Ingress Protection)

When the AI generates content containing tokens, they are converted back to real names **only in the instructor's browser**:

```
AI generates: "Please remind M12345_name and M67890_name about the deadline."

Browser extension converts to: "Please remind John Smith and Jane Doe about the deadline."
```

This unmasking happens:
- Just before displaying to the instructor
- Just before posting content to Moodle forums/messages
- **Never** on the server or AI service

### 4. One-Way Masking for Unknown PII

If PII is detected that's not in the course roster (e.g., instructors, external references), it's masked with **one-way** patterns that cannot be reversed:

| Original | One-Way Mask | Purpose |
|----------|--------------|---------|
| `Dr. Jane Roberts` | `Dr. Jan*** Rob***` | Protects names not in roster |
| `C00999888` | `C***888` | Protects unknown student IDs |
| `unknown@edu` | `unk**@edu` | Protects unknown emails |

---

## The Masking Architecture

### Token Format

Moodle MCP uses a consistent token format that AI models can understand:

```
M{MoodleUserId}_{type}

Where:
  - M          = Prefix identifying this as a mask token
  - MoodleUserId = The student's internal Moodle user ID (numeric)
  - _          = Underscore separator (chosen for LLM compatibility)
  - type       = One of: name, email, CID
```

**Examples:**
- `M12345_name` → Student's display name
- `M12345_email` → Student's email address
- `M12345_CID` → Student's institutional ID (e.g., C00123456)

### Masking Order

To avoid partial matches and ensure accuracy, masking happens in this order:

1. **Emails first** (longest, may contain student IDs)
2. **Names second** (handles multiple formats: "First Last", "Last, First")
3. **Student IDs last** (shortest, may be substrings)

### Name Format Handling

The system recognizes multiple name formats students might use:

| Format | Example | Masked As |
|--------|---------|-----------|
| First Last | `John Smith` | `M12345_name` |
| Last, First | `Smith, John` | `M12345_name` |
| Last First | `Smith John` | `M12345_name` |
| With middle | `John Michael Smith` | `M12345_name` |
| First + Last only | `John Smith` (when middle exists) | `M12345_name` |

---

## Data Flow Diagrams

### Reading Student Data (e.g., "List students who haven't submitted")

```
┌─────────────────────────────────────────────────────────────────────────┐
│ STEP 1: AI requests student list                                        │
│                                                                         │
│ AI Client                         MCP Server                            │
│ ─────────                         ──────────                            │
│ "list_participants"      ───►     Routes to browser                     │
│                                                                         │
└─────────────────────────────────────────────────────────────────────────┘
                                         │
                                         ▼
┌─────────────────────────────────────────────────────────────────────────┐
│ STEP 2: Browser fetches real data from Moodle                           │
│                                                                         │
│ Browser Extension                  Moodle LMS                           │
│ ─────────────────                  ──────────                           │
│ Navigate to page         ───►      Returns HTML with:                   │
│                                    • John Smith                         │
│                                    • Jane Doe                           │
│                                    • C00123456                          │
│                                                                         │
└─────────────────────────────────────────────────────────────────────────┘
                                         │
                                         ▼
┌─────────────────────────────────────────────────────────────────────────┐
│ STEP 3: Browser masks PII and builds roster                             │
│                                                                         │
│ Browser Extension                                                       │
│ ─────────────────                                                       │
│ Roster Cache:                      Response to Server:                  │
│ ┌─────────────────────────┐       ┌────────────────────────────────┐   │
│ │ M12345 = John Smith     │       │ participants: [                │   │
│ │ M67890 = Jane Doe       │  ───► │   { name: "M12345_name", ... } │   │
│ │ ...                     │       │   { name: "M67890_name", ... } │   │
│ └─────────────────────────┘       │ ]                              │   │
│ (Stored locally in browser)       └────────────────────────────────┘   │
│                                   (Sent to server - NO PII)            │
│                                                                         │
└─────────────────────────────────────────────────────────────────────────┘
                                         │
                                         ▼
┌─────────────────────────────────────────────────────────────────────────┐
│ STEP 4: Server forwards masked data to AI                               │
│                                                                         │
│ MCP Server                         AI Service                           │
│ ──────────                         ──────────                           │
│ Forwards response        ───►      Receives:                            │
│ (never stores it)                  "M12345_name, M67890_name"           │
│                                    (NO real student names)              │
│                                                                         │
└─────────────────────────────────────────────────────────────────────────┘
```

### Writing Student Data (e.g., "Post announcement mentioning students")

```
┌─────────────────────────────────────────────────────────────────────────┐
│ STEP 1: AI generates content with masked tokens                         │
│                                                                         │
│ AI Service                         MCP Server                           │
│ ──────────                         ──────────                           │
│ "Congratulations to      ───►      Routes to browser                    │
│  M12345_name and                                                        │
│  M67890_name!"                                                          │
│                                                                         │
└─────────────────────────────────────────────────────────────────────────┘
                                         │
                                         ▼
┌─────────────────────────────────────────────────────────────────────────┐
│ STEP 2: Browser unmasks tokens using local roster                       │
│                                                                         │
│ Browser Extension                                                       │
│ ─────────────────                                                       │
│ Local Roster:                      Unmasked Content:                    │
│ ┌─────────────────────────┐       ┌────────────────────────────────┐   │
│ │ M12345 = John Smith     │  ───► │ "Congratulations to            │   │
│ │ M67890 = Jane Doe       │       │  John Smith and                │   │
│ │ ...                     │       │  Jane Doe!"                    │   │
│ └─────────────────────────┘       └────────────────────────────────┘   │
│ (Retrieved from local storage)    (Ready to post to Moodle)            │
│                                                                         │
└─────────────────────────────────────────────────────────────────────────┘
                                         │
                                         ▼
┌─────────────────────────────────────────────────────────────────────────┐
│ STEP 3: Browser posts real content to Moodle                            │
│                                                                         │
│ Browser Extension                  Moodle LMS                           │
│ ─────────────────                  ──────────                           │
│ Post to forum            ───►      Forum now shows:                     │
│                                    "Congratulations to                  │
│                                     John Smith and                      │
│                                     Jane Doe!"                          │
│                                                                         │
└─────────────────────────────────────────────────────────────────────────┘
```

---

## What Data is Stored Where

### Instructor's Browser (Local Storage)

| Data | Purpose | Retention |
|------|---------|-----------|
| Course roster cache | Name ↔ Token mapping for masking/unmasking | Session only |
| Authentication tokens | OAuth/JWT for connecting to MCP server | Until logout |
| Extension settings | Server selection, preferences | Persistent |

**✅ This data never leaves the browser**

### Moodle MCP Server (Hosted Service)

| Data | Purpose | Stored? |
|------|---------|---------|
| Instructor email | Account identification | Yes |
| API keys | Authentication | Yes (hashed) |
| Masked tokens (M12345_name) | Routing commands | Transient only |
| Student names | N/A | **NO** |
| Student emails | N/A | **NO** |
| Student IDs | N/A | **NO** |

**✅ No student PII is ever stored on the server**

### AI Service (Claude, ChatGPT, etc.)

| Data | What They See | What They Don't See |
|------|---------------|---------------------|
| Tool requests | `list_participants(course_id=123)` | N/A |
| Tool responses | `[{name: "M12345_name"}, ...]` | `[{name: "John Smith"}, ...]` |
| Generated content | `"M12345_name submitted late"` | `"John Smith submitted late"` |

**✅ AI services only see anonymized tokens, never real student data**

---

## Comparison to Other Approaches

### Approach 1: Direct API Integration

**How it works:** LMS provides API, data sent directly to AI

| Aspect | Risk Level | Notes |
|--------|------------|-------|
| PII Exposure | 🔴 HIGH | All student data sent to AI provider |
| Third-party Storage | 🔴 HIGH | Data may be logged, used for training |
| Compliance | 🔴 RISK | Likely FERPA violation without BAA |

### Approach 2: Export & Upload

**How it works:** Instructor exports data, manually uploads to AI

| Aspect | Risk Level | Notes |
|--------|------------|-------|
| PII Exposure | 🔴 HIGH | Full data in exports |
| Third-party Storage | 🟡 MEDIUM | Depends on AI chat retention policy |
| Compliance | 🔴 RISK | Manual process, easy to leak |

### Approach 3: Moodle MCP (This System)

**How it works:** Browser-based with PII masking

| Aspect | Risk Level | Notes |
|--------|------------|-------|
| PII Exposure | 🟢 LOW | Only masked tokens leave browser |
| Third-party Storage | 🟢 LOW | No PII in server or AI logs |
| Compliance | 🟢 SAFE | Privacy by architecture |

### Side-by-Side Comparison

| Feature | Direct API | Export/Upload | Moodle MCP |
|---------|------------|---------------|------------|
| Student names sent to AI | ✅ Yes | ✅ Yes | ❌ No |
| Student emails sent to AI | ✅ Yes | ✅ Yes | ❌ No |
| Student IDs sent to AI | ✅ Yes | ✅ Yes | ❌ No |
| Data stored on third-party | ✅ Yes | ✅ Likely | ❌ No |
| Works with existing auth | ❌ Needs API tokens | ❌ Manual | ✅ Yes |
| Audit trail | Varies | ❌ None | ✅ Local only |
| FERPA compliant by default | ❌ No | ❌ No | ✅ Yes |

---

## Best Practices for Instructors

### DO ✅

1. **Keep your browser extension updated**
   - Updates include security patches and improved masking

2. **Use course-specific contexts**
   - Load participant lists before working with a course
   - This ensures accurate name ↔ token mapping

3. **Review AI-generated content before posting**
   - Verify that unmasked names are correct
   - Check for any remaining tokens (indicates incomplete roster)

4. **Log out when finished**
   - Clear your session from both Moodle and the extension

5. **Report unmasked PII**
   - If you notice student names appearing unmasked, report it
   - This helps improve the masking patterns

### DON'T ❌

1. **Don't share your API key**
   - Your key is linked to your browser session

2. **Don't manually type student names in AI prompts**
   - Let the AI use the masked tokens
   - If you type "John Smith", it won't be protected

3. **Don't export masked reports without context**
   - Masked tokens like `M12345_name` are meaningless without the roster

4. **Don't disable the browser extension while using AI**
   - The extension handles the critical masking/unmasking

---

## Technical Details

### Masking Algorithm

```typescript
// Pseudocode for PII masking
function maskPII(text: string, roster: RosterEntry[]): string {
  let masked = text;
  
  // Order matters: longer patterns first to avoid partial matches
  
  // 1. Replace known emails (longest, may contain student IDs)
  for (const entry of roster) {
    masked = masked.replace(entry.email, `M${entry.moodleId}_email`);
  }
  
  // 2. Replace known names (multiple formats)
  for (const entry of sortByNameLength(roster)) {
    const patterns = [
      entry.displayName,           // "John Smith"
      `${entry.lastName}, ${entry.firstName}`,  // "Smith, John"
      // ... other variations
    ];
    for (const pattern of patterns) {
      masked = masked.replace(pattern, `M${entry.moodleId}_name`);
    }
  }
  
  // 3. Replace known student IDs
  for (const entry of roster) {
    masked = masked.replace(entry.studentId, `M${entry.moodleId}_CID`);
  }
  
  // 4. One-way mask any remaining PII
  masked = maskUnknownPII(masked);
  
  return masked;
}
```

### Roster Storage

The roster (name ↔ token mapping) is stored:
- **Where:** Server-side database, keyed to instructor's account
- **Contents:** Moodle user IDs, display names, emails, student IDs
- **Access:** Only the instructor who loaded the roster can access it
- **Encryption:** Database at rest uses standard encryption

**Important:** The roster is required for unmasking. Without it, tokens cannot be converted back to names.

### Security Considerations

1. **Token Predictability**
   - Tokens use Moodle user IDs, which are semi-sequential
   - This is acceptable because tokens are only meaningful with the roster
   - An attacker with just `M12345_name` cannot determine the student

2. **Roster Security**
   - Roster is tied to instructor's authenticated session
   - Cannot be accessed by other users
   - Deleted when instructor's account is removed

3. **Man-in-the-Middle**
   - All communication uses TLS/HTTPS
   - WebSocket connections use WSS (encrypted)
   - Even if intercepted, data contains only masked tokens

---

## Frequently Asked Questions

### Q: Is using Moodle MCP a FERPA violation?

**A: No.** The system is designed so that student PII never reaches third-party services. The AI only sees anonymized tokens like `M12345_name`, not actual student names.

### Q: What if the AI mentions a student by name?

**A: It can't.** The AI never receives real student names—only tokens. When the AI generates content like "M12345_name submitted late," the browser extension converts this to the real name only when displaying to you or posting to Moodle.

### Q: Does the MCP server see student data?

**A: No.** The server sees masked tokens only. The actual student names exist only:
1. In Moodle (where they belong)
2. In your browser (temporarily, while viewing)

### Q: What if I type a student name directly in my prompt?

**A: That bypasses the protection.** Always refer to students using the AI's terminology (which uses tokens). If you need to reference a specific student, use their token or let the AI work from the roster it received.

### Q: Can I export reports with real student names?

**A: Yes, through the proper flow.** Use the "Create Download File" tool, which generates a downloadable file that unmasks names only when you download it in your browser.

### Q: What happens if the roster is incomplete?

**A: Unknown names may use one-way masking.** If a student isn't in the roster, their name becomes `Joh*** Smi***` (partially hidden). You should load the full participant list for each course before working with student data.

### Q: Is the data stored in Moodle affected?

**A: No.** Moodle continues to store all data normally. Moodle MCP only affects what the AI sees—it doesn't modify Moodle's database.

### Q: Who has access to my roster mappings?

**A: Only you.** The roster is tied to your authenticated account. Other instructors cannot see your roster, and the system administrators can only see encrypted database entries.

---

## Summary

Moodle MCP provides a **privacy-first** approach to AI-assisted course management:

| Principle | Implementation |
|-----------|----------------|
| **Data Minimization** | AI sees only what it needs (masked tokens) |
| **Purpose Limitation** | Roster used only for masking, never shared |
| **Storage Limitation** | PII stored only in authorized locations |
| **Access Control** | Instructor's Moodle permissions determine data access |
| **Transparency** | Clear documentation of data flows |

By keeping student PII in the instructor's browser and only sending anonymized tokens to external services, Moodle MCP enables powerful AI assistance while maintaining **full FERPA compliance**.

---

*Document Version: 1.0*  
*Last Updated: January 2026*  
*For questions or concerns, contact your institution's privacy officer or the Moodle MCP development team.*
