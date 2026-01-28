# Moodle MCP Name Masking Enhancement Specification

## Document Info
- **Date:** January 27, 2026
- **Author:** Generated via Cursor AI assistant
- **Status:** ✅ CORE FIX IMPLEMENTED (Jan 28, 2026)
- **Priority:** Critical (FERPA Compliance)

### Implementation Status
| Feature | Status |
|---------|--------|
| First+Last without middle name | ✅ Implemented |
| Middle initial variations (F. M. Last, etc.) | ✅ Implemented |
| First initial variations (F. Last) | ✅ Implemented |
| **Ambiguity detection** | ✅ Implemented (Jan 28) |
| Dashboard mask/unmask tool | ✅ Implemented (Jan 28) |
| File masking capability | ✅ Implemented (Jan 28) |
| Nickname expansion | ⏳ Future enhancement |
| Instructor variation CUD UI | ⏳ Future enhancement |

---

## 1. Problem Statement

### Current Behavior
The Moodle MCP name masking filter currently handles:
- First + Last name matching
- Name order variations (e.g., "John Smith" ↔ "Smith, John")
- Case insensitivity
- Comma/space separators

### Identified Gap
When a student's roster entry includes a **middle name** (e.g., "Matheus John Nery"), but someone types only "Matheus Nery" in a forum post, the masking system **fails to match** and the name passes through in **clear text**.

### FERPA Implication
Unmasked student names leak to:
- The LLM (Claude) in API calls
- Potentially to logs, exports, and other downstream systems

This defeats the purpose of the privacy filter and creates a compliance risk.

### Real-World Example
```
Roster Entry:     "Matheus John Nery" (user_id: 21011)
Forum Post Text:  "Member (Flex): Matheus Nery"
Expected Output:  "Member (Flex): M21011_name"
Actual Output:    "Member (Flex): Matheus Nery"  ← FERPA VIOLATION
```

---

## 2. Proposed Solution

### Overview
Implement a **pre-computed name variation system** that generates and stores multiple acceptable name forms for each student. The masking filter will match against all variations, not just the canonical roster name.

### Why Pre-computed vs. NER
| Approach | Verdict |
|----------|---------|
| NER (Named Entity Recognition) | Rejected - unpredictable, false positives, computational overhead |
| Pre-computed variations | **Accepted** - deterministic, auditable, instructor-verifiable |

---

## 3. Technical Specification

### 3.1 Variation Generation Algorithm

For each student in the roster, generate the following variations:

```python
def generate_name_variations(full_name: str, user_id: int) -> List[str]:
    """
    Input:  "Matheus John Nery"
    Output: ["Matheus John Nery", "Matheus Nery", "Nery, Matheus", 
             "M. Nery", "M Nery", "Matheus J. Nery", "Matheus J Nery",
             "Matt Nery", "Matt John Nery", ...]
    """
    variations = set()
    
    # Parse name components
    parts = parse_name(full_name)  # Returns {first, middle, last, suffix}
    first = parts['first']
    middle = parts.get('middle')
    last = parts['last']
    
    # === Core Variations ===
    
    # 1. Full name as-is
    variations.add(full_name)
    
    # 2. First + Last only (CRITICAL - fixes the reported bug)
    variations.add(f"{first} {last}")
    variations.add(f"{last}, {first}")
    variations.add(f"{last} {first}")
    
    # 3. With middle initial
    if middle:
        mi = middle[0]
        variations.add(f"{first} {mi}. {last}")
        variations.add(f"{first} {mi} {last}")
        variations.add(f"{last}, {first} {mi}.")
        variations.add(f"{last}, {first} {mi}")
    
    # 4. Initial + Last
    fi = first[0]
    variations.add(f"{fi}. {last}")
    variations.add(f"{fi} {last}")
    variations.add(f"{last}, {fi}.")
    variations.add(f"{last}, {fi}")
    
    # 5. Nickname expansion (see 3.2)
    nicknames = get_nicknames(first)
    for nick in nicknames:
        variations.add(f"{nick} {last}")
        variations.add(f"{last}, {nick}")
        if middle:
            variations.add(f"{nick} {middle} {last}")
    
    # === Apply case normalization ===
    # Store all as lowercase for matching; preserve original for display
    
    return list(variations)
```

### 3.2 Nickname Mapping Table

Maintain a static lookup table for common English nicknames:

