/**
 * background.ts - Service Worker (Backend)
 * 
 * Role: Handles overlay window management
 * Responsibilities:
 * - Listens for messages from popup (runtime.onMessage)
 * - Opens overlay windows with specified URLs
 * - Manages overlay window lifecycle
 * 
 * Flow: popup.ts sends openOverlay message → background.ts opens window
 */

self.addEventListener('install', () => {
  console.log('Service worker installed');
});

self.addEventListener('activate', () => {
  console.log('Service worker activated');
});

(self as any).chrome.runtime.onMessage.addListener((request: any, sender: any, sendResponse: any) => {
  // Open a lightweight overlay popup window using the browser's session
  if (request.action === 'openOverlay') {
    try {
      const url = request.url;
      const width = request.width || 900;
      const height = request.height || 700;

      openOverlayWindow(url, width, height)
        .then(win => sendResponse({ success: true, windowId: win && (win as any).id }))
        .catch((err: any) => sendResponse({ success: false, error: err && err.message ? err.message : String(err) }));

      return true; // keep sendResponse async
    } catch (err: any) {
      sendResponse({ success: false, error: err && err.message ? err.message : String(err) });
      return false;
    }
  }
  // Request from injected tab to close the overlay popup
  if (request.action === 'closeOverlayFromTab') {
    try {
      const chromeApi = (self as any).chrome;
      const tabId = sender && sender.tab && sender.tab.id;
      if (typeof tabId !== 'number') return sendResponse({ success: false, error: 'No tabId' });

      // find popup window id mapped to this tab
      let foundPopupId: number | null = null;
      for (const [popupId, mappedTabId] of overlayToTab.entries()) {
        if (mappedTabId === tabId) { foundPopupId = popupId; break; }
      }

      if (foundPopupId) {
        try { chromeApi.windows.remove(foundPopupId); } catch (e) {}
        // explicitly notify the tab to remove the injected overlay (in case onRemoved cleanup doesn't run yet)
        try { chromeApi.tabs.sendMessage(tabId, { action: 'removeOverlay' }, () => {}); } catch (e) {}
        // cleanup mapping
        overlayToTab.delete(foundPopupId);
      }

      sendResponse({ success: true });
    } catch (e: any) {
      sendResponse({ success: false, error: e && e.message ? e.message : String(e) });
    }
    return true;
  }
});

async function openOverlayWindow(url: string, width: number, height: number): Promise<any> {
  return new Promise((resolve, reject) => {
    try {
      // Ensure url is a string
      if (!url || typeof url !== 'string') return reject(new Error('Invalid URL'));

      const chromeApi = (self as any).chrome;

      // Get current window to center overlay on top of it
      chromeApi.windows.getCurrent({ populate: false }, (currentWin: any) => {
            try {
              const cw = currentWin && typeof currentWin.width === 'number' ? currentWin.width : 1200;
              const ch = currentWin && typeof currentWin.height === 'number' ? currentWin.height : 800;
              const cleft = typeof currentWin.left === 'number' ? currentWin.left : 0;
              const ctop = typeof currentWin.top === 'number' ? currentWin.top : 0;

              const left = cleft + Math.max(0, Math.round((cw - width) / 2));
              const top = ctop + Math.max(0, Math.round((ch - height) / 2));

              // Try to inject a grey overlay into the active tab of the current window
              chromeApi.tabs.query({ active: true, windowId: currentWin.id }, (tabs: any[]) => {
                const activeTab = (tabs && tabs[0]) || null;
                const tabId = activeTab && typeof activeTab.id === 'number' ? activeTab.id : null;

                const injectAndCreate = () => {
                  // Create the content popup on top, centered relative to current window
                  chromeApi.windows.create({
                    url,
                    type: 'popup',
                    width,
                    height,
                    left,
                    top,
                    focused: true
                  }, (createdWin: any) => {
                    if (chromeApi.runtime.lastError) {
                      return reject(new Error(chromeApi.runtime.lastError.message));
                    }
                    // If we injected into a tab, track mapping so we can remove overlay later
                    try {
                      if (createdWin && createdWin.id && tabId !== null) {
                        overlayToTab.set(createdWin.id, tabId);
                      }
                    } catch (e) {}
                    resolve(createdWin);
                  });
                };

                if (tabId !== null) {
                  // inject helper file that adds a full-page semi-transparent div
                  try {
                    chromeApi.scripting.executeScript({ target: { tabId }, files: ['overlay_inject.js'] }, () => {
                      // ignore injection errors, still create popup
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

// Map popup window id -> originating tab id (we inject an overlay into that tab)
const overlayToTab: Map<number, number> = new Map();

// When a popup window is removed, tell the originating tab to remove the injected overlay
(self as any).chrome.windows.onRemoved.addListener((windowId: number) => {
  try {
    const chromeApi = (self as any).chrome;
    if (overlayToTab.has(windowId)) {
      const tabId = overlayToTab.get(windowId)!;
      overlayToTab.delete(windowId);
      try {
        chromeApi.tabs.sendMessage(tabId, { action: 'removeOverlay' }, () => {});
      } catch (e) {}
    }
  } catch (e) {
    console.warn('onRemoved cleanup error', e);
  }
});
