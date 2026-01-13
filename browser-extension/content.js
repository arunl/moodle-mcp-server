// Content script - runs on Moodle pages
// Extracts the sesskey from the page's JavaScript context

(function() {
  console.log('[MoodleMCP Content] Script loaded on:', window.location.href);
  
  // Check if user is logged in by looking for M.cfg
  function extractSesskey() {
    try {
      // Method 1: Try to access M.cfg directly (if available in page context)
      // Note: Content scripts run in isolated world, so M.cfg won't be directly accessible
      
      // Method 2: Look in script tags
      const scripts = document.querySelectorAll('script');
      let sesskey = null;
      
      for (const script of scripts) {
        const content = script.textContent || '';
        // Look for sesskey in M.cfg initialization
        const match = content.match(/"sesskey"\s*:\s*"([^"]+)"/);
        if (match) {
          sesskey = match[1];
          console.log('[MoodleMCP Content] Found sesskey in script tag');
          break;
        }
      }
      
      // Method 3: Check the logout link which contains sesskey
      if (!sesskey) {
        const logoutLink = document.querySelector('a[href*="logout.php?sesskey="]');
        if (logoutLink) {
          const href = logoutLink.getAttribute('href');
          const match = href.match(/sesskey=([^&]+)/);
          if (match) {
            sesskey = match[1];
            console.log('[MoodleMCP Content] Found sesskey in logout link');
          }
        }
      }
      
      // Method 4: Look for sesskey in any link or form
      if (!sesskey) {
        const sesskeyLink = document.querySelector('a[href*="sesskey="]');
        if (sesskeyLink) {
          const href = sesskeyLink.getAttribute('href');
          const match = href.match(/sesskey=([^&"]+)/);
          if (match) {
            sesskey = match[1];
            console.log('[MoodleMCP Content] Found sesskey in page link');
          }
        }
      }
      
      // Method 5: Look for hidden sesskey input
      if (!sesskey) {
        const sesskeyInput = document.querySelector('input[name="sesskey"]');
        if (sesskeyInput) {
          sesskey = sesskeyInput.value;
          console.log('[MoodleMCP Content] Found sesskey in hidden input');
        }
      }
      
      console.log('[MoodleMCP Content] extractSesskey result:', sesskey ? sesskey.substring(0, 4) + '...' : 'null');
      return sesskey;
    } catch (e) {
      console.error('[MoodleMCP Content] Error extracting sesskey', e);
      return null;
    }
  }
  
  // Check if user appears to be logged in
  function isLoggedIn() {
    const indicators = [
      document.querySelector('[data-region="usermenu"]'),
      document.querySelector('a[href*="logout.php"]'),
      document.querySelector('.usermenu'),
      document.querySelector('.userbutton'),
      document.querySelector('#user-menu-toggle')
    ];
    
    const loggedIn = indicators.some(el => el !== null);
    console.log('[MoodleMCP Content] isLoggedIn:', loggedIn);
    return loggedIn;
  }
  
  // Get the Moodle base URL
  function getMoodleUrl() {
    return window.location.origin;
  }
  
  // Send session info to background script
  function updateSession() {
    console.log('[MoodleMCP Content] updateSession called');
    
    if (!isLoggedIn()) {
      console.log('[MoodleMCP Content] User not logged in, skipping');
      return;
    }
    
    const sesskey = extractSesskey();
    if (sesskey) {
      console.log('[MoodleMCP Content] Sending SESSION_UPDATE to background');
      chrome.runtime.sendMessage({
        type: 'SESSION_UPDATE',
        data: {
          moodleUrl: getMoodleUrl(),
          sesskey: sesskey,
          timestamp: Date.now()
        }
      }, (response) => {
        if (chrome.runtime.lastError) {
          console.error('[MoodleMCP Content] Error sending message:', chrome.runtime.lastError.message);
        } else {
          console.log('[MoodleMCP Content] SESSION_UPDATE response:', response);
        }
      });
    } else {
      console.log('[MoodleMCP Content] No sesskey found');
    }
  }
  
  // Run on page load with a small delay to ensure page is ready
  setTimeout(() => {
    console.log('[MoodleMCP Content] Initial updateSession (delayed)');
    updateSession();
  }, 1000);
  
  // Also run immediately
  if (document.readyState === 'complete') {
    console.log('[MoodleMCP Content] Document already complete, running now');
    updateSession();
  }
  
  // Watch for dynamic content changes (in case of SPA-like navigation)
  let debounceTimer = null;
  const observer = new MutationObserver(() => {
    if (debounceTimer) clearTimeout(debounceTimer);
    debounceTimer = setTimeout(() => {
      console.log('[MoodleMCP Content] DOM mutation detected, updating session');
      updateSession();
    }, 2000);
  });
  
  observer.observe(document.body, {
    childList: true,
    subtree: true
  });
  
  console.log('[MoodleMCP Content] Content script setup complete');
})();