```python
NICKNAME_MAP = {
    # Formal → [Nicknames]
    "william": ["will", "bill", "billy", "willy"],
    "robert": ["rob", "bob", "bobby", "robbie"],
    "richard": ["rick", "rich", "dick", "ricky"],
    "matthew": ["matt", "matty"],
    "matheus": ["matt", "matty"],  # Portuguese variant
    "michael": ["mike", "mikey", "mick"],
    "christopher": ["chris", "topher", "kit"],
    "nicholas": ["nick", "nicky"],
    "benjamin": ["ben", "benny", "benji"],
    "jonathan": ["jon", "johnny", "jonny"],
    "elizabeth": ["liz", "lizzy", "beth", "betty", "eliza"],
    "katherine": ["kate", "katie", "kathy", "kat"],
    "catherine": ["cate", "cathy", "cat"],
    "jennifer": ["jen", "jenny", "jenn"],
    "stephanie": ["steph", "stephie"],
    "alexander": ["alex", "xander", "al"],
    "alexandra": ["alex", "alexa", "lexi"],
    "joseph": ["joe", "joey"],
    "joshua": ["josh"],
    "daniel": ["dan", "danny"],
    "samuel": ["sam", "sammy"],
    "david": ["dave", "davey"],
    "james": ["jim", "jimmy", "jamie"],
    "thomas": ["tom", "tommy"],
    "edward": ["ed", "eddie", "ted", "teddy"],
    "anthony": ["tony", "ant"],
    "charles": ["charlie", "chuck", "chas"],
    "andrew": ["andy", "drew"],
    "jacob": ["jake"],
    "zachary": ["zach", "zack"],
    "timothy": ["tim", "timmy"],
    "patrick": ["pat", "paddy"],
    "victoria": ["vicky", "vic", "tori"],
    "margaret": ["maggie", "meg", "peggy", "marge"],
    "rebecca": ["becky", "becca"],
    "jessica": ["jess", "jessie"],
    "samantha": ["sam", "sammy"],
    "natalie": ["nat", "nattie"],
    "abigail": ["abby", "gail"],
    "madeline": ["maddy", "maddie"],
    "gabriella": ["gabby", "gabi", "ella"],
    "isabella": ["izzy", "bella", "izzie"],
    "olivia": ["liv", "livvy"],
    "sophia": ["sophie"],
    # Add more as needed...
}

def get_nicknames(first_name: str) -> List[str]:
    """Return list of common nicknames for a given first name."""
    key = first_name.lower()
    nicknames = NICKNAME_MAP.get(key, [])
    
    # Also check if input IS a nickname → return formal
    for formal, nicks in NICKNAME_MAP.items():
        if key in nicks:
            nicknames.append(formal)
            nicknames.extend(nicks)
    
    return list(set(nicknames))
```

### 3.3 Instructor Override Interface

Provide a UI for instructors to:

1. **View auto-generated variations** for each student
2. **Add custom variations** (e.g., preferred names, cultural variants)
3. **Remove variations** that are too generic (e.g., single common names)
4. **Import variations** from a CSV

#### Suggested UI Mockup

```
┌─────────────────────────────────────────────────────────────────┐
│ Name Masking Configuration - CMPS453-001-202640                 │
├─────────────────────────────────────────────────────────────────┤
│ Student: Matheus John Nery (M21011)                             │
│                                                                 │
│ Auto-Generated Variations:              ☑ Enable All            │
│ ┌─────────────────────────────────────────────────────────────┐ │
│ │ ☑ Matheus John Nery                                         │ │
│ │ ☑ Matheus Nery                    ← Would have caught bug   │ │
│ │ ☑ Nery, Matheus                                             │ │
│ │ ☑ Nery, Matheus John                                        │ │
│ │ ☑ M. Nery                                                   │ │
│ │ ☑ Matheus J. Nery                                           │ │
│ │ ☑ Matt Nery                       (nickname)                │ │
│ │ ☑ Matt John Nery                  (nickname)                │ │
│ └─────────────────────────────────────────────────────────────┘ │
│                                                                 │
│ Custom Variations:                      [+ Add]                 │
│ ┌─────────────────────────────────────────────────────────────┐ │
│ │ • Theus Nery                      [Remove]                  │ │
│ │ • Matheus N.                      [Remove]                  │ │
│ └─────────────────────────────────────────────────────────────┘ │
│                                                                 │
│ [Save] [Reset to Defaults] [Apply to All Students]              │
└─────────────────────────────────────────────────────────────────┘
```

### 3.4 Storage Schema

