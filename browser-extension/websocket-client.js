/**
 * WebSocket Client for MCP Server Communication
 * 
 * Connects to the MCP server and handles browser commands
 * (navigate, click, extract, etc.)
 */

const WS_URL = 'ws://127.0.0.1:3848';
const RECONNECT_INTERVAL = 5000; // 5 seconds

let ws = null;
let isConnected = false;
let reconnectTimer = null;

// Debug logging
function wsLog(message, data = null) {
  const timestamp = new Date().toISOString();
  console.log(`[WS ${timestamp}]`, message, data || '');
  
  // Also log to extension's debug logs
  if (typeof debugLog === 'function') {
    debugLog(`[WS] ${message}`, data);
  }
}

/**
 * Connect to the MCP server WebSocket
 */
function connectWebSocket() {
  if (ws && (ws.readyState === WebSocket.CONNECTING || ws.readyState === WebSocket.OPEN)) {
    return;
  }

  wsLog('Connecting to MCP server...', WS_URL);

  try {
    ws = new WebSocket(WS_URL);

    ws.onopen = () => {
      isConnected = true;
      wsLog('Connected to MCP server');
      
      // Update badge to show connected
      chrome.action.setBadgeText({ text: '⚡' });
      chrome.action.setBadgeBackgroundColor({ color: '#2196F3' });
      
      // Clear reconnect timer
      if (reconnectTimer) {
        clearInterval(reconnectTimer);
        reconnectTimer = null;
      }
    };

    ws.onmessage = async (event) => {
      try {
        const message = JSON.parse(event.data);
        wsLog('Received message', { action: message.action, id: message.id });
        
        if (message.type === 'connected') {
          wsLog('Server acknowledged connection');
          return;
        }
        
        // Handle command from MCP server
        if (message.action) {
          const response = await handleCommand(message);
          ws.send(JSON.stringify(response));
        }
      } catch (e) {
        wsLog('Error processing message', { error: e.message });
      }
    };

    ws.onclose = () => {
      isConnected = false;
      wsLog('Disconnected from MCP server');
      
      // Update badge
      if (sessionData && sessionData.isValid) {
        chrome.action.setBadgeText({ text: '✓' });
        chrome.action.setBadgeBackgroundColor({ color: '#4CAF50' });
      } else {
        chrome.action.setBadgeText({ text: '' });
      }
      
      // Schedule reconnect
      scheduleReconnect();
    };

    ws.onerror = (error) => {
      wsLog('WebSocket error', { error: error.message || 'Unknown error' });
      isConnected = false;
    };
  } catch (e) {
    wsLog('Failed to create WebSocket', { error: e.message });
    scheduleReconnect();
  }
}

/**
 * Schedule a reconnection attempt
 */
function scheduleReconnect() {
  if (reconnectTimer) return;
  
  reconnectTimer = setInterval(() => {
    if (!isConnected) {
      wsLog('Attempting to reconnect...');
      connectWebSocket();
    }
  }, RECONNECT_INTERVAL);
}

/**
 * Handle a command from the MCP server
 */
async function handleCommand(command) {
  const { id, action, params } = command;
  
  try {
    switch (action) {
      case 'navigate':
        return await handleNavigate(id, params);
      
      case 'click':
        return await handleClick(id, params);
      
      case 'type':
        return await handleType(id, params);
      
      case 'extract':
        return await handleExtract(id, params);
      
      case 'get_element':
        return await handleGetElement(id, params);
      
      case 'screenshot':
        return await handleScreenshot(id, params);
      
      case 'wait':
        return await handleWait(id, params);
      
      case 'evaluate':
        return await handleEvaluate(id, params);
      
      default:
        return { id, success: false, error: `Unknown action: ${action}` };
    }
  } catch (e) {
    return { id, success: false, error: e.message };
  }
}

/**
 * Navigate to a URL
 */
