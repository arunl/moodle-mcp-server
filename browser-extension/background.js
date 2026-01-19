// Background service worker for Moodle MCP Bridge (Hosted Version)
// VERSION 2.3.0 - Using ISOLATED world to bypass page CSP for evaluate
console.log('[MoodleMCP v2.3.0] Background script loaded - connecting to localhost:8080');

// Server configuration - change for production
// For local development, use localhost:8080
const SERVER_URL = 'http://localhost:8080';
const WS_URL = 'ws://localhost:8080/ws';
console.log('[MoodleMCP] WebSocket URL:', WS_URL);

let ws = null;
let reconnectAttempts = 0;
const MAX_RECONNECT_ATTEMPTS = 10;
const RECONNECT_DELAY = 5000;

// Get stored auth tokens
async function getTokens() {
  // [AL] - access token for bridge to mcp server
  // [AL] - how do you know its the correct access token. there is nothing identifying the bridge.
  const result = await chrome.storage.local.get(['accessToken', 'refreshToken', 'user']);
  return result;
}

// Save auth tokens
async function saveTokens(accessToken, refreshToken, user) {
  await chrome.storage.local.set({ accessToken, refreshToken, user });
}

// Clear auth tokens
async function clearTokens() {
  await chrome.storage.local.remove(['accessToken', 'refreshToken', 'user']);
}

// Refresh the access token
async function refreshAccessToken() {
  const { refreshToken } = await getTokens();
  if (!refreshToken) return null;

  try {
    const response = await fetch(`${SERVER_URL}/auth/token`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        grant_type: 'refresh_token',
        refresh_token: refreshToken,
      }),
    });

    if (!response.ok) {
      console.error('[Auth] Failed to refresh token');
      await clearTokens();
      return null;
    }

    const data = await response.json();
    const { user } = await getTokens();
    await saveTokens(data.access_token, refreshToken, user);
    return data.access_token;
  } catch (error) {
    console.error('[Auth] Token refresh error:', error);
    return null;
  }
}

// Connect to WebSocket server
async function connectWebSocket() {
  const { accessToken } = await getTokens();
  
  if (!accessToken) {
    console.log('[WebSocket] No access token, not connecting');
    return;
  }

  if (ws && ws.readyState === WebSocket.OPEN) {
    console.log('[WebSocket] Already connected');
    return;
  }

  console.log('[WebSocket] Connecting to', WS_URL);
  
  try {
    ws = new WebSocket(WS_URL);

    ws.onopen = () => {
      console.log('[WebSocket] Connected, authenticating...');
      reconnectAttempts = 0;
      
      // Send authentication
      ws.send(JSON.stringify({
        type: 'auth',
        token: accessToken,
      }));
    };

    ws.onmessage = async (event) => {
      try {
        const message = JSON.parse(event.data);
        
        if (message.type === 'auth_success') {
          console.log('[WebSocket] Authenticated as', message.email);
          chrome.storage.local.set({ wsConnected: true });
          return;
        }
        
        if (message.type === 'auth_error') {
          console.error('[WebSocket] Auth error:', message.error);
          // Try to refresh token
          const newToken = await refreshAccessToken();
          if (newToken) {
            ws.send(JSON.stringify({ type: 'auth', token: newToken }));
          } else {
            chrome.storage.local.set({ wsConnected: false });
          }
          return;
        }
        
        if (message.type === 'pong') {
          return;
        }

        // Handle browser commands
        if (message.id && message.action) {
          const response = await handleCommand(message);
          ws.send(JSON.stringify(response));
        }
      } catch (error) {
        console.error('[WebSocket] Message error:', error);
      }
    };

    ws.onclose = () => {
      console.log('[WebSocket] Disconnected');
      chrome.storage.local.set({ wsConnected: false });
      ws = null;
      
      // Attempt to reconnect
      if (reconnectAttempts < MAX_RECONNECT_ATTEMPTS) {
        reconnectAttempts++;
        console.log(`[WebSocket] Reconnecting in ${RECONNECT_DELAY}ms (attempt ${reconnectAttempts})`);
        setTimeout(connectWebSocket, RECONNECT_DELAY);
      }
    };

    ws.onerror = (error) => {
      console.error('[WebSocket] Error:', error);
    };
  } catch (error) {
    console.error('[WebSocket] Connection error:', error);
  }
}