```sql
-- New table for name variations
CREATE TABLE mdl_local_mcp_name_variations (
    id BIGINT PRIMARY KEY AUTO_INCREMENT,
    course_id BIGINT NOT NULL,
    user_id BIGINT NOT NULL,
    variation VARCHAR(255) NOT NULL,
    variation_normalized VARCHAR(255) NOT NULL,  -- lowercase, whitespace normalized
    is_auto_generated BOOLEAN DEFAULT TRUE,
    is_enabled BOOLEAN DEFAULT TRUE,
    created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
    updated_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP,
    
    UNIQUE KEY unique_variation (course_id, user_id, variation_normalized),
    INDEX idx_lookup (course_id, variation_normalized),
    FOREIGN KEY (course_id) REFERENCES mdl_course(id) ON DELETE CASCADE,
    FOREIGN KEY (user_id) REFERENCES mdl_user(id) ON DELETE CASCADE
);
```

### 3.5 Masking Filter Update

Update the masking filter to:

1. **On page load / API call:**
   - Fetch all enabled variations for the course
   - Build a lookup dictionary: `{normalized_variation: (user_id, mask_token)}`

2. **During text processing:**
   - Tokenize text into potential name segments (2-4 consecutive words)
   - Normalize each segment (lowercase, whitespace)
   - Check against lookup dictionary
   - Replace matches with mask token

```python
def mask_names_in_text(text: str, course_id: int) -> str:
    """
    Enhanced masking that uses pre-computed variations.
    """
    # Load variations for course (cache this!)
    variations = load_variations_for_course(course_id)
    # variations = {"matheus nery": ("M21011", "M21011_name"), ...}
    
    # Sort by length descending to match longer names first
    sorted_variations = sorted(variations.keys(), key=len, reverse=True)
    
    result = text
    for variation in sorted_variations:
        # Case-insensitive replacement
        pattern = re.compile(re.escape(variation), re.IGNORECASE)
        user_id, mask_token = variations[variation]
        result = pattern.sub(mask_token, result)
    
    return result
```

---

## 4. Migration Plan

### Phase 1: Generate Variations for Existing Courses
1. Run batch job to generate variations for all enrolled students
2. Store with `is_auto_generated = TRUE`
3. No instructor action required - works immediately

### Phase 2: Add Instructor UI
1. Deploy variation management interface
2. Allow instructors to customize as needed
3. Document in help/FAQ

### Phase 3: Continuous Improvement
1. Monitor for unmasked names in logs (if any slip through)
2. Expand nickname mapping based on real-world misses
3. Consider ML-based nickname suggestion (optional enhancement)

---

## 5. Testing Requirements

### Unit Tests
- [ ] `generate_name_variations()` produces expected output for various name formats
- [ ] Nickname lookup works bidirectionally (formal ↔ nickname)
- [ ] Masking correctly replaces all variations
- [ ] Longer names matched before shorter (no partial replacements)

### Integration Tests
- [ ] Variations generated on course enrollment
- [ ] Variations updated when roster changes
- [ ] Instructor overrides persist and apply correctly
- [ ] Performance acceptable with large rosters (500+ students)

### FERPA Compliance Tests
- [ ] Middle-name-omitted names are masked (THE BUG)
- [ ] Nickname variants are masked
- [ ] Initial-only references are masked
- [ ] Mixed case references are masked

---

## 6. Success Criteria

1. **Zero unmasked names** for any student when referenced by:
   - First + Last (no middle)
   - Common nickname + Last
   - Initial + Last
   - Any order (First Last, Last First, Last, First)

2. **Instructor control** over edge cases without requiring developer intervention

3. **Backward compatible** - existing courses work without reconfiguration

---

## 7. Open Questions

1. **How generic is too generic?**
   - Should "M. Nery" be masked? (Probably yes)
   - Should "Matt" alone be masked? (Probably no - too common)
   - Recommendation: Require at least first initial + last name minimum

2. **International names**
   - How to handle patronymics, single names, multiple surnames?
   - Recommendation: Start with Western name conventions; expand based on user feedback

3. **Performance considerations**
   - With 40 students × 15 variations = 600 patterns per course
   - Should be manageable with proper indexing and caching

---

## 8. References

- Original bug discovered: Team-05 forum post in CMPS453-001-202640
- Student "Matheus John Nery" (M21011) referenced as "Matheus Nery" - not masked
- FERPA: Family Educational Rights and Privacy Act (20 U.S.C. § 1232g)