async function handleNavigate(id, params) {
  const { url } = params;
  
  // Get the active tab or create a new one
  const tabs = await chrome.tabs.query({ active: true, currentWindow: true });
  let tab = tabs[0];
  
  if (!tab) {
    // Create a new tab if none exists
    tab = await chrome.tabs.create({ url });
  } else {
    // Navigate existing tab
    await chrome.tabs.update(tab.id, { url });
  }
  
  // Wait for the page to load
  return new Promise((resolve) => {
    const listener = (tabId, changeInfo) => {
      if (tabId === tab.id && changeInfo.status === 'complete') {
        chrome.tabs.onUpdated.removeListener(listener);
        
        // Give the page a moment to fully render
        setTimeout(async () => {
          // Extract page data after navigation
          const pageData = await extractPageData(tab.id);
          resolve({ id, success: true, data: pageData });
        }, 500);
      }
    };
    chrome.tabs.onUpdated.addListener(listener);
    
    // Timeout after 30 seconds
    setTimeout(() => {
      chrome.tabs.onUpdated.removeListener(listener);
      resolve({ id, success: false, error: 'Navigation timeout' });
    }, 30000);
  });
}

/**
 * Click an element
 */
async function handleClick(id, params) {
  const { selector } = params;
  
  const tabs = await chrome.tabs.query({ active: true, currentWindow: true });
  if (!tabs[0]) {
    return { id, success: false, error: 'No active tab' };
  }
  
  const result = await chrome.scripting.executeScript({
    target: { tabId: tabs[0].id },
    func: (sel) => {
      const element = document.querySelector(sel);
      if (element) {
        element.click();
        return { clicked: true, selector: sel };
      }
      return { clicked: false, error: `Element not found: ${sel}` };
    },
    args: [selector]
  });
  
  if (result[0]?.result?.clicked) {
    // Wait a bit for any page changes
    await new Promise(r => setTimeout(r, 500));
    const pageData = await extractPageData(tabs[0].id);
    return { id, success: true, data: pageData };
  }
  
  return { id, success: false, error: result[0]?.result?.error || 'Click failed' };
}

/**
 * Type text into an element
 */
async function handleType(id, params) {
  const { selector, text } = params;
  
  const tabs = await chrome.tabs.query({ active: true, currentWindow: true });
  if (!tabs[0]) {
    return { id, success: false, error: 'No active tab' };
  }
  
  const result = await chrome.scripting.executeScript({
    target: { tabId: tabs[0].id },
    func: (sel, txt) => {
      const element = document.querySelector(sel);
      if (element) {
        element.focus();
        element.value = txt;
        element.dispatchEvent(new Event('input', { bubbles: true }));
        element.dispatchEvent(new Event('change', { bubbles: true }));
        return { typed: true };
      }
      return { typed: false, error: `Element not found: ${sel}` };
    },
    args: [selector, text]
  });
  
  return { 
    id, 
    success: result[0]?.result?.typed || false,
    error: result[0]?.result?.error
  };
}

/**
 * Extract page data
 */
async function handleExtract(id, params) {
  const { includeHtml, includeText, selectors } = params;
  
  const tabs = await chrome.tabs.query({ active: true, currentWindow: true });
  if (!tabs[0]) {
    return { id, success: false, error: 'No active tab' };
  }
  
  const pageData = await extractPageData(tabs[0].id, { includeHtml, includeText, selectors });
  return { id, success: true, data: pageData };
}

/**
 * Get information about elements matching a selector
 */
async function handleGetElement(id, params) {
  const { selector } = params;
  
  const tabs = await chrome.tabs.query({ active: true, currentWindow: true });
  if (!tabs[0]) {
    return { id, success: false, error: 'No active tab' };
  }
  
  const result = await chrome.scripting.executeScript({
    target: { tabId: tabs[0].id },
    func: (sel) => {
      const elements = document.querySelectorAll(sel);
      return Array.from(elements).map(el => ({
        tag: el.tagName.toLowerCase(),
        text: el.textContent?.trim().substring(0, 200),
        href: el.href,
        id: el.id,
        classes: Array.from(el.classList),
        value: el.value,
      }));
    },
    args: [selector]
  });
  
  return { id, success: true, data: { elements: result[0]?.result || [] } };
}

/**
 * Take a screenshot
 */
async function handleScreenshot(id, params) {
  try {
    const dataUrl = await chrome.tabs.captureVisibleTab(null, { format: 'png' });
    return { id, success: true, data: { screenshot: dataUrl } };
  } catch (e) {
    return { id, success: false, error: e.message };
  }
}

/**
 * Wait for an element or time
 */
