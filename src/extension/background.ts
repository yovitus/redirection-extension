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

self.addEventListener('install', () => {});

(self as any).chrome.runtime.onMessage.addListener((request: any, sender: any, sendResponse: any) => {
  const chromeApi = (self as any).chrome;

  if (request.action === 'openOverlay') {
    const url = request.url;
    const width = request.width || 900;
    const height = request.height || 700;
    openOverlayWindow(url, width, height).then(win => sendResponse({ success: true, windowId: win && (win as any).id })).catch((err: any) => sendResponse({ success: false, error: String(err) }));
    return true;
  }

  if (request.action === 'closeOverlayFromTab') {
    const tabId = sender && sender.tab && sender.tab.id;
    if (typeof tabId !== 'number') return sendResponse({ success: false, error: 'No tabId' });

    let foundPopupId: number | null = null;
    for (const [popupId, mappedTabId] of overlayToTab.entries()) {
      if (mappedTabId === tabId) { foundPopupId = popupId; break; }
    }

    if (foundPopupId) {
      try { chromeApi.windows.remove(foundPopupId); } catch (e) {}
      try { chromeApi.tabs.sendMessage(tabId, { action: 'removeOverlay' }, () => {}); } catch (e) {}
      overlayToTab.delete(foundPopupId);
    }

    sendResponse({ success: true });
    return true;
  }
});

// openOverlayWindow optionally takes originTabId: when present, we'll inject the grey
// overlay into that tab and center the popup relative to that tab's window.
async function openOverlayWindow(url: string, width: number, height: number, originTabId?: number): Promise<any> {
  return new Promise((resolve, reject) => {
    try {
      if (!url || typeof url !== 'string') return reject(new Error('Invalid URL'));
      const chromeApi = (self as any).chrome;

      const centerAndCreate = (currentWin: any, injectTabId: number | null) => {
        try {
          const cw = currentWin && typeof currentWin.width === 'number' ? currentWin.width : 1200;
          const ch = currentWin && typeof currentWin.height === 'number' ? currentWin.height : 800;
          const cleft = typeof currentWin.left === 'number' ? currentWin.left : 0;
          const ctop = typeof currentWin.top === 'number' ? currentWin.top : 0;

          const left = cleft + Math.max(0, Math.round((cw - width) / 2));
          const top = ctop + Math.max(0, Math.round((ch - height) / 2));

          const doCreate = () => {
            chromeApi.windows.create({ url, type: 'popup', width, height, left, top, focused: true }, (createdWin: any) => {
              if (chromeApi.runtime.lastError) return reject(new Error(chromeApi.runtime.lastError.message));
              if (createdWin && createdWin.id && injectTabId !== null) overlayToTab.set(createdWin.id, injectTabId);
              if (createdWin && createdWin.id) {
                chromeApi.tabs.query({ windowId: createdWin.id }, (tabs: any[]) => {
                  const newTab = tabs && tabs[0];
                  if (newTab && typeof newTab.id === 'number') overlayTabIds.add(newTab.id);
                });
              }
              resolve(createdWin);
            });
          };

          if (injectTabId !== null) {
            try {
              chromeApi.scripting.executeScript({ target: { tabId: injectTabId }, files: ['overlay-inject.js'] }, () => {
                // ignore injection errors, still create popup
                doCreate();
              });
            } catch (e) {
              doCreate();
            }
          } else {
            doCreate();
          }
        } catch (e) { reject(e); }
      };

      if (typeof originTabId === 'number') {
        // try to get tab's window and center relative to it
        chromeApi.tabs.get(originTabId, (tabInfo: any) => {
          try {
            const winId = tabInfo && tabInfo.windowId;
            if (typeof winId === 'number') {
              chromeApi.windows.get(winId, { populate: false }, (win: any) => {
                centerAndCreate(win, originTabId);
              });
            } else {
              chromeApi.windows.getCurrent({ populate: false }, (win: any) => centerAndCreate(win, originTabId));
            }
          } catch (e) { centerAndCreate(null, originTabId); }
        });
      } else {
        chromeApi.windows.getCurrent({ populate: false }, (currentWin: any) => {
          centerAndCreate(currentWin, null);
        });
      }
    } catch (e) { reject(e); }
  });
}

