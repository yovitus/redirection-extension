/**
 * delay-manager.ts
 *
 * Session-based + wall-clock timer that keeps counting after the first trigger.
 */

type DelayPhase = 'idle' | 'running' | 'cooldown';

type DelayState = {
	phase: DelayPhase;
	startAt: number | null;
	lastIsTrigger: boolean;
};

type DelayManagerDeps = {
	getStorage: () => any | null;
	openPopup: () => void;
	scheduleAlarm?: (name: string, whenMs: number) => void;
	clearAlarm?: (name: string) => void;
	now?: () => number;
};

export function createDelayManager(deps: DelayManagerDeps) {
	const ALARM_NAME = 'focular-delay-alarm';
	const now = deps.now ?? (() => Date.now());

	let delayMs = 0;
	let enabled = true;

	let state: DelayState = {
		phase: 'idle',
		startAt: null,
		lastIsTrigger: false,
	};

	let loaded = false;
	let loadPromise: Promise<void> | null = null;

	function setDelayMs(nextMs: number) {
		if (delayMs === nextMs) return;
		// On service worker restart we want to keep the stored timer running.
		if (!loaded && delayMs === 0) {
			delayMs = nextMs;
			return;
		}
		delayMs = nextMs;
		resetState();
	}

	function setEnabled(nextEnabled: boolean) {
		if (enabled === nextEnabled) return;
		enabled = nextEnabled;
		if (!enabled) {
			resetState();
		}
	}

	async function updateContext(isTrigger: boolean) {
		if (!enabled) return;
		await ensureLoaded();

		const nowMs = now();
		state.lastIsTrigger = isTrigger;

		if (delayMs <= 0) {
			if (state.phase === 'idle' && isTrigger) {
				firePopup();
			}
			if (state.phase === 'cooldown' && !isTrigger) {
				resetState();
			}
			persistState();
			return;
		}

		if (state.phase === 'cooldown') {
			if (!isTrigger) {
				resetState();
				return;
			}
			persistState();
			return;
		}

		if (state.phase === 'idle' && isTrigger) {
			state.phase = 'running';
			state.startAt = nowMs;
			scheduleAlarm(nowMs + delayMs);
			persistState();
			return;
		}

		if (state.phase === 'running') {
			if (!state.startAt) {
				state.startAt = nowMs;
			}

			if (nowMs - (state.startAt ?? nowMs) >= delayMs) {
				firePopup();
				persistState();
				return;
			}

			scheduleAlarm((state.startAt ?? nowMs) + delayMs);
		}

		persistState();
	}

	function handleAlarm(name: string): boolean {
		if (name !== ALARM_NAME) return false;
		if (!enabled || delayMs <= 0) return true;
		if (state.phase !== 'running' || !state.startAt) return true;

		const nowMs = now();
		if (nowMs - state.startAt >= delayMs) {
			firePopup();
			persistState();
		}
		return true;
	}

	function firePopup() {
		clearAlarm();
		state.phase = 'cooldown';
		state.startAt = null;
		deps.openPopup();
	}

	function resetState() {
		clearAlarm();
		state = {
			phase: 'idle',
			startAt: null,
			lastIsTrigger: false,
		};
		persistState();
	}

	async function ensureLoaded(): Promise<void> {
		if (loaded) return;
		if (!loadPromise) {
			loadPromise = loadState();
		}
		return loadPromise;
	}

	async function loadState(): Promise<void> {
		try {
			const storage = deps.getStorage();
			if (!storage) return;
			const res = await getFromStorageArea(storage, ['delayState']);
			const stored = res?.delayState;
			if (stored) {
				state.phase = normalizePhase(stored.phase);
				state.startAt = typeof stored.startAt === 'number' ? stored.startAt : null;
				state.lastIsTrigger = !!stored.lastIsTrigger;
				if (state.phase === 'running' && !state.startAt) {
					state.phase = 'idle';
				}
			}
		} finally {
			loaded = true;
		}
	}

	function normalizePhase(phase: any): DelayPhase {
		if (phase === 'running' || phase === 'cooldown' || phase === 'idle') return phase;
		return 'idle';
	}

	function scheduleAlarm(whenMs: number) {
		deps.scheduleAlarm?.(ALARM_NAME, whenMs);
	}

	function clearAlarm() {
		deps.clearAlarm?.(ALARM_NAME);
	}

	function persistState() {
		try {
			const storage = deps.getStorage();
			if (!storage) return;
			storage.set({
					delayState: {
						phase: state.phase,
						startAt: state.startAt,
						lastIsTrigger: state.lastIsTrigger,
					},
				});
		} catch (e) {}
	}

	return {
		setDelayMs,
		setEnabled,
		updateContext,
		handleAlarm,
	};
}

function getFromStorageArea(area: any, keys: string[]): Promise<any> {
	return new Promise((resolve) => {
		try {
			area.get(keys, (res: any) => resolve(res || {}));
		} catch (e) {
			resolve({});
		}
	});
}
