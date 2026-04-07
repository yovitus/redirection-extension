/**
 * popup.ts
 *
 * Popup controller for managing trigger sites.
 */

import { normalizeStoredList } from './utils/list-utils';
import { createTriggerAutocomplete, TriggerAutocompleteHandle } from './utils/trigger-autocomplete';
import { DAY_MS, EXPERIMENT_OVERLAY_DAYS, EXPERIMENT_TOTAL_DAYS } from '../shared/experiment-constants';
import { normalizeTriggerSite } from '../shared/trigger-site';

// Use chrome from window to avoid duplicate ambient declarations
const chromeApi: any = (window as any).chrome;

type ListKey = 'triggerSites';
type ConsentChoice = boolean | null;

type ExperimentPhase = 'logging' | 'overlay' | 'completed';

type ExperimentState = {
	startAt: number;
	phase?: ExperimentPhase;
	experimentStartAt?: number;
	experimentEndAt?: number;
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

const EXPERIMENT_STATE_KEY = 'experimentState';
const EXPERIMENT_CONSENT_KEY = 'experimentConsentGiven';
const EXPERIMENT_EMAIL_KEY = 'experimentUserEmail';
const MIN_TRIGGER_SITES_REQUIRED = 2;
const AUTOCOMPLETE_MAX_RESULTS = 6;
const COMMON_TRIGGER_SITE_SUGGESTIONS = [
	'youtube.com',
	'reddit.com',
	'facebook.com',
	'instagram.com',
	'linkedin.com',
	'netflix.com',
	'x.com',
	'tiktok.com',
	'twitch.tv',
	'kick.com',
	'dr.dk',
	'pinterest.com',
	'ekstrabladet.dk',
	'tv2.dk',
	'seoghoer.dk',
	'bt.dk',
	'viaplay.dk',
	'disneyplus.com',
	'play.hbo.com',
	'hbo.com',
	'hbo-max.com',
	'mrgreen.com',
	'unibet.com',
	'bet365.com',
	'danskespil.dk',
];

let mainPopupInitialized = false;
let consentGateInitialized = false;
let triggerAutocompleteInitialized = false;
const listRenderVersionById = new Map<string, number>();
let triggerSiteAutocompleteSource: string[] = [];
const triggerAutocompleteHandles: TriggerAutocompleteHandle[] = [];

window.addEventListener('DOMContentLoaded', () => {
	setupStorageListener();
	setupTriggerSiteAutocomplete();
	setupConsentGate();
	void bootstrapPopupView();
});

async function bootstrapPopupView() {
	await migrateTriggerSitesToCanonicalValues();
	await renderPopupView();
}

async function renderPopupView() {
	const [sites, consentChoice] = await Promise.all([
		getList('triggerSites'),
		getExperimentConsentChoice(),
	]);
	updateTriggerAutocompleteSource(sites);
	const hasMinimumSites = sites.length >= MIN_TRIGGER_SITES_REQUIRED;
	const canShowMainPopup = consentChoice === true && hasMinimumSites;
	if (canShowMainPopup) {
		setPopupViewVisibility(true);
		if (!mainPopupInitialized) {
			initMainPopup();
		}
		await renderMainPopup();
		return;
	}

	setPopupViewVisibility(canShowMainPopup);

	await renderConsentGate(sites, consentChoice);
	focusInput('gate-trigger-site-input');
	stopTimerInterval();
}

function setPopupViewVisibility(showMain: boolean) {
	const gate = document.getElementById('consent-gate');
	const main = document.getElementById('popup-main');
	if (gate) {
		gate.classList.toggle('hidden', showMain);
		gate.style.display = showMain ? 'none' : 'flex';
	}
	if (main) {
		main.classList.toggle('hidden', !showMain);
		main.style.display = showMain ? 'block' : 'none';
	}
}

function initMainPopup() {
	if (mainPopupInitialized) return;
	mainPopupInitialized = true;
	setupLists();
	setupDelayButtons();
	setupPopupToggle();
	focusInput('trigger-url');
}

async function renderMainPopup() {
	await renderAllLists();
	await renderDelayButtons();
	await renderPopupToggle();
	await renderDelayTimer();
	await renderExperimentStatus();
}

function setupConsentGate() {
	if (consentGateInitialized) return;
	consentGateInitialized = true;

	const triggerInput = document.getElementById('gate-trigger-site-input') as HTMLInputElement | null;
	const addTriggerButton = document.getElementById('gate-add-trigger-site-btn') as HTMLButtonElement | null;
	const emailInput = document.getElementById('gate-email-input') as HTMLInputElement | null;
	const saveEmailButton = document.getElementById('gate-save-email-btn') as HTMLButtonElement | null;
	const consentYesButton = document.getElementById('gate-consent-yes-btn') as HTMLButtonElement | null;
	const consentNoButton = document.getElementById('gate-consent-no-btn') as HTMLButtonElement | null;
	const consentInfoButton = document.getElementById('gate-consent-info-btn') as HTMLButtonElement | null;
	const consentModal = document.getElementById('gate-consent-modal');
	const closeConsentModalButton = document.getElementById('gate-close-consent-modal-btn') as HTMLButtonElement | null;

	const addGateTriggerSite = async () => {
		const raw = (triggerInput?.value || '').trim();
		if (!raw) {
			setGateFeedback('gate-trigger-feedback', 'Enter a site first (for example: youtube.com).', true);
			return;
		}
		const normalized = normalizeTriggerSite(raw);
		if (!normalized) {
			setGateFeedback('gate-trigger-feedback', 'That site format is not valid.', true);
			return;
		}
		try {
			const current = await getList('triggerSites');
			if (!current.includes(normalized)) {
				current.push(normalized);
				await setList('triggerSites', current);
			}
			if (triggerInput) triggerInput.value = '';
			await renderPopupView();
		} catch (e) {
			console.warn('Failed to save onboarding trigger site', e);
		}
	};

	addTriggerButton?.addEventListener('click', () => {
		void addGateTriggerSite();
	});
	triggerInput?.addEventListener('keydown', (event) => {
		if (event.key !== 'Enter') return;
		event.preventDefault();
		void addGateTriggerSite();
	});

	const saveGateEmail = async () => {
		const raw = (emailInput?.value || '').trim();
		if (!raw) {
			setGateFeedback('gate-email-feedback', 'Email is optional. Leave blank to skip.', false);
			return;
		}
		const normalized = normalizeEmail(raw);
		if (!isValidEmail(normalized)) {
			setGateFeedback('gate-email-feedback', 'Enter a valid email address.', true);
			return;
		}
		try {
			await setExperimentEmail(normalized);
			sendEmail(normalized);
			if (emailInput) emailInput.value = normalized;
			setGateFeedback('gate-email-feedback', 'Email saved.', false);
		} catch (e) {
			console.warn('Failed to save email', e);
			setGateFeedback('gate-email-feedback', 'Could not save email. Try again.', true);
		}
	};

	saveEmailButton?.addEventListener('click', () => {
		void saveGateEmail();
	});
	emailInput?.addEventListener('keydown', (event) => {
		if (event.key !== 'Enter') return;
		event.preventDefault();
		void saveGateEmail();
	});

	const openConsentModal = () => {
		consentModal?.classList.remove('hidden');
	};
	const closeConsentModal = () => {
		consentModal?.classList.add('hidden');
	};

	consentInfoButton?.addEventListener('click', openConsentModal);
	closeConsentModalButton?.addEventListener('click', closeConsentModal);
	consentModal?.addEventListener('click', (event) => {
		if (event.target === consentModal) closeConsentModal();
	});
	document.addEventListener('keydown', (event) => {
		if (event.key === 'Escape') closeConsentModal();
	});

	const handleConsentClick = async (consent: boolean) => {
		try {
			await setExperimentConsentChoice(consent);
			sendConsent(consent);
			await renderPopupView();
		} catch (e) {
			console.warn('Failed to save consent choice', e);
		}
	};

	consentYesButton?.addEventListener('click', () => {
		void handleConsentClick(true);
	});
	consentNoButton?.addEventListener('click', () => {
		void handleConsentClick(false);
	});
}

async function renderConsentGate(sites: string[], consentChoice: ConsentChoice) {
	renderConsentGateSites(sites);
	await renderConsentGateTimeline();
	await renderConsentGateEmail();

	const consentYesButton = document.getElementById('gate-consent-yes-btn') as HTMLButtonElement | null;
	const consentNoButton = document.getElementById('gate-consent-no-btn') as HTMLButtonElement | null;
	consentYesButton?.classList.toggle('consent-selected', consentChoice === true);
	consentNoButton?.classList.toggle('consent-selected', consentChoice === false);

	const hasMinimumSites = sites.length >= MIN_TRIGGER_SITES_REQUIRED;
	if (!hasMinimumSites) {
		const remaining = MIN_TRIGGER_SITES_REQUIRED - sites.length;
		setGateFeedback(
			'gate-trigger-feedback',
			`Add ${remaining} more trigger ${remaining === 1 ? 'site' : 'sites'} to continue.`,
			true,
		);
	} else {
		setGateFeedback(
			'gate-trigger-feedback',
			`At least ${MIN_TRIGGER_SITES_REQUIRED} trigger sites are set.`,
			false,
		);
	}

	if (consentChoice === true) {
		setGateFeedback('gate-consent-feedback', 'You selected: I Consent.', false);
	} else {
		setGateFeedback('gate-consent-feedback', 'You need to consent to be part of this study.', true);
	}
}

function renderConsentGateSites(sites: string[]) {
	const listEl = document.getElementById('gate-trigger-site-list');
	if (!listEl) return;
	listEl.innerHTML = '';
	if (sites.length === 0) {
		const empty = document.createElement('div');
		empty.className = 'gate-setup-pill';
		empty.textContent = 'No trigger sites yet';
		listEl.appendChild(empty);
		return;
	}
	for (const site of sites) {
		const pill = document.createElement('div');
		pill.className = 'gate-setup-pill';
		pill.textContent = site.replace(/^https?:\/\//i, '');
		listEl.appendChild(pill);
	}
}

async function renderConsentGateTimeline() {
	const state = await getExperimentState();
	const startAt = typeof state?.startAt === 'number' ? state.startAt : Date.now();
	const overlayAt = state?.experimentStartAt ?? startAt + EXPERIMENT_OVERLAY_DAYS * DAY_MS;
	const completeAt = state?.experimentEndAt ?? startAt + EXPERIMENT_TOTAL_DAYS * DAY_MS;

	setText('gate-week1-range', `${formatDate(startAt)} - ${formatDate(overlayAt - DAY_MS)} (logging only)`);
	setText('gate-week2-range', `${formatDate(overlayAt)} - ${formatDate(completeAt - DAY_MS)} (overlay enabled)`);
	setText('gate-note', `Experiment starts on ${formatDate(startAt)}. Overlay turns on automatically on ${formatDate(overlayAt)}.`);
}

async function renderConsentGateEmail() {
	const input = document.getElementById('gate-email-input') as HTMLInputElement | null;
	if (!input) return;
	const stored = await getExperimentEmail();
	if (!input.value && stored) {
		input.value = stored;
	}
	if (stored) {
		setGateFeedback('gate-email-feedback', 'Email saved.', false);
	}
}

function setGateFeedback(id: string, text: string, isError: boolean) {
	const el = document.getElementById(id);
	if (!el) return;
	el.textContent = text;
	el.classList.toggle('error', isError);
	el.classList.toggle('ok', !isError && !!text);
}

function sendConsent(consent: boolean) {
	try {
		chromeApi.runtime?.sendMessage({ type: 'experiment-consent', consent });
	} catch (e) {}
}

function sendEmail(email: string) {
	try {
		chromeApi.runtime?.sendMessage({ type: 'experiment-email', email });
	} catch (e) {}
}

function setText(id: string, text: string) {
	const el = document.getElementById(id);
	if (el) {
		el.textContent = text;
	}
}

function setupTriggerSiteAutocomplete() {
	if (triggerAutocompleteInitialized) return;
	triggerAutocompleteInitialized = true;
	const inputIds = ['trigger-url', 'gate-trigger-site-input'];
	for (const inputId of inputIds) {
		const input = document.getElementById(inputId) as HTMLInputElement | null;
		if (!input) continue;
		const handle = createTriggerAutocomplete({
			input,
			getSuggestions: getTriggerAutocompleteSuggestions,
		});
		triggerAutocompleteHandles.push(handle);
	}
}

function updateTriggerAutocompleteSource(sites: string[]) {
	triggerSiteAutocompleteSource = dedupe(sites.map((site) => normalizeTriggerSite(site)).filter(Boolean));
	for (const handle of triggerAutocompleteHandles) {
		handle.refresh();
	}
}

function getTriggerAutocompleteSuggestions(inputValue: string): string[] {
	const query = normalizeTriggerSite(inputValue).toLowerCase();
	const pool = dedupe(
		[...triggerSiteAutocompleteSource, ...COMMON_TRIGGER_SITE_SUGGESTIONS]
			.map((site) => normalizeTriggerSite(site))
			.filter(Boolean),
	);
	if (!query) {
		return pool.slice(0, AUTOCOMPLETE_MAX_RESULTS);
	}
	const prefix: string[] = [];
	const contains: string[] = [];
	for (const site of pool) {
		if (site === query) continue;
		if (site.startsWith(query)) {
			prefix.push(site);
			continue;
		}
		if (site.includes(query)) {
			contains.push(site);
		}
	}
	return [...prefix, ...contains].slice(0, AUTOCOMPLETE_MAX_RESULTS);
}

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
					if (config.key === 'triggerSites') {
						updateTriggerAutocompleteSource(list);
					}
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
	const experimentPhase = experiment && experiment.startAt ? getExperimentPhase(experiment, Date.now()) : null;
	const input = document.getElementById('popup-enabled') as HTMLInputElement | null;
	if (input) {
		input.checked = enabled;
		const experimentLocksToggle = experimentManaged && experimentPhase !== 'overlay';
		input.disabled = experimentLocksToggle || !delayChosen;
	}
	updatePopupToggleCopy(experimentManaged, experimentPhase);

	const settings = document.getElementById('popup-settings');
	if (settings) {
		const shouldGraySettings = !enabled && !(experimentManaged && experimentPhase === 'logging');
		settings.classList.toggle('settings-disabled', shouldGraySettings);
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
		subtitleEl.textContent = 'Experiment phase 1: logging only (overlay off).';
		return;
	}
	if (phase === 'overlay') {
		subtitleEl.textContent = 'Experiment phase 2: you can toggle the overlay on or off.';
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
	const hasStarted = nowMs >= state.startAt;
	const dayIndex = Math.floor((nowMs - state.startAt) / DAY_MS) + 1;
	const overlayAt = state.experimentStartAt ?? state.startAt + EXPERIMENT_OVERLAY_DAYS * DAY_MS;
	const completeAt = state.experimentEndAt ?? state.startAt + EXPERIMENT_TOTAL_DAYS * DAY_MS;
	const totalDays = Math.max(1, Math.round((completeAt - state.startAt) / DAY_MS));
	const dayNumber = Math.min(totalDays, Math.max(1, dayIndex));

	const phaseEl = document.getElementById('experiment-phase');
	const summaryEl = document.getElementById('experiment-summary');
	const datesEl = document.getElementById('experiment-dates');

	if (phaseEl) {
		if (phase === 'logging') phaseEl.textContent = 'Phase 1';
		if (phase === 'overlay') phaseEl.textContent = 'Phase 2';
		if (phase === 'completed') phaseEl.textContent = 'Complete';
	}

	if (summaryEl) {
		if (!hasStarted) {
			summaryEl.textContent = `Scheduled start: ${formatDate(state.startAt)}.`;
		} else if (phase === 'logging') {
			summaryEl.textContent = `Day ${dayNumber} of ${totalDays}. Logging only.`;
		} else if (phase === 'overlay') {
			summaryEl.textContent = `Day ${dayNumber} of ${totalDays}. Overlay enabled.`;
		} else {
			summaryEl.textContent = `Experiment complete. Overlay stays enabled.`;
		}
	}

	if (datesEl) {
		if (!hasStarted) {
			datesEl.textContent = `Phase 1: ${formatDate(state.startAt)} to ${formatDate(overlayAt - DAY_MS)}.`;
		} else if (phase === 'logging') {
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

function normalizeEmail(value: string): string {
	return (value || '').trim().toLowerCase();
}

function isValidEmail(value: string): boolean {
	if (!value) return false;
	return /^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(value);
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

function normalizeListValues(values: any): string[] {
	return dedupe(
		normalizeStoredList(values)
			.map((entry) => normalizeTriggerSite(entry))
			.filter(Boolean),
	);
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
				resolve(normalizeListValues(raw));
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
			const normalized = normalizeListValues(list);
			chromeApi.storage.local.set({ [key]: normalized }, () => {
				if (chromeApi.runtime.lastError) return reject(new Error(chromeApi.runtime.lastError.message));
				resolve();
			});
		} catch (e) {
			reject(e);
		}
	});
}

async function migrateTriggerSitesToCanonicalValues() {
	try {
		const current = await getList('triggerSites');
		await setList('triggerSites', current);
	} catch (e) {}
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
					experimentStartAt: typeof raw.experimentStartAt === 'number' ? raw.experimentStartAt : undefined,
					experimentEndAt: typeof raw.experimentEndAt === 'number' ? raw.experimentEndAt : undefined,
				});
			});
		} catch (e) {
			resolve(null);
		}
	});
}

