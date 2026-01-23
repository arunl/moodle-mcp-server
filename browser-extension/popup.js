// Popup script for Moodle MCP Bridge
import { SERVER_URL } from './config.js';

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

// Hide Dev Login button unless connecting to localhost
const isLocalDev = SERVER_URL.includes('localhost') || SERVER_URL.includes('127.0.0.1');
if (!isLocalDev) {
  devLoginBtn.style.display = 'none';
}

// Load current status
async function loadStatus() {
  try {
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
    const response = await fetch(`${SERVER_URL}/dev/login`, { method: 'POST' });
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
    alert('Dev login failed: ' + error.message + '\\nMake sure the server is running at ' + SERVER_URL);
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

dashboardBtn.addEventListener('click', () => {
  chrome.tabs.create({ url: `${SERVER_URL}/dashboard` });
  window.close();
});

// Initialize
loadStatus();

// Refresh status periodically (5 seconds - popup is only open briefly)
setInterval(loadStatus, 5000);
