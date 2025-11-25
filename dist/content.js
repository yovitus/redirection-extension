"use strict";
(() => {
  // src/extension/content.ts
  function isTopLevelHttp() {
    try {
      return window.top === window && /^https?:\/\//i.test(location.href);
    } catch (e) {
      return false;
    }
  }
  if (isTopLevelHttp()) {
    window.addEventListener("load", () => {
      try {
        window.chrome.runtime.sendMessage({ action: "pageLoaded", url: location.href }, () => {
        });
      } catch (e) {
      }
    }, { once: true });
  }
})();