// Handle incoming commands from the server
async function handleCommand(command) {
  const { id, action, params } = command;
  
  try {
    const tabs = await chrome.tabs.query({ active: true, currentWindow: true });
    const tab = tabs[0];
    
    if (!tab) {
      return { id, success: false, error: 'No active tab' };
    }

    switch (action) {
      case 'navigate':
        return await handleNavigate(id, params, tab);
      case 'click':
        return await handleClick(id, params, tab);
      case 'type':
        return await handleType(id, params, tab);
      case 'extract':
        return await handleExtract(id, params, tab);
      case 'evaluate':
        return await handleEvaluate(id, params, tab);
      case 'wait':
        return await handleWait(id, params, tab);
      // Moodle-specific extraction handlers (CSP-safe, no eval)
      case 'extract_participants':
        return await handleExtractParticipants(id, params, tab);
      case 'extract_editing_status':
        return await handleExtractEditingStatus(id, params, tab);
      case 'extract_addable_sections':
        return await handleExtractAddableSections(id, params, tab);
      case 'extract_forum_discussions':
        return await handleExtractForumDiscussions(id, params, tab);
      case 'extract_course_sections':
        return await handleExtractCourseSections(id, params, tab);
      case 'setEditor':
        return await handleSetEditor(id, params, tab);
      case 'set_moodle_date':
        return await handleSetMoodleDate(id, params, tab);
      // Session/auth handlers
      case 'extract_sesskey':
        return await handleExtractSesskey(id, params, tab);
      case 'extract_course_id':
        return await handleExtractCourseId(id, params, tab);
      // Assignment extraction handlers
      case 'extract_assignments':
        return await handleExtractAssignments(id, params, tab);
      case 'extract_assignment_details':
        return await handleExtractAssignmentDetails(id, params, tab);
      case 'extract_submissions':
        return await handleExtractSubmissions(id, params, tab);
      case 'extract_activities':
        return await handleExtractActivities(id, params, tab);
      case 'set_activity_date':
        return await handleSetActivityDate(id, params, tab);
      case 'extract_forum_discussions':
        return await handleExtractForumDiscussions(id, params, tab);
      case 'extract_discussion_replies':
        return await handleExtractDiscussionReplies(id, params, tab);
      default:
        return { id, success: false, error: `Unknown action: ${action}` };
    }
  } catch (error) {
    return { id, success: false, error: error.message };
  }
}

// Command handlers
async function handleNavigate(id, params, tab) {
  let url = params.url;
  
  // If relative URL, use Moodle base from current tab
  if (url.startsWith('/')) {
    const tabUrl = new URL(tab.url);
    url = tabUrl.origin + url;
  }
  
  await chrome.tabs.update(tab.id, { url });
  
  // Wait for page to load
  await new Promise((resolve) => {
    const listener = (tabId, changeInfo) => {
      if (tabId === tab.id && changeInfo.status === 'complete') {
        chrome.tabs.onUpdated.removeListener(listener);
        resolve();
      }
    };
    chrome.tabs.onUpdated.addListener(listener);
    setTimeout(resolve, 10000); // Timeout after 10s
  });
  
  return { id, success: true, data: { url } };
}

async function handleClick(id, params, tab) {
  const { selector, description } = params;
  
  const result = await chrome.scripting.executeScript({
    target: { tabId: tab.id },
    func: (sel) => {
      const element = document.querySelector(sel);
      if (!element) {
        return { success: false, error: `Element not found: ${sel}` };
      }
      element.click();
      return { success: true };
    },
    args: [selector],
  });
  
  return { id, ...result[0].result };
}

async function handleType(id, params, tab) {
  const { selector, text, clearFirst } = params;
  
  const result = await chrome.scripting.executeScript({
    target: { tabId: tab.id },
    func: (sel, txt, clear) => {
      const element = document.querySelector(sel);
      if (!element) {
        return { success: false, error: `Element not found: ${sel}` };
      }
      
      if (clear) {
        element.value = '';
      }
      
      element.focus();
      element.value = txt;
      element.dispatchEvent(new Event('input', { bubbles: true }));
      element.dispatchEvent(new Event('change', { bubbles: true }));
      
      return { success: true };
    },
    args: [selector, text, clearFirst !== false],
  });
  
  return { id, ...result[0].result };
}

async function handleExtract(id, params, tab) {
  const result = await chrome.scripting.executeScript({
    target: { tabId: tab.id },
    func: () => {
      const data = {
        title: document.title,
        url: window.location.href,
        headings: [],
        links: [],
        text: '',
      };
      
      // Extract headings
      document.querySelectorAll('h1, h2, h3, h4').forEach((h) => {
        data.headings.push({
          level: parseInt(h.tagName[1]),
          text: h.textContent.trim(),
        });
      });
      
      // Extract links
      document.querySelectorAll('a[href]').forEach((a) => {
        const text = a.textContent.trim();
        if (text && !text.startsWith('http')) {
          data.links.push({
            text,
            href: a.href,
          });
        }
      });
      
      // Extract main content text
      const main = document.querySelector('#region-main, main, .content, #content');
      if (main) {
        data.text = main.textContent.trim().substring(0, 5000);
      }
      
      return { success: true, data };
    },
  });
  
  return { id, success: true, data: result[0].result.data };
}

async function handleEvaluate(id, params, tab) {
  const { script } = params;
  
  // Use ISOLATED world to bypass page's CSP while still accessing DOM
  const result = await chrome.scripting.executeScript({
    target: { tabId: tab.id },
    world: 'ISOLATED',  // Extension's context, not page's - avoids CSP restrictions
    func: (code) => {
      try {
        const fn = new Function('return ' + code);
        return { success: true, data: fn() };
      } catch (error) {
        return { success: false, error: error.message };
      }
    },
    args: [script],
  });
  
  return { id, ...result[0].result };
}

async function handleWait(id, params, tab) {
  const { selector, timeout = 10000 } = params;
  
  const result = await chrome.scripting.executeScript({
    target: { tabId: tab.id },
    func: async (sel, ms) => {
      const start = Date.now();
      while (Date.now() - start < ms) {
        if (document.querySelector(sel)) {
          return { success: true };
        }
        await new Promise((r) => setTimeout(r, 100));
      }
      return { success: false, error: `Timeout waiting for: ${sel}` };
    },
    args: [selector, timeout],
  });
  
  return { id, ...result[0].result };
}

// ===========================================
// Moodle-specific extraction handlers (CSP-safe)
// ===========================================

