// Popup script
document.addEventListener('DOMContentLoaded', async () => {
  const statusDiv = document.getElementById('status');
  const statusText = document.getElementById('status-text');
  const sessionInfo = document.getElementById('session-info');
  const mcpStatusDiv = document.getElementById('mcp-status');
  const mcpStatusText = document.getElementById('mcp-status-text');
  const wsStatusDiv = document.getElementById('ws-status');
  const wsStatusText = document.getElementById('ws-status-text');
  const syncMcpBtn = document.getElementById('sync-mcp');
  const reconnectWsBtn = document.getElementById('reconnect-ws');
  const copyBtn = document.getElementById('copy-btn');
  const openMoodleBtn = document.getElementById('open-moodle');
  
  // Tab handling
  const tabs = document.querySelectorAll('.tab');
  const tabContents = document.querySelectorAll('.tab-content');
  
  tabs.forEach(tab => {
    tab.addEventListener('click', () => {
      const tabId = tab.dataset.tab;
      
      tabs.forEach(t => t.classList.remove('active'));
      tabContents.forEach(tc => tc.classList.remove('active'));
      
      tab.classList.add('active');
      document.getElementById(`${tabId}-tab`).classList.add('active');
      
      if (tabId === 'debug') {
        loadDebugLogs();
      }
    });
  });
  
  // Debug log functions
  async function loadDebugLogs() {
    const logsDiv = document.getElementById('debug-logs');
    
    try {
      const response = await chrome.runtime.sendMessage({ type: 'GET_DEBUG_LOGS' });
      
      if (!response || response.length === 0) {
        logsDiv.innerHTML = '<div class="log-entry">No logs yet. Visit a Moodle page to generate logs.</div>';
        return;
      }
      
      logsDiv.innerHTML = response.map(log => `
        <div class="log-entry">
          <span class="log-time">${new Date(log.timestamp).toLocaleTimeString()}</span>
          <span class="log-msg">${log.message}</span>
          ${log.data ? `<div class="log-data">${JSON.stringify(log.data)}</div>` : ''}
        </div>
      `).join('');
    } catch (e) {
      logsDiv.innerHTML = `<div class="log-entry" style="color: #ef4444;">Error loading logs: ${e.message}</div>`;
    }
  }
  
  document.getElementById('refresh-logs').addEventListener('click', loadDebugLogs);
  
  document.getElementById('clear-logs').addEventListener('click', async () => {
    await chrome.runtime.sendMessage({ type: 'CLEAR_DEBUG_LOGS' });
    loadDebugLogs();
  });
  
  // Check MCP HTTP API status
  async function checkMcpStatus() {
    try {
      const result = await chrome.runtime.sendMessage({ type: 'GET_MCP_STATUS' });
      
      if (result && result.connected) {
        mcpStatusDiv.className = 'status connected';
        mcpStatusText.textContent = 'HTTP API: Connected (port 3847)';
        mcpStatusDiv.querySelector('.status-icon').textContent = '✅';
      } else {
        mcpStatusDiv.className = 'status disconnected';
        mcpStatusText.textContent = 'HTTP API: Not connected';
        mcpStatusDiv.querySelector('.status-icon').textContent = '🔌';
      }
    } catch (e) {
      mcpStatusDiv.className = 'status disconnected';
      mcpStatusText.textContent = 'HTTP API: Error checking';
    }
  }
  
  // Check WebSocket status
  async function checkWsStatus() {
    try {
      const result = await chrome.runtime.sendMessage({ type: 'GET_WS_STATUS' });
      
      if (result && result.connected) {
        wsStatusDiv.className = 'status connected';
        wsStatusText.textContent = 'WebSocket: Connected (port 3848)';
        wsStatusDiv.querySelector('.status-icon').textContent = '⚡';
      } else {
        wsStatusDiv.className = 'status disconnected';
        wsStatusText.textContent = 'WebSocket: Not connected';
        wsStatusDiv.querySelector('.status-icon').textContent = '📡';
      }
    } catch (e) {
      wsStatusDiv.className = 'status disconnected';
      wsStatusText.textContent = 'WebSocket: Error checking';
    }
  }
  
  // Sync to MCP button
  syncMcpBtn.addEventListener('click', async () => {
    syncMcpBtn.textContent = '⏳ Syncing...';
    syncMcpBtn.disabled = true;
    
    try {
      const result = await chrome.runtime.sendMessage({ type: 'SYNC_TO_MCP' });
      
      if (result && result.success) {
        syncMcpBtn.textContent = '✅ Session Synced!';
        syncMcpBtn.style.background = '#065f46';
        await checkMcpStatus();
        setTimeout(() => {
          syncMcpBtn.textContent = '🔄 Sync Session to MCP Server';
          syncMcpBtn.style.background = '';
          syncMcpBtn.disabled = false;
        }, 2000);
      } else {
        syncMcpBtn.textContent = '❌ Sync failed';
        syncMcpBtn.style.background = '#7f1d1d';
        setTimeout(() => {
          syncMcpBtn.textContent = '🔄 Sync Session to MCP Server';
          syncMcpBtn.style.background = '';
          syncMcpBtn.disabled = false;
        }, 2000);
      }
    } catch (e) {
      syncMcpBtn.textContent = '❌ Error';
      setTimeout(() => {
        syncMcpBtn.textContent = '🔄 Sync Session to MCP Server';
        syncMcpBtn.style.background = '';
        syncMcpBtn.disabled = false;
      }, 2000);
    }
  });
  
  // Reconnect WebSocket button
  reconnectWsBtn.addEventListener('click', async () => {
    reconnectWsBtn.textContent = '⏳ Reconnecting...';
    reconnectWsBtn.disabled = true;
    
    try {
      await chrome.runtime.sendMessage({ type: 'RECONNECT_WS' });
      
      // Wait a moment for connection
      await new Promise(r => setTimeout(r, 1000));
      await checkWsStatus();
      
      reconnectWsBtn.textContent = '⚡ Reconnect WebSocket';
      reconnectWsBtn.disabled = false;
    } catch (e) {
      reconnectWsBtn.textContent = '❌ Failed';
      setTimeout(() => {
        reconnectWsBtn.textContent = '⚡ Reconnect WebSocket';
        reconnectWsBtn.disabled = false;
      }, 2000);
    }
  });
  
  // Get session from background
  try {
    const session = await chrome.runtime.sendMessage({ type: 'GET_SESSION' });
    
    if (session && session.isValid) {
      statusDiv.className = 'status connected';
      statusText.textContent = 'Connected to Moodle';
      statusDiv.querySelector('.status-icon').textContent = '✅';
      
      sessionInfo.style.display = 'block';
      document.getElementById('moodle-url').textContent = session.moodleUrl;
      document.getElementById('sesskey').textContent = session.sesskey;
      document.getElementById('timestamp').textContent = new Date(session.timestamp).toLocaleString();
      
      copyBtn.style.display = 'block';
      
      // Check statuses
      await Promise.all([checkMcpStatus(), checkWsStatus()]);
      
      // Copy config button
      copyBtn.addEventListener('click', async () => {
        const config = {
          mcpServers: {
            "moodle": {
              command: "node",
              args: ["dist/index.js"],
              cwd: "C:/Users/rnlkh/Desktop/workspace/university/moodle-mcp",
              env: {
                MOODLE_URL: session.moodleUrl,
                MOODLE_SESSION: session.sessionCookie,
                MOODLE_SESSKEY: session.sesskey
              }
            }
          }
        };
        
        try {
          await navigator.clipboard.writeText(JSON.stringify(config, null, 2));
          copyBtn.textContent = '✅ Copied!';
          copyBtn.classList.add('copied');
          setTimeout(() => {
            copyBtn.textContent = '📋 Copy MCP Config (Manual)';
            copyBtn.classList.remove('copied');
          }, 2000);
        } catch (e) {
          copyBtn.textContent = '❌ Copy failed';
          console.error('Copy failed:', e);
        }
      });
    } else {
      statusDiv.className = 'status disconnected';
      statusText.textContent = 'Not connected to Moodle';
      statusDiv.querySelector('.status-icon').textContent = '⚠️';
      sessionInfo.style.display = 'none';
      copyBtn.style.display = 'none';
      
      // Still check MCP/WS status
      await Promise.all([checkMcpStatus(), checkWsStatus()]);
    }
  } catch (e) {
    statusDiv.className = 'status disconnected';
    statusText.textContent = `Error: ${e.message}`;
    console.error('Error getting session:', e);
    
    // Still check MCP/WS status
    await Promise.all([checkMcpStatus(), checkWsStatus()]);
  }
  
  // Open Moodle button
  openMoodleBtn.addEventListener('click', () => {
    chrome.tabs.create({ url: 'https://moodle.louisiana.edu' });
  });
  
  // Auto-refresh statuses every 5 seconds
  setInterval(async () => {
    await Promise.all([checkMcpStatus(), checkWsStatus()]);
  }, 5000);
});
