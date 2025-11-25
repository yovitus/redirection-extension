/**
 * content.ts - Content Script
 *
 * Notifies the background service worker when a top-level HTTP(S) page finishes
 * loading so the background can decide whether to auto-open the overlay for
 * user-saved sites.
 */

function isTopLevelHttp() {
	try {
		return window.top === window && /^https?:\/\//i.test(location.href);
	} catch (e) {
		return false;
	}
}

if (isTopLevelHttp()) {
	// Wait for load to ensure the URL is stable
	window.addEventListener('load', () => {
		try {
			(window as any).chrome.runtime.sendMessage({ action: 'pageLoaded', url: location.href }, () => {});
		} catch (e) {
			// ignore
		}
	}, { once: true });
}
