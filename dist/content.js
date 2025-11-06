"use strict";
(() => {
  // src/extension/content.ts
  console.log("Content script running (TS)");
  window.addEventListener("message", (event) => {
    if (event.source !== window) return;
    console.log("Content script received window message", event.data);
  });
  if (window.chrome?.runtime?.sendMessage) {
    window.chrome.runtime.sendMessage({ hello: "from content script (TS)" });
  }
})();