function getExperimentConsentChoice(): Promise<ConsentChoice> {
	return new Promise((resolve) => {
		try {
			chromeApi.storage.local.get([EXPERIMENT_CONSENT_KEY], (res: any) => {
				const raw = res?.[EXPERIMENT_CONSENT_KEY];
				if (raw === true || raw === false) {
					resolve(raw);
					return;
				}
				resolve(null);
			});
		} catch (e) {
			resolve(null);
		}
	});
}

function setExperimentConsentChoice(consent: boolean): Promise<void> {
	return new Promise((resolve, reject) => {
		try {
			chromeApi.storage.local.set({ [EXPERIMENT_CONSENT_KEY]: consent }, () => {
				if (chromeApi.runtime.lastError) return reject(new Error(chromeApi.runtime.lastError.message));
				resolve();
			});
		} catch (e) {
			reject(e);
		}
	});
}

function getExperimentEmail(): Promise<string | null> {
	return new Promise((resolve) => {
		try {
			chromeApi.storage.local.get([EXPERIMENT_EMAIL_KEY], (res: any) => {
				const raw = res?.[EXPERIMENT_EMAIL_KEY];
				resolve(typeof raw === 'string' ? raw : null);
			});
		} catch (e) {
			resolve(null);
		}
	});
}

function setExperimentEmail(email: string): Promise<void> {
	return new Promise((resolve, reject) => {
		try {
			chromeApi.storage.local.set({ [EXPERIMENT_EMAIL_KEY]: email }, () => {
				if (chromeApi.runtime.lastError) return reject(new Error(chromeApi.runtime.lastError.message));
				resolve();
			});
		} catch (e) {
			reject(e);
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
			const hasCoreUiChange =
				!!changes.popupDelayMs ||
				!!changes.popupEnabled ||
				!!changes.experimentState ||
				!!changes.triggerSites ||
				!!changes.savedSites ||
				!!changes[EXPERIMENT_CONSENT_KEY] ||
				!!changes[EXPERIMENT_EMAIL_KEY];
			if (hasCoreUiChange) {
				void renderPopupView();
				return;
			}
			if (changes.delayState && isMainPopupVisible()) {
				void renderDelayTimer();
			}
		});
	} catch (e) {}
}

function isMainPopupVisible(): boolean {
	const main = document.getElementById('popup-main');
	if (!main) return false;
	return !main.classList.contains('hidden') && main.style.display !== 'none';
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
	const completeAt = state.experimentEndAt ?? state.startAt + EXPERIMENT_TOTAL_DAYS * DAY_MS;
	if (nowMs >= completeAt) return 'completed';
	const overlayStartMs = state.experimentStartAt
		? Math.max(0, state.experimentStartAt - state.startAt)
		: EXPERIMENT_OVERLAY_DAYS * DAY_MS;
	if (elapsedMs >= overlayStartMs) return 'overlay';
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
		const nextVersion = (listRenderVersionById.get(config.listId) ?? 0) + 1;
		listRenderVersionById.set(config.listId, nextVersion);

		const items = await getList(config.key);
		if (listRenderVersionById.get(config.listId) !== nextVersion) return;
		listEl.innerHTML = '';
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
					if (config.key === 'triggerSites') {
						updateTriggerAutocompleteSource(filtered);
					}
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
