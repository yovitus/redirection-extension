/**
 * background.ts
 *
 * Opens a fixed-size popup window with the game and dims all tabs while open.
 */

import { normalizeStoredList } from '../ui/utils/list-utils';
import { normalizeTriggerSite } from '../shared/trigger-site';
import { getNextLocalMidnight } from '../shared/time';
import { createDelayManager } from './delay-manager';
import { createExperimentManager, EXPERIMENT_ALARM_NAME } from './experiment-manager';
import { DbLogger } from './dblogger';

const chromeApi: any = (globalThis as any).chrome;

// Configuration for active time logging to the database.
const LOG_FUNCTION_URL = 'https://khnycvxxfdixvtofxfqm.supabase.co/rest/v1/logs';
const LOG_ANON_KEY = 'sb_publishable_MlbW7wbBg8vh663gUXFP_w_grOoa-DD';
const LOG_USER_ID_KEY = 'focularUserId';
const USER_LOG_URL = 'https://khnycvxxfdixvtofxfqm.supabase.co/rest/v1/users';
const TRIGGER_LOG_URL = 'https://khnycvxxfdixvtofxfqm.supabase.co/rest/v1/trigger_site_events';
const dbLogger = new DbLogger({
  logUrl: LOG_FUNCTION_URL,
  anonKey: LOG_ANON_KEY,
  userUrl: USER_LOG_URL,
  triggerLogUrl: TRIGGER_LOG_URL,
  consentKey: 'experimentConsentGiven',
  storage: chromeApi?.storage?.local ?? null,
  userIdKey: LOG_USER_ID_KEY,
});

const GAME_URL = 'https://www.minisudoku.games/'//'https://minigamegpt.com/en/games/sudoku/';
const POPUP_BASE_WIDTH = 960;
const POPUP_BASE_HEIGHT = 640;
const POPUP_WIDTH_RATIO = 0.7;
const POPUP_HEIGHT_RATIO = 0.75;
const POPUP_MIN_WIDTH = 720;
const POPUP_MAX_WIDTH = 1100;
const POPUP_MIN_HEIGHT = 480;
const POPUP_MAX_HEIGHT = 820;
const POPUP_ZOOM = 0.9;
const BREAK_THRESHOLD_MS = 2 * 60 * 1000;
const GAME_OVERLAY_DOMAIN = 'focular-game-overlay';
const TAB_POPUP_SUPPRESS_MS = 5 * 1000;
const ACTIVE_VISIT_STATE_KEY = 'activeVisitState';

let activeVisitStartTs: number | null = null;
let activeVisitDomain: string | null = null;
let gameOverlayStartTs: number | null = null;

let cachedTriggerSites: string[] = [];
let popupWindowId: number | null = null;
let experimentPopupWindowId: number | null = null;
let openingPopup = false;
let currentVisitedUrl: string | null = null;
let currentVisitedIsTrigger = false;
let currentActiveTabId: number | null = null;
let currentActiveTabUrl: string | null = null;
let currentActiveTabWindowId: number | null = null;
let currentTriggerDomain: string | null = null;
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
const popupShownByTabAndDomain = new Map<number, { domain: string; shownAt: number }>();
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
const experimentManager = createExperimentManager({
	dbLogger,
	chromeApi,
	setPopupEnabled: setPopupEnabledManaged,
	openExperimentPopup,
	getFromStorage,
	setToStorage,
});

init();

// Bootstrap background listeners and cache.
function init() {
	if (!chromeApi?.storage) return;
	delayManager.setBreakThresholdMs(BREAK_THRESHOLD_MS);
	refreshSettings();
	watchStorage();
	watchMessages();
	watchTabs();
	watchWindows();
	watchAlarms();
	watchInstall();
	watchStartup();
	refreshActiveTab();
	syncExistingPopupWindow();
	syncExistingExperimentPopupWindow();
	void experimentManager.initExperiment();
}

