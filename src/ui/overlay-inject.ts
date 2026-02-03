/**
 * overlay-inject.ts
 *
 * Content script that injects a small iframe overlay when the current
 * page matches a saved trigger site.
 */

import { normalizeStoredList } from './utils/list-utils';

const chromeApi: any = (window as any).chrome;

const OVERLAY_ID = 'focular-overlay';
const OVERLAY_HINT_ID = 'focular-overlay-hint';
const FRAME_WRAP_ID = 'focular-iframe-wrap';
const IFRAME_ID = 'focular-iframe';

let cachedTriggerSites: string[] = [];
let cachedGameUrls: string[] = [];
let lastMatchKey: string | null = null;
let lastTriggeredHref: string | null = null;
let dismissedForHref: string | null = null;
let dismissedMatchKey: string | null = null;
let originalBodyOverflow: string | null = null;
let originalHtmlOverflow: string | null = null;

init();

async function init() {
	if (!chromeApi?.storage?.local) return;
	if (window.top !== window) return;

	await refreshCachedLists();
	applyOverlay();
	watchStorage();
	watchNavigation();
}

function watchStorage() {
	try {
		chromeApi.storage.onChanged.addListener((changes: any, area: string) => {
			if (area !== 'local') return;
			if (!changes.triggerSites && !changes.savedSites && !changes.gameUrls) return;
			refreshCachedLists().then(() => applyOverlay());
		});
	} catch (e) {}
}

function watchNavigation() {
	const handleNavigation = () => applyOverlay(true);
	window.addEventListener('popstate', handleNavigation);
	window.addEventListener('hashchange', handleNavigation);

	const originalPushState = history.pushState;
	history.pushState = function (...args: any[]) {
		const result = originalPushState.apply(this, args as any);
		handleNavigation();
		return result;
	};

	const originalReplaceState = history.replaceState;
	history.replaceState = function (...args: any[]) {
		const result = originalReplaceState.apply(this, args as any);
		handleNavigation();
		return result;
	};
}

async function refreshCachedLists() {
	try {
		const res = await chromeApi.storage.local.get(['triggerSites', 'savedSites', 'gameUrls']);
		cachedTriggerSites = normalizeStoredList(res.triggerSites ?? res.savedSites);
		cachedGameUrls = normalizeStoredList(res.gameUrls).map(ensureGameUrl);
	} catch (e) {
		cachedTriggerSites = [];
		cachedGameUrls = [];
	}
}

function applyOverlay(forceRecheck = false) {
	if (dismissedForHref && dismissedForHref !== window.location.href) {
		dismissedForHref = null;
		dismissedMatchKey = null;
	}

	const matchKey = findMatchKey(window.location.href, cachedTriggerSites);
	if (!matchKey || cachedGameUrls.length === 0) {
		removeOverlay();
		lastMatchKey = null;
		lastTriggeredHref = null;
		dismissedForHref = null;
		dismissedMatchKey = null;
		return;
	}

	if (dismissedForHref === window.location.href && dismissedMatchKey === matchKey) {
		return;
	}

	const shouldRefresh =
		forceRecheck ||
		!document.getElementById(OVERLAY_ID) ||
		matchKey !== lastMatchKey ||
		lastTriggeredHref !== window.location.href;

	if (shouldRefresh) {
		const nextUrl = pickRandom(cachedGameUrls);
		upsertOverlay(nextUrl);
		lastMatchKey = matchKey;
		lastTriggeredHref = window.location.href;
	}
}

function findMatchKey(href: string, patterns: string[]): string | null {
	let currentUrl: URL;
	try {
		currentUrl = new URL(href);
	} catch (e) {
		return null;
	}

	for (const pattern of patterns) {
		const trimmed = String(pattern || '').trim();
		if (!trimmed) continue;

		if (/^https?:\/\//i.test(trimmed)) {
			if (href.startsWith(trimmed)) return trimmed;
			continue;
		}

		const normalizedPattern = trimmed.replace(/^www\./i, '');
		const currentHost = currentUrl.hostname.replace(/^www\./i, '');
		if (currentHost === normalizedPattern || currentHost.endsWith(`.${normalizedPattern}`)) {
			return trimmed;
		}
	}

	return null;
}

function pickRandom(list: string[]): string {
	return list[Math.floor(Math.random() * list.length)];
}

