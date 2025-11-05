/**
 * content.ts - Content Script
 * 
 * Role: Runs on web pages (currently minimal)
 * Current Use: Placeholder for future enhancements
 * 
 * Future Possibilities:
 * - Inject UI into Zeeguu articles
 * - Highlight words and provide translations
 * - Track reading progress
 * - Provide word lookup on selected text
 * 
 * Note: Content scripts run in the context of web pages and have access to page DOM,
 * but currently this extension focuses on the popup interface.
 */

// content script. This file is the single source of truth for page-level behavior.

console.log('Content script running (TS)');

// Example: listen for messages from background or popup
window.addEventListener('message', (event) => {
  if (event.source !== window) return;
  console.log('Content script received window message', event.data);
});

// Send a hello message to background via runtime (works when content script has runtime access)
if ((window as any).chrome?.runtime?.sendMessage) {
  (window as any).chrome.runtime.sendMessage({ hello: 'from content script (TS)' });
}
