"use strict";
(() => {
  // src/extension/background.ts
  self.addEventListener("install", () => {
  });
  self.chrome.runtime.onMessage.addListener((request, sender, sendResponse) => {
    const chromeApi = self.chrome;
    if (request.action === "openOverlay") {
      const url = request.url;
      const width = request.width || 900;
      const height = request.height || 700;
      openOverlayWindow(url, width, height).then((win) => sendResponse({ success: true, windowId: win && win.id })).catch((err) => sendResponse({ success: false, error: String(err) }));
      return true;
    }
    if (request.action === "closeOverlayFromTab") {
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
      return true;
    }
  });
  async function openOverlayWindow(url, width, height, originTabId) {
    return new Promise((resolve, reject) => {
      try {
        if (!url || typeof url !== "string")
          return reject(new Error("Invalid URL"));
        const chromeApi = self.chrome;
        const centerAndCreate = (currentWin, injectTabId) => {
          try {
            const cw = currentWin && typeof currentWin.width === "number" ? currentWin.width : 1200;
            const ch = currentWin && typeof currentWin.height === "number" ? currentWin.height : 800;
            const cleft = typeof currentWin.left === "number" ? currentWin.left : 0;
            const ctop = typeof currentWin.top === "number" ? currentWin.top : 0;
            const left = cleft + Math.max(0, Math.round((cw - width) / 2));
            const top = ctop + Math.max(0, Math.round((ch - height) / 2));
            const doCreate = () => {
              chromeApi.windows.create({ url, type: "popup", width, height, left, top, focused: true }, (createdWin) => {
                if (chromeApi.runtime.lastError)
                  return reject(new Error(chromeApi.runtime.lastError.message));
                if (createdWin && createdWin.id && injectTabId !== null)
                  overlayToTab.set(createdWin.id, injectTabId);
                if (createdWin && createdWin.id) {
                  chromeApi.tabs.query({ windowId: createdWin.id }, (tabs) => {
                    const newTab = tabs && tabs[0];
                    if (newTab && typeof newTab.id === "number")
                      overlayTabIds.add(newTab.id);
                  });
                }
                resolve(createdWin);
              });
            };
            if (injectTabId !== null) {
              try {
                chromeApi.scripting.executeScript({ target: { tabId: injectTabId }, files: ["overlay-inject.js"] }, () => {
                  doCreate();
                });
              } catch (e) {
                doCreate();
              }
            } else {
              doCreate();
            }
          } catch (e) {
            reject(e);
          }
        };
        if (typeof originTabId === "number") {
          chromeApi.tabs.get(originTabId, (tabInfo) => {
            try {
              const winId = tabInfo && tabInfo.windowId;
              if (typeof winId === "number") {
                chromeApi.windows.get(winId, { populate: false }, (win) => {
                  centerAndCreate(win, originTabId);
                });
              } else {
                chromeApi.windows.getCurrent({ populate: false }, (win) => centerAndCreate(win, originTabId));
              }
            } catch (e) {
              centerAndCreate(null, originTabId);
            }
          });
        } else {
          chromeApi.windows.getCurrent({ populate: false }, (currentWin) => {
            centerAndCreate(currentWin, null);
          });
        }
      } catch (e) {
        reject(e);
      }
    });
  }
  var overlayToTab = /* @__PURE__ */ new Map();
  var overlayTabIds = /* @__PURE__ */ new Set();
  var recentOpenByTab = /* @__PURE__ */ new Map();
  var RECENT_OPEN_MS = 3e3;
  var lastVisitedDomainByTab = /* @__PURE__ */ new Map();
  function normalizeHost(host) {
    if (!host)
      return "";
    const trimmed = host.trim().toLowerCase();
    const noPort = trimmed.split(":")[0];
    return noPort.startsWith("www.") ? noPort.slice(4) : noPort;
  }
  self.chrome.windows.onRemoved.addListener((windowId) => {
    try {
      const chromeApi = self.chrome;
      if (overlayToTab.has(windowId)) {
        const tabId = overlayToTab.get(windowId);
        overlayToTab.delete(windowId);
        try {
          overlayTabIds.delete(tabId);
        } catch (e) {
        }
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
  self.chrome.tabs.onRemoved.addListener((tabId) => {
    try {
      lastVisitedDomainByTab.delete(tabId);
      recentOpenByTab.delete(tabId);
    } catch (e) {
    }
  });
  self.chrome.tabs.onUpdated.addListener((tabId, changeInfo, tab) => {
    try {
      if (!changeInfo || changeInfo.status !== "complete")
        return;
      const chromeApi = self.chrome;
      try {
        console.log("[bg] tabs.onUpdated complete", tabId, changeInfo && changeInfo.url);
      } catch (e) {
      }
      const url = changeInfo && changeInfo.url ? changeInfo.url : tab && tab.url ? tab.url : null;
      if (!url || !/^https?:\/\//i.test(url))
        return;
      if (overlayTabIds.has(tabId))
        return;
      let normalizedPageHost = "";
      try {
        const pageUrlObj = new URL(url);
        normalizedPageHost = normalizeHost(pageUrlObj.hostname);
      } catch (e) {
        normalizedPageHost = "";
      }
      if (!normalizedPageHost) {
        lastVisitedDomainByTab.delete(tabId);
        return;
      }
      const previousHost = lastVisitedDomainByTab.get(tabId) || null;
      const last = recentOpenByTab.get(tabId) || 0;
      if (Date.now() - last < RECENT_OPEN_MS)
        return;
      chromeApi.storage && chromeApi.storage.local && chromeApi.storage.local.get(["savedSites"], (res) => {
        try {
          const sites = res && Array.isArray(res.savedSites) ? res.savedSites : [];
          const setLastVisited = () => {
            try {
              lastVisitedDomainByTab.set(tabId, normalizedPageHost);
            } catch (e) {
            }
          };
          const seen = /* @__PURE__ */ new Set();
          const normalizedSites = [];
          for (const s of sites) {
            const item = typeof s === "string" ? { match: String(s).trim() } : s;
            const rawKey = String(item && item.match || "").trim().toLowerCase();
            if (!rawKey)
              continue;
            if (seen.has(rawKey))
              continue;
            seen.add(rawKey);
            normalizedSites.push(item);
          }
          for (const s of normalizedSites) {
            try {
              if (!s)
                continue;
              const item = typeof s === "string" ? { match: String(s).trim() } : s;
              const raw = String(item.match || "").trim();
              if (!raw)
                continue;
              let savedHost = "";
              try {
                const candidate = /^https?:\/\//i.test(raw) ? raw : "https://" + raw;
                const savedUrlObj = new URL(candidate);
                savedHost = savedUrlObj.hostname.toLowerCase();
              } catch (e) {
                const noProto = raw.replace(/^https?:\/\//i, "");
                savedHost = noProto.split("/")[0].toLowerCase();
              }
              if (!savedHost)
                continue;
              const normalizedSavedHost = normalizeHost(savedHost);
              if (!normalizedSavedHost)
                continue;
              const domainMatches = normalizedPageHost === normalizedSavedHost || normalizedPageHost.endsWith("." + normalizedSavedHost);
              if (!domainMatches)
                continue;
              if (previousHost && previousHost === normalizedSavedHost) {
                setLastVisited();
                return;
              }
              openOverlayWindow("https://zeeguu.org/exercises", 900, 700, tabId).catch(() => {
              });
              recentOpenByTab.set(tabId, Date.now());
              setLastVisited();
              return;
            } catch (e) {
            }
          }
          setLastVisited();
        } catch (e) {
          try {
            lastVisitedDomainByTab.set(tabId, normalizedPageHost);
          } catch (err) {
          }
        }
      });
    } catch (e) {
    }
  });
})();