function ensureGameUrl(value: string): string {
	if (/^https?:\/\//i.test(value)) return value;
	return `https://${value}`;
}

function upsertOverlay(gameUrl: string) {
	let overlay = document.getElementById(OVERLAY_ID) as HTMLDivElement | null;
	let iframe = document.getElementById(IFRAME_ID) as HTMLIFrameElement | null;

	if (!overlay) {
		overlay = document.createElement('div');
		overlay.id = OVERLAY_ID;
		overlay.style.position = 'fixed';
		overlay.style.inset = '0';
		overlay.style.width = '100vw';
		overlay.style.height = '100vh';
		overlay.style.background = 'rgba(0, 0, 0, 0.55)';
		overlay.style.zIndex = '2147483647';
		overlay.style.display = 'flex';
		overlay.style.alignItems = 'center';
		overlay.style.justifyContent = 'center';
		overlay.style.padding = '32px';
		overlay.style.boxSizing = 'border-box';
		overlay.style.backdropFilter = 'blur(1.5px)';
		overlay.style.cursor = 'pointer';

		overlay.addEventListener('click', () => {
			dismissedForHref = window.location.href;
			dismissedMatchKey = lastMatchKey;
			removeOverlay();
		});

		const hint = document.createElement('div');
		hint.id = OVERLAY_HINT_ID;
		hint.textContent = 'Click anywhere to close the pop up';
		hint.style.position = 'absolute';
		hint.style.top = '24px';
		hint.style.left = '0';
		hint.style.right = '0';
		hint.style.textAlign = 'center';
		hint.style.color = '#f5f5f5';
		hint.style.fontSize = '14px';
		hint.style.letterSpacing = '0.2px';
		hint.style.textShadow = '0 2px 8px rgba(0, 0, 0, 0.4)';

		const frameWrap = document.createElement('div');
		frameWrap.id = FRAME_WRAP_ID;
		frameWrap.style.width = 'min(960px, 92vw)';
		frameWrap.style.height = 'min(640px, 82vh)';
		frameWrap.style.borderRadius = '16px';
		frameWrap.style.overflow = 'hidden';
		frameWrap.style.background = '#000';
		frameWrap.style.boxShadow = '0 24px 60px rgba(0, 0, 0, 0.35)';
		frameWrap.style.cursor = 'auto';
		frameWrap.style.display = 'flex';
		frameWrap.style.pointerEvents = 'auto';
		frameWrap.addEventListener('click', (event) => event.stopPropagation());

		iframe = document.createElement('iframe');
		iframe.id = IFRAME_ID;
		iframe.name = 'focular-iframe';
		iframe.style.width = '100%';
		iframe.style.height = '100%';
		iframe.style.border = '0';
		iframe.setAttribute('loading', 'lazy');
		iframe.setAttribute('allow', 'autoplay; fullscreen');
		iframe.setAttribute('allowfullscreen', 'true');
		iframe.setAttribute('referrerpolicy', 'no-referrer-when-downgrade');

		frameWrap.appendChild(iframe);
		overlay.appendChild(hint);
		overlay.appendChild(frameWrap);
		const mount = document.body || document.documentElement;
		mount.appendChild(overlay);
		lockPageScroll();
	}

	if (!iframe) {
		iframe = document.getElementById(IFRAME_ID) as HTMLIFrameElement | null;
	}
	if (iframe) {
		iframe.addEventListener('load', () => tryMuteIframe(iframe as HTMLIFrameElement), { once: true });
		iframe.src = gameUrl;
	}
}

function removeOverlay() {
	const existing = document.getElementById(OVERLAY_ID);
	if (existing && existing.parentNode) {
		existing.parentNode.removeChild(existing);
	}
	unlockPageScroll();
}

function tryMuteIframe(iframe: HTMLIFrameElement) {
	try {
		const doc = iframe.contentDocument;
		if (!doc) return;
		muteMediaInDocument(doc);
		doc.addEventListener(
			'play',
			(event) => {
				const target = event.target;
				if (target && target instanceof HTMLMediaElement) {
					target.muted = true;
					target.volume = 0;
				}
			},
			true
		);
	} catch (e) {
		// Cross-origin frames can't be muted from here.
	}
}

function muteMediaInDocument(doc: Document) {
	const media = Array.from(doc.querySelectorAll('audio, video')) as HTMLMediaElement[];
	media.forEach((el) => {
		try {
			el.muted = true;
			el.volume = 0;
		} catch (e) {}
	});
}

function lockPageScroll() {
	if (originalBodyOverflow === null) {
		originalBodyOverflow = document.body ? document.body.style.overflow : '';
	}
	if (originalHtmlOverflow === null) {
		originalHtmlOverflow = document.documentElement.style.overflow;
	}
	if (document.body) {
		document.body.style.overflow = 'hidden';
	}
	document.documentElement.style.overflow = 'hidden';
}

function unlockPageScroll() {
	if (document.body && originalBodyOverflow !== null) {
		document.body.style.overflow = originalBodyOverflow;
	}
	if (originalHtmlOverflow !== null) {
		document.documentElement.style.overflow = originalHtmlOverflow;
	}
	originalBodyOverflow = null;
	originalHtmlOverflow = null;
}
