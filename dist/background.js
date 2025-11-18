"use strict";
(() => {
  // src/extension/background.ts
  self.addEventListener("install", () => {
    console.log("Service worker installed");
  });
  self.addEventListener("activate", () => {
    console.log("Service worker activated");
  });
  self.chrome.runtime.onMessage.addListener((request, sender, sendResponse) => {
    if (request.action === "openOverlay") {
      try {
        const url = request.url;
        const width = request.width || 900;
        const height = request.height || 700;
        openOverlayWindow(url, width, height).then((win) => sendResponse({ success: true, windowId: win && win.id })).catch((err) => sendResponse({ success: false, error: err && err.message ? err.message : String(err) }));
        return true;
      } catch (err) {
        sendResponse({ success: false, error: err && err.message ? err.message : String(err) });
        return false;
      }
    }
    if (request.action === "closeOverlayFromTab") {
      try {
        const chromeApi = self.chrome;
        const tabId = sender && sender.tab && sender.tab.id;
        if (typeof tabId !== "number")
          return sendResponse({ success: false, error: "No tabId" });
        let foundPopupId = null;
        for (const [popupId, mappedTabId] of overlayToTab.entries()) {
          if (mappedTabId === tabId) {
            foundPopupId = popupId;
            break;
          }
        }
        if (foundPopupId) {
          try {
            chromeApi.windows.remove(foundPopupId);
          } catch (e) {
          }
          try {
            chromeApi.tabs.sendMessage(tabId, { action: "removeOverlay" }, () => {
            });
          } catch (e) {
          }
          overlayToTab.delete(foundPopupId);
        }
        sendResponse({ success: true });
      } catch (e) {
        sendResponse({ success: false, error: e && e.message ? e.message : String(e) });
      }
      return true;
    }
  });
  async function openOverlayWindow(url, width, height) {
    return new Promise((resolve, reject) => {
      try {
        if (!url || typeof url !== "string")
          return reject(new Error("Invalid URL"));
        const chromeApi = self.chrome;
        chromeApi.windows.getCurrent({ populate: false }, (currentWin) => {
          try {
            const cw = currentWin && typeof currentWin.width === "number" ? currentWin.width : 1200;
            const ch = currentWin && typeof currentWin.height === "number" ? currentWin.height : 800;
            const cleft = typeof currentWin.left === "number" ? currentWin.left : 0;
            const ctop = typeof currentWin.top === "number" ? currentWin.top : 0;
            const left = cleft + Math.max(0, Math.round((cw - width) / 2));
            const top = ctop + Math.max(0, Math.round((ch - height) / 2));
            chromeApi.tabs.query({ active: true, windowId: currentWin.id }, (tabs) => {
              const activeTab = tabs && tabs[0] || null;
              const tabId = activeTab && typeof activeTab.id === "number" ? activeTab.id : null;
              const injectAndCreate = () => {
                chromeApi.windows.create({
                  url,
                  type: "popup",
                  width,
                  height,
                  left,
                  top,
                  focused: true
                }, (createdWin) => {
                  if (chromeApi.runtime.lastError) {
                    return reject(new Error(chromeApi.runtime.lastError.message));
                  }
                  try {
                    if (createdWin && createdWin.id && tabId !== null) {
                      overlayToTab.set(createdWin.id, tabId);
                    }
                  } catch (e) {
                  }
                  resolve(createdWin);
                });
              };
              if (tabId !== null) {
                try {
                  chromeApi.scripting.executeScript({ target: { tabId }, files: ["overlay-inject.js"] }, () => {
                    injectAndCreate();
                  });
                } catch (e) {
                  injectAndCreate();
                }
              } else {
                injectAndCreate();
              }
            });
          } catch (e) {
            reject(e);
          }
        });
      } catch (e) {
        reject(e);
      }
    });
  }
  var overlayToTab = /* @__PURE__ */ new Map();
  self.chrome.windows.onRemoved.addListener((windowId) => {
    try {
      const chromeApi = self.chrome;
      if (overlayToTab.has(windowId)) {
        const tabId = overlayToTab.get(windowId);
        overlayToTab.delete(windowId);
        try {
          chromeApi.tabs.sendMessage(tabId, { action: "removeOverlay" }, () => {
          });
        } catch (e) {
        }
      }
    } catch (e) {
      console.warn("onRemoved cleanup error", e);
    }
  });
})();
