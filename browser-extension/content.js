// Content script - runs on Moodle pages
// Extracts the sesskey from the page's JavaScript context

(function() {
  // Check if user is logged in by looking for M.cfg
  function extractSesskey() {
    try {
      // Try to get sesskey from the page
      const scripts = document.querySelectorAll('script');
      let sesskey = null;
      
      for (const script of scripts) {
        const content = script.textContent || '';
        // Look for sesskey in M.cfg initialization
        const match = content.match(/"sesskey"\s*:\s*"([^"]+)"/);
        if (match) {
          sesskey = match[1];
          break;
        }
      }
      
      // Also check the logout link which contains sesskey
      if (!sesskey) {
        const logoutLink = document.querySelector('a[href*="logout.php?sesskey="]');
        if (logoutLink) {
          const href = logoutLink.getAttribute('href');
          const match = href.match(/sesskey=([^&]+)/);
          if (match) {
            sesskey = match[1];
          }
        }
      }
      
      return sesskey;
    } catch (e) {
      console.error('Moodle MCP: Error extracting sesskey', e);
      return null;
    }
  }
  
  // Check if user appears to be logged in
  function isLoggedIn() {
    // Look for user menu or logout link
    return document.querySelector('[data-region="usermenu"]') !== null ||
           document.querySelector('a[href*="logout.php"]') !== null ||
           document.querySelector('.usermenu') !== null;
  }
  
  // Get the Moodle base URL
  function getMoodleUrl() {
    return window.location.origin;
  }
  
  // Send session info to background script
  function updateSession() {
    if (!isLoggedIn()) {
      return;
    }
    
    const sesskey = extractSesskey();
    if (sesskey) {
      chrome.runtime.sendMessage({
        type: 'SESSION_UPDATE',
        data: {
          moodleUrl: getMoodleUrl(),
          sesskey: sesskey,
          timestamp: Date.now()
        }
      });
    }
  }
  
  // Run on page load
  updateSession();
  
  // Also watch for navigation changes (SPA-like behavior)
  const observer = new MutationObserver(() => {
    updateSession();
  });
  
  observer.observe(document.body, {
    childList: true,
    subtree: true
  });
})();
