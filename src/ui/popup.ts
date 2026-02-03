/**
 * popup.ts
 *
 * Popup controller for managing trigger sites and game URLs.
 */

import { normalizeStoredList } from './utils/list-utils';

// Use chrome from window to avoid duplicate ambient declarations
const chromeApi: any = (window as any).chrome;

window.addEventListener('DOMContentLoaded', () => {
	setupLists();
	focusInput('trigger-url');
	renderAllLists();
});

type ListKey = 'triggerSites' | 'gameUrls';

type ListConfig = {
	key: ListKey;
	inputId: string;
	buttonId: string;
	listId: string;
	emptyText: string;
	normalize?: (value: string) => string;
	display?: (value: string) => string;
};

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
	{
		key: 'gameUrls',
		inputId: 'game-url',
		buttonId: 'save-game-btn',
		listId: 'game-sites-list',
		emptyText: 'No game URLs yet - add at least one above.',
		normalize: normalizeGameUrl,
		display: (value) => value.replace(/^https?:\/\//i, ''),
	},
];

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

function focusInput(id: string) {
	try {
		const el = document.getElementById(id) as HTMLInputElement | null;
		if (el) {
			el.focus();
			el.select && el.select();
		}
	} catch (e) {}
}

async function renderAllLists() {
	for (const config of LISTS) {
		await renderList(config);
	}
}

function normalizeTriggerSite(value: string): string {
	return value.trim().replace(/\/+$/, '');
}

function normalizeGameUrl(value: string): string {
	let normalized = value.trim();
	if (!/^https?:\/\//i.test(normalized)) {
		normalized = `https://${normalized}`;
	}
	return normalized;
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