// Refresh cached trigger sites when storage changes.
function watchStorage() {
	try {
		chromeApi.storage.onChanged.addListener((changes: any, area: string) => {
			if (area !== 'local') return;
			const hasTriggerChange = !!(changes.triggerSites || changes.savedSites);
			if (!hasTriggerChange && !changes.popupDelayMs && !changes.popupEnabled) return;
			if (hasTriggerChange) {
				void logTriggerSitesFromStorageChange(changes);
			}
			refreshSettings();
		});
	} catch (e) {}
}

function logTriggerSitesFromStorageChange(changes: any) {
	try {
		const change = changes.triggerSites ?? changes.savedSites;
		if (!change) return;
		const oldSites = normalizeTriggerSiteList(change.oldValue);
		const newSites = normalizeTriggerSiteList(change.newValue);
		const { added, removed } = diffTriggerSiteLists(oldSites, newSites);
		if (added.length === 0 && removed.length === 0) return;
		void dbLogger.logTriggerSiteChanges(added, removed, newSites);
	} catch (e) {}
}

function normalizeTriggerSiteList(value: any): string[] {
	const seen = new Set<string>();
	const output: string[] = [];
	for (const site of normalizeStoredList(value)) {
		const normalized = normalizeTriggerSite(String(site || ''));
		if (!normalized) continue;
		if (seen.has(normalized)) continue;
		seen.add(normalized);
		output.push(normalized);
	}
	return output;
}

function diffTriggerSiteLists(previous: string[], next: string[]) {
	const prevSet = new Set(previous);
	const nextSet = new Set(next);
	const added = next.filter((site) => !prevSet.has(site));
	const removed = previous.filter((site) => !nextSet.has(site));
	return { added, removed };
}

// Handle messages from content scripts (dismiss requests).
function watchMessages() {
	try {
		chromeApi.runtime.onMessage.addListener((message: any, sender: any) => {
			if (!message || typeof message.type !== 'string') return;
			if (message.type === 'dismiss-popup') {
				closePopup();
			}
			if (message.type === 'overlay-ready') {
				handleOverlayReady(sender);
			}
			if (message.type === 'experiment-consent') {
				handleExperimentConsent(message);
			}
			if (message.type === 'experiment-email') {
				handleExperimentEmail(message);
			}
		});
	} catch (e) {}
}

// Ensure the dim overlay is shown when a content script becomes ready.
function handleOverlayReady(sender: any) {
	if (hasModalOpen()) {
		const tabId = sender?.tab?.id;
		if (tabId) {
			try {
				chromeApi.tabs.sendMessage(tabId, buildShowDimMessage(), () => {
					const err = chromeApi.runtime.lastError;
					if (err) return;
				});
			} catch (e) {}
		}
		return;
	}

	Promise.all([findExistingPopupWindow(), findExistingExperimentPopupWindow()])
		.then(([existingGameId, existingExperimentId]) => {
			if (!existingGameId && !existingExperimentId) return;
			if (existingGameId) {
				popupWindowId = existingGameId;
				startGameOverlaySession();
				applyPopupZoom(popupWindowId);
			}
			if (existingExperimentId) {
				experimentPopupWindowId = existingExperimentId;
			}
			updateDimState();
		})
		.catch(() => {});
}
async function handleExperimentConsent(message:any) {
	try {
		if (typeof message?.consent !== 'boolean') return;
		await setToStorage({ experimentConsentGiven: message.consent });
		if (!message.consent) {
			await experimentManager.refreshExperimentState();
			return;
		}
		await dbLogger.logUserConsent(true);
		const res = await getFromStorage([
			'experimentState',
			'experimentUserEmail',
			'delayTimerChoice',
			'delayTimerLocked',
			'popupDelayMs',
			'triggerSites',
			'savedSites',
		]);
		const state = res?.experimentState;
		const startAt =
			typeof state?.startAt === 'number' ? state.startAt : getNextLocalMidnight(Date.now());
		const phase = typeof state?.phase === 'string' ? state.phase : undefined;
		await dbLogger.logUserCreated(startAt, phase);
		if (phase === 'logging' || phase === 'overlay' || phase === 'completed') {
			await dbLogger.logUserExperimentPhase(phase);
		}
		const email = typeof res?.experimentUserEmail === 'string' ? res.experimentUserEmail : '';
		if (email) {
			await dbLogger.logUserEmail(email);
		}
		const delayChoice = typeof res?.delayTimerChoice === 'string' ? res.delayTimerChoice : null;
		const delayLocked = res?.delayTimerLocked === true;
		let finalDelayChoice: 'Instant' | '5' | '10' | null =
			delayChoice === 'Instant' || delayChoice === '5' || delayChoice === '10' ? delayChoice : null;
		let finalDelayMs = typeof res?.popupDelayMs === 'number' ? res.popupDelayMs : null;
		if (!delayLocked) {
			const assignedLabel = await dbLogger.assignDelayTimerRoundRobin();
			const assigned =
				assignedLabel === 'Instant' || assignedLabel === '5' || assignedLabel === '10' ? assignedLabel : null;
			finalDelayChoice = assigned ?? finalDelayChoice ?? 'Instant';
			finalDelayMs =
				finalDelayChoice === '10'
					? 10 * 60 * 1000
					: finalDelayChoice === '5'
					? 5 * 60 * 1000
					: 0;
			await setToStorage({
				popupDelayMs: finalDelayMs,
				delayTimerChoice: finalDelayChoice,
				delayTimerLocked: true,
			});
		}
		if (finalDelayChoice) {
			await dbLogger.logUserDelayTimer(finalDelayChoice);
		}
		const triggerSites = normalizeTriggerSiteList(res?.triggerSites ?? res?.savedSites);
		if (triggerSites.length > 0) {
			await dbLogger.logTriggerSitesSnapshot(triggerSites);
		}
		await experimentManager.refreshExperimentState();
	} catch (e) {}
}

