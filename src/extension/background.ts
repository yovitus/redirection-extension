/**
 * background.ts
 *
 * Opens a fixed-size popup window with the game and dims all tabs while open.
 */

import { normalizeStoredList } from '../ui/utils/list-utils';

const chromeApi: any = (globalThis as any).chrome;

const GAME_URL = 'https://minigamegpt.com/en/games/sudoku/';
const POPUP_WIDTH = 960;
const POPUP_HEIGHT = 640;

let cachedTriggerSites: string[] = [];
let popupWindowId: number | null = null;
let openingPopup = false;
let currentVisitedUrl: string | null = null;
let currentVisitedIsTrigger = false;
let navStateLoaded = false;
let navStatePromise: Promise<void> | null = null;
let navQueue: Promise<void> = Promise.resolve();

init();

// Bootstrap background listeners and cache.
function init() {
	if (!chromeApi?.storage) return;
	refreshTriggerSites();
	watchStorage();
	watchMessages();
	watchTabs();
	watchWindows();
}

// Refresh cached trigger sites when storage changes.
function watchStorage() {
	try {
		chromeApi.storage.onChanged.addListener((changes: any, area: string) => {
			if (area !== 'local') return;
			if (!changes.triggerSites && !changes.savedSites) return;
			refreshTriggerSites();
		});
	} catch (e) {}
}

// Handle messages from content scripts (dismiss requests).
function watchMessages() {
	try {
		chromeApi.runtime.onMessage.addListener((message: any, sender: any) => {
			if (!message || typeof message.type !== 'string') return;
			if (message.type === 'dismiss-popup') {
				closePopup();
			}
		});
	} catch (e) {}
}

// Watch tab navigation to open popups and dim new tabs.
function watchTabs() {
	try {
		chromeApi.tabs.onUpdated.addListener((tabId: number, changeInfo: any, tab: any) => {
			if (changeInfo.status === 'complete' && tab?.url) {
				if (popupWindowId && tab.windowId === popupWindowId) return;
				if (popupWindowId) {
					chromeApi.tabs.sendMessage(tabId, { type: 'show-dim' }, () => {
						const err = chromeApi.runtime.lastError;
						if (err) return;
					});
				}
				navQueue = navQueue.then(() => handleNavigation(tabId, tab.url));
			}
		});

		chromeApi.tabs.onActivated.addListener((activeInfo: any) => {
			try {
				chromeApi.tabs.get(activeInfo.tabId, (tab: any) => {
					if (chromeApi.runtime.lastError) return;
					if (popupWindowId && tab?.windowId && tab.windowId !== popupWindowId) {
						closePopup();
						return;
					}
				});
			} catch (e) {}
		});

	} catch (e) {}
}

// Close popup when the user focuses another window.
function watchWindows() {
	try {
		chromeApi.windows.onFocusChanged.addListener((windowId: number) => {
			if (popupWindowId && windowId !== popupWindowId) {
				closePopup();
			}
		});

		chromeApi.windows.onRemoved.addListener((windowId: number) => {
			if (popupWindowId === windowId) {
				popupWindowId = null;
				hideDimAllTabs();
			}
		});
	} catch (e) {}
}

// Load trigger sites from storage.
async function refreshTriggerSites() {
	try {
		const res = await getFromStorage(['triggerSites', 'savedSites']);
		cachedTriggerSites = normalizeStoredList(res.triggerSites ?? res.savedSites);
	} catch (e) {
		cachedTriggerSites = [];
	}
}

// Update navigation state and decide whether to open the popup.
async function handleNavigation(_tabId: number, href: string) {
	if (!href || !cachedTriggerSites.length) return;
	await ensureNavStateLoaded();
	const isTrigger = !!findMatchKey(href, cachedTriggerSites);
	const shouldOpen = isTrigger && !currentVisitedIsTrigger;

	currentVisitedUrl = href;
	currentVisitedIsTrigger = isTrigger;
	persistNavState();

	if (shouldOpen) {
		openPopup();
	}
}

// Match current URL against saved trigger patterns.
function findMatchKey(href: string, patterns: string[]): string | null {
	let currentUrl: URL;
	try {
		currentUrl = new URL(href);
	} catch (e) {
		return null;
	}

	for (const pattern of patterns) {
		const trimmed = String(pattern || '').trim();
		if (!trimmed) continue;

		if (/^https?:\/\//i.test(trimmed)) {
			if (href.startsWith(trimmed)) return trimmed;
			continue;
		}

		const normalizedPattern = trimmed.replace(/^www\./i, '');
		const currentHost = currentUrl.hostname.replace(/^www\./i, '');
		if (currentHost === normalizedPattern || currentHost.endsWith(`.${normalizedPattern}`)) {
			return trimmed;
		}
	}

	return null;
}

