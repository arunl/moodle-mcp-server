// Popup script

document.addEventListener('DOMContentLoaded', async () => {
  // Get session data from background
  const session = await chrome.runtime.sendMessage({ type: 'GET_SESSION' });
  
  const statusEl = document.getElementById('status');
  const statusTextEl = document.getElementById('status-text');
  const sessionInfoEl = document.getElementById('session-info');
  const noSessionEl = document.getElementById('no-session');
  
  if (session && session.isValid && session.sessionCookie && session.sesskey) {
    // Show session info
    statusEl.className = 'status valid';
    statusEl.querySelector('.status-icon').textContent = '✅';
    statusTextEl.textContent = 'Connected to Moodle';
    
    document.getElementById('moodle-url').textContent = session.moodleUrl;
    document.getElementById('sesskey').textContent = session.sesskey;
    document.getElementById('session-cookie').textContent = 
      session.sessionCookie.substring(0, 20) + '...' + 
      session.sessionCookie.substring(session.sessionCookie.length - 10);
    
    if (session.timestamp) {
      const date = new Date(session.timestamp);
      document.getElementById('timestamp').textContent = 
        `Last updated: ${date.toLocaleTimeString()}`;
    }
    
    sessionInfoEl.style.display = 'block';
    noSessionEl.style.display = 'none';
    
    // Copy MCP Config button
    document.getElementById('copy-config').addEventListener('click', async () => {
      const config = {
        mcpServers: {
          moodle: {
            command: "node",
            args: ["C:/Users/rnlkh/Desktop/workspace/university/moodle-mcp/dist/index.js"],
            env: {
              MOODLE_URL: session.moodleUrl,
              MOODLE_SESSION: session.sessionCookie,
              MOODLE_SESSKEY: session.sesskey
            }
          }
        }
      };
      
      await navigator.clipboard.writeText(JSON.stringify(config, null, 2));
      
      const btn = document.getElementById('copy-config');
      btn.textContent = '✅ Copied!';
      btn.classList.add('copied');
      setTimeout(() => {
        btn.textContent = '📋 Copy MCP Config';
        btn.classList.remove('copied');
      }, 2000);
    });
    
    // Copy ENV button
    document.getElementById('copy-env').addEventListener('click', async () => {
      const env = `MOODLE_URL=${session.moodleUrl}
MOODLE_SESSION=${session.sessionCookie}
MOODLE_SESSKEY=${session.sesskey}`;
      
      await navigator.clipboard.writeText(env);
      
      const btn = document.getElementById('copy-env');
      btn.textContent = '✅ Copied!';
      btn.classList.add('copied');
      setTimeout(() => {
        btn.textContent = 'Copy as Environment Variables';
        btn.classList.remove('copied');
      }, 2000);
    });
    
  } else {
    // Show no session message
    statusEl.className = 'status invalid';
    statusTextEl.textContent = 'Not connected to Moodle';
    sessionInfoEl.style.display = 'none';
    noSessionEl.style.display = 'block';
    
    document.getElementById('open-moodle').addEventListener('click', () => {
      chrome.tabs.create({ url: 'https://moodle.louisiana.edu' });
      window.close();
    });
  }
});
