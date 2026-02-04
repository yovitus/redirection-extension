/**
 * overlay-inject.ts
 *
 * Content script that shows a dimmed overlay while the popup window is open.
 */

const chromeApi: any = (window as any).chrome;

const OVERLAY_ID = 'focular-dim-overlay';
const GAME_URL = 'https://minigamegpt.com/en/games/sudoku/';

init();

// Start content script behavior on page load.
function init() {
	if (!chromeApi?.runtime) return;
	if (window.top !== window) return;
	if (isGameWindow()) return;

	listenForMessages();
}

// Listen for background commands to show/hide the dim overlay.
function listenForMessages() {
	try {
		chromeApi.runtime.onMessage.addListener((message: any) => {
			if (!message || typeof message.type !== 'string') return;
			if (message.type === 'show-dim') {
				showDimOverlay();
			}
			if (message.type === 'hide-dim') {
				hideDimOverlay();
			}
		});
	} catch (e) {}
}

// Detect the game window URL to avoid dimming inside the popup.
function isGameWindow(): boolean {
	const href = window.location.href;
	if (href.startsWith(GAME_URL)) return true;
	return (
		window.location.hostname === 'minigamegpt.com' &&
		window.location.pathname.startsWith('/en/games/sudoku')
	);
}

// Render the dimmed overlay and click-to-close message.
function showDimOverlay() {
	if (document.getElementById(OVERLAY_ID)) return;

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
	overlay.style.cursor = 'pointer';

	const message = document.createElement('div');
	message.textContent = 'Click anywhere outside the popup, to close it';
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
	overlay.addEventListener('click', () => {
		try {
			chromeApi.runtime.sendMessage({ type: 'dismiss-popup' });
		} catch (e) {}
		hideDimOverlay();
	});

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
