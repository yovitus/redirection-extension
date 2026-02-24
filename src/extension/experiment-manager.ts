import { DbLogger } from './dblogger';

const DAY_MS = 24 * 60 * 60 * 1000;
const EXPERIMENT_OVERLAY_DAYS = 7;
const EXPERIMENT_TOTAL_DAYS = 14;
export const EXPERIMENT_ALARM_NAME = 'focular-experiment-alarm';
const EXPERIMENT_STATE_KEY = 'experimentState';

type DelayTimerLabel = 'Instant' | '5' | '10';
type DelayTimerOption = { label: DelayTimerLabel; delayMs: number };

const DELAY_TIMER_OPTIONS: DelayTimerOption[] = [
	{ label: 'Instant', delayMs: 0 },
	{ label: '5', delayMs: 5 * 60 * 1000 },
	{ label: '10', delayMs: 10 * 60 * 1000 },
];

export type ExperimentPhase = 'logging' | 'overlay' | 'completed';

type ExperimentState = {
	startAt: number;
	phase: ExperimentPhase;
	experimentStartAt?: number;
	onboardingShown?: boolean;
	overlayShown?: boolean;
	completionShown?: boolean;
};

type ExperimentRefreshReason = 'startup' | 'alarm' | 'install';
type ExperimentPopupMode = 'welcome' | 'overlay' | 'complete';

type ExperimentManagerOptions = {
	dbLogger: DbLogger;
	chromeApi: any;
	setPopupEnabled: (enabled: boolean) => Promise<void>;
	openExperimentPopup: (mode: ExperimentPopupMode) => Promise<boolean>;
	getFromStorage: (keys: string[]) => Promise<any>;
	setToStorage: (values: Record<string, any>) => Promise<void>;
};

