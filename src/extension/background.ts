/**
 * background.ts
 *
 * Opens a fixed-size popup window with the game and dims all tabs while open.
 */

import { normalizeStoredList } from '../ui/utils/list-utils';
import { createDelayManager } from './delay-manager';

const chromeApi: any = (globalThis as any).chrome;

const GAME_URL = 'https://minigamegpt.com/en/games/sudoku/';
const POPUP_BASE_WIDTH = 960;
const POPUP_BASE_HEIGHT = 640;
const POPUP_WIDTH_RATIO = 0.7;
const POPUP_HEIGHT_RATIO = 0.75;
const POPUP_MIN_WIDTH = 720;
const POPUP_MAX_WIDTH = 1100;
const POPUP_MIN_HEIGHT = 480;
const POPUP_MAX_HEIGHT = 820;
const POPUP_ZOOM = 0.9;

let cachedTriggerSites: string[] = [];
let popupWindowId: number | null = null;
let openingPopup = false;
let currentVisitedUrl: string | null = null;
let currentVisitedIsTrigger = false;
let currentActiveTabId: number | null = null;
let currentActiveTabUrl: string | null = null;
let currentActiveTabWindowId: number | null = null;
let lastNonPopupUrl: string | null = null;
let suppressNullActiveUpdate = false;
let windowFocused = true;
let navStateLoaded = false;
let navStatePromise: Promise<void> | null = null;
let navQueue: Promise<void> = Promise.resolve();
let settingsLoaded = false;
let settingsPromise: Promise<void> | null = null;
let popupDelayMs = 0;
let popupEnabled = false;
const delayManager = createDelayManager({
	getStorage: getDelayStorage,
	openPopup: () => openPopup(),
	scheduleAlarm: (name, whenMs) => {
		try {
			if (!chromeApi.alarms) return;
			chromeApi.alarms.create(name, { when: whenMs });
		} catch (e) {}
	},
	clearAlarm: (name) => {
		try {
			chromeApi.alarms?.clear(name);
		} catch (e) {}
	},
});

init();

// Bootstrap background listeners and cache.
function init() {
	if (!chromeApi?.storage) return;
	refreshSettings();
	watchStorage();
	watchMessages();
	watchTabs();
	watchWindows();
	watchAlarms();
	refreshActiveTab();
	syncExistingPopupWindow();
}

// Refresh cached trigger sites when storage changes.
function watchStorage() {
	try {
		chromeApi.storage.onChanged.addListener((changes: any, area: string) => {
			if (area !== 'local') return;
			if (!changes.triggerSites && !changes.savedSites && !changes.popupDelayMs && !changes.popupEnabled) return;
			refreshSettings();
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
				if (tabId === currentActiveTabId) {
					currentActiveTabUrl = tab.url;
					currentActiveTabWindowId = tab.windowId ?? null;
					if (!popupWindowId || tab.windowId !== popupWindowId) {
						lastNonPopupUrl = tab.url ?? null;
					}
					updateActiveContext();
				}
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
					currentActiveTabId = activeInfo.tabId;
					currentActiveTabUrl = tab?.url ?? null;
					currentActiveTabWindowId = tab?.windowId ?? null;
					if (!popupWindowId || tab?.windowId !== popupWindowId) {
						lastNonPopupUrl = tab?.url ?? null;
					}
					updateActiveContext();
				});
			} catch (e) {}
		});

		chromeApi.tabs.onRemoved.addListener((tabId: number) => {
			if (tabId === currentActiveTabId) {
				currentActiveTabId = null;
				currentActiveTabUrl = null;
				currentActiveTabWindowId = null;
				if (suppressNullActiveUpdate) {
					suppressNullActiveUpdate = false;
					return;
				}
				updateActiveContext();
			}
		});
	} catch (e) {}
}

// Close popup when the user focuses another window.
function watchWindows() {
	try {
		chromeApi.windows.onFocusChanged.addListener((windowId: number) => {
			windowFocused = windowId !== chromeApi.windows.WINDOW_ID_NONE;
			if (popupWindowId && windowId !== popupWindowId) {
				closePopup();
			}
			if (windowFocused) {
				refreshActiveTab();
			} else {
				updateActiveContext();
			}
		});

		chromeApi.windows.onRemoved.addListener((windowId: number) => {
			if (popupWindowId === windowId) {
				popupWindowId = null;
				suppressNullActiveUpdate = true;
				hideDimAllTabs();
				refreshActiveTab();
			}
		});
	} catch (e) {}
}

// Refresh the currently active tab in the focused window.
function refreshActiveTab() {
	try {
		chromeApi.tabs.query({ active: true, lastFocusedWindow: true }, (tabs: any[]) => {
			const tab = tabs && tabs.length > 0 ? tabs[0] : null;
			currentActiveTabId = tab?.id ?? null;
			currentActiveTabUrl = tab?.url ?? null;
			currentActiveTabWindowId = tab?.windowId ?? null;
			if (!popupWindowId || tab?.windowId !== popupWindowId) {
				lastNonPopupUrl = tab?.url ?? null;
			}
			updateActiveContext();
		});
	} catch (e) {}
}

// Wake on alarm to complete the delay timer.
function watchAlarms() {
	try {
		chromeApi.alarms?.onAlarm.addListener((alarm: any) => {
			if (!alarm?.name) return;
			navQueue = navQueue.then(async () => {
				await ensureNavStateLoaded();
				delayManager.handleAlarm(alarm.name);
			});
		});
	} catch (e) {}
}

