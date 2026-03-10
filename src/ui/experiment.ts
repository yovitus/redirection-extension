/**
 * experiment.ts
 *
 * First-run / overlay-start / completion popup for the experiment.
 */

const chromeApi: any = (window as any).chrome;

const DAY_MS = 24 * 60 * 60 * 1000;
const EXPERIMENT_OVERLAY_DAYS = 3;
const EXPERIMENT_TOTAL_DAYS = 6;
const EXPERIMENT_STATE_KEY = 'experimentState';
const TRIGGER_SITES_KEY = 'triggerSites';
const LEGACY_TRIGGER_SITES_KEY = 'savedSites';
const EXPERIMENT_EMAIL_KEY = 'experimentUserEmail';
const MIN_TRIGGER_SITES_REQUIRED = 2;

type ExperimentState = {
	startAt: number;
	phase?: string;
	experimentStartAt?: number;
};

window.addEventListener('DOMContentLoaded', () => {
 
    initExperimentPopup();
  
});

async function initExperimentPopup() {

	const mode = getMode();
	const state = await getExperimentState();
	const isWelcomeMode = mode === 'welcome';
	let hasConsented = false;
	const startAt = typeof state?.startAt === 'number' ? state.startAt : Date.now();
	const overlayAt = state?.experimentStartAt ?? startAt + EXPERIMENT_OVERLAY_DAYS * DAY_MS;
	const completeAt = startAt + EXPERIMENT_TOTAL_DAYS * DAY_MS;

	const week1Range = `${formatDate(startAt)} - ${formatDate(overlayAt - DAY_MS)}`;
	const week2Range = `${formatDate(overlayAt)} - ${formatDate(completeAt - DAY_MS)}`;

	setText('week1-range', `${week1Range} (logging only)`);
	setText('week2-range', `${week2Range} (overlay enabled)`);
	setText('consent-feedback', '');
	setText('trigger-feedback', '');

	if (mode === 'complete') {
		setText('experiment-badge', 'Complete');
		setText('experiment-title', 'Thanks for participating');
		setText(
			'experiment-subtitle',
			'Your 6-day experiment is complete. The procrastination overlay stays enabled and logging continues.',
		);
		setText('experiment-note', `Experiment ran from ${formatDate(startAt)} to ${formatDate(completeAt)}.`);
		setText('primary-btn', 'Close');
	} else if (mode === 'overlay') {
		setText('experiment-badge', 'Phase 2');
		setText('experiment-title', 'Experiment phase started');
		setText(
			'experiment-subtitle',
			'Phase 2 has begun. For the next 3 days, the procrastination overlay is enabled while logging continues.',
		);
		setText('experiment-note', `Phase 2 runs from ${formatDate(overlayAt)} to ${formatDate(completeAt - DAY_MS)}.`);
		setText('primary-btn', 'Close');
	} else {
		setText('experiment-note', `Experiment starts on ${formatDate(startAt)}.`);
	}

	const button = document.getElementById('primary-btn') as HTMLButtonElement | null;
	if (button) {
		button.addEventListener('click', async () => {
			if (!isWelcomeMode) {
				window.close();
				return;
			}
			const sites = await getTriggerSites();
			if (sites.length < MIN_TRIGGER_SITES_REQUIRED) {
				const remaining = getRemainingTriggerSitesRequired(sites.length);
				setFeedback(
					'trigger-feedback',
					`Add ${remaining} more trigger ${remaining === 1 ? 'site' : 'sites'} to continue.`,
					true,
				);
				await refreshCloseButtonState(button, hasConsented);
				return;
			}
			if (!hasConsented) {
				setFeedback('consent-feedback', 'You need to consent to be part of this study.', true);
				await refreshCloseButtonState(button, hasConsented);
				return;
			}
			if (sites.length >= MIN_TRIGGER_SITES_REQUIRED && hasConsented) {
				requestOpenSettingsAfterWelcomeClose();
				window.close();
				return;
			}
		});
	}

	const triggerSetup = document.getElementById('trigger-setup');
	const triggerInput = document.getElementById('trigger-site-input') as HTMLInputElement | null;
	const addTriggerButton = document.getElementById('add-trigger-site-btn') as HTMLButtonElement | null;
	const emailInput = document.getElementById('email-input') as HTMLInputElement | null;
	const saveEmailButton = document.getElementById('save-email-btn') as HTMLButtonElement | null;
	if (!isWelcomeMode) {
		triggerSetup?.remove();
	} else {
		const addTriggerSite = async () => {
			const raw = (triggerInput?.value || '').trim();
			if (!raw) {
				setFeedback('trigger-feedback', 'Enter a site first (for example: youtube.com).', true);
				return;
			}
			const normalized = normalizeTriggerSite(raw);
			if (!normalized) {
				setFeedback('trigger-feedback', 'That site format is not valid.', true);
				return;
			}
			const existing = await getTriggerSites();
			if (existing.indexOf(normalized) === -1) {
				existing.push(normalized);
				await setTriggerSites(existing);
			}
			if (triggerInput) triggerInput.value = '';
			await renderTriggerSites();
			await refreshCloseButtonState(button, hasConsented);
			const updatedSites = await getTriggerSites();
			const remaining = getRemainingTriggerSitesRequired(updatedSites.length);
			if (remaining > 0) {
				setFeedback(
					'trigger-feedback',
					`Saved: ${normalized}. Add ${remaining} more trigger ${remaining === 1 ? 'site' : 'sites'}.`,
					false,
				);
			} else {
				setFeedback('trigger-feedback', `Saved: ${normalized}. Requirement complete.`, false);
			}
		};
		addTriggerButton?.addEventListener('click', () => {
			void addTriggerSite();
		});
		triggerInput?.addEventListener('keydown', (event) => {
			if (event.key !== 'Enter') return;
			event.preventDefault();
			void addTriggerSite();
		});
		await renderTriggerSites();
		await refreshCloseButtonState(button, hasConsented);

		const saveEmail = async () => {
			const raw = (emailInput?.value || '').trim();
			if (!raw) {
				setFeedback('email-feedback', 'Email is optional. Leave blank to skip.', false);
				return;
			}
			const normalized = normalizeEmail(raw);
			if (!isValidEmail(normalized)) {
				setFeedback('email-feedback', 'Enter a valid email address.', true);
				return;
			}
			try {
				await setExperimentEmail(normalized);
				sendEmail(normalized);
				if (emailInput) emailInput.value = normalized;
				setFeedback('email-feedback', 'Email saved.', false);
			} catch (e) {
				setFeedback('email-feedback', 'Could not save email. Try again.', true);
			}
		};

		saveEmailButton?.addEventListener('click', () => {
			void saveEmail();
		});
		emailInput?.addEventListener('keydown', (event) => {
			if (event.key !== 'Enter') return;
			event.preventDefault();
			void saveEmail();
		});

		const storedEmail = await getExperimentEmail();
		if (emailInput && storedEmail) {
			emailInput.value = storedEmail;
			setFeedback('email-feedback', 'Email saved.', false);
		}
	}

	const consentRow = document.getElementById('consent-row');
	const consentYesButton = document.getElementById('consent-yes-btn') as HTMLButtonElement | null;
	const consentNoButton = document.getElementById('consent-no-btn') as HTMLButtonElement | null;
	const consentInfoButton = document.getElementById('consent-info-btn') as HTMLButtonElement | null;
	const consentModal = document.getElementById('consent-modal');
	const closeConsentModalButton = document.getElementById('close-consent-modal-btn') as HTMLButtonElement | null;
	if (mode === 'complete' || mode === 'overlay') {
		consentRow?.remove();
		consentInfoButton?.remove();
		consentModal?.remove();
	} else {
		const openConsentModal = () => {
			consentModal?.classList.remove('hidden');
		};
		const closeConsentModal = () => {
			consentModal?.classList.add('hidden');
		};
		const handleConsentClick = (consent: boolean) => {
			hasConsented = consent;
			if (consentYesButton) consentYesButton.classList.toggle('consent-selected', consent);
			if (consentNoButton) consentNoButton.classList.toggle('consent-selected', !consent);
			sendConsent(consent);
			setFeedback(
				'consent-feedback',
				consent ? 'You selected: I Consent.' : 'You need to consent to be part of this study.',
				!consent,
			);
			void refreshCloseButtonState(button, hasConsented);
		};
		consentYesButton?.addEventListener('click', () => handleConsentClick(true));
		consentNoButton?.addEventListener('click', () => handleConsentClick(false));
		consentInfoButton?.addEventListener('click', openConsentModal);
		closeConsentModalButton?.addEventListener('click', closeConsentModal);
		consentModal?.addEventListener('click', (event) => {
			if (event.target === consentModal) closeConsentModal();
		});
		document.addEventListener('keydown', (event) => {
			if (event.key === 'Escape') closeConsentModal();
		});
	}
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

function requestOpenSettingsAfterWelcomeClose() {
	try {
		chromeApi.runtime?.sendMessage({ type: 'open-settings-after-experiment-close' });
	} catch (e) {}
}

function getMode(): 'welcome' | 'overlay' | 'complete' {
	try {
		const params = new URLSearchParams(window.location.search);
		if (params.get('mode') === 'overlay') return 'overlay';
		return params.get('mode') === 'complete' ? 'complete' : 'welcome';
	} catch (e) {
		return "overlay";
	}
}

function getExperimentState(): Promise<ExperimentState | null> {
	return new Promise((resolve) => {
		try {
			chromeApi.storage?.local?.get([EXPERIMENT_STATE_KEY], (res: any) => {
				resolve(res?.[EXPERIMENT_STATE_KEY] ?? null);
			});
		} catch (e) {
			resolve(null);
		}
	});
}

function getTriggerSites(): Promise<string[]> {
	return new Promise((resolve) => {
		try {
			chromeApi.storage?.local?.get([TRIGGER_SITES_KEY, LEGACY_TRIGGER_SITES_KEY], (res: any) => {
				const current = normalizeStoredList(res?.[TRIGGER_SITES_KEY]);
				if (current.length > 0) return resolve(current);
				const legacy = normalizeStoredList(res?.[LEGACY_TRIGGER_SITES_KEY]);
				resolve(legacy);
			});
		} catch (e) {
			resolve([]);
		}
	});
}

function setTriggerSites(sites: string[]): Promise<void> {
	return new Promise((resolve) => {
		try {
			const normalized = dedupe(normalizeStoredList(sites));
			chromeApi.storage?.local?.set({ [TRIGGER_SITES_KEY]: normalized }, () => resolve());
		} catch (e) {
			resolve();
		}
	});
}

function getExperimentEmail(): Promise<string | null> {
	return new Promise((resolve) => {
		try {
			chromeApi.storage?.local?.get([EXPERIMENT_EMAIL_KEY], (res: any) => {
				const raw = res?.[EXPERIMENT_EMAIL_KEY];
				resolve(typeof raw === 'string' ? raw : null);
			});
		} catch (e) {
			resolve(null);
		}
	});
}

function setExperimentEmail(email: string): Promise<void> {
	return new Promise((resolve) => {
		try {
			chromeApi.storage?.local?.set({ [EXPERIMENT_EMAIL_KEY]: email }, () => resolve());
		} catch (e) {
			resolve();
		}
	});
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

function setText(id: string, text: string) {
	const el = document.getElementById(id);
	if (el) {
		el.textContent = text;
	}
}

function setFeedback(id: string, text: string, isError: boolean) {
	const el = document.getElementById(id);
	if (!el) return;
	el.textContent = text;
	el.classList.toggle('error', isError);
	el.classList.toggle('ok', !isError && !!text);
}

async function refreshCloseButtonState(button: HTMLButtonElement | null, hasConsented: boolean) {
	if (!button) return;
	const mode = getMode();
	if (mode !== 'welcome') {
		button.disabled = false;
		return;
	}
	const sites = await getTriggerSites();
	const hasSites = sites.length >= MIN_TRIGGER_SITES_REQUIRED;
	const canClose = hasSites && hasConsented;
	const remaining = getRemainingTriggerSitesRequired(sites.length);
	button.disabled = !canClose;
	if (!hasSites) {
		button.textContent = `Add ${remaining} more ${remaining === 1 ? 'site' : 'sites'} first`;
		setFeedback(
			'trigger-feedback',
			`Add at least ${MIN_TRIGGER_SITES_REQUIRED} trigger sites to continue.`,
			true,
		);
		return;
	}
	button.textContent = hasConsented ? 'Got it' : 'Consent required';
	if (!hasConsented) {
		setFeedback('consent-feedback', 'You need to consent to be part of this study.', true);
		return;
	}
	if (canClose) {
		setFeedback('consent-feedback', 'You selected: I Consent.', false);
	}
	if (!canClose) {
		return;
	} else {
		setFeedback(
			'trigger-feedback',
			`At least ${MIN_TRIGGER_SITES_REQUIRED} trigger sites are set. You can continue.`,
			false,
		);
	}
}

async function renderTriggerSites() {
	const listEl = document.getElementById('trigger-site-list');
	if (!listEl) return;
	const sites = await getTriggerSites();
	listEl.innerHTML = '';
	if (sites.length === 0) {
		const empty = document.createElement('div');
		empty.className = 'setup-pill';
		empty.textContent = 'No trigger sites yet';
		listEl.appendChild(empty);
		return;
	}
	sites.forEach((site) => {
		const pill = document.createElement('div');
		pill.className = 'setup-pill';
		pill.textContent = site.replace(/^https?:\/\//i, '');
		listEl.appendChild(pill);
	});
}

function normalizeTriggerSite(value: string): string {
	return value.trim().replace(/\/+$/, '');
}

function normalizeStoredList(value: any): string[] {
	if (!Array.isArray(value)) return [];
	return value
		.map((entry: any) => {
			if (typeof entry === 'string') return entry.trim();
			if (entry && typeof entry.match === 'string') return entry.match.trim();
			if (entry && typeof entry.url === 'string') return entry.url.trim();
			if (entry && typeof entry.open === 'string') return entry.open.trim();
			return '';
		})
		.filter(Boolean);
}

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

function getRemainingTriggerSitesRequired(currentCount: number): number {
	return Math.max(0, MIN_TRIGGER_SITES_REQUIRED - currentCount);
}
