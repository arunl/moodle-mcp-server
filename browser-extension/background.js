// Background service worker
// Handles cookie extraction, session storage, and MCP server communication
// Also handles two-way WebSocket communication with MCP server

// Import WebSocket client
importScripts('websocket-client.js');

// Debug log storage
const MAX_LOG_ENTRIES = 50;

// Cookie names to look for (in order of preference)
const MOODLE_COOKIE_NAMES = ['MoodleSessionprod', 'MoodleSession', 'MoodleSessiondev', 'MoodleSessiontest'];

// MCP Server HTTP API (for session sync)
const MCP_SERVER_URL = 'http://127.0.0.1:3847';
let mcpServerConnected = false;

async function debugLog(message, data = null) {
  const timestamp = new Date().toISOString();
  const logEntry = { timestamp, message, data };
  
  console.log(`[MoodleMCP ${timestamp}]`, message, data || '');
  
  try {
    const result = await chrome.storage.local.get(['debugLogs']);
    const logs = result.debugLogs || [];
    logs.unshift(logEntry);
    
    // Keep only last N entries
    while (logs.length > MAX_LOG_ENTRIES) {
      logs.pop();
    }
    
    await chrome.storage.local.set({ debugLogs: logs });
  } catch (e) {
    console.error('Failed to write debug log:', e);
  }
}

// Store session data
let sessionData = {
  moodleUrl: null,
  sessionCookie: null,
  sesskey: null,
  timestamp: null,
  isValid: false
};

// Initialize on service worker start
debugLog('Service worker started');

// Get MoodleSession cookie - try multiple cookie names
async function getMoodleCookie(url) {
  try {
    debugLog('Getting cookie for URL', url);
    
    const domain = new URL(url).hostname;
    
    // Get all cookies for this domain
    const allCookies = await chrome.cookies.getAll({ domain: domain });
    debugLog('All cookies found', allCookies.map(c => c.name));
    
    // Look for any Moodle session cookie
    for (const cookieName of MOODLE_COOKIE_NAMES) {
      const cookie = allCookies.find(c => c.name === cookieName);
      if (cookie) {
        debugLog('Found cookie', { name: cookieName, valuePreview: cookie.value.substring(0, 10) + '...' });
        return cookie.value;
      }
    }
    
    // Also look for any cookie that starts with "MoodleSession"
    const anyMoodleCookie = allCookies.find(c => c.name.startsWith('MoodleSession'));
    if (anyMoodleCookie) {
      debugLog('Found MoodleSession* cookie', { name: anyMoodleCookie.name, valuePreview: anyMoodleCookie.value.substring(0, 10) + '...' });
      return anyMoodleCookie.value;
    }
    
    debugLog('No Moodle session cookie found');
    return null;
  } catch (e) {
    debugLog('Error getting cookie', { error: e.message });
    return null;
  }
}

// Send credentials to MCP server
async function syncToMcpServer(sessionInfo) {
  try {
    debugLog('Syncing to MCP server...', { url: MCP_SERVER_URL });
    
    const response = await fetch(`${MCP_SERVER_URL}/session`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        moodleUrl: sessionInfo.moodleUrl,
        sessionCookie: sessionInfo.sessionCookie,
        sesskey: sessionInfo.sesskey,
        timestamp: sessionInfo.timestamp
      })
    });
    
    if (response.ok) {
      const result = await response.json();
      mcpServerConnected = true;
      debugLog('MCP server sync successful', result);
      
      // Update badge to show connected
      await chrome.action.setBadgeText({ text: '⚡' });
      await chrome.action.setBadgeBackgroundColor({ color: '#2196F3' });
      
      return true;
    } else {
      const error = await response.text();
      debugLog('MCP server sync failed', { status: response.status, error });
      mcpServerConnected = false;
      return false;
    }
  } catch (e) {
    debugLog('MCP server not reachable', { error: e.message });
    mcpServerConnected = false;
    
    // Show green badge if we have valid session but MCP not connected
    if (sessionData.isValid) {
      await chrome.action.setBadgeText({ text: '✓' });
      await chrome.action.setBadgeBackgroundColor({ color: '#4CAF50' });
    }
    
    return false;
  }
}

// Check MCP server status
async function checkMcpServerStatus() {
  try {
    const response = await fetch(`${MCP_SERVER_URL}/status`);
    if (response.ok) {
      const status = await response.json();
      mcpServerConnected = true;
      debugLog('MCP server status', status);
      return status;
    }
  } catch (e) {
    mcpServerConnected = false;
    debugLog('MCP server status check failed', { error: e.message });
  }
  return null;
}

// Update session data
async function updateSessionData(data) {
  debugLog('updateSessionData called', { url: data.moodleUrl, sesskey: data.sesskey });
  
  const sessionCookie = await getMoodleCookie(data.moodleUrl);
  
  if (sessionCookie && data.sesskey) {
    sessionData = {
      moodleUrl: data.moodleUrl,
      sessionCookie: sessionCookie,
      sesskey: data.sesskey,
      timestamp: data.timestamp,
      isValid: true
    };
    
    // Store in chrome.storage for persistence
    await chrome.storage.local.set({ moodleSession: sessionData });
    debugLog('Session saved successfully', { 
      url: data.moodleUrl, 
      sesskey: data.sesskey,
      cookieLength: sessionCookie.length 
    });
    
    // Sync to MCP server (don't wait for it)
    syncToMcpServer(sessionData);
    
    // Update badge to show we have a valid session
    try {
      await chrome.action.setBadgeText({ text: '✓' });
      await chrome.action.setBadgeBackgroundColor({ color: '#4CAF50' });
      debugLog('Badge updated');
    } catch (e) {
      debugLog('Badge update failed', e.message);
    }
  } else {
    debugLog('Session update failed - missing data', { 
      hasCookie: !!sessionCookie, 
      hasSesskey: !!data.sesskey 
    });
  }
}

