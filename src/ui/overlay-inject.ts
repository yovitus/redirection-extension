/**
 * overlay-inject.ts
 *
 * Injected into the active tab to draw a semi-transparent overlay that can be
 * clicked to close the popup window. Also cleans itself up when the background
 * script sends a `removeOverlay` message.
 */

(() => {
  try {
    const chromeApi = (globalThis as any).chrome as typeof chrome | undefined;
    if (!chromeApi) {
      return;
    }

    if (document.getElementById('__ext_overlay_div')) {
      return;
    }

    const overlay = document.createElement('div');
    overlay.id = '__ext_overlay_div';
    Object.assign(overlay.style, {
      position: 'fixed',
      left: '0',
      top: '0',
      width: '100%',
      height: '100%',
      background: 'rgba(0, 0, 0, 0.65)',
      zIndex: '2147483647',
      pointerEvents: 'auto',
      backdropFilter: 'blur(2px)'
    });

    overlay.addEventListener('click', () => {
      try {
        chromeApi.runtime.sendMessage({ action: 'closeOverlayFromTab' });
      } catch {
        /* ignore */
      }
    }, { once: true });

    const hint = document.createElement('div');
    Object.assign(hint.style, {
      position: 'fixed',
      right: '12px',
      top: '12px',
      color: '#fff',
      background: 'rgba(0, 0, 0, 0.3)',
      padding: '6px 8px',
      borderRadius: '6px',
      fontFamily: 'sans-serif',
      fontSize: '12px',
      zIndex: '2147483647'
    });
    hint.textContent = 'Click anywhere to close';

    overlay.appendChild(hint);
    document.documentElement.appendChild(overlay);

    const messageListener = (
      msg: { action?: string } | undefined,
      _sender: chrome.runtime.MessageSender,
      sendResponse: (response?: unknown) => void
    ) => {
      if (msg?.action !== 'removeOverlay') {
        return;
      }

      const element = document.getElementById('__ext_overlay_div');
      if (element && element.parentNode) {
        element.parentNode.removeChild(element);
      }

      chromeApi.runtime.onMessage.removeListener(messageListener);
      sendResponse({ success: true });
    };

    chromeApi.runtime.onMessage.addListener(messageListener);
  } catch (error) {
    console.warn('overlay-inject error', error);
  }
})();