async function handleWait(id, params) {
  const { selector, timeout = 5000 } = params;
  
  if (!selector) {
    // Just wait for the specified time
    await new Promise(r => setTimeout(r, timeout));
    return { id, success: true };
  }
  
  const tabs = await chrome.tabs.query({ active: true, currentWindow: true });
  if (!tabs[0]) {
    return { id, success: false, error: 'No active tab' };
  }
  
  const startTime = Date.now();
  
  while (Date.now() - startTime < timeout) {
    const result = await chrome.scripting.executeScript({
      target: { tabId: tabs[0].id },
      func: (sel) => !!document.querySelector(sel),
      args: [selector]
    });
    
    if (result[0]?.result) {
      return { id, success: true };
    }
    
    await new Promise(r => setTimeout(r, 100));
  }
  
  return { id, success: false, error: `Element not found within ${timeout}ms: ${selector}` };
}

/**
 * Evaluate arbitrary JavaScript in the page context
 * This is useful for complex DOM manipulations like setting Moodle editor content
 */
async function handleEvaluate(id, params) {
  const { script } = params;
  
  if (!script) {
    return { id, success: false, error: 'No script provided' };
  }
  
  const tabs = await chrome.tabs.query({ active: true, currentWindow: true });
  if (!tabs[0]) {
    return { id, success: false, error: 'No active tab' };
  }
  
  try {
    const result = await chrome.scripting.executeScript({
      target: { tabId: tabs[0].id },
      func: (scriptCode) => {
        try {
          // Execute the script and return the result
          const fn = new Function(scriptCode);
          return fn();
        } catch (e) {
          return { error: e.message };
        }
      },
      args: [script]
    });
    
    const evalResult = result[0]?.result;
    
    if (evalResult && evalResult.error) {
      return { id, success: false, error: evalResult.error };
    }
    
    return { id, success: true, data: evalResult };
  } catch (e) {
    return { id, success: false, error: e.message };
  }
}

/**
 * Extract comprehensive page data
 */
async function extractPageData(tabId, options = {}) {
  const { includeHtml = false, includeText = true, selectors = [] } = options;
  
  const result = await chrome.scripting.executeScript({
    target: { tabId },
    func: (opts) => {
      const data = {
        url: window.location.href,
        title: document.title,
      };
      
      if (opts.includeText) {
        data.text = document.body?.innerText?.substring(0, 50000) || '';
      }
      
      if (opts.includeHtml) {
        data.html = document.body?.innerHTML?.substring(0, 100000) || '';
      }
      
      // Extract common elements
      data.links = Array.from(document.querySelectorAll('a[href]')).slice(0, 100).map(a => ({
        text: a.textContent?.trim().substring(0, 100),
        href: a.href,
      }));
      
      data.headings = Array.from(document.querySelectorAll('h1, h2, h3, h4')).slice(0, 50).map(h => ({
        level: h.tagName.toLowerCase(),
        text: h.textContent?.trim().substring(0, 200),
      }));
      
      data.forms = Array.from(document.querySelectorAll('form')).slice(0, 10).map(f => ({
        action: f.action,
        method: f.method,
        inputs: Array.from(f.querySelectorAll('input, select, textarea')).map(i => ({
          name: i.name,
          type: i.type,
          value: i.type !== 'password' ? i.value : '***',
        })),
      }));
      
      // Extract Moodle-specific data
      data.moodle = {
        sesskey: window.M?.cfg?.sesskey,
        courseId: window.M?.cfg?.courseId,
        userId: window.M?.cfg?.userId,
      };
      
      // Extract specific selectors if provided
      if (opts.selectors && opts.selectors.length > 0) {
        data.selected = {};
        for (const sel of opts.selectors) {
          const elements = document.querySelectorAll(sel);
          data.selected[sel] = Array.from(elements).map(el => ({
            tag: el.tagName.toLowerCase(),
            text: el.textContent?.trim().substring(0, 500),
            html: el.innerHTML?.substring(0, 1000),
          }));
        }
      }
      
      return data;
    },
    args: [{ includeHtml, includeText, selectors }]
  });
  
  return result[0]?.result || { error: 'Failed to extract page data' };
}

/**
 * Get WebSocket connection status
 */
function getWsStatus() {
  return {
    connected: isConnected,
    url: WS_URL,
  };
}

// Export functions for use in background.js
if (typeof window !== 'undefined') {
  window.connectWebSocket = connectWebSocket;
  window.getWsStatus = getWsStatus;
}

// Start connection when script loads
connectWebSocket();