async function handleExtractParticipants(id, params, tab) {
  const result = await chrome.scripting.executeScript({
    target: { tabId: tab.id },
    func: () => {
      const participants = [];
      // Try the participants table
      const rows = document.querySelectorAll('table#participants tbody tr, table.generaltable tbody tr');
      
      rows.forEach((row) => {
        const nameLink = row.querySelector('a[href*="/user/view.php"]');
        const roleCell = row.querySelector('td[data-column="roles"], td:nth-child(3)');
        const emailCell = row.querySelector('td[data-column="email"]');
        
        if (nameLink) {
          const href = nameLink.getAttribute('href');
          const idMatch = href.match(/id=(\d+)/);
          participants.push({
            name: nameLink.textContent.trim(),
            userId: idMatch ? parseInt(idMatch[1]) : null,
            profileUrl: nameLink.href,
            role: roleCell ? roleCell.textContent.trim() : null,
            email: emailCell ? emailCell.textContent.trim() : null,
          });
        }
      });
      
      // Get total count if available
      const countEl = document.querySelector('.userlist-count, [data-region="participants-count"]');
      const totalMatch = document.body.textContent.match(/(\d+)\s*participants?\s*found/i);
      
      return {
        success: true,
        data: {
          participants,
          total: totalMatch ? parseInt(totalMatch[1]) : participants.length,
          url: window.location.href,
        },
      };
    },
  });
  
  return { id, ...result[0].result };
}

async function handleExtractEditingStatus(id, params, tab) {
  const result = await chrome.scripting.executeScript({
    target: { tabId: tab.id },
    func: () => {
      // Check for editing mode indicators
      const editButton = document.querySelector('button.section-modchooser[data-action="open-chooser"]');
      const editModeInput = document.querySelector('input[name="setmode"]');
      const editingOn = document.body.classList.contains('editing') || 
                        !!editButton || 
                        (editModeInput && editModeInput.value === '0');
      
      return {
        success: true,
        data: {
          enabled: editingOn,
          url: window.location.href,
        },
      };
    },
  });
  
  return { id, ...result[0].result };
}

async function handleExtractAddableSections(id, params, tab) {
  const result = await chrome.scripting.executeScript({
    target: { tabId: tab.id },
    func: () => {
      const buttons = document.querySelectorAll('button.section-modchooser[data-sectionid]');
      const sections = [];
      
      buttons.forEach((btn) => {
        const sectionId = btn.getAttribute('data-sectionid');
        if (sectionId) {
          sections.push(parseInt(sectionId));
        }
      });
      
      return {
        success: true,
        data: {
          sections: [...new Set(sections)], // Remove duplicates
          count: sections.length,
        },
      };
    },
  });
  
  return { id, ...result[0].result };
}

async function handleExtractCourseSections(id, params, tab) {
  const result = await chrome.scripting.executeScript({
    target: { tabId: tab.id },
    func: () => {
      const sections = [];
      
      // Find all sections on the course page
      const sectionElements = document.querySelectorAll('.section, [data-sectionid], li.section');
      
      sectionElements.forEach((section) => {
        // Get section ID from data attribute or from edit link
        let sectionId = section.getAttribute('data-sectionid');
        
        // Get section name
        const nameEl = section.querySelector('.sectionname, .section-title, h3.sectionname');
        const name = nameEl ? nameEl.textContent.trim() : null;
        
        // Try to find edit link to get section ID
        const editLink = section.querySelector('a[href*="editsection.php"]');
        if (editLink && !sectionId) {
          const href = editLink.getAttribute('href');
          const idMatch = href.match(/id=(\d+)/);
          if (idMatch) {
            sectionId = idMatch[1];
          }
        }
        
        // Get section number from class or ID
        const sectionNum = section.id?.match(/section-(\d+)/)?.[1] || 
                          section.getAttribute('data-sectionnum') ||
                          null;
        
        if (sectionId || name) {
          sections.push({
            sectionId: sectionId ? parseInt(sectionId) : null,
            sectionNum: sectionNum ? parseInt(sectionNum) : null,
            name: name || `Section ${sectionNum || 'Unknown'}`,
            editUrl: editLink ? editLink.href : null,
          });
        }
      });
      
      // Remove duplicates by sectionId
      const uniqueSections = sections.filter((s, i, arr) => 
        !s.sectionId || arr.findIndex(x => x.sectionId === s.sectionId) === i
      );
      
      return {
        success: true,
        data: {
          sections: uniqueSections,
          count: uniqueSections.length,
          url: window.location.href,
        },
      };
    },
  });
  
  return { id, ...result[0].result };
}

async function handleSetEditor(id, params, tab) {
  const { htmlContent, editorId } = params;
  
  const result = await chrome.scripting.executeScript({
    target: { tabId: tab.id },
    func: (content, targetEditorId) => {
      // Find the editor textarea
      let textarea;
      if (targetEditorId) {
        textarea = document.getElementById(targetEditorId);
      } else {
        // Find first plausible editor - include message textareas for forums
        textarea = document.querySelector(
          'textarea[id*="editor"], textarea[id*="summary"], textarea[name*="summary"], ' +
          'textarea[id*="message"], textarea[name*="message"], textarea[id*="intro"]'
        );
      }
      
      if (!textarea) {
        return { success: false, error: 'No editor textarea found' };
      }
      
      // Set the textarea value
      textarea.value = content;
      textarea.dispatchEvent(new Event('input', { bubbles: true }));
      textarea.dispatchEvent(new Event('change', { bubbles: true }));
      
      // Try to update the contenteditable div if using Atto/TinyMCE
      const editorId = textarea.id;
      // Look for Atto editor's editable div
      const editableDiv = document.querySelector(
        `#${editorId}editable, ` +
        `[data-region="text"] [contenteditable="true"], ` +
        `.editor_atto_content[contenteditable="true"]`
      );
      if (editableDiv) {
        editableDiv.innerHTML = content;
        editableDiv.dispatchEvent(new Event('input', { bubbles: true }));
      }
      
      return { success: true, textareaId: textarea.id, editableDivFound: !!editableDiv };
    },
    args: [htmlContent, editorId],
  });
  
  return { id, ...result[0].result };
}

