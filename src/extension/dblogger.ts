export type DbLoggerConfig = {
	logUrl: string;
	anonKey: string;
	userUrl?: string;
	triggerLogUrl?: string;
	consentKey?: string;
	storage?: {
		get: (keys: string[], cb: (res: any) => void) => void;
		set: (values: Record<string, any>, cb: () => void) => void;
	};
	userIdKey?: string;
};

export class DbLogger {
	private logUrl: string;
	private anonKey: string;
	private userUrl?: string;
	private triggerLogUrl?: string;
	private consentKey: string;
	private storage?: DbLoggerConfig['storage'];
	private userIdKey: string;
	private experimentPhaseByUserId = new Map<string, 'logging' | 'overlay' | 'completed'>();
	private cachedUserId: string | null = null;
	private userIdPromise: Promise<string> | null = null;

	constructor(config: DbLoggerConfig) {
		this.logUrl = config.logUrl;
		this.anonKey = config.anonKey;
		this.userUrl = config.userUrl;
		this.triggerLogUrl = config.triggerLogUrl;
		this.consentKey = config.consentKey ?? 'experimentConsentGiven';
		this.storage = config.storage;
		this.userIdKey = config.userIdKey ?? 'userId';
	}

	async logVisit(domain: string, durationMinutes: number) {
		if (!this.logUrl || !this.anonKey) return;
		if (!domain || !Number.isFinite(durationMinutes)) return;
		if (!(await this.hasUserConsent())) return;

		const userId = await this.getUserId();
		const reason = await this.resolveVisitReason(userId);
		await this.postJson(this.logUrl, {
			user_id: userId,
			domain,
			duration_minutes: durationMinutes,
			reason,
		}, 'Supabase visit insert');
	}

	async ensureUserId(): Promise<string> {
		return this.getUserId();
	}

	async logUserCreated(experimentStartAt?: number, experimentPhase?: string) {
		if (!this.userUrl || !this.anonKey) return;
		if (!(await this.hasUserConsent())) return;
		const userId = await this.getUserId();
		const payload: Record<string, any> = {
			user_id: userId,
		};
		if (typeof experimentStartAt === 'number') {
			payload.experiment_start_at = new Date(experimentStartAt).toISOString();
		}
		if (typeof experimentPhase === 'string') {
			payload.experiment_phase = experimentPhase;
			if (experimentPhase === 'logging' || experimentPhase === 'overlay' || experimentPhase === 'completed') {
				this.experimentPhaseByUserId.set(userId, experimentPhase);
			}
		}
		await this.postJson(this.userUrl, payload, 'Supabase user insert', {
			Prefer: 'resolution=merge-duplicates',
		});
	}

	async logUserConsent(consentGiven: boolean) {
		if (!this.userUrl || !this.anonKey) return;
		if (consentGiven !== true) return;
		const userId = await this.getUserId();
		const payload: Record<string, any> = {
			user_id: userId,
			consent_given: consentGiven ? 'true' : 'false',
		};
		await this.postJson(this.userUrl, payload, 'Supabase user consent', {
			Prefer: 'resolution=merge-duplicates',
		});
	}

	async logUserDelayTimer(delayTimer: 'Instant' | '5' | '10') {
		if (!this.userUrl || !this.anonKey) return;
		if (!(await this.hasUserConsent())) return;
		const userId = await this.getUserId();
		const payload: Record<string, any> = {
			user_id: userId,
			delay_timer: delayTimer,
		};
		await this.postJson(this.userUrl, payload, 'Supabase user delay timer', {
			Prefer: 'resolution=merge-duplicates',
		});
	}

	async logUserEmail(email: string) {
		if (!this.userUrl || !this.anonKey) return;
		if (!(await this.hasUserConsent())) return;
		const normalized = this.normalizeEmail(email);
		if (!normalized) return;
		const userId = await this.getUserId();
		const payload: Record<string, any> = {
			user_id: userId,
			email: normalized,
		};
		await this.postJson(this.userUrl, payload, 'Supabase user email', {
			Prefer: 'resolution=merge-duplicates',
		});
	}

