// Popup script for Moodle MCP Bridge
import { SERVERS, DEFAULT_SERVER, getSelectedServer, setSelectedServer, getServerUrl } from './config.js';

// DOM elements
const loadingEl = document.getElementById('loading');
const loggedOutEl = document.getElementById('logged-out');
const loggedInEl = document.getElementById('logged-in');

const loginBtn = document.getElementById('login-btn');
const devLoginBtn = document.getElementById('dev-login-btn');
const logoutBtn = document.getElementById('logout-btn');
const reconnectBtn = document.getElementById('reconnect-btn');
const dashboardBtn = document.getElementById('dashboard-btn');

const userPicture = document.getElementById('user-picture');
const userName = document.getElementById('user-name');
const userEmail = document.getElementById('user-email');
const serverStatus = document.getElementById('server-status');
const wsStatus = document.getElementById('ws-status');

const serverSelect = document.getElementById('server-select');
const serverIndicator = document.getElementById('server-indicator');
const serverNameEl = document.getElementById('server-name');

// Current server URL (will be set asynchronously)
let currentServerUrl = null;

// Initialize server selector
async function initServerSelector() {
  // Populate dropdown
  const result = await chrome.storage.local.get(['selectedServer']);
  const selectedKey = result.selectedServer || DEFAULT_SERVER;
  
  serverSelect.innerHTML = '';
  for (const [key, server] of Object.entries(SERVERS)) {
    const option = document.createElement('option');
    option.value = key;
    option.textContent = server.name;
    if (key === selectedKey) {
      option.selected = true;
    }
    serverSelect.appendChild(option);
  }
  
  // Update login buttons based on server capabilities
  await updateLoginButtons(selectedKey);
  
  // Set current server URL
  currentServerUrl = SERVERS[selectedKey].url;
  
  return selectedKey;
}

// Update login buttons based on selected server and its capabilities
async function updateLoginButtons(serverKey) {
  const isLocalDev = serverKey === 'localhost';
  const serverUrl = SERVERS[serverKey].url;
  
  // Always show dev login for localhost
  devLoginBtn.style.display = isLocalDev ? 'block' : 'none';
  
  // Check if Google OAuth is configured on this server
  try {
    const response = await fetch(`${serverUrl}/auth/status`, { 
      method: 'GET',
      headers: { 'Accept': 'application/json' }
    });
    
    if (response.ok) {
      const status = await response.json();
      
      // Disable Google login if OAuth not configured
      if (status.googleOAuthConfigured === false) {
        loginBtn.disabled = true;
        loginBtn.title = 'Google OAuth not configured on this server';
        loginBtn.style.opacity = '0.5';
        loginBtn.style.cursor = 'not-allowed';
      } else {
        loginBtn.disabled = false;
        loginBtn.title = '';
        loginBtn.style.opacity = '1';
        loginBtn.style.cursor = 'pointer';
      }
    }
  } catch (error) {
    // Server might not be running - show both buttons but don't disable
    console.log('Could not check server status:', error.message);
    loginBtn.disabled = false;
    loginBtn.title = '';
    loginBtn.style.opacity = '1';
    loginBtn.style.cursor = 'pointer';
  }
}

// Update server indicator in logged-in view
function updateServerIndicator(serverKey) {
  const server = SERVERS[serverKey];
  if (server) {
    serverNameEl.textContent = server.name;
    if (serverKey === 'localhost') {
      serverIndicator.classList.add('localhost');
    } else {
      serverIndicator.classList.remove('localhost');
    }
  }
}

// Handle server selection change
serverSelect.addEventListener('change', async () => {
  const selectedKey = serverSelect.value;
  await setSelectedServer(selectedKey);
  await updateLoginButtons(selectedKey);
  currentServerUrl = SERVERS[selectedKey].url;
  
  // Notify background script to reconnect with new server
  await chrome.runtime.sendMessage({ action: 'serverChanged', serverKey: selectedKey });
});

// Load current status
async function loadStatus() {
  try {
    const selectedKey = await initServerSelector();
    const response = await chrome.runtime.sendMessage({ action: 'getStatus' });
    
    loadingEl.classList.add('hidden');
    
    if (response.loggedIn && response.user) {
      // Show logged in state
      loggedOutEl.classList.add('hidden');
      loggedInEl.classList.remove('hidden');
      
      // Set user info
      if (response.user.picture) {
        userPicture.src = response.user.picture;
      }
      userName.textContent = response.user.name || response.user.email;
      userEmail.textContent = response.user.email;
      
      // Set status
      updateStatus(serverStatus, true, 'Connected');
      updateStatus(wsStatus, response.wsConnected, response.wsConnected ? 'Connected' : 'Disconnected');
      
      // Update server indicator
      updateServerIndicator(selectedKey);
    } else {
      // Show logged out state
      loggedOutEl.classList.remove('hidden');
      loggedInEl.classList.add('hidden');
    }
  } catch (error) {
    console.error('Error loading status:', error);
    loadingEl.textContent = 'Error loading status';
  }
}

// Update status badge
function updateStatus(element, connected, text) {
  element.className = `status-badge ${connected ? 'connected' : 'disconnected'}`;
  element.innerHTML = `<span class="dot">●</span> ${text}`;
}

// Event listeners
loginBtn.addEventListener('click', () => {
  chrome.runtime.sendMessage({ action: 'login' });
  window.close();
});

// Dev login for local testing
devLoginBtn.addEventListener('click', async () => {
  try {
    // Call dev login endpoint
    const response = await fetch(`${currentServerUrl}/dev/login`, { method: 'POST' });
    const data = await response.json();
    
    if (data.accessToken) {
      // Send token to background script
      await chrome.runtime.sendMessage({ 
        action: 'devLogin', 
        token: data.accessToken,
        user: data.user
      });
      loadStatus();
    } else {
      alert('Dev login failed: ' + (data.error || 'Unknown error'));
    }
  } catch (error) {
    alert('Dev login failed: ' + error.message + '\nMake sure the server is running at ' + currentServerUrl);
  }
});

logoutBtn.addEventListener('click', async () => {
  await chrome.runtime.sendMessage({ action: 'logout' });
  loadStatus();
});

reconnectBtn.addEventListener('click', async () => {
  await chrome.runtime.sendMessage({ action: 'reconnect' });
  setTimeout(loadStatus, 1000);
});

dashboardBtn.addEventListener('click', async () => {
  chrome.tabs.create({ url: `${currentServerUrl}/dashboard` });
  window.close();
});

// Initialize
loadStatus();

// Refresh status periodically (5 seconds - popup is only open briefly)
setInterval(loadStatus, 5000);
