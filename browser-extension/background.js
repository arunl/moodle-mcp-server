// Background service worker for Moodle MCP Bridge (Hosted Version)
// VERSION 2.1.0 - If you see this in console, the correct extension is loaded!
console.log('[MoodleMCP v2.1.0] Background script loaded - connecting to localhost:8080');

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
  
  const result = await chrome.scripting.executeScript({
    target: { tabId: tab.id },
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
