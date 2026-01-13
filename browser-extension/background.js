// Background service worker
// Handles cookie extraction and session storage

// Store session data
let sessionData = {
  moodleUrl: null,
  sessionCookie: null,
  sesskey: null,
  timestamp: null,
  isValid: false
};

// Get MoodleSession cookie
async function getMoodleCookie(url) {
  try {
    const cookie = await chrome.cookies.get({
      url: url,
      name: 'MoodleSession'
    });
    return cookie ? cookie.value : null;
  } catch (e) {
    console.error('Error getting cookie:', e);
    return null;
  }
}

// Update session data
async function updateSessionData(data) {
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
    
    // Update badge to show we have a valid session
    chrome.action.setBadgeText({ text: '✓' });
    chrome.action.setBadgeBackgroundColor({ color: '#4CAF50' });
    
    console.log('Moodle session updated:', {
      url: data.moodleUrl,
      sesskey: data.sesskey,
      cookieLength: sessionCookie.length
    });
  }
}

// Listen for messages from content script
chrome.runtime.onMessage.addListener((message, sender, sendResponse) => {
  if (message.type === 'SESSION_UPDATE') {
    updateSessionData(message.data);
    sendResponse({ success: true });
  } else if (message.type === 'GET_SESSION') {
    sendResponse(sessionData);
  }
  return true;
});

// Listen for cookie changes
chrome.cookies.onChanged.addListener(async (changeInfo) => {
  if (changeInfo.cookie.name === 'MoodleSession') {
    if (changeInfo.removed) {
      // Cookie was removed (logout)
      sessionData.isValid = false;
      sessionData.sessionCookie = null;
      await chrome.storage.local.set({ moodleSession: sessionData });
      chrome.action.setBadgeText({ text: '' });
    } else {
      // Cookie was updated
      sessionData.sessionCookie = changeInfo.cookie.value;
      sessionData.timestamp = Date.now();
      await chrome.storage.local.set({ moodleSession: sessionData });
    }
  }
});

// Load stored session on startup
chrome.storage.local.get(['moodleSession'], (result) => {
  if (result.moodleSession) {
    sessionData = result.moodleSession;
    if (sessionData.isValid) {
      chrome.action.setBadgeText({ text: '✓' });
      chrome.action.setBadgeBackgroundColor({ color: '#4CAF50' });
    }
  }
});