	async logUserExperimentPhase(experimentPhase: 'logging' | 'overlay' | 'completed') {
		if (!this.userUrl || !this.anonKey) return;
		if (!(await this.hasUserConsent())) return;
		const userId = await this.getUserId();
		this.experimentPhaseByUserId.set(userId, experimentPhase);
		const payload: Record<string, any> = {
			user_id: userId,
			experiment_phase: experimentPhase,
		};
		await this.postJson(this.userUrl, payload, 'Supabase user experiment phase', {
			Prefer: 'resolution=merge-duplicates',
		});
	}

	async logTriggerSiteChanges(added: string[], removed: string[], triggerSites: string[]) {
		if (!this.triggerLogUrl || !this.anonKey) return;
		if (!(await this.hasUserConsent())) return;
		const userId = await this.getUserId();
		const changedAt = new Date().toISOString();
		const rows: Record<string, any>[] = [];
		for (const site of added) {
			if (!site) continue;
			rows.push({
				user_id: userId,
				action: 'add',
				site,
				trigger_sites: triggerSites,
				changed_at: changedAt,
			});
		}
		for (const site of removed) {
			if (!site) continue;
			rows.push({
				user_id: userId,
				action: 'remove',
				site,
				trigger_sites: triggerSites,
				changed_at: changedAt,
			});
		}
		if (rows.length === 0) return;
		await this.postJson(this.triggerLogUrl, rows, 'Supabase trigger site change');
	}

	async logTriggerSitesSnapshot(triggerSites: string[]) {
		if (!this.triggerLogUrl || !this.anonKey) return;
		if (!(await this.hasUserConsent())) return;
		if (!Array.isArray(triggerSites) || triggerSites.length === 0) return;
		const userId = await this.getUserId();
		const changedAt = new Date().toISOString();
		const payload: Record<string, any> = {
			user_id: userId,
			action: 'snapshot',
			trigger_sites: triggerSites,
			changed_at: changedAt,
		};
		await this.postJson(this.triggerLogUrl, payload, 'Supabase trigger site snapshot');
	}

	async assignDelayTimerRoundRobin(): Promise<'Instant' | '5' | '10' | null> {
		if (!(await this.hasUserConsent())) return null;
		const rpcUrl = this.getRpcUrl('assign_delay_timer');
		if (!rpcUrl || !this.anonKey) return null;
		const userId = await this.getUserId();
		try {
			const res = await fetch(rpcUrl, {
				method: 'POST',
				headers: {
					'Content-Type': 'application/json',
					apikey: this.anonKey,
					Authorization: `Bearer ${this.anonKey}`,
				},
				body: JSON.stringify({ _user_id: userId }),
			});
			const text = await res.text();
			if (!res.ok) {
				throw new Error(text || `Request failed (${res.status})`);
			}
			const parsed = this.safeParseJson(text);
			const value = typeof parsed === 'string' ? parsed : typeof text === 'string' ? text : null;
			if (value === 'Instant' || value === '5' || value === '10') {
				return value;
			}
			return null;
		} catch (err) {
			console.error('Supabase assign delay timer failed:', err);
			return null;
		}
	}
	private async getUserId(): Promise<string> {
		if (this.cachedUserId) return this.cachedUserId;

		if (!this.storage) {
			this.cachedUserId = this.generateId();
			return this.cachedUserId;
		}

		if (!this.userIdPromise) {
			this.userIdPromise = (async () => {
				const stored = await new Promise<any>((resolve) =>
					this.storage!.get([this.userIdKey], (res) => resolve(res?.[this.userIdKey]))
				);

				if (typeof stored === 'string' && stored) {
					this.cachedUserId = stored;
					return stored;
				}

				const next = this.generateId();
				await new Promise<void>((resolve) => {
					this.storage!.set({ [this.userIdKey]: next }, () => resolve());
				});
				this.cachedUserId = next;
				return next;
			})().finally(() => {
				this.userIdPromise = null;
			});
		}

		return this.userIdPromise;
	}

