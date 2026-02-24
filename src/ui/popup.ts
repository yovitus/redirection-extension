/**
 * popup.ts
 *
 * Popup controller for managing trigger sites.
 */

import { normalizeStoredList } from './utils/list-utils';

// Use chrome from window to avoid duplicate ambient declarations
const chromeApi: any = (window as any).chrome;

window.addEventListener('DOMContentLoaded', () => {
	setupLists();
	setupDelayButtons();
	setupPopupToggle();
	setupStorageListener();
	focusInput('trigger-url');
	renderAllLists();
	renderDelayButtons();
	renderPopupToggle();
	renderDelayTimer();
	renderExperimentStatus();
});

type ListKey = 'triggerSites';

type ExperimentPhase = 'logging' | 'overlay' | 'completed';

type ExperimentState = {
	startAt: number;
	phase?: ExperimentPhase;
	experimentStartAt?: number;
};

type ListConfig = {
	key: ListKey;
	inputId: string;
	buttonId: string;
	listId: string;
	emptyText: string;
	normalize?: (value: string) => string;
	display?: (value: string) => string;
};

// Configuration for popup lists.
const LISTS: ListConfig[] = [
	{
		key: 'triggerSites',
		inputId: 'trigger-url',
		buttonId: 'save-trigger-btn',
		listId: 'trigger-sites-list',
		emptyText: 'No trigger sites yet - add one above.',
		normalize: normalizeTriggerSite,
		display: (value) => value.replace(/^https?:\/\//i, ''),
	},
];

const DAY_MS = 24 * 60 * 60 * 1000;
const EXPERIMENT_OVERLAY_DAYS = 7;
const EXPERIMENT_TOTAL_DAYS = 14;
const EXPERIMENT_STATE_KEY = 'experimentState';

// Bind UI events for adding items to each list.
function setupLists() {
	LISTS.forEach((config) => {
		const input = document.getElementById(config.inputId) as HTMLInputElement | null;
		const button = document.getElementById(config.buttonId) as HTMLButtonElement | null;
		if (!input || !button) return;

		const addCurrentValue = async () => {
			const raw = (input.value || '').trim();
			if (!raw) return;
			const normalized = config.normalize ? config.normalize(raw) : raw;
			if (!normalized) return;
			try {
				const list = await getList(config.key);
				if (!list.includes(normalized)) {
					list.push(normalized);
					await setList(config.key, list);
				}
				input.value = '';
				renderList(config);
			} catch (e) {
				console.warn('Failed to save entry', e);
			}
		};

		button.addEventListener('click', addCurrentValue);
		input.addEventListener('keydown', (event) => {
			if (event.key === 'Enter') {
				event.preventDefault();
				addCurrentValue();
			}
		});
	});
}

// Focus and select the primary input on load.
function focusInput(id: string) {
	try {
		const el = document.getElementById(id) as HTMLInputElement | null;
		if (el) {
			el.focus();
			el.select && el.select();
		}
	} catch (e) {}
}

// Render all configured lists in the popup.
async function renderAllLists() {
	for (const config of LISTS) {
		await renderList(config);
	}
}

// Bind UI events for the delay option buttons.
function setupDelayButtons() {
	const buttons = Array.from(document.querySelectorAll<HTMLButtonElement>('.delay-btn'));
	buttons.forEach((button) => {
		button.addEventListener('click', async () => {
			const { locked } = await getDelayTimerLock();
			if (locked) return;
			const raw = button.dataset.delay;
			const delayMs = raw ? Number(raw) : 0;
			if (!Number.isFinite(delayMs)) return;
			try {
				const current = await getPopupDelayMs();
				const nextDelay = current === delayMs ? null : delayMs;
				await setPopupDelayMs(nextDelay);
				renderDelayButtons();
				renderPopupToggle();
			} catch (e) {
				console.warn('Failed to save delay', e);
			}
		});
	});
}

// Bind UI events for enabling/disabling popup logic.
function setupPopupToggle() {
	const input = document.getElementById('popup-enabled') as HTMLInputElement | null;
	if (!input) return;
	input.addEventListener('change', async () => {
		if (input.disabled) return;
		try {
			await setPopupEnabled(input.checked);
			renderPopupToggle();
			renderDelayButtons();
		} catch (e) {
			console.warn('Failed to toggle popup', e);
		}
	});
}

// Render the selected delay button state.
async function renderDelayButtons() {
	const [currentDelay, enabled, lockState] = await Promise.all([
		getPopupDelayMs(),
		getPopupEnabled(),
		getDelayTimerLock(),
	]);
	const buttons = Array.from(document.querySelectorAll<HTMLButtonElement>('.delay-btn'));
	buttons.forEach((button) => {
		const raw = button.dataset.delay;
		const delayMs = raw ? Number(raw) : 0;
		const isActive = Number.isFinite(delayMs) && currentDelay !== null && delayMs === currentDelay;
		button.classList.toggle('active', isActive);
		button.disabled = enabled || lockState.locked;
	});
}

// Render the popup enabled toggle and disabled state styling.
async function renderPopupToggle() {
	const [enabled, currentDelay, experiment] = await Promise.all([
		getPopupEnabled(),
		getPopupDelayMs(),
		getExperimentState(),
	]);
	const delayChosen = currentDelay !== null && Number.isFinite(currentDelay);
	const experimentManaged = !!experiment?.startAt;
	const experimentPhase =
		experiment && experiment.startAt ? getExperimentPhase(experiment, Date.now()) : null;
	const input = document.getElementById('popup-enabled') as HTMLInputElement | null;
	if (input) {
		input.checked = enabled;
		input.disabled = experimentManaged || !delayChosen;
	}
	updatePopupToggleCopy(experimentManaged, experimentPhase);

	const settings = document.getElementById('popup-settings');
	if (settings) {
		settings.classList.toggle('settings-disabled', !enabled);
	}
}

function updatePopupToggleCopy(experimentManaged: boolean, phase: ExperimentPhase | null) {
	const titleEl = document.getElementById('popup-toggle-title');
	const subtitleEl = document.getElementById('popup-toggle-subtitle');
	if (!titleEl || !subtitleEl) return;

	titleEl.textContent = 'Popup enabled';

	if (!experimentManaged) {
		subtitleEl.textContent = 'Turn all popup logic on or off.';
		return;
	}

	if (phase === 'logging') {
		subtitleEl.textContent = 'Experiment week 1: logging only (overlay off).';
		return;
	}
	if (phase === 'overlay') {
		subtitleEl.textContent = 'Experiment week 2: overlay enabled automatically.';
		return;
	}
	if (phase === 'completed') {
		subtitleEl.textContent = 'Experiment complete: overlay stays enabled.';
		return;
	}

	subtitleEl.textContent = 'Experiment controlled.';
}

async function renderExperimentStatus() {
	const card = document.getElementById('experiment-status');
	if (!card) return;
	const state = await getExperimentState();
	if (!state || !state.startAt) {
		card.classList.add('hidden');
		return;
	}

	card.classList.remove('hidden');
	const nowMs = Date.now();
	const phase = getExperimentPhase(state, nowMs);
	const dayIndex = Math.floor((nowMs - state.startAt) / DAY_MS) + 1;
	const dayNumber = Math.min(EXPERIMENT_TOTAL_DAYS, Math.max(1, dayIndex));
	const overlayAt = state.startAt + EXPERIMENT_OVERLAY_DAYS * DAY_MS;
	const completeAt = state.startAt + EXPERIMENT_TOTAL_DAYS * DAY_MS;

	const phaseEl = document.getElementById('experiment-phase');
	const summaryEl = document.getElementById('experiment-summary');
	const datesEl = document.getElementById('experiment-dates');

	if (phaseEl) {
		if (phase === 'logging') phaseEl.textContent = 'Week 1';
		if (phase === 'overlay') phaseEl.textContent = 'Week 2';
		if (phase === 'completed') phaseEl.textContent = 'Complete';
	}

	if (summaryEl) {
		if (phase === 'logging') {
			summaryEl.textContent = `Day ${dayNumber} of ${EXPERIMENT_TOTAL_DAYS}. Logging only.`;
		} else if (phase === 'overlay') {
			summaryEl.textContent = `Day ${dayNumber} of ${EXPERIMENT_TOTAL_DAYS}. Overlay enabled.`;
		} else {
			summaryEl.textContent = `Experiment complete. Overlay stays enabled.`;
		}
	}

	if (datesEl) {
		if (phase === 'logging') {
			datesEl.textContent = `Overlay starts on ${formatDate(overlayAt)}.`;
		} else if (phase === 'overlay') {
			datesEl.textContent = `Experiment ends on ${formatDate(completeAt)}.`;
		} else {
			datesEl.textContent = `Completed on ${formatDate(completeAt)}.`;
		}
	}
}

// Render countdown/status for the delay timer.
async function renderDelayTimer() {
	const [delayMs, enabled, delayState] = await Promise.all([
		getPopupDelayMs(),
		getPopupEnabled(),
		getDelayState(),
	]);

	const timerEl = document.getElementById('delay-timer');
	const labelEl = document.getElementById('delay-timer-label');
	const valueEl = document.getElementById('delay-timer-value');
	if (!timerEl || !labelEl || !valueEl) return;

	if (!delayMs || delayMs <= 0) {
		timerEl.classList.add('hidden');
		stopTimerInterval();
		return;
	}

	timerEl.classList.remove('hidden');

	if (!enabled) {
		labelEl.textContent = 'Timer disabled';
		valueEl.textContent = '--:--';
		stopTimerInterval();
		return;
	}

	const phase = delayState?.phase || 'idle';
	const startAt = typeof delayState?.startAt === 'number' ? delayState.startAt : null;
	const elapsed = startAt ? Date.now() - startAt : 0;
	const remaining = Math.max(0, delayMs - elapsed);

	if (phase === 'running') {
		labelEl.textContent = 'Time remaining';
		valueEl.textContent = formatMs(remaining);
		startTimerInterval();
		return;
	}

	if (phase === 'cooldown') {
		labelEl.textContent = 'Timer complete';
		valueEl.textContent = 'Waiting for next trigger';
	} else {
		labelEl.textContent = 'Starts on trigger';
		valueEl.textContent = formatMs(delayMs);
	}
	stopTimerInterval();
}

// Normalize trigger site input for consistent matching.
function normalizeTriggerSite(value: string): string {
	return value.trim().replace(/\/+$/, '');
}

// Remove duplicates while preserving order.
function dedupe(values: string[]): string[] {
	const seen = new Set<string>();
	const output: string[] = [];
	for (const value of values) {
		if (seen.has(value)) continue;
		seen.add(value);
		output.push(value);
	}
	return output;
}

// Load a list from chrome storage (with legacy fallback).
function getList(key: ListKey): Promise<string[]> {
	return new Promise((resolve) => {
		try {
			chromeApi.storage.local.get([key, 'savedSites'], (res: any) => {
				let raw = res ? res[key] : [];
				if ((!raw || !Array.isArray(raw)) && key === 'triggerSites') {
					raw = res ? res.savedSites : [];
				}
				resolve(dedupe(normalizeStoredList(raw)));
			});
		} catch (e) {
			resolve([]);
		}
	});
}

// Persist a list to chrome storage.
function setList(key: ListKey, list: string[]): Promise<void> {
	return new Promise((resolve, reject) => {
		try {
			chromeApi.storage.local.set({ [key]: list }, () => {
				if (chromeApi.runtime.lastError) return reject(new Error(chromeApi.runtime.lastError.message));
				resolve();
			});
		} catch (e) {
			reject(e);
		}
	});
}

// Load the currently selected popup delay.
function getPopupDelayMs(): Promise<number | null> {
	return new Promise((resolve) => {
		try {
			chromeApi.storage.local.get(['popupDelayMs'], (res: any) => {
				const value = res?.popupDelayMs;
				resolve(typeof value === 'number' ? value : null);
			});
		} catch (e) {
			resolve(null);
		}
	});
}

// Load whether the popup logic is enabled.
function getPopupEnabled(): Promise<boolean> {
	return new Promise((resolve) => {
		try {
			chromeApi.storage.local.get(['popupEnabled'], (res: any) => {
				resolve(res?.popupEnabled === true);
			});
		} catch (e) {
			resolve(false);
		}
	});
}

function getDelayTimerLock(): Promise<{ locked: boolean }> {
	return new Promise((resolve) => {
		try {
			chromeApi.storage.local.get(['delayTimerLocked'], (res: any) => {
				resolve({ locked: res?.delayTimerLocked === true });
			});
		} catch (e) {
			resolve({ locked: false });
		}
	});
}

function getExperimentState(): Promise<ExperimentState | null> {
	return new Promise((resolve) => {
		try {
			chromeApi.storage.local.get([EXPERIMENT_STATE_KEY], (res: any) => {
				const raw = res?.[EXPERIMENT_STATE_KEY];
				if (!raw || typeof raw !== 'object') return resolve(null);
				const startAt = typeof raw.startAt === 'number' ? raw.startAt : null;
				if (!startAt) return resolve(null);
				resolve({
					startAt,
					phase: raw.phase,
				});
			});
		} catch (e) {
			resolve(null);
		}
	});
}

// Persist the popup enabled toggle.
function setPopupEnabled(enabled: boolean): Promise<void> {
	return new Promise((resolve, reject) => {
		try {
			chromeApi.storage.local.set({ popupEnabled: enabled }, () => {
				if (chromeApi.runtime.lastError) return reject(new Error(chromeApi.runtime.lastError.message));
				resolve();
			});
		} catch (e) {
			reject(e);
		}
	});
}

// Read delay state from session/local storage.
function getDelayState(): Promise<{ phase?: string; startAt?: number } | null> {
	return new Promise((resolve) => {
		try {
			chromeApi.storage.local.get(['delayState'], (res: any) => {
				if (res?.delayState) return resolve(res.delayState);
				const session = chromeApi.storage?.session;
				if (session?.get) {
					session.get(['delayState'], (fallback: any) => {
						resolve(fallback?.delayState ?? null);
					});
					return;
				}
				resolve(null);
			});
		} catch (e) {
			resolve(null);
		}
	});
}

// Listen to storage changes to keep UI in sync.
function setupStorageListener() {
	try {
		chromeApi.storage.onChanged.addListener((changes: any, area: string) => {
			if (area !== 'local' && area !== 'session') return;
			if (changes.popupDelayMs || changes.popupEnabled || changes.delayState || changes.experimentState) {
				renderDelayButtons();
				renderPopupToggle();
				renderDelayTimer();
				renderExperimentStatus();
			}
		});
	} catch (e) {}
}

let timerIntervalId: number | null = null;

function startTimerInterval() {
	if (timerIntervalId !== null) return;
	timerIntervalId = window.setInterval(() => {
		renderDelayTimer();
	}, 1000);
}

function stopTimerInterval() {
	if (timerIntervalId === null) return;
	window.clearInterval(timerIntervalId);
	timerIntervalId = null;
}

function formatMs(ms: number): string {
	const totalSeconds = Math.ceil(ms / 1000);
	const minutes = Math.floor(totalSeconds / 60);
	const seconds = totalSeconds % 60;
	const mm = String(minutes).padStart(2, '0');
	const ss = String(seconds).padStart(2, '0');
	return `${mm}:${ss}`;
}

function getExperimentPhase(state: ExperimentState, nowMs: number): ExperimentPhase {
	if (!state?.startAt || !Number.isFinite(state.startAt)) return 'logging';
	const elapsedMs = Math.max(0, nowMs - state.startAt);
	if (elapsedMs >= EXPERIMENT_TOTAL_DAYS * DAY_MS) return 'completed';
	if (elapsedMs >= EXPERIMENT_OVERLAY_DAYS * DAY_MS) return 'overlay';
	return 'logging';
}

function formatDate(value: number): string {
	try {
		return new Date(value).toLocaleDateString(undefined, {
			month: 'short',
			day: 'numeric',
			year: 'numeric',
		});
	} catch (e) {
		return new Date(value).toDateString();
	}
}

// Persist the popup delay selection.
function setPopupDelayMs(delayMs: number | null): Promise<void> {
	return new Promise((resolve, reject) => {
		try {
			chromeApi.storage.local.set({ popupDelayMs: delayMs }, () => {
				if (chromeApi.runtime.lastError) return reject(new Error(chromeApi.runtime.lastError.message));
				resolve();
			});
		} catch (e) {
			reject(e);
		}
	});
}

// Render a single list section in the UI.
async function renderList(config: ListConfig) {
	try {
		const listEl = document.getElementById(config.listId);
		if (!listEl) return;
		listEl.innerHTML = '';

		const items = await getList(config.key);
		if (!items || items.length === 0) {
			const empty = document.createElement('div');
			empty.style.color = '#666';
			empty.style.fontSize = '13px';
			empty.textContent = config.emptyText;
			listEl.appendChild(empty);
			return;
		}

		items.forEach((value) => {
			const row = document.createElement('div');
			row.style.display = 'flex';
			row.style.justifyContent = 'space-between';
			row.style.alignItems = 'center';
			row.style.padding = '6px 8px';
			row.style.border = '1px solid #eee';
			row.style.borderRadius = '6px';

			const label = document.createElement('div');
			label.textContent = config.display ? config.display(value) : value;
			label.style.color = '#333';
			label.style.flex = '1';
			label.style.wordBreak = 'break-word';

			const del = document.createElement('button');
			del.textContent = 'Remove';
			del.style.marginLeft = '8px';
			del.style.background = '#fff';
			del.style.border = '1px solid #ddd';
			del.style.borderRadius = '4px';
			del.style.padding = '6px 8px';
			del.style.cursor = 'pointer';
			del.addEventListener('click', async () => {
				try {
					const existing = await getList(config.key);
					const filtered = existing.filter((item) => item !== value);
					await setList(config.key, filtered);
					renderList(config);
				} catch (e) {
					console.warn('Failed to remove entry', e);
				}
			});

			row.appendChild(label);
			row.appendChild(del);
			listEl.appendChild(row);
		});
	} catch (e) {
		console.warn('renderList failed', e);
	}
}