export function createExperimentManager(options: ExperimentManagerOptions) {
	return {
		initExperiment,
		handleFirstInstall,
		refreshExperimentState,
	};

	async function initExperiment() {
		await options.dbLogger.ensureUserId();
		await refreshExperimentState('startup');
	}

	async function handleFirstInstall() {
		const state = await refreshExperimentState('install');
		await options.dbLogger.ensureUserId();
		await options.dbLogger.logUserCreated(state.startAt, state.phase);
		await ensureInitialDelayChoice();
		if (!state.onboardingShown) {
			const didOpen = await options.openExperimentPopup('welcome');
			if (didOpen) {
				state.onboardingShown = true;
				await saveExperimentState(state);
			}
		}
	}

	async function refreshExperimentState(reason: ExperimentRefreshReason): Promise<ExperimentState> {
		const state = await ensureExperimentState();
		const nowMs = Date.now();
		const nextPhase = computeExperimentPhase(state.startAt, nowMs, state.experimentStartAt);

		let changed = false;
		let phaseChanged = false;
		if (state.phase !== nextPhase) {
			state.phase = nextPhase;
			changed = true;
			phaseChanged = true;
		}

		const onboardingShown = state.onboardingShown === true;
		const overlayShown = state.overlayShown === true;
		const completionShown = state.completionShown === true;
		if (
			state.onboardingShown !== onboardingShown ||
			state.overlayShown !== overlayShown ||
			state.completionShown !== completionShown
		) {
			state.onboardingShown = onboardingShown;
			state.overlayShown = overlayShown;
			state.completionShown = completionShown;
			changed = true;
		}

		if (changed) {
			await saveExperimentState(state);
		}
		if (phaseChanged) {
			await options.dbLogger.logUserExperimentPhase(state.phase);
		}

		await applyExperimentPhase(state);
		scheduleExperimentAlarm(state, nowMs);

		if (state.phase === 'overlay' && !state.overlayShown) {
			const didOpen = await options.openExperimentPopup('overlay');
			if (didOpen) {
				state.overlayShown = true;
				await saveExperimentState(state);
			}
		}

		if (state.phase === 'completed' && !state.completionShown) {
			const didOpen = await options.openExperimentPopup('complete');
			if (didOpen) {
				state.completionShown = true;
				await saveExperimentState(state);
			}
		}

		return state;
	}

	function computeExperimentPhase(startAt: number, nowMs: number, experimentStartAt?: number): ExperimentPhase {
		if (!Number.isFinite(startAt)) return 'logging';
		const elapsedMs = Math.max(0, nowMs - startAt);
		if (elapsedMs >= EXPERIMENT_TOTAL_DAYS * DAY_MS) return 'completed';
		const overlayStartMs = experimentStartAt
			? Math.max(0, experimentStartAt - startAt)
			: EXPERIMENT_OVERLAY_DAYS * DAY_MS;
		if (elapsedMs >= overlayStartMs) return 'overlay';
		return 'logging';
	}

	async function ensureExperimentState(): Promise<ExperimentState> {
		const stored = await loadExperimentState();
		if (stored) return stored;
		const initial: ExperimentState = {
			startAt: Date.now(),
			phase: 'logging',
			experimentStartAt: Date.now() + 1 * 60 * 1000,
			onboardingShown: false,
			overlayShown: false,
			completionShown: false,
		};
		await saveExperimentState(initial);
		return initial;
	}

	async function loadExperimentState(): Promise<ExperimentState | null> {
		try {
			const res = await options.getFromStorage([EXPERIMENT_STATE_KEY]);
			const raw = res?.[EXPERIMENT_STATE_KEY];
			if (!raw || typeof raw !== 'object') return null;
			const startAt = typeof raw.startAt === 'number' ? raw.startAt : null;
			if (!startAt) return null;
			const phase = normalizeExperimentPhase(raw.phase);
			return {
				startAt,
				phase,
				experimentStartAt: typeof raw.experimentStartAt === 'number' ? raw.experimentStartAt : undefined,
				onboardingShown: raw.onboardingShown === true,
				overlayShown: raw.overlayShown === true,
				completionShown: raw.completionShown === true,
			};
		} catch (e) {
			return null;
		}
	}

	async function saveExperimentState(state: ExperimentState): Promise<void> {
		await options.setToStorage({ [EXPERIMENT_STATE_KEY]: state });
	}

	async function ensureInitialDelayChoice(): Promise<DelayTimerOption> {
		try {
			const res = await options.getFromStorage(['delayTimerChoice', 'popupDelayMs', 'delayTimerLocked']);
			const existingLabel = typeof res?.delayTimerChoice === 'string' ? res.delayTimerChoice : null;
			const existingDelay = typeof res?.popupDelayMs === 'number' ? res.popupDelayMs : null;
			const byDelay = resolveDelayOptionByDelay(existingDelay);
			if (byDelay) {
				if (res?.delayTimerLocked !== true) {
					await options.setToStorage({
						popupDelayMs: byDelay.delayMs,
						delayTimerChoice: byDelay.label,
						delayTimerLocked: true,
					});
				}
				return byDelay;
			}
			const byLabel = resolveDelayOptionByLabel(existingLabel);
			if (byLabel) {
				if (res?.delayTimerLocked !== true) {
					await options.setToStorage({
						popupDelayMs: byLabel.delayMs,
						delayTimerChoice: byLabel.label,
						delayTimerLocked: true,
					});
				}
				return byLabel;
			}
		} catch (e) {}

		const assignedLabel = await options.dbLogger.assignDelayTimerRoundRobin();
		let choice = resolveDelayOptionByLabel(assignedLabel);
		if (!choice) {
			choice = { label: 'Instant', delayMs: 0 };
			await options.dbLogger.logUserDelayTimer(choice.label);
		}
		await options.setToStorage({
			popupDelayMs: choice.delayMs,
			delayTimerChoice: choice.label,
			delayTimerLocked: true,
		});
		return choice;
	}

	function normalizeExperimentPhase(value: any): ExperimentPhase {
		if (value === 'logging' || value === 'overlay' || value === 'completed') return value;
		return 'logging';
	}

	async function applyExperimentPhase(state: ExperimentState) {
		const shouldEnable = state.phase !== 'logging';
		await options.setPopupEnabled(shouldEnable);
	}

	function scheduleExperimentAlarm(state: ExperimentState, nowMs: number) {
		try {
			const startAt = state.startAt;
			if (!Number.isFinite(startAt) || !options.chromeApi?.alarms) return;
			const overlayAt = state.experimentStartAt ?? startAt + EXPERIMENT_OVERLAY_DAYS * DAY_MS;
			const completeAt = startAt + EXPERIMENT_TOTAL_DAYS * DAY_MS;
			let nextAt: number | null = null;
			if (nowMs < overlayAt) {
				nextAt = overlayAt;
			} else if (nowMs < completeAt) {
				nextAt = completeAt;
			}
			if (nextAt) {
				options.chromeApi.alarms.create(EXPERIMENT_ALARM_NAME, { when: nextAt });
			} else {
				options.chromeApi.alarms?.clear(EXPERIMENT_ALARM_NAME);
			}
		} catch (e) {}
	}

	function resolveDelayOptionByDelay(delayMs: number | null): DelayTimerOption | null {
		if (delayMs === null || delayMs === undefined) return null;
		return DELAY_TIMER_OPTIONS.find((option) => option.delayMs === delayMs) ?? null;
	}

	function resolveDelayOptionByLabel(label: string | null): DelayTimerOption | null {
		if (!label) return null;
		return DELAY_TIMER_OPTIONS.find((option) => option.label === label) ?? null;
	}
}