async function handleExperimentEmail(message: any) {
	try {
		if (typeof message?.email !== 'string') return;
		const email = message.email.trim();
		if (!email) return;
		await dbLogger.logUserEmail(email);
	} catch (e) {}
}

// Watch tab navigation to open popups and dim new tabs.
function watchTabs() {
	try {
		chromeApi.tabs.onUpdated.addListener((tabId: number, changeInfo: any, tab: any) => {
			if (changeInfo.status === 'complete' && tab?.url) {
				const isModalTab =
					(popupWindowId && tab.windowId === popupWindowId) ||
					(experimentPopupWindowId && tab.windowId === experimentPopupWindowId);
				if (isModalTab) return;
				if (hasModalOpen()) {
					chromeApi.tabs.sendMessage(tabId, buildShowDimMessage(), () => {
						const err = chromeApi.runtime.lastError;
						if (err) return;
					});
				}
				if (tabId === currentActiveTabId) {
					currentActiveTabUrl = tab.url;
					currentActiveTabWindowId = tab.windowId ?? null;
					if (!isModalWindow(tab.windowId)) {
						lastNonPopupUrl = tab.url ?? null;
					}
					updateActiveContext();
					return;
				}
				if (currentActiveTabId === null || tab?.active === true) {
					refreshActiveTab();
				}
			}
		});

		chromeApi.tabs.onActivated.addListener((activeInfo: any) => {
			try {
				chromeApi.tabs.get(activeInfo.tabId, (tab: any) => {
					if (chromeApi.runtime.lastError) return;
					if (experimentPopupWindowId && tab?.windowId !== experimentPopupWindowId) {
						focusExperimentPopup();
						return;
					}
					let closed = false;
					if (popupWindowId && tab?.windowId && tab.windowId !== popupWindowId) {
						closePopup();
						closed = true;
					}
					if (closed) return;
					currentActiveTabId = activeInfo.tabId;
					currentActiveTabUrl = tab?.url ?? null;
					currentActiveTabWindowId = tab?.windowId ?? null;
					if (!isModalWindow(tab?.windowId ?? null)) {
						lastNonPopupUrl = tab?.url ?? null;
					}
					updateActiveContext();
				});
			} catch (e) {}
		});

		chromeApi.tabs.onRemoved.addListener((tabId: number) => {
			popupShownByTabAndDomain.delete(tabId);
			if (tabId === currentActiveTabId) {
				endActiveVisit();
				currentActiveTabId = null;
				currentActiveTabUrl = null;
				currentActiveTabWindowId = null;
				currentTriggerDomain = null;
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
			if (
				experimentPopupWindowId &&
				windowId !== chromeApi.windows.WINDOW_ID_NONE &&
				windowId !== experimentPopupWindowId
			) {
				focusExperimentPopup();
				return;
			}
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
				endGameOverlaySession();
				popupWindowId = null;
				suppressNullActiveUpdate = true;
				updateDimState();
				refreshActiveTab();
			}
			if (experimentPopupWindowId === windowId) {
				experimentPopupWindowId = null;
				suppressNullActiveUpdate = true;
				updateDimState();
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
			currentTriggerDomain = null;
			if (!isModalWindow(tab?.windowId ?? null)) {
				lastNonPopupUrl = tab?.url ?? null;
			}
			updateActiveContext();
		});
	} catch (e) {}
}

function queryTabs(queryInfo: any): Promise<any[]> {
	return new Promise((resolve) => {
		try {
			chromeApi.tabs.query(queryInfo, (tabs: any[]) => {
				resolve(Array.isArray(tabs) ? tabs : []);
			});
		} catch (e) {
			resolve([]);
		}
	});
}

async function hasAudibleTriggerTab(): Promise<boolean> {
	try {
		if (!cachedTriggerSites || cachedTriggerSites.length === 0) return false;
		const tabs = await queryTabs({ audible: true });
		for (const tab of tabs) {
			const url = typeof tab?.url === 'string' ? tab.url : '';
			if (!url) continue;
			if (findMatchKey(url, cachedTriggerSites)) return true;
		}
	} catch (e) {}
	return false;
}

// Query the active tab and compute whether it is a trigger site.
async function getActiveTriggerState(): Promise<boolean> {
	try {
		const tabs = await queryTabs({ active: true, lastFocusedWindow: true });
		const tab = tabs && tabs.length > 0 ? tabs[0] : null;
		if (tab) {
			currentActiveTabId = tab.id ?? currentActiveTabId;
			currentActiveTabUrl = tab.url ?? currentActiveTabUrl;
			currentActiveTabWindowId = tab.windowId ?? currentActiveTabWindowId;
			if (!isModalWindow(tab.windowId)) {
				lastNonPopupUrl = tab.url ?? lastNonPopupUrl;
			}
		}

		const isPopupTab = isModalWindow(currentActiveTabWindowId);
		if (isPopupTab && !lastNonPopupUrl) {
			lastNonPopupUrl = currentVisitedUrl;
		}
		const href = isPopupTab ? lastNonPopupUrl : currentActiveTabUrl;
		if (!href) {
			const audibleTrigger = await hasAudibleTriggerTab();
			return currentVisitedIsTrigger || audibleTrigger;
		}

		const domain = findMatchKey(href, cachedTriggerSites);
		const isActiveTrigger = !!domain;
		currentTriggerDomain = isActiveTrigger ? domain : null;
		currentVisitedUrl = href;
		currentVisitedIsTrigger = isActiveTrigger;
		persistNavState();

		const audibleTrigger = await hasAudibleTriggerTab();
		return isActiveTrigger || audibleTrigger;
	} catch (e) {
		const audibleTrigger = await hasAudibleTriggerTab();
		return currentVisitedIsTrigger || audibleTrigger;
	}
}

// Wake on alarm to complete the delay timer.
function watchAlarms() {
	try {
		chromeApi.alarms?.onAlarm.addListener((alarm: any) => {
			if (!alarm?.name) return;
			if (alarm.name === EXPERIMENT_ALARM_NAME) {
				void experimentManager.refreshExperimentState();
				return;
			}
			navQueue = navQueue.then(async () => {
				await ensureNavStateLoaded();
				if (experimentPopupWindowId) return;
				const isTrigger = await getActiveTriggerState();
				delayManager.handleAlarm(alarm.name, isTrigger);
			});
		});
	} catch (e) {}
}

// Handle first install to create the user id and show onboarding.
function watchInstall() {
	try {
		chromeApi.runtime?.onInstalled?.addListener((details: any) => {
			if (details?.reason === 'install') {
				void (async () => {
					await experimentManager.handleFirstInstall();
					await openExtensionPopupWithFallback();
				})();
			}
		});
	} catch (e) {}
}

function watchStartup() {
	try {
		chromeApi.runtime?.onStartup?.addListener(() => {
			clearActiveVisitState();
		});
	} catch (e) {}
}

async function openExperimentPopup(mode: 'overlay' | 'complete'): Promise<boolean> {
	try {
		if (!chromeApi?.runtime?.getURL) return false;
		if (experimentPopupWindowId) {
			updateDimState();
			return true;
		}
		const existingId = await findExistingExperimentPopupWindow();
		if (existingId) {
			experimentPopupWindowId = existingId;
			updateDimState();
			return true;
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
		const url = chromeApi.runtime.getURL(`experiment.html?mode=${mode}`);
		const popup = await createWindow({
			url,
			type: 'popup',
			width: popupWidth,
			height: popupHeight,
			left: popupLeft,
			top: popupTop,
			focused: true,
		});
		experimentPopupWindowId = popup?.id ?? null;
		updateDimState();
		return true;
	} catch (e) {
		return false;
	}
}

// Load trigger sites and delay settings from storage.
async function refreshSettings() {
	try {
		const res = await getFromStorage(['triggerSites', 'savedSites', 'popupDelayMs', 'popupEnabled']);
		const previousDelay = popupDelayMs;
		cachedTriggerSites = normalizeTriggerSiteList(res.triggerSites ?? res.savedSites);
		popupDelayMs = typeof res.popupDelayMs === 'number' ? res.popupDelayMs : 0;
		popupEnabled = res.popupEnabled === true;
		if (popupDelayMs !== previousDelay) {
			delayManager.setDelayMs(popupDelayMs);
		}
		delayManager.setEnabled(popupEnabled);
		if (!popupEnabled) {
			closePopup();
			updateDimState();
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

async function setPopupEnabledManaged(enabled: boolean) {
	if (popupEnabled === enabled) return;
	popupEnabled = enabled;
	delayManager.setEnabled(enabled);
	await setToStorage({ popupEnabled: enabled });
	if (!enabled) {
		closePopup();
		updateDimState();
	}
}

// Update context for the active tab and active-time tracking.
function updateActiveContext() {
	navQueue = navQueue.then(async () => {
		await ensureNavStateLoaded();
		await ensureSettingsLoaded();
		const isPopupTab = isModalWindow(currentActiveTabWindowId);
		if (isPopupTab && !lastNonPopupUrl) {
			lastNonPopupUrl = currentVisitedUrl;
		}
		const href = isPopupTab ? lastNonPopupUrl : currentActiveTabUrl;
		if (!href) {
			if (popupWindowId && activeVisitStartTs && activeVisitDomain) {
				endActiveVisit();
			}
			return;
		}
		const domain = findMatchKey(href, cachedTriggerSites);
		const isActiveTrigger = !!(href && domain);
		const isAudibleTrigger = await hasAudibleTriggerTab();
		const isTriggerForDelay = isActiveTrigger || isAudibleTrigger;
		currentTriggerDomain = isActiveTrigger ? domain : null;
		const shouldTrackActiveVisit = isActiveTrigger && !popupWindowId;
		if (shouldTrackActiveVisit) {
			if (activeVisitStartTs && activeVisitDomain && domain && activeVisitDomain !== domain) {
				endActiveVisit();
			}
			if (!activeVisitStartTs && domain) {
				startActiveVisit(domain);
			}
		}
		if (!shouldTrackActiveVisit && activeVisitStartTs && activeVisitDomain) {
			endActiveVisit();
		}

		currentVisitedUrl = href;
		currentVisitedIsTrigger = isActiveTrigger;

		persistNavState();

		// Pause delay logic while the experiment modal is open.
		if (experimentPopupWindowId) {
			if (activeVisitStartTs && activeVisitDomain) {
				endActiveVisit();
			}
			return;
		}

		await delayManager.updateContext(isTriggerForDelay);
		if (popupWindowId && isActiveTrigger) {
			ensureDimOnActiveTab();
		}
	});

}

function startActiveVisit(domain: string) {
	activeVisitStartTs = Date.now();
	activeVisitDomain = domain;
	persistActiveVisitState();
}

function endActiveVisit() {
	if (!activeVisitStartTs || !activeVisitDomain) return;
	const durationMs = Date.now() - activeVisitStartTs;
	const durationMinutes = durationMs / 60000;
	dbLogger.logVisit(activeVisitDomain, durationMinutes);
	clearActiveVisitState();
}

// Ensure the active tab shows the dim overlay when a popup is open.
function ensureDimOnActiveTab() {
	if (!currentActiveTabId) return;
	if (popupWindowId && currentActiveTabWindowId === popupWindowId) return;
	try {
		chromeApi.tabs.sendMessage(currentActiveTabId, buildShowDimMessage(), () => {
			const err = chromeApi.runtime.lastError;
			if (err) {
				ensureOverlayInjected({ id: currentActiveTabId, url: currentActiveTabUrl });
			}
		});
	} catch (e) {}
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

		const normalizedPattern = normalizeTriggerSite(trimmed);
		if (!normalizedPattern) continue;
		const currentHost = currentUrl.hostname.replace(/^www\./i, '');
		if (currentHost === normalizedPattern || currentHost.endsWith(`.${normalizedPattern}`)) {
			return normalizedPattern;
		}
	}

	return null;
}

// Open the game popup window and dim all tabs.
async function openPopup() {
	if (shouldSuppressPopupForCurrentTab()) return;
	if (experimentPopupWindowId) {
		updateDimState();
		return;
	}
	if (popupWindowId) {
		startGameOverlaySession();
		return;
	}
	if (openingPopup) return;
	openingPopup = true;

	try {
		const existingId = await findExistingPopupWindow();
		if (existingId) {
			popupWindowId = existingId;
			markPopupShownForCurrentTab();
			startGameOverlaySession();
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
		markPopupShownForCurrentTab();
		startGameOverlaySession();
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
			markPopupShownForCurrentTab();
			startGameOverlaySession();
			applyPopupZoom(popupWindowId);
			showDimAllTabs();
		}
	} catch (e) {}
}

async function syncExistingExperimentPopupWindow() {
	try {
		const existingId = await findExistingExperimentPopupWindow();
		if (existingId) {
			experimentPopupWindowId = existingId;
			showDimAllTabs();
		}
	} catch (e) {}
}

// Close the popup window and clear dim overlays.
function closePopup() {
	if (!popupWindowId) {
		updateDimState();
		return;
	}
	endGameOverlaySession();
	const toClose = popupWindowId;
	popupWindowId = null;
	suppressNullActiveUpdate = true;

	try {
		chromeApi.windows.remove(toClose, () => {
				const err = chromeApi.runtime.lastError;
			if (err) {
				updateDimState();
				refreshActiveTab();
				return;
			}
			updateDimState();
			refreshActiveTab();
		});
	} catch (e) {
		updateDimState();
		refreshActiveTab();
	}
}

function focusExperimentPopup() {
	if (!experimentPopupWindowId) return;
	try {
		chromeApi.windows.update(experimentPopupWindowId, { focused: true }, () => {
			const err = chromeApi.runtime.lastError;
			if (!err) return;
			experimentPopupWindowId = null;
			updateDimState();
		});
	} catch (e) {}
}

async function openExtensionPopupWithFallback() {
	const opened = await tryOpenExtensionActionPopup();
	if (opened) return;
	await openSettingsInCurrentTab();
}

async function tryOpenExtensionActionPopup(): Promise<boolean> {
	try {
		if (typeof chromeApi?.action?.openPopup !== 'function') return false;
		await chromeApi.action.openPopup();
		return true;
	} catch (e) {
		return false;
	}
}

async function openSettingsInCurrentTab() {
	try {
		if (!chromeApi?.runtime?.getURL) return;
		const settingsUrl = chromeApi.runtime.getURL('popup.html');
		const targetTabId = await findSettingsTargetTabId();
		if (targetTabId) {
			await updateTabUrl(targetTabId, settingsUrl);
			return;
		}
		await createTab({ url: settingsUrl, active: true });
	} catch (e) {}
}

function findSettingsTargetTabId(): Promise<number | null> {
	return new Promise((resolve) => {
		try {
			chromeApi.tabs.query({ active: true }, (activeTabs: any[]) => {
				if (!Array.isArray(activeTabs)) return resolve(null);
				const activeNonModal = activeTabs.find((tab) => tab?.id && !isModalWindow(tab.windowId));
				if (activeNonModal?.id) return resolve(activeNonModal.id);
				chromeApi.tabs.query({}, (allTabs: any[]) => {
					if (!Array.isArray(allTabs)) return resolve(null);
					const nonModal = allTabs.find((tab) => tab?.id && !isModalWindow(tab.windowId));
					resolve(nonModal?.id ?? null);
				});
			});
		} catch (e) {
			resolve(null);
		}
	});
}

function updateTabUrl(tabId: number, url: string): Promise<void> {
	return new Promise((resolve) => {
		try {
			chromeApi.tabs.update(tabId, { url, active: true }, () => resolve());
		} catch (e) {
			resolve();
		}
	});
}

function createTab(createProperties: any): Promise<void> {
	return new Promise((resolve) => {
		try {
			chromeApi.tabs.create(createProperties, () => resolve());
		} catch (e) {
			resolve();
		}
	});
}

// Broadcast a show-dim command to all tabs.
function isModalWindow(windowId: number | null | undefined): boolean {
	if (!windowId && windowId !== 0) return false;
	return (
		(!!popupWindowId && windowId === popupWindowId) ||
		(!!experimentPopupWindowId && windowId === experimentPopupWindowId)
	);
}

function hasModalOpen(): boolean {
	return !!popupWindowId || !!experimentPopupWindowId;
}

function startGameOverlaySession() {
	if (!popupWindowId) return;
	if (gameOverlayStartTs) return;
	gameOverlayStartTs = Date.now();
}

function shouldSuppressPopupForCurrentTab(): boolean {
	if (!currentVisitedIsTrigger) return false;
	if (!currentActiveTabId || !currentTriggerDomain) return false;
	const record = popupShownByTabAndDomain.get(currentActiveTabId);
	if (!record) return false;
	if (record.domain !== currentTriggerDomain) return false;
	if (Date.now() - record.shownAt <= TAB_POPUP_SUPPRESS_MS) {
		popupShownByTabAndDomain.set(currentActiveTabId, {
			domain: record.domain,
			shownAt: Date.now(),
		});
		return true;
	}
	popupShownByTabAndDomain.delete(currentActiveTabId);
	return false;
}

function markPopupShownForCurrentTab() {
	if (!currentActiveTabId || !currentTriggerDomain) return;
	popupShownByTabAndDomain.set(currentActiveTabId, {
		domain: currentTriggerDomain,
		shownAt: Date.now(),
	});
}

function endGameOverlaySession() {
	if (!gameOverlayStartTs) return;
	const durationMinutes = (Date.now() - gameOverlayStartTs) / 60000;
	void dbLogger.logVisit(GAME_OVERLAY_DOMAIN, durationMinutes);
	gameOverlayStartTs = null;
}

function updateDimState() {
	if (hasModalOpen()) {
		showDimAllTabs();
	} else {
		hideDimAllTabs();
	}
}

function showDimAllTabs() {
	broadcastToTabs(buildShowDimMessage());
}

// Broadcast a hide-dim command to all tabs.
function hideDimAllTabs() {
	broadcastToTabs({ type: 'hide-dim' });
}

function buildShowDimMessage() {
	return {
		type: 'show-dim',
		allowDismiss: !!popupWindowId,
	};
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
						if (err && message?.type === 'show-dim') {
							ensureOverlayInjected(tab);
						}
					});
				} catch (e) {}
			});
		});
	} catch (e) {}
}

