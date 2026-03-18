/**
 * overlay-inject.ts
 *
 * Content script that shows a dimmed overlay while the popup window is open.
 */

export {};

const chromeApi: any = (window as any).chrome;
const windowAny: any = window as any;

const OVERLAY_ID = 'focular-dim-overlay';
const GAME_CONTEXT_ID = 'focular-game-context';
const GAME_URL = 'https://www.minisudoku.games/';

init();

// Start content script behavior on page load.
function init() {
	if (!chromeApi?.runtime) return;
	if (windowAny.__focularOverlayInjected) return;
	windowAny.__focularOverlayInjected = true;
	if (window.top !== window) return;
	if (isGameWindow()) {
		ensureGamePopupOverlay();
		cleanupGamePopupLayout();
		return;
	}

	listenForMessages();
	announceOverlayReady();
}

// Listen for background commands to show/hide the dim overlay.
function listenForMessages() {
	try {
		chromeApi.runtime.onMessage.addListener((message: any) => {
			if (!message || typeof message.type !== 'string') return;
			if (message.type === 'show-dim') {
				showDimOverlay(message.allowDismiss !== false);
			}
			if (message.type === 'hide-dim') {
				hideDimOverlay();
			}
		});
	} catch (e) {}
}

// Notify the background script that the overlay can be shown on this tab.
function announceOverlayReady() {
	try {
		chromeApi.runtime.sendMessage({ type: 'overlay-ready' });
	} catch (e) {}
}

// Detect the game window URL to avoid dimming inside the popup.
function isGameWindow(): boolean {
	const href = window.location.href;
	if (href.startsWith(GAME_URL)) return true;
	const host = (window.location.hostname || '').toLowerCase();
	return host === 'www.minisudoku.games' || host === 'minisudoku.games';
}

// Keep only core gameplay sections visible in the game popup.
function cleanupGamePopupLayout() {
	const applyCleanup = () => {
		const wrapper = document.getElementById('app-wrapper');
		const main = wrapper?.querySelector('main');
		if (!main) return false;

		const directDivChildren = Array.from(main.children).filter((child) => child.tagName === 'DIV');
		for (const node of directDivChildren) {
			const div = node as HTMLDivElement;
			const keep =
				div.id === 'sudoku-board-container' ||
				div.id === 'number-controls' ||
				!!div.querySelector('#difficulty') ||
				(!!div.querySelector('#new-game-btn') && !!div.querySelector('#hint-btn'));
			div.style.display = keep ? '' : 'none';
		}
		return true;
	};

	const observer = new MutationObserver(() => {
		applyCleanup();
	});
	observer.observe(document.documentElement, { childList: true, subtree: true });
	applyCleanup();
}

function ensureGamePopupOverlay() {
	try {
		if (document.getElementById(GAME_CONTEXT_ID)) return;
		const mount = document.body || document.documentElement;
		if (!mount) {
			setTimeout(ensureGamePopupOverlay, 200);
			return;
		}
	const overlay = document.createElement('div');
	overlay.id = GAME_CONTEXT_ID;
	overlay.style.position = 'fixed';
	overlay.style.top = '50%';
	overlay.style.left = '50%';
	overlay.style.transform = 'translate(-50%, -50%)';
		overlay.style.maxWidth = '720px';
		overlay.style.width = 'calc(100% - 48px)';
		overlay.style.padding = '16px 20px';
		overlay.style.borderRadius = '14px';
		overlay.style.background = 'rgba(17, 24, 39, 0.92)';
		overlay.style.color = '#f5f5f5';
		overlay.style.textAlign = 'center';
		overlay.style.lineHeight = '1.4';
		overlay.style.fontFamily = '"Merriweather", "Georgia", serif';
		overlay.style.boxShadow = '0 10px 28px rgba(0, 0, 0, 0.45)';
		overlay.style.zIndex = '2147483647';

		const title = document.createElement('div');
		title.textContent = 'You are procrastinating.';
		title.style.fontSize = '18px';
		title.style.fontWeight = '600';
		title.style.marginBottom = '6px';

		const body = document.createElement('div');
		body.textContent =
			'Consider doing something else. Here is a game of sudoku for you to do something more stimulating.';
		body.style.fontSize = '15px';

		const close = document.createElement('button');
		close.type = 'button';
		close.textContent = 'Dismiss';
		close.style.marginTop = '10px';
		close.style.background = 'transparent';
		close.style.border = '1px solid rgba(255, 255, 255, 0.5)';
		close.style.color = '#f5f5f5';
		close.style.borderRadius = '999px';
		close.style.padding = '6px 12px';
		close.style.cursor = 'pointer';
		close.addEventListener('click', () => {
			overlay.remove();
		});

		overlay.appendChild(title);
		overlay.appendChild(body);
		overlay.appendChild(close);

		overlay.addEventListener('click', (event) => {
			if (event.target !== overlay) return;
			overlay.remove();
		});
		const dismissOnAnyClick = () => {
			overlay.remove();
			document.removeEventListener('click', dismissOnAnyClick, true);
		};
		document.addEventListener('click', dismissOnAnyClick, true);

		mount.appendChild(overlay);
	} catch (e) {}
}

// Render the dimmed overlay and click-to-close message.
function showDimOverlay(allowDismiss: boolean) {
	hideDimOverlay();

	const overlay = document.createElement('div');
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
	overlay.style.cursor = allowDismiss ? 'pointer' : 'default';

	const message = document.createElement('div');
	message.textContent = allowDismiss
		? 'Click anywhere outside the popup, to close it'
		: 'Return to the experiment popup to continue';
	message.style.position = 'absolute';
	message.style.top = '20px';
	message.style.left = '50%';
	message.style.transform = 'translateX(-50%)';
	message.style.color = '#f5f5f5';
	message.style.fontSize = '15px';
	message.style.letterSpacing = '0.2px';
	message.style.textAlign = 'center';
	message.style.maxWidth = '520px';
	message.style.padding = '10px 16px';
	message.style.borderRadius = '999px';
	message.style.background = 'rgba(0, 0, 0, 0.6)';
	message.style.boxShadow = '0 6px 20px rgba(0, 0, 0, 0.35)';

	overlay.appendChild(message);
	if (allowDismiss) {
		overlay.addEventListener('click', () => {
			try {
				chromeApi.runtime.sendMessage({ type: 'dismiss-popup' });
			} catch (e) {}
			hideDimOverlay();
		});
	}

	const mount = document.body || document.documentElement;
	mount.appendChild(overlay);
}

// Remove the dimmed overlay if present.
function hideDimOverlay() {
	const existing = document.getElementById(OVERLAY_ID);
	if (existing && existing.parentNode) {
		existing.parentNode.removeChild(existing);
	}
}