async function handleSetMoodleDate(id, params, tab) {
  const { fieldPrefix, dateString, enableCheckbox } = params;
  
  const result = await chrome.scripting.executeScript({
    target: { tabId: tab.id },
    func: (prefix, dateStr, enable) => {
      const date = new Date(dateStr);
      
      // Enable the date field if checkbox exists and enableCheckbox is true
      if (enable) {
        const checkbox = document.getElementById(`${prefix}_enabled`);
        if (checkbox && !checkbox.checked) {
          checkbox.click();
          // Wait a moment for the fields to become enabled
        }
      }
      
      // Helper to set select dropdown value
      const setSelect = (id, value) => {
        const select = document.getElementById(id);
        if (select) {
          select.value = value;
          select.dispatchEvent(new Event('change', { bubbles: true }));
          return true;
        }
        return false;
      };
      
      // Helper to set input value
      const setInput = (id, value) => {
        const input = document.getElementById(id);
        if (input) {
          input.value = value;
          input.dispatchEvent(new Event('input', { bubbles: true }));
          input.dispatchEvent(new Event('change', { bubbles: true }));
          return true;
        }
        return false;
      };
      
      // Moodle uses select dropdowns for date components
      const day = date.getDate();
      const month = date.getMonth() + 1; // 0-indexed
      const year = date.getFullYear();
      const hour = date.getHours();
      const minute = date.getMinutes();
      
      // Try setting as select dropdowns first (most common in Moodle)
      const daySet = setSelect(`${prefix}_day`, day) || setInput(`${prefix}_day`, day);
      const monthSet = setSelect(`${prefix}_month`, month) || setInput(`${prefix}_month`, month);
      const yearSet = setSelect(`${prefix}_year`, year) || setInput(`${prefix}_year`, year);
      const hourSet = setSelect(`${prefix}_hour`, hour) || setInput(`${prefix}_hour`, hour);
      const minuteSet = setSelect(`${prefix}_minute`, minute) || setInput(`${prefix}_minute`, minute);
      
      return {
        success: daySet && monthSet && yearSet,
        data: {
          day: daySet,
          month: monthSet, 
          year: yearSet,
          hour: hourSet,
          minute: minuteSet,
          dateSet: dateStr,
        },
      };
    },
    args: [fieldPrefix, dateString, enableCheckbox],
  });
  
  return { id, ...result[0].result };
}

async function handleExtractCourseId(id, params, tab) {
  const result = await chrome.scripting.executeScript({
    target: { tabId: tab.id },
    func: () => {
      // Method 1: Look in URL
      const urlMatch = window.location.href.match(/[?&]id=(\d+)|course[=/](\d+)/);
      if (urlMatch) {
        const courseId = urlMatch[1] || urlMatch[2];
        if (courseId) return { courseId: parseInt(courseId) };
      }
      
      // Method 2: Look for course link in breadcrumbs or navigation
      const courseLink = document.querySelector('a[href*="/course/view.php?id="]');
      if (courseLink) {
        const match = courseLink.href.match(/id=(\d+)/);
        if (match) return { courseId: parseInt(match[1]) };
      }
      
      // Method 3: Look in body data attributes
      const body = document.body;
      if (body.dataset.courseid) {
        return { courseId: parseInt(body.dataset.courseid) };
      }
      
      return null;
    },
  });
  
  if (result[0]?.result?.courseId) {
    return { id, success: true, data: result[0].result };
  }
  
  return { id, success: false, error: 'Could not find course ID' };
}

async function handleExtractSesskey(id, params, tab) {
  // Try DOM-based extraction (works in ISOLATED world)
  const domResult = await chrome.scripting.executeScript({
    target: { tabId: tab.id },
    func: () => {
      // Method 1: Look for any link containing sesskey
      const links = document.querySelectorAll('a[href*="sesskey"]');
      for (const link of links) {
        const match = link.href.match(/sesskey=([a-zA-Z0-9]+)/);
        if (match) {
          return { sesskey: match[1], method: 'link' };
        }
      }
      
      // Method 2: Look for hidden input with sesskey
      const sessKeyInput = document.querySelector('input[name="sesskey"]');
      if (sessKeyInput && sessKeyInput.value) {
        return { sesskey: sessKeyInput.value, method: 'input' };
      }
      
      return null;
    },
  });
  
  if (domResult[0]?.result?.sesskey) {
    return { id, success: true, data: domResult[0].result };
  }
  
  // Fallback: Try MAIN world to access window.M.cfg.sesskey
  try {
    const mainResult = await chrome.scripting.executeScript({
      target: { tabId: tab.id },
      world: 'MAIN',
      func: () => {
        if (window.M?.cfg?.sesskey) {
          return { sesskey: window.M.cfg.sesskey, method: 'M.cfg' };
        }
        return null;
      },
    });
    
    if (mainResult[0]?.result?.sesskey) {
      return { id, success: true, data: mainResult[0].result };
    }
  } catch (e) {
    // MAIN world might fail, that's ok
  }
  
  return { id, success: false, error: 'Could not find sesskey on page' };
}