	private generateId() {
		return `${Date.now()}-${Math.random().toString(36).slice(2)}`;
	}

	private async resolveVisitReason(
		userId: string,
	): Promise<'logging' | 'active' | 'active-enabled' | 'active-disabled'> {
		const phase = await this.getUserExperimentPhase(userId);
		if (phase === 'overlay' || phase === 'completed') {
			const enabled = await this.getPopupEnabled();
			if (enabled === true) return 'active-enabled';
			if (enabled === false) return 'active-disabled';
			return 'active';
		}
		return 'logging';
	}

	private async getUserExperimentPhase(
		userId: string,
	): Promise<'logging' | 'overlay' | 'completed' | null> {
		const cached = this.experimentPhaseByUserId.get(userId) ?? null;
		if (!this.userUrl || !this.anonKey) return cached;
		if (!(await this.hasUserConsent())) return cached;
		try {
			const phaseUrl = `${this.userUrl}?select=experiment_phase&user_id=eq.${encodeURIComponent(userId)}&limit=1`;
			const res = await fetch(phaseUrl, {
				method: 'GET',
				headers: {
					apikey: this.anonKey,
					Authorization: `Bearer ${this.anonKey}`,
				},
			});
			const text = await res.text();
			if (!res.ok) {
				throw new Error(text || `Request failed (${res.status})`);
			}
			const parsed = this.safeParseJson(text);
			const row = Array.isArray(parsed) && parsed.length > 0 ? parsed[0] : null;
			const phase = row?.experiment_phase;
			if (phase === 'logging' || phase === 'overlay' || phase === 'completed') {
				this.experimentPhaseByUserId.set(userId, phase);
				return phase;
			}
			return cached;
		} catch (err) {
			console.error('Supabase user experiment phase lookup failed:', err);
			return cached;
		}
	}

	private async hasUserConsent(): Promise<boolean> {
		if (!this.storage) return false;
		const stored = await new Promise<any>((resolve) =>
			this.storage!.get([this.consentKey], (res) => resolve(res?.[this.consentKey]))
		);
		return stored === true;
	}

	private getRpcUrl(fnName: string): string | null {
		const base = this.userUrl || this.logUrl;
		if (!base) return null;
		const marker = '/rest/v1/';
		const idx = base.indexOf(marker);
		if (idx === -1) return null;
		return `${base.slice(0, idx)}${marker}rpc/${fnName}`;
	}

	private safeParseJson(value: string): any {
		try {
			return JSON.parse(value);
		} catch (e) {
			return null;
		}
	}

	private async getPopupEnabled(): Promise<boolean | null> {
		if (!this.storage) return null;
		const stored = await new Promise<any>((resolve) =>
			this.storage!.get(['popupEnabled'], (res) => resolve(res?.popupEnabled))
		);
		if (stored === true || stored === false) return stored;
		return null;
	}

	private normalizeEmail(value: string): string | null {
		const trimmed = String(value || '').trim().toLowerCase();
		if (!trimmed) return null;
		if (!/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(trimmed)) return null;
		return trimmed;
	}

	private async postJson(
		url: string,
		payload: Record<string, any> | Record<string, any>[],
		label: string,
		extraHeaders?: Record<string, string>,
	) {
		try {
			const res = await fetch(url, {
				method: 'POST',
				headers: {
					'Content-Type': 'application/json',
					apikey: this.anonKey,
					Authorization: `Bearer ${this.anonKey}`,
					...(extraHeaders ?? {}),
				},
				body: JSON.stringify(payload),
			});
			const text = await res.text();
			if (!res.ok) {
				throw new Error(text || `Request failed (${res.status})`);
			}
		} catch (err) {
			console.error(`${label} failed:`, err);
		}
	}
}