// Load trigger sites and delay settings from storage.
async function refreshSettings() {
	try {
		const res = await getFromStorage(['triggerSites', 'savedSites', 'popupDelayMs', 'popupEnabled']);
		const previousDelay = popupDelayMs;
		cachedTriggerSites = normalizeStoredList(res.triggerSites ?? res.savedSites);
		popupDelayMs = typeof res.popupDelayMs === 'number' ? res.popupDelayMs : 0;
		popupEnabled = res.popupEnabled === true;
		if (popupDelayMs !== previousDelay) {
			delayManager.setDelayMs(popupDelayMs);
		}
		delayManager.setEnabled(popupEnabled);
		if (!popupEnabled) {
			closePopup();
			hideDimAllTabs();
		}
	} catch (e) {
		cachedTriggerSites = [];
		popupDelayMs = 0;
		popupEnabled = false;
	} finally {
		settingsLoaded = true;
		updateActiveContext();
	}
}

// Update context for the active tab and active-time tracking.
function updateActiveContext() {
	navQueue = navQueue.then(async () => {
		await ensureNavStateLoaded();
		await ensureSettingsLoaded();
		const isPopupTab = popupWindowId && currentActiveTabWindowId === popupWindowId;
		if (isPopupTab && !lastNonPopupUrl) {
			lastNonPopupUrl = currentVisitedUrl;
		}
		const href = isPopupTab ? lastNonPopupUrl : currentActiveTabUrl;
		if (!href) return;
		const isTrigger = !!(href && findMatchKey(href, cachedTriggerSites));
		currentVisitedUrl = href;
		currentVisitedIsTrigger = isTrigger;
		persistNavState();

		delayManager.updateContext(isTrigger);
	});
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
		const existingId = await findExistingPopupWindow();
		if (existingId) {
			popupWindowId = existingId;
			applyPopupZoom(popupWindowId);
			showDimAllTabs();
			return;
		}
		const currentWindow = await getCurrentWindow();
		const left = currentWindow?.left ?? 0;
		const top = currentWindow?.top ?? 0;
		const width = currentWindow?.width ?? POPUP_BASE_WIDTH;
		const height = currentWindow?.height ?? POPUP_BASE_HEIGHT;
		const popupWidth = clamp(Math.round(width * POPUP_WIDTH_RATIO), POPUP_MIN_WIDTH, POPUP_MAX_WIDTH);
		const popupHeight = clamp(Math.round(height * POPUP_HEIGHT_RATIO), POPUP_MIN_HEIGHT, POPUP_MAX_HEIGHT);
		const popupLeft = Math.round(left + Math.max(0, (width - popupWidth) / 2));
		const popupTop = Math.round(top + Math.max(0, (height - popupHeight) / 2));

		const popup = await createWindow({
			url: GAME_URL,
			type: 'popup',
			width: popupWidth,
			height: popupHeight,
			left: popupLeft,
			top: popupTop,
			focused: true,
		});

		popupWindowId = popup?.id ?? null;
		applyPopupZoom(popupWindowId);
		showDimAllTabs();
	} catch (e) {
		// ignore
	} finally {
		openingPopup = false;
	}
}

// Restore popup state after service worker restarts.
async function syncExistingPopupWindow() {
	try {
		const existingId = await findExistingPopupWindow();
		if (existingId) {
			popupWindowId = existingId;
			applyPopupZoom(popupWindowId);
			showDimAllTabs();
		}
	} catch (e) {}
}

// Close the popup window and clear dim overlays.
function closePopup() {
	if (!popupWindowId) {
		hideDimAllTabs();
		return;
	}
	const toClose = popupWindowId;
	popupWindowId = null;
	suppressNullActiveUpdate = true;

	try {
		chromeApi.windows.remove(toClose, () => {
			hideDimAllTabs();
			refreshActiveTab();
		});
	} catch (e) {
		hideDimAllTabs();
		refreshActiveTab();
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

// Apply a zoom level to the popup window's active tab.
function applyPopupZoom(windowId: number | null) {
	if (!windowId) return;
	try {
		chromeApi.tabs.query({ windowId, active: true }, (tabs: any[]) => {
			const tabId = tabs && tabs[0] ? tabs[0].id : null;
			if (!tabId) return;
			try {
				chromeApi.tabs.setZoom(tabId, POPUP_ZOOM, () => {});
			} catch (e) {}
		});
	} catch (e) {}
}

// Clamp a number between min and max values.
function clamp(value: number, min: number, max: number): number {
	return Math.min(max, Math.max(min, value));
}

// Ensure settings are loaded from storage.
function ensureSettingsLoaded(): Promise<void> {
	if (settingsLoaded) return Promise.resolve();
	if (!settingsPromise) {
		settingsPromise = refreshSettings().then(() => {
			settingsLoaded = true;
		});
	}
	return settingsPromise;
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

// Persist delay state to local storage so it survives service worker restarts.
function getDelayStorage(): any | null {
	return chromeApi.storage?.local ?? chromeApi.storage?.session ?? null;
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

// Find an existing popup window showing the game URL.
function findExistingPopupWindow(): Promise<number | null> {
	return new Promise((resolve) => {
		try {
			chromeApi.windows.getAll({ populate: true }, (windows: any[]) => {
				if (!Array.isArray(windows)) return resolve(null);
				const matches: number[] = [];
				for (const win of windows) {
					if (win?.type !== 'popup') continue;
					const tabs = Array.isArray(win.tabs) ? win.tabs : [];
					const match = tabs.find((tab: any) => typeof tab?.url === 'string' && tab.url.startsWith(GAME_URL));
					if (match && win.id) matches.push(win.id);
				}
				if (matches.length === 0) return resolve(null);
				const [keep, ...extras] = matches;
				extras.forEach((id) => {
					try {
						chromeApi.windows.remove(id, () => {});
					} catch (e) {}
				});
				resolve(keep ?? null);
			});
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
