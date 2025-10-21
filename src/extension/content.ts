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