// Inject the overlay content script if the tab has no listener.
function ensureOverlayInjected(tab: any) {
	try {
		if (!chromeApi.scripting?.executeScript) return;
		const url = typeof tab?.url === 'string' ? tab.url : '';
		if (!/^https?:/i.test(url)) return;
		chromeApi.scripting.executeScript(
			{
				target: { tabId: tab.id },
				files: ['overlay-inject.js'],
			},
			() => {
				if (chromeApi.runtime.lastError) return;
				try {
					chromeApi.tabs.sendMessage(tab.id, buildShowDimMessage(), () => {
						const err = chromeApi.runtime.lastError;
						if (err) return;
					});
				} catch (e) {}
			},
		);
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

// Load the last navigation state and any in-flight visit from session/local storage.
async function loadNavState(): Promise<void> {
	try {
		const storage = getStateStorage();
		if (!storage) return;
		const res = await getFromStorageArea(storage, ['navState', ACTIVE_VISIT_STATE_KEY]);
		const navState = res?.navState;
		if (navState) {
			currentActiveTabId = typeof navState.currentTabId === 'number' ? navState.currentTabId : null;
			currentActiveTabWindowId = typeof navState.currentWindowId === 'number' ? navState.currentWindowId : null;
			currentVisitedUrl = typeof navState.currentUrl === 'string' ? navState.currentUrl : null;
			currentVisitedIsTrigger = !!navState.currentIsTrigger;
			lastNonPopupUrl = typeof navState.lastNonPopupUrl === 'string' ? navState.lastNonPopupUrl : null;
		}
		const activeVisit = res?.[ACTIVE_VISIT_STATE_KEY];
		const startTs = typeof activeVisit?.startTs === 'number' ? activeVisit.startTs : null;
		const domain = typeof activeVisit?.domain === 'string' ? activeVisit.domain : null;
		if (startTs && domain) {
			activeVisitStartTs = startTs;
			activeVisitDomain = domain;
		} else {
			activeVisitStartTs = null;
			activeVisitDomain = null;
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
				currentTabId: currentActiveTabId,
				currentWindowId: currentActiveTabWindowId,
				currentUrl: currentVisitedUrl,
				currentIsTrigger: currentVisitedIsTrigger,
				lastNonPopupUrl,
			},
		});
	} catch (e) {}
}