// Listen for messages from content script and popup
chrome.runtime.onMessage.addListener((message, sender, sendResponse) => {
  debugLog('Message received', { type: message.type, sender: sender.tab?.url });
  
  if (message.type === 'SESSION_UPDATE') {
    updateSessionData(message.data)
      .then(() => sendResponse({ success: true }))
      .catch(e => {
        debugLog('SESSION_UPDATE error', e.message);
        sendResponse({ success: false, error: e.message });
      });
    return true; // Keep channel open for async response
  } else if (message.type === 'GET_SESSION') {
    // Load from storage first in case service worker restarted
    chrome.storage.local.get(['moodleSession'], (result) => {
      if (result.moodleSession) {
        sessionData = result.moodleSession;
      }
      debugLog('GET_SESSION response', { isValid: sessionData.isValid });
      sendResponse({ ...sessionData, mcpConnected: mcpServerConnected });
    });
    return true; // Keep channel open for async response
  } else if (message.type === 'GET_MCP_STATUS') {
    checkMcpServerStatus()
      .then(status => sendResponse({ connected: mcpServerConnected, status }))
      .catch(e => sendResponse({ connected: false, error: e.message }));
    return true;
  } else if (message.type === 'SYNC_TO_MCP') {
    if (sessionData.isValid) {
      syncToMcpServer(sessionData)
        .then(success => sendResponse({ success }))
        .catch(e => sendResponse({ success: false, error: e.message }));
    } else {
      sendResponse({ success: false, error: 'No valid session to sync' });
    }
    return true;
  } else if (message.type === 'GET_DEBUG_LOGS') {
    chrome.storage.local.get(['debugLogs'], (result) => {
      sendResponse(result.debugLogs || []);
    });
    return true;
  } else if (message.type === 'CLEAR_DEBUG_LOGS') {
    chrome.storage.local.set({ debugLogs: [] }, () => {
      sendResponse({ success: true });
    });
    return true;
  } else if (message.type === 'GET_WS_STATUS') {
    // Get WebSocket connection status
    const status = typeof getWsStatus === 'function' ? getWsStatus() : { connected: false };
    sendResponse(status);
    return true;
  } else if (message.type === 'RECONNECT_WS') {
    // Manually trigger WebSocket reconnection
    if (typeof connectWebSocket === 'function') {
      connectWebSocket();
      sendResponse({ success: true });
    } else {
      sendResponse({ success: false, error: 'WebSocket client not loaded' });
    }
    return true;
  }
});

// Listen for cookie changes - watch for any MoodleSession* cookie
chrome.cookies.onChanged.addListener(async (changeInfo) => {
  if (changeInfo.cookie.name.startsWith('MoodleSession')) {
    debugLog('Moodle cookie changed', { 
      name: changeInfo.cookie.name,
      removed: changeInfo.removed, 
      cause: changeInfo.cause,
      domain: changeInfo.cookie.domain
    });
    
    if (changeInfo.removed) {
      // Cookie was removed (logout)
      sessionData.isValid = false;
      sessionData.sessionCookie = null;
      await chrome.storage.local.set({ moodleSession: sessionData });
      chrome.action.setBadgeText({ text: '' });
      debugLog('Session invalidated - cookie removed');
    } else {
      // Cookie was updated - also update our stored session
      sessionData.sessionCookie = changeInfo.cookie.value;
      sessionData.timestamp = Date.now();
      if (sessionData.sesskey) {
        sessionData.isValid = true;
      }
      await chrome.storage.local.set({ moodleSession: sessionData });
      debugLog('Session cookie updated from change listener');
    }
  }
});

// Load stored session on startup and sync to MCP
chrome.storage.local.get(['moodleSession'], async (result) => {
  debugLog('Loading stored session', result.moodleSession ? 'Found' : 'Not found');
  if (result.moodleSession) {
    sessionData = result.moodleSession;
    if (sessionData.isValid) {
      chrome.action.setBadgeText({ text: '✓' });
      chrome.action.setBadgeBackgroundColor({ color: '#4CAF50' });
      debugLog('Restored valid session from storage');
      
      // Try to sync to MCP server on startup
      await syncToMcpServer(sessionData);
    }
  }
});

// Periodic sync check (every 5 minutes)
setInterval(async () => {
  if (sessionData.isValid) {
    // Refresh the session cookie in case it changed
    const freshCookie = await getMoodleCookie(sessionData.moodleUrl);
    if (freshCookie && freshCookie !== sessionData.sessionCookie) {
      sessionData.sessionCookie = freshCookie;
      sessionData.timestamp = Date.now();
      await chrome.storage.local.set({ moodleSession: sessionData });
      debugLog('Session cookie refreshed');
    }
    
    // Sync to MCP server
    await syncToMcpServer(sessionData);
  }
}, 5 * 60 * 1000); // 5 minutes

debugLog('Service worker initialization complete');
