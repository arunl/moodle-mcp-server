// Content script for Moodle MCP Bridge
// Runs on Moodle pages to help extract sesskey and other info

(function() {
  'use strict';
  
  // Check if we're on a Moodle page
  const isMoodlePage = document.querySelector('body.format-topics, body.format-weeks, body.course-format-topics') ||
                       document.querySelector('.moodlelogo') ||
                       document.querySelector('[data-region="drawer"]') ||
                       window.M !== undefined;
  
  if (!isMoodlePage) {
    return;
  }
  
  console.log('[MoodleMCP] Content script loaded on Moodle page');
  
  // Extract sesskey from page
  function getSesskey() {
    // Try to get from M.cfg
    if (window.M && window.M.cfg && window.M.cfg.sesskey) {
      return window.M.cfg.sesskey;
    }
    
    // Try to find in links
    const sesskeyLink = document.querySelector('a[href*="sesskey="]');
    if (sesskeyLink) {
      const match = sesskeyLink.href.match(/sesskey=([^&]+)/);
      if (match) return match[1];
    }
    
    // Try to find in forms
    const sesskeyInput = document.querySelector('input[name="sesskey"]');
    if (sesskeyInput) {
      return sesskeyInput.value;
    }
    
    return null;
  }
  
  // Get current Moodle URL
  function getMoodleUrl() {
    return window.location.origin;
  }
  
  // Send Moodle info to background script
  function reportMoodleInfo() {
    const sesskey = getSesskey();
    const moodleUrl = getMoodleUrl();
    
    if (sesskey) {
      chrome.runtime.sendMessage({
        action: 'moodleInfo',
        sesskey,
        moodleUrl,
        pageUrl: window.location.href,
        pageTitle: document.title,
      });
    }
  }
  
  // Report info when page loads
  reportMoodleInfo();
  
  // Also report when M.cfg becomes available (may be async)
  if (typeof window.M === 'undefined') {
    const observer = new MutationObserver(() => {
      if (window.M && window.M.cfg) {
        reportMoodleInfo();
        observer.disconnect();
      }
    });
    observer.observe(document.body, { childList: true, subtree: true });
    setTimeout(() => observer.disconnect(), 5000);
  }
})();