// Open the game popup window and dim all tabs.
async function openPopup() {
	if (popupWindowId || openingPopup) return;
	openingPopup = true;

	try {
		const currentWindow = await getCurrentWindow();
		const left = currentWindow?.left ?? 0;
		const top = currentWindow?.top ?? 0;
		const width = currentWindow?.width ?? POPUP_WIDTH;
		const height = currentWindow?.height ?? POPUP_HEIGHT;
		const popupLeft = Math.round(left + Math.max(0, (width - POPUP_WIDTH) / 2));
		const popupTop = Math.round(top + Math.max(0, (height - POPUP_HEIGHT) / 2));

		const popup = await createWindow({
			url: GAME_URL,
			type: 'popup',
			width: POPUP_WIDTH,
			height: POPUP_HEIGHT,
			left: popupLeft,
			top: popupTop,
			focused: true,
		});

		popupWindowId = popup?.id ?? null;
		showDimAllTabs();
	} catch (e) {
		// ignore
	} finally {
		openingPopup = false;
	}
}

// Close the popup window and clear dim overlays.
function closePopup() {
	if (!popupWindowId) {
		hideDimAllTabs();
		return;
	}
	const toClose = popupWindowId;
	popupWindowId = null;

	try {
		chromeApi.windows.remove(toClose, () => {
			hideDimAllTabs();
		});
	} catch (e) {
		hideDimAllTabs();
	}
}

// Broadcast a show-dim command to all tabs.
function showDimAllTabs() {
	broadcastToTabs({ type: 'show-dim' });
}

// Broadcast a hide-dim command to all tabs.
function hideDimAllTabs() {
	broadcastToTabs({ type: 'hide-dim' });
}

// Send a message to every open tab.
function broadcastToTabs(message: any) {
	try {
		chromeApi.tabs.query({}, (tabs: any[]) => {
			tabs.forEach((tab) => {
				if (!tab?.id) return;
				try {
					chromeApi.tabs.sendMessage(tab.id, message, () => {
						const err = chromeApi.runtime.lastError;
						if (err) return;
					});
				} catch (e) {}
			});
		});
	} catch (e) {}
}

// Ensure navigation state is loaded from storage (service workers can restart).
function ensureNavStateLoaded(): Promise<void> {
	if (navStateLoaded) return Promise.resolve();
	if (!navStatePromise) {
		navStatePromise = loadNavState();
	}
	return navStatePromise;
}

// Load the last navigation state from session/local storage.
async function loadNavState(): Promise<void> {
	try {
		const storage = getStateStorage();
		if (!storage) return;
		const res = await getFromStorageArea(storage, ['navState']);
		const navState = res?.navState;
		if (navState) {
			currentVisitedUrl = typeof navState.currentUrl === 'string' ? navState.currentUrl : null;
			currentVisitedIsTrigger = !!navState.currentIsTrigger;
		}
	} catch (e) {
		// ignore
	} finally {
		navStateLoaded = true;
	}
}

// Persist the latest navigation state.
function persistNavState() {
	try {
		const storage = getStateStorage();
		if (!storage) return;
		storage.set({
			navState: {
				currentUrl: currentVisitedUrl,
				currentIsTrigger: currentVisitedIsTrigger,
			},
		});
	} catch (e) {}
}

// Prefer session storage; fall back to local if unavailable.
function getStateStorage(): any | null {
	return chromeApi.storage?.session ?? chromeApi.storage?.local ?? null;
}

// Promisified wrapper around chrome.storage area get.
function getFromStorageArea(area: any, keys: string[]): Promise<any> {
	return new Promise((resolve) => {
		try {
			area.get(keys, (res: any) => resolve(res || {}));
		} catch (e) {
			resolve({});
		}
	});
}

// Promisified wrapper around chrome.storage.local.get.
function getFromStorage(keys: string[]): Promise<any> {
	return new Promise((resolve) => {
		try {
			chromeApi.storage.local.get(keys, (res: any) => resolve(res || {}));
		} catch (e) {
			resolve({});
		}
	});
}

// Promisified wrapper around chrome.windows.getCurrent.
function getCurrentWindow(): Promise<any> {
	return new Promise((resolve) => {
		try {
			chromeApi.windows.getCurrent((win: any) => resolve(win || null));
		} catch (e) {
			resolve(null);
		}
	});
}

// Promisified wrapper around chrome.windows.create.
function createWindow(createData: any): Promise<any> {
	return new Promise((resolve, reject) => {
		try {
			chromeApi.windows.create(createData, (win: any) => {
				if (chromeApi.runtime.lastError) return reject(new Error(chromeApi.runtime.lastError.message));
				resolve(win || null);
			});
		} catch (e) {
			reject(e);
		}
	});
}