function persistActiveVisitState() {
	try {
		const storage = getStateStorage();
		if (!storage || !activeVisitStartTs || !activeVisitDomain) return;
		storage.set({
			[ACTIVE_VISIT_STATE_KEY]: {
				startTs: activeVisitStartTs,
				domain: activeVisitDomain,
			},
		});
	} catch (e) {}
}

function clearActiveVisitState() {
	activeVisitStartTs = null;
	activeVisitDomain = null;
	try {
		const storage = getStateStorage();
		if (!storage) return;
		if (typeof storage.remove === 'function') {
			storage.remove([ACTIVE_VISIT_STATE_KEY], () => {});
			return;
		}
		storage.set({ [ACTIVE_VISIT_STATE_KEY]: null });
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

function setToStorage(values: Record<string, any>): Promise<void> {
	return new Promise((resolve) => {
		try {
			chromeApi.storage.local.set(values, () => {
				resolve();
			});
		} catch (e) {
			resolve();
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

function findExistingExperimentPopupWindow(): Promise<number | null> {
	return new Promise((resolve) => {
		try {
			const prefix = chromeApi?.runtime?.getURL
				? chromeApi.runtime.getURL('experiment.html')
				: null;
			if (!prefix) return resolve(null);
			chromeApi.windows.getAll({ populate: true }, (windows: any[]) => {
				if (!Array.isArray(windows)) return resolve(null);
				const matches: number[] = [];
				for (const win of windows) {
					if (win?.type !== 'popup') continue;
					const tabs = Array.isArray(win.tabs) ? win.tabs : [];
					const match = tabs.find(
						(tab: any) => typeof tab?.url === 'string' && tab.url.startsWith(prefix),
					);
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