async function handleExtractAssignments(id, params, tab) {
  const result = await chrome.scripting.executeScript({
    target: { tabId: tab.id },
    func: () => {
      const assignments = [];
      
      // Parse the assignments table
      const rows = document.querySelectorAll('table tbody tr');
      
      rows.forEach((row) => {
        const cells = row.querySelectorAll('td');
        if (cells.length >= 4) {
          const nameLink = row.querySelector('a[href*="mod/assign/view.php"]');
          const topicCell = cells[0];
          const dueDateCell = cells[2];
          const submissionCell = cells[3];
          const gradeCell = cells[4]; // Grade column if present
          const gradingLink = row.querySelector('a[href*="action=grading"]');
          
          if (nameLink) {
            const href = nameLink.getAttribute('href');
            const idMatch = href.match(/id=(\d+)/);
            
            // Try to extract max grade from grade cell (often shows "-" or "X / Y")
            let maxGrade = null;
            if (gradeCell) {
              const gradeText = gradeCell.textContent.trim();
              const gradeMatch = gradeText.match(/\/\s*(\d+)/); // Match "/ 100" pattern
              if (gradeMatch) {
                maxGrade = parseInt(gradeMatch[1]);
              }
            }
            
            assignments.push({
              id: idMatch ? parseInt(idMatch[1]) : null,
              name: nameLink.textContent.trim(),
              topic: topicCell ? topicCell.textContent.trim() : null,
              dueDate: dueDateCell ? dueDateCell.textContent.trim() : null,
              submissions: submissionCell ? parseInt(submissionCell.textContent.trim()) || 0 : 0,
              needsGrading: gradingLink ? parseInt(gradingLink.textContent.match(/\d+/)?.[0]) || 0 : 0,
              maxGrade: maxGrade,
              url: nameLink.href,
            });
          }
        }
      });
      
      return {
        success: true,
        data: {
          assignments,
          count: assignments.length,
          url: window.location.href,
        },
      };
    },
  });
  
  return { id, ...result[0].result };
}

async function handleExtractAssignmentDetails(id, params, tab) {
  const result = await chrome.scripting.executeScript({
    target: { tabId: tab.id },
    func: () => {
      const details = {
        name: null,
        description: null,
        dueDate: null,
        cutoffDate: null,
        maxGrade: null,
        submissionStatus: null,
        gradingStatus: null,
        timeRemaining: null,
        participants: null,
        submitted: null,
        needsGrading: null,
      };
      
      // Get assignment name
      const header = document.querySelector('.activity-header h2, .page-header-headings h1, h2');
      if (header) {
        details.name = header.textContent.trim();
      }
      
      // Get description
      const intro = document.querySelector('.activity-description, .intro, [data-region="intro"]');
      if (intro) {
        details.description = intro.innerHTML;
      }
      
      // Parse submission status table (student view)
      const statusTable = document.querySelector('.submissionstatustable, .generaltable');
      if (statusTable) {
        const rows = statusTable.querySelectorAll('tr');
        rows.forEach((row) => {
          const label = row.querySelector('td:first-child, th')?.textContent?.trim().toLowerCase();
          const value = row.querySelector('td:last-child')?.textContent?.trim();
          
          if (label?.includes('due date')) {
            details.dueDate = value;
          } else if (label?.includes('cut-off')) {
            details.cutoffDate = value;
          } else if (label?.includes('time remaining')) {
            details.timeRemaining = value;
          } else if (label?.includes('submission status')) {
            details.submissionStatus = value;
          } else if (label?.includes('grading status')) {
            details.gradingStatus = value;
          } else if (label?.includes('grade')) {
            // Try to extract max grade from "Grade" or "Grade out of X"
            const gradeMatch = value?.match(/(\d+)/);
            if (gradeMatch) {
              details.maxGrade = parseInt(gradeMatch[1]);
            }
          }
        });
      }
      
      // Parse grading summary (instructor view)
      const gradingSummary = document.querySelector('.submissionsummarytable, .gradingsummarytable');
      if (gradingSummary) {
        const rows = gradingSummary.querySelectorAll('tr');
        rows.forEach((row) => {
          const label = row.querySelector('td:first-child, th')?.textContent?.trim().toLowerCase();
          const value = row.querySelector('td:last-child')?.textContent?.trim();
          
          if (label?.includes('participants')) {
            details.participants = parseInt(value) || null;
          } else if (label?.includes('submitted')) {
            details.submitted = parseInt(value) || null;
          } else if (label?.includes('needs grading')) {
            details.needsGrading = parseInt(value) || null;
          } else if (label?.includes('due date')) {
            details.dueDate = value;
          }
        });
      }
      
      // Try to get max grade from grade display
      const gradeInfo = document.querySelector('.gradeinfo, .grade');
      if (gradeInfo) {
        const gradeMatch = gradeInfo.textContent.match(/out of (\d+)/i);
        if (gradeMatch) {
          details.maxGrade = parseInt(gradeMatch[1]);
        }
      }
      
      return {
        success: true,
        data: details,
      };
    },
  });
  
  return { id, ...result[0].result };
}