// Map popup window id -> originating tab id (we inject an overlay into that tab)
const overlayToTab: Map<number, number> = new Map();
// Track tab ids that are the tabs inside popup windows we created, so the content
// script won't re-trigger overlay creation for them.
const overlayTabIds: Set<number> = new Set();
// Prevent multiple popups for the same tab within a short timeframe
const recentOpenByTab: Map<number, number> = new Map();
const RECENT_OPEN_MS = 3000;

// When a popup window is removed, tell the originating tab to remove the injected overlay
(self as any).chrome.windows.onRemoved.addListener((windowId: number) => {
  try {
    const chromeApi = (self as any).chrome;
    if (overlayToTab.has(windowId)) {
      const tabId = overlayToTab.get(windowId)!;
      overlayToTab.delete(windowId);
      try { overlayTabIds.delete(tabId); } catch (e) {}
      try {
        chromeApi.tabs.sendMessage(tabId, { action: 'removeOverlay' }, () => {});
      } catch (e) {}
    }
  } catch (e) {
    console.warn('onRemoved cleanup error', e);
  }
});

// Also listen for tab navigations as a fallback (some sites / reload flows may not
// trigger the content script message). When a tab finishes loading, check saved
// sites and open the Zeeguu exercises popup if there's a match.
(self as any).chrome.tabs.onUpdated.addListener((tabId: number, changeInfo: any, tab: any) => {
  try {
    // only consider fully loaded pages
    if (!changeInfo || changeInfo.status !== 'complete') return;
    const chromeApi = (self as any).chrome;
    try { console.log('[bg] tabs.onUpdated complete', tabId, changeInfo && changeInfo.url); } catch (e) {}

    const url = (changeInfo && changeInfo.url) ? changeInfo.url : (tab && tab.url ? tab.url : null);
    if (!url || !/^https?:\/\//i.test(url)) return;
    if (overlayTabIds.has(tabId)) return; // ignore tabs that are our popups
    // ignore rapid repeats for the same tab
    const last = recentOpenByTab.get(tabId) || 0;
    if (Date.now() - last < RECENT_OPEN_MS) return;

    // read savedSites and run matching logic
    chromeApi.storage && chromeApi.storage.local && chromeApi.storage.local.get(['savedSites'], (res: any) => {
      try {
        const sites = (res && Array.isArray(res.savedSites)) ? res.savedSites : [];
        let pageUrlObj: URL | null = null;
        try { pageUrlObj = new URL(url); } catch (e) { pageUrlObj = null; }

        // normalize and dedupe saved matches
        const seen = new Set<string>();
        const normalizedSites: any[] = [];
        for (const s of sites) {
          const item = (typeof s === 'string') ? { match: String(s).trim() } : s;
          const rawKey = String((item && item.match) || '').trim().toLowerCase();
          if (!rawKey) continue;
          if (seen.has(rawKey)) continue;
          seen.add(rawKey);
          normalizedSites.push(item);
        }

        for (const s of normalizedSites) {
          try {
            if (!s) continue;
            const item = (typeof s === 'string') ? { match: String(s).trim() } : s;
            const raw = String(item.match || '').trim();
            if (!raw) continue;

            // Normalize saved entry into a host string (domain only)
            let savedHost = '';
            try {
              const candidate = /^https?:\/\//i.test(raw) ? raw : 'https://' + raw;
              const savedUrlObj = new URL(candidate);
              savedHost = savedUrlObj.hostname.toLowerCase();
            } catch (e) {
              // fallback: strip path if user entered something like 'example.com/foo'
              const noProto = raw.replace(/^https?:\/\//i, '');
              savedHost = noProto.split('/')[0].toLowerCase();
            }

            if (!savedHost) continue;
            const pageHost = pageUrlObj ? pageUrlObj.hostname.toLowerCase() : (new URL(url)).hostname.toLowerCase();
            if (pageHost === savedHost || pageHost.endsWith('.' + savedHost)) {
              // Domain match only — open the hardcoded Zeeguu exercises popup
              openOverlayWindow('https://zeeguu.org/exercises', 900, 700, tabId).catch(() => {});
              recentOpenByTab.set(tabId, Date.now());
              return;
            }
          } catch (e) {}
        }
      } catch (e) {}
    });
  } catch (e) {}
});
