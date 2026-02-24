/**
 * experiment.ts
 *
 * First-run / overlay-start / completion popup for the 2-week experiment.
 */

const chromeApi: any = (window as any).chrome;

const DAY_MS = 24 * 60 * 60 * 1000;
const EXPERIMENT_OVERLAY_DAYS = 7;
const EXPERIMENT_TOTAL_DAYS = 14;
const EXPERIMENT_STATE_KEY = 'experimentState';

type ExperimentState = {
	startAt: number;
	phase?: string;
	experimentStartAt?: number;
};

window.addEventListener('DOMContentLoaded', () => {
 
    initExperimentPopup();
  
});

async function initExperimentPopup() {
	requestDimOverlay();
	const mode = getMode();
	const state = await getExperimentState();
	const startAt = typeof state?.startAt === 'number' ? state.startAt : Date.now();
	const overlayAt = state?.experimentStartAt ?? startAt + EXPERIMENT_OVERLAY_DAYS * DAY_MS;
	const completeAt = startAt + EXPERIMENT_TOTAL_DAYS * DAY_MS;

	const week1Range = `${formatDate(startAt)} - ${formatDate(overlayAt - DAY_MS)}`;
	const week2Range = `${formatDate(overlayAt)} - ${formatDate(completeAt - DAY_MS)}`;

	setText('week1-range', `${week1Range} (logging only)`);
	setText('week2-range', `${week2Range} (overlay enabled)`);

	if (mode === 'complete') {
		setText('experiment-badge', 'Complete');
		setText('experiment-title', 'Thanks for participating');
		setText(
			'experiment-subtitle',
			'Your 14-day experiment is complete. The procrastination overlay stays enabled and logging continues.',
		);
		setText('experiment-note', `Experiment ran from ${formatDate(startAt)} to ${formatDate(completeAt)}.`);
		setText('primary-btn', 'Close');
	} else if (mode === 'overlay') {
		setText('experiment-badge', 'Week 2');
		setText('experiment-title', 'Experiment phase started');
		setText(
			'experiment-subtitle',
			'Week 2 has begun. For the next 7 days, the procrastination overlay is enabled while logging continues.',
		);
		setText('experiment-note', `Week 2 runs from ${formatDate(overlayAt)} to ${formatDate(completeAt - DAY_MS)}.`);
		setText('primary-btn', 'Close');
	} else {
		setText('experiment-badge', 'Welcome');
		setText('experiment-title', 'Welcome to Focular12');
		setText(
			'experiment-subtitle',
			'This experiment lasts 14 days. Week 1 logs ONLY visits to sites that you have added to your Focal list. Week 2 enables the procrastination overlay.',
		);
		setText('experiment-note', `Overlay turns on automatically on ${formatDate(overlayAt)}.`);
	}

	const button = document.getElementById('primary-btn') as HTMLButtonElement | null;
	button?.addEventListener('click', () => {
		window.close();
	});

	const consentRow = document.getElementById('consent-row');
	const consentYesButton = document.getElementById('consent-yes-btn') as HTMLButtonElement | null;
	const consentNoButton = document.getElementById('consent-no-btn') as HTMLButtonElement | null;
	if (mode === 'complete' || mode === 'overlay') {
		consentRow?.remove();
	} else {
		const handleConsentClick = (consent: boolean) => {
			if (consentYesButton?.disabled || consentNoButton?.disabled) return;
			if (consentYesButton) consentYesButton.disabled = true;
			if (consentNoButton) consentNoButton.disabled = true;
			sendConsent(consent);
		};
		consentYesButton?.addEventListener('click', () => handleConsentClick(true));
		consentNoButton?.addEventListener('click', () => handleConsentClick(false));
	}
}

function requestDimOverlay() {
	try {
		chromeApi.runtime?.sendMessage({ type: 'experiment-popup-ready' });
	} catch (e) {}
}

function sendConsent(consent: boolean) {
	try {
		chromeApi.runtime?.sendMessage({ type: 'experiment-consent', consent });
	} catch (e) {}
}

function getMode(): 'welcome' | 'overlay' | 'complete' {
	try {
		const params = new URLSearchParams(window.location.search);
		if (params.get('mode') === 'overlay') return 'overlay';
		return params.get('mode') === 'complete' ? 'complete' : 'welcome';
	} catch (e) {
		return 'welcome';
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
