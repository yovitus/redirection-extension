/**
 * popup.ts - Overlay launcher only
 *
 * Minimal controller that focuses the URL input and sends an `openOverlay` message
 * to the background service worker. The popup itself then closes.
 */

// Use chrome from window to avoid duplicate ambient declarations
const chromeApi: any = (window as any).chrome;

window.addEventListener('DOMContentLoaded', () => {
	setupOverlayUI();
	focusOverlayInput();
});

function setupOverlayUI() {
	try {
		const urlInput = document.getElementById('overlay-url') as HTMLInputElement | null;
		const openBtn = document.getElementById('overlay-open-btn') as HTMLButtonElement | null;

		const presets = document.querySelectorAll('.overlay-preset');
		presets.forEach(p => {
			p.addEventListener('click', (e) => {
				const target = e.currentTarget as HTMLElement;
				const u = target.getAttribute('data-url') || '';
				if (urlInput) urlInput.value = u;
			});
		});

		if (openBtn && urlInput) {
			openBtn.addEventListener('click', () => {
				let url = (urlInput.value || '').trim();
				if (!url) return;
				if (!/^https?:\/\//i.test(url)) url = 'https://' + url;

						try {
							if (chromeApi && chromeApi.runtime && chromeApi.runtime.sendMessage) {
								chromeApi.runtime.sendMessage({ action: 'openOverlay', url, width: 900, height: 700 }, (resp: any) => {
									try { window.close(); } catch {}
								});
							} else {
								try { window.close(); } catch {}
							}
						} catch (e) {
							try { window.close(); } catch {}
						}
			});

			urlInput.addEventListener('keydown', (ev) => {
				if ((ev as KeyboardEvent).key === 'Enter') {
					openBtn.click();
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

