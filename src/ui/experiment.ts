/**
 * experiment.ts
 *
 * Popup used for experiment phase-change notices.
 */

export {};

import { DAY_MS, EXPERIMENT_OVERLAY_DAYS, EXPERIMENT_TOTAL_DAYS } from '../shared/experiment-constants';

const chromeApi: any = (window as any).chrome;
const EXPERIMENT_STATE_KEY = 'experimentState';

type ExperimentMode = 'overlay' | 'complete';

type ExperimentState = {
	startAt: number;
	experimentStartAt?: number;
	experimentEndAt?: number;
};

window.addEventListener('DOMContentLoaded', () => {
	void initExperimentPopup();
});

async function initExperimentPopup() {
	const mode = getMode();
	const state = await getExperimentState();
	const startAt = typeof state?.startAt === 'number' ? state.startAt : Date.now();
	const overlayAt = state?.experimentStartAt ?? startAt + EXPERIMENT_OVERLAY_DAYS * DAY_MS;
	const completeAt = state?.experimentEndAt ?? startAt + EXPERIMENT_TOTAL_DAYS * DAY_MS;

	setText('week1-range', `${formatDate(startAt)} - ${formatDate(overlayAt - DAY_MS)} (logging only)`);
	setText('week2-range', `${formatDate(overlayAt)} - ${formatDate(completeAt - DAY_MS)} (overlay enabled)`);

	if (mode === 'complete') {
		setText('experiment-badge', 'Complete');
		setText('experiment-title', 'Thanks for participating');
		setText(
			'experiment-subtitle',
			'Your 14-day experiment is complete. The procrastination overlay stays enabled and logging continues.',
		);
		setText('experiment-note', `Experiment ran from ${formatDate(startAt)} to ${formatDate(completeAt)}.`);
		setText('primary-btn', 'Close');
	} else {
		setText('experiment-badge', 'Phase 2');
		setText('experiment-title', 'Experiment phase started');
		setText(
			'experiment-subtitle',
			'Phase 2 has begun. For the next 7 days, the procrastination overlay is enabled while logging continues.',
		);
		setText('experiment-note', `Phase 2 runs from ${formatDate(overlayAt)} to ${formatDate(completeAt - DAY_MS)}.`);
		setText('primary-btn', 'Close');
	}

	const button = document.getElementById('primary-btn') as HTMLButtonElement | null;
	button?.addEventListener('click', () => {
		window.close();
	});
}

function getMode(): ExperimentMode {
	try {
		const params = new URLSearchParams(window.location.search);
		return params.get('mode') === 'complete' ? 'complete' : 'overlay';
	} catch (e) {
		return 'overlay';
	}
}

function getExperimentState(): Promise<ExperimentState | null> {
	return new Promise((resolve) => {
		try {
			chromeApi.storage?.local?.get([EXPERIMENT_STATE_KEY], (res: any) => {
				const raw = res?.[EXPERIMENT_STATE_KEY];
				if (!raw || typeof raw !== 'object') return resolve(null);
				const startAt = typeof raw.startAt === 'number' ? raw.startAt : null;
				if (!startAt) return resolve(null);
				resolve({
					startAt,
					experimentStartAt: typeof raw.experimentStartAt === 'number' ? raw.experimentStartAt : undefined,
					experimentEndAt: typeof raw.experimentEndAt === 'number' ? raw.experimentEndAt : undefined,
				});
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