async function handleExtractSubmissions(id, params, tab) {
  const { filter } = params;
  
  const result = await chrome.scripting.executeScript({
    target: { tabId: tab.id },
    func: (filterType) => {
      const submissions = [];
      
      // Parse grading table
      const rows = document.querySelectorAll('table tbody tr[data-userid], table tbody tr[class*="user"]');
      
      rows.forEach((row) => {
        const userId = row.getAttribute('data-userid') || row.querySelector('[data-userid]')?.getAttribute('data-userid');
        const nameEl = row.querySelector('.fullname a, td.cell.c2 a, .userfullname');
        const statusEl = row.querySelector('.submissionstatussubmitted, .submissionstatusnotsubmitted, [class*="submissionstatus"]');
        const gradeEl = row.querySelector('.grade, td.cell.c4');
        const feedbackEl = row.querySelector('.feedbacktext');
        const submissionDateEl = row.querySelector('.timesubmitted, td.cell.c7');
        
        const submission = {
          userId: userId ? parseInt(userId) : null,
          name: nameEl ? nameEl.textContent.trim() : null,
          status: statusEl ? statusEl.textContent.trim() : null,
          grade: gradeEl ? gradeEl.textContent.trim() : null,
          feedback: feedbackEl ? feedbackEl.textContent.trim() : null,
          submissionDate: submissionDateEl ? submissionDateEl.textContent.trim() : null,
        };
        
        // Apply filter
        if (filterType === 'all') {
          submissions.push(submission);
        } else if (filterType === 'submitted' && submission.status?.toLowerCase().includes('submitted')) {
          submissions.push(submission);
        } else if (filterType === 'needs_grading' && !submission.grade) {
          submissions.push(submission);
        } else if (filterType === 'not_submitted' && !submission.status?.toLowerCase().includes('submitted')) {
          submissions.push(submission);
        }
      });
      
      return {
        success: true,
        data: {
          submissions,
          count: submissions.length,
          filter: filterType,
          url: window.location.href,
        },
      };
    },
    args: [filter || 'all'],
  });
  
  return { id, ...result[0].result };
}

