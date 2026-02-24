export type DbLoggerConfig = {
	logUrl: string;
	anonKey: string;
	userUrl?: string;
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
	private storage?: DbLoggerConfig['storage'];
	private userIdKey: string;

	constructor(config: DbLoggerConfig) {
		this.logUrl = config.logUrl;
		this.anonKey = config.anonKey;
		this.userUrl = config.userUrl;
		this.storage = config.storage;
		this.userIdKey = config.userIdKey ?? 'userId';
	}

	async logVisit(domain: string, durationMinutes: number) {
		if (!this.logUrl || !this.anonKey) return;
		if (!domain || !Number.isFinite(durationMinutes)) return;

		const userId = await this.getUserId();
		console.log("Logging visit:", { userId, domain, durationMinutes });
		await this.postJson(this.logUrl, {
			user_id: userId,
			domain,
			duration_minutes: durationMinutes,
		}, 'Supabase visit insert');
	}

	async ensureUserId(): Promise<string> {
		return this.getUserId();
	}

	async logUserCreated(experimentStartAt?: number, experimentPhase?: string) {
		if (!this.userUrl || !this.anonKey) return;
		const userId = await this.getUserId();
		const payload: Record<string, any> = {
			user_id: userId,
		};
		if (typeof experimentStartAt === 'number') {
			payload.experiment_start_at = new Date(experimentStartAt + 1 * 60 * 1000).toISOString();
		}
		if (typeof experimentPhase === 'string') {
			payload.experiment_phase = experimentPhase;
		}
		await this.postJson(this.userUrl, payload, 'Supabase user insert');
	}

	async logUserConsent(consentGiven: boolean) {
		if (!this.userUrl || !this.anonKey) return;
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
		const userId = await this.getUserId();
		const payload: Record<string, any> = {
			user_id: userId,
			delay_timer: delayTimer,
		};
		await this.postJson(this.userUrl, payload, 'Supabase user delay timer', {
			Prefer: 'resolution=merge-duplicates',
		});
	}

	async logUserExperimentPhase(experimentPhase: 'logging' | 'overlay' | 'completed') {
		if (!this.userUrl || !this.anonKey) return;
		const userId = await this.getUserId();
		const payload: Record<string, any> = {
			user_id: userId,
			experiment_phase: experimentPhase,
		};
		await this.postJson(this.userUrl, payload, 'Supabase user experiment phase', {
			Prefer: 'resolution=merge-duplicates',
		});
	}

async assignDelayTimerRoundRobin(): Promise<'Instant' | '5' | '10' | null> {
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
		if (!this.storage) return this.generateId();

		const stored = await new Promise<any>((resolve) =>
			this.storage!.get([this.userIdKey], (res) => resolve(res?.[this.userIdKey]))
		);

		if (typeof stored === 'string') return stored;

		const next = this.generateId();
		this.storage.set({ [this.userIdKey]: next }, () => {});
		return next;
	}

	private generateId() {
		return `${Date.now()}-${Math.random().toString(36).slice(2)}`;
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

	private async postJson(
		url: string,
		payload: Record<string, any>,
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
			console.log(`${label} status:`, res.status);
			if (text) {
				console.log(`${label} response:`, text);
			}
			if (!res.ok) {
				throw new Error(text || `Request failed (${res.status})`);
			}
		} catch (err) {
			console.error(`${label} failed:`, err);
		}
	}
}
