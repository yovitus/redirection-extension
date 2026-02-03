/**
 * popup.ts
 *
 * Minimal controller for storing and listing websites.
 */

// Use chrome from window to avoid duplicate ambient declarations
const chromeApi: any = (window as any).chrome;

window.addEventListener('DOMContentLoaded', () => {
	setupOverlayUI();
	focusOverlayInput();
	renderSavedSites();
});

function setupOverlayUI() {
	try {
		const urlInput = document.getElementById('overlay-url') as HTMLInputElement | null;
		const saveBtn = document.getElementById('save-site-btn') as HTMLButtonElement | null;

		if (saveBtn && urlInput) {
			saveBtn.addEventListener('click', async () => {
				const raw = (urlInput.value || '').trim();
				if (!raw) return;
				let match = raw;
				if (!/^https?:\/\//i.test(match)) match = match; // keep as user entered for matching
				try {
					const stored = await getSavedSites();
					// normalize to objects { match }
					const normalized = (stored || []).map((s: any) => typeof s === 'string' ? { match: s } : s);
					if (!normalized.find((e: any) => String(e.match) === String(match))) {
						normalized.push({ match });
						await setSavedSites(normalized);
					}
					renderSavedSites();
				} catch (e) {
					console.warn('Failed to save site', e);
				}
			});
		}
	} catch (e) {
		console.warn('Overlay UI setup failed', e);
	}
}

function focusOverlayInput() {
	try {
		const el = document.getElementById('overlay-url') as HTMLInputElement | null;
		if (el) {
			el.focus();
			el.select && el.select();
		}
	} catch (e) {}
}

function getSavedSites(): Promise<any[]> {
	return new Promise((resolve) => {
		try {
			chromeApi.storage.local.get(['savedSites'], (res: any) => {
				const arr = (res && Array.isArray(res.savedSites)) ? res.savedSites : [];
				resolve(arr);
			});
		} catch (e) {
			resolve([]);
		}
	});
}

function setSavedSites(sites: any[]): Promise<void> {
	return new Promise((resolve, reject) => {
		try {
			chromeApi.storage.local.set({ savedSites: sites }, () => {
				if (chromeApi.runtime.lastError) return reject(new Error(chromeApi.runtime.lastError.message));
				resolve();
			});
		} catch (e) { reject(e); }
	});
}

async function renderSavedSites() {
	try {
		const listEl = document.getElementById('saved-sites-list');
		if (!listEl) return;
		listEl.innerHTML = '';
		const sites = await getSavedSites();
		if (!sites || sites.length === 0) {
			const p = document.createElement('div');
			p.style.color = '#666';
			p.style.fontSize = '13px';
			p.textContent = 'No saved sites yet — add one and press Save.';
			listEl.appendChild(p);
			return;
		}

		// normalize to objects { match, open? }
		const normalized = sites.map((s: any) => typeof s === 'string' ? { match: s } : s);
		normalized.forEach((s: any) => {
			const row = document.createElement('div');
			row.style.display = 'flex';
			row.style.justifyContent = 'space-between';
			row.style.alignItems = 'center';
			row.style.padding = '6px 8px';
			row.style.border = '1px solid #eee';
			row.style.borderRadius = '6px';

			const label = document.createElement('div');
			const display = (s.open ? s.open : s.match) || '';
			label.textContent = String(display).replace(/^https?:\/\//i, '');
			label.style.color = '#333';
			label.style.flex = '1';

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
					const existing = await getSavedSites();
					const normalizedStores = existing.map((x: any) => typeof x === 'string' ? { match: x } : x);
					const filtered = normalizedStores.filter((x: any) => x.match !== s.match);
					await setSavedSites(filtered);
					renderSavedSites();
				} catch (e) {
					console.warn('Failed to remove', e);
				}
			});

			row.appendChild(label);
			row.appendChild(del);
			listEl.appendChild(row);
		});
	} catch (e) {
		console.warn('renderSavedSites failed', e);
	}
}