// Extract all activities from a course page
async function handleExtractActivities(id, params, tab) {
  const namePattern = params.namePattern || null;
  const activityType = params.activityType || null;
  const sectionNum = params.sectionNum !== undefined ? params.sectionNum : null;
  
  const result = await chrome.scripting.executeScript({
    target: { tabId: tab.id },
    func: (namePattern, activityType, sectionNum) => {
      const activities = [];
      
      // Find all activity links on the course page
      const activitySelectors = [
        'li.activity a.aalink',
        'li.activity a.activityname',
        '.activity-item a.aalink',
        '.activity-item a.activityname',
        '[data-activityname] a',
      ];
      
      const allLinks = [];
      activitySelectors.forEach(sel => {
        document.querySelectorAll(sel).forEach(link => {
          if (!allLinks.includes(link)) {
            allLinks.push(link);
          }
        });
      });
      
      allLinks.forEach((link) => {
        const href = link.getAttribute('href') || '';
        const name = link.textContent?.trim() || '';
        
        // Extract activity type from URL (mod/assign/view.php -> assign)
        const typeMatch = href.match(/mod\/([^/]+)\//);
        const type = typeMatch ? typeMatch[1] : null;
        
        // Extract activity ID from URL
        const idMatch = href.match(/id=(\d+)/);
        const activityId = idMatch ? parseInt(idMatch[1]) : null;
        
        // Find the section this activity is in
        const section = link.closest('.section, [data-sectionid]');
        let sectionNumber = null;
        let sectionName = null;
        
        if (section) {
          const sectionIdMatch = section.id?.match(/section-(\d+)/) || 
                                  section.dataset?.sectionid?.match(/(\d+)/);
          sectionNumber = sectionIdMatch ? parseInt(sectionIdMatch[1]) : null;
          
          const sectionNameEl = section.querySelector('.sectionname, .section-title');
          sectionName = sectionNameEl ? sectionNameEl.textContent.trim() : null;
        }
        
        // Apply filters
        if (activityType && type !== activityType) {
          return;
        }
        
        if (namePattern && !name.toLowerCase().includes(namePattern.toLowerCase())) {
          return;
        }
        
        if (sectionNum !== null && sectionNumber !== sectionNum) {
          return;
        }
        
        if (activityId && type) {
          activities.push({
            id: activityId,
            name,
            type,
            url: href,
            sectionNumber,
            sectionName,
            editUrl: `/course/modedit.php?update=${activityId}`,
          });
        }
      });
      
      // Deduplicate by ID
      const uniqueActivities = [];
      const seen = new Set();
      activities.forEach(a => {
        if (!seen.has(a.id)) {
          seen.add(a.id);
          uniqueActivities.push(a);
        }
      });
      
      return {
        success: true,
        data: {
          activities: uniqueActivities,
          count: uniqueActivities.length,
          filters: { namePattern, activityType, sectionNum },
          url: window.location.href,
        },
      };
    },
    args: [namePattern, activityType, sectionNum],
  });
  
  return { id, ...result[0].result };
}

// Set a date field on an activity edit form
async function handleSetActivityDate(id, params, tab) {
  const { fieldName, date, enabled } = params;
  const targetDate = new Date(date);
  
  const result = await chrome.scripting.executeScript({
    target: { tabId: tab.id },
    func: (fieldName, targetDateISO, enabled) => {
      const targetDate = new Date(targetDateISO);
      
      // Common date field prefixes in Moodle
      const fieldPrefixes = [fieldName, `id_${fieldName}`];
      
      let foundFields = false;
      
      for (const prefix of fieldPrefixes) {
        // Try to find and enable the checkbox if it exists
        const enabledCheckbox = document.querySelector(`#${prefix}_enabled, #id_${prefix}_enabled, [name="${prefix}[enabled]"]`);
        if (enabledCheckbox) {
          if (enabled !== false && !enabledCheckbox.checked) {
            enabledCheckbox.click();
          } else if (enabled === false && enabledCheckbox.checked) {
            enabledCheckbox.click();
            return { success: true, message: `Disabled ${fieldName}` };
          }
        }
        
        // Find the date fields - try both select dropdowns and newer date inputs
        const dayField = document.querySelector(`#${prefix}_day, #id_${prefix}_day, [name="${prefix}[day]"]`);
        const monthField = document.querySelector(`#${prefix}_month, #id_${prefix}_month, [name="${prefix}[month]"]`);
        const yearField = document.querySelector(`#${prefix}_year, #id_${prefix}_year, [name="${prefix}[year]"]`);
        const hourField = document.querySelector(`#${prefix}_hour, #id_${prefix}_hour, [name="${prefix}[hour]"]`);
        const minuteField = document.querySelector(`#${prefix}_minute, #id_${prefix}_minute, [name="${prefix}[minute]"]`);
        
        if (dayField && monthField && yearField) {
          foundFields = true;
          
          // Set each field value
          const setFieldValue = (field, value) => {
            if (field.tagName === 'SELECT') {
              field.value = String(value);
            } else {
              field.value = String(value);
            }
            field.dispatchEvent(new Event('change', { bubbles: true }));
          };
          
          setFieldValue(dayField, targetDate.getDate());
          setFieldValue(monthField, targetDate.getMonth() + 1);
          setFieldValue(yearField, targetDate.getFullYear());
          
          if (hourField) {
            setFieldValue(hourField, targetDate.getHours());
          }
          if (minuteField) {
            setFieldValue(minuteField, targetDate.getMinutes());
          }
          
          return {
            success: true,
            message: `Set ${fieldName} to ${targetDate.toISOString()}`,
            fieldName,
            date: targetDate.toISOString(),
          };
        }
      }
      
      if (!foundFields) {
        return {
          success: false,
          error: `Date field '${fieldName}' not found on this form. Available fields might include: duedate, timeopen, timeclose, cutoffdate, allowsubmissionsfromdate`,
        };
      }
    },
    args: [fieldName, targetDate.toISOString(), enabled],
  });
  
  return { id, ...result[0].result };
}

// Extract all discussions from a forum page
async function handleExtractForumDiscussions(id, params, tab) {
  const result = await chrome.scripting.executeScript({
    target: { tabId: tab.id },
    func: () => {
      const discussions = [];
      
      // Find all discussion rows in the forum
      const discussionRows = document.querySelectorAll('tr.discussion, .discussion-list-item, [data-region="discussion-list"] tr');
      
      discussionRows.forEach((row) => {
        // Try to get discussion link and title
        const titleLink = row.querySelector('a.w-100.h-100, .discussion-name a, td.topic a, .discussionname a');
        if (!titleLink) return;
        
        const title = titleLink.textContent.trim();
        const href = titleLink.href;
        const discussionIdMatch = href.match(/d=(\d+)/);
        const discussionId = discussionIdMatch ? parseInt(discussionIdMatch[1]) : null;
        
        // Get author (Started by)
        const authorCell = row.querySelector('td.author, .discussion-started-by, .author-info');
        let author = null;
        if (authorCell) {
          const authorLink = authorCell.querySelector('a');
          author = authorLink ? authorLink.textContent.trim() : authorCell.textContent.trim();
        }
        
        // Get reply count
        const repliesCell = row.querySelector('td.replies, .discussion-replies, [data-region="replies"]');
        let replyCount = 0;
        if (repliesCell) {
          const replyText = repliesCell.textContent.trim();
          const replyMatch = replyText.match(/(\d+)/);
          replyCount = replyMatch ? parseInt(replyMatch[1]) : 0;
        }
        
        // Get last post info
        const lastPostCell = row.querySelector('td.lastpost, .discussion-last-post');
        let lastPostAuthor = null;
        let lastPostDate = null;
        if (lastPostCell) {
          const lastPostLink = lastPostCell.querySelector('a');
          if (lastPostLink) {
            lastPostAuthor = lastPostLink.textContent.trim();
          }
          const dateText = lastPostCell.textContent;
          const dateMatch = dateText.match(/(\d{1,2}\s+\w+\s+\d{4})/);
          lastPostDate = dateMatch ? dateMatch[1] : null;
        }
        
        if (discussionId && title) {
          discussions.push({
            id: discussionId,
            title,
            author,
            replyCount,
            lastPostAuthor,
            lastPostDate,
            url: href,
          });
        }
      });
      
      // Alternative: try the table format
      if (discussions.length === 0) {
        const tableRows = document.querySelectorAll('table.forumheaderlist tbody tr, .generaltable tbody tr');
        tableRows.forEach((row) => {
          const cells = row.querySelectorAll('td');
          if (cells.length < 3) return;
          
          const titleCell = cells[0];
          const titleLink = titleCell.querySelector('a');
          if (!titleLink) return;
          
          const title = titleLink.textContent.trim();
          const href = titleLink.href;
          const discussionIdMatch = href.match(/d=(\d+)/);
          const discussionId = discussionIdMatch ? parseInt(discussionIdMatch[1]) : null;
          
          // Author is typically in cell 1 or has class 'author'
          let author = null;
          const authorCell = row.querySelector('td.author') || cells[1];
          if (authorCell) {
            const authorLink = authorCell.querySelector('a');
            author = authorLink ? authorLink.textContent.trim() : authorCell.textContent.trim().split('\n')[0].trim();
          }
          
          // Replies count
          let replyCount = 0;
          const repliesCell = row.querySelector('td.replies');
          if (repliesCell) {
            replyCount = parseInt(repliesCell.textContent.trim()) || 0;
          } else if (cells.length > 3) {
            replyCount = parseInt(cells[cells.length - 2]?.textContent.trim()) || 0;
          }
          
          if (discussionId && title) {
            discussions.push({
              id: discussionId,
              title,
              author,
              replyCount,
              url: href,
            });
          }
        });
      }
      
      return {
        success: true,
        data: {
          discussions,
          count: discussions.length,
          url: window.location.href,
        },
      };
    },
  });
  
  return { id, ...result[0].result };
}

// Extract replies from a single discussion page
async function handleExtractDiscussionReplies(id, params, tab) {
  const result = await chrome.scripting.executeScript({
    target: { tabId: tab.id },
    func: () => {
      const posts = [];
      
      // Find all posts in the discussion
      const postElements = document.querySelectorAll('.forumpost, [data-region="post"], .forum-post');
      
      postElements.forEach((post, index) => {
        // Get author
        const authorEl = post.querySelector('.author a, .d-flex.flex-column a[href*="user/view"], .posting-author a');
        const author = authorEl ? authorEl.textContent.trim() : null;
        
        // Get date
        const dateEl = post.querySelector('.author time, .post-date, .posting-date time');
        const date = dateEl ? dateEl.textContent.trim() : null;
        
        // Get post ID
        const postId = post.id || post.dataset.postId || `post-${index}`;
        
        // Check if this is the original post (first one) or a reply
        const isOriginal = index === 0 || post.classList.contains('firstpost');
        
        // Get parent info (which post this is replying to)
        const parentLink = post.querySelector('a[href*="parent="]');
        let parentId = null;
        if (parentLink) {
          const parentMatch = parentLink.href.match(/parent=(\d+)/);
          parentId = parentMatch ? parentMatch[1] : null;
        }
        
        if (author) {
          posts.push({
            postId,
            author,
            date,
            isOriginal,
            parentId,
          });
        }
      });
      
      // Get discussion info
      const discussionTitle = document.querySelector('.discussionname, h2.discussion-title, .subject')?.textContent.trim();
      const discussionIdMatch = window.location.href.match(/d=(\d+)/);
      const discussionId = discussionIdMatch ? parseInt(discussionIdMatch[1]) : null;
      
      // The first post author is the discussion starter
      const discussionStarter = posts.length > 0 ? posts[0].author : null;
      
      // Count replies (all posts except the first one)
      const replies = posts.slice(1);
      
      // Count unique repliers (excluding discussion starter if they also replied)
      const replierCounts = {};
      replies.forEach((reply) => {
        if (reply.author && reply.author !== discussionStarter) {
          replierCounts[reply.author] = (replierCounts[reply.author] || 0) + 1;
        }
      });
      
      return {
        success: true,
        data: {
          discussionId,
          discussionTitle,
          discussionStarter,
          totalPosts: posts.length,
          replyCount: replies.length,
          posts,
          uniqueRepliers: Object.keys(replierCounts),
          replierCounts,
          url: window.location.href,
        },
      };
    },
  });
  
  return { id, ...result[0].result };
}

// Ping server periodically to keep connection alive
setInterval(() => {
  if (ws && ws.readyState === WebSocket.OPEN) {
    ws.send(JSON.stringify({ type: 'ping' }));
  }
}, 30000);

// Initialize on extension load
chrome.runtime.onInstalled.addListener(() => {
  console.log('[MoodleMCP] Extension installed');
  connectWebSocket();
});

// Try to connect when extension starts
connectWebSocket();

// Listen for messages from popup
chrome.runtime.onMessage.addListener((message, sender, sendResponse) => {
  if (message.action === 'getStatus') {
    getTokens().then(({ user }) => {
      sendResponse({
        loggedIn: !!user,
        user,
        wsConnected: ws && ws.readyState === WebSocket.OPEN,
      });
    });
    return true;
  }
  
  if (message.action === 'login') {
    // Open login popup
    chrome.windows.create({
      url: `${SERVER_URL}/auth/google?extension=true`,
      type: 'popup',
      width: 500,
      height: 600,
    });
    sendResponse({ success: true });
    return true;
  }
  
  if (message.action === 'logout') {
    clearTokens().then(() => {
      if (ws) ws.close();
      sendResponse({ success: true });
    });
    return true;
  }
  
  if (message.action === 'saveTokens') {
    saveTokens(message.accessToken, message.refreshToken, message.user).then(() => {
      connectWebSocket();
      sendResponse({ success: true });
    });
    return true;
  }
  
  if (message.action === 'reconnect') {
    connectWebSocket();
    sendResponse({ success: true });
    return true;
  }
  
  if (message.action === 'devLogin') {
    // Dev login with provided token
    console.log('[MoodleMCP] dev login with token:', message.token);
    saveTokens(message.token, null, message.user).then(() => {
      connectWebSocket();
      sendResponse({ success: true });
    });
    return true;
  }
});
