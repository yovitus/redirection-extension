/**
 * overlay-backdrop.ts
 *
 * Injected into the dedicated overlay-backdrop window. It captures a click
 * anywhere on the backdrop window and notifies the background script so the
 * overlay popup can be closed (falling back to removing the window directly if
 * messaging fails).
 */

(() => {
  try {
    const chromeApi = (globalThis as any).chrome as typeof chrome | undefined;
    if (!chromeApi) {
      return;
    }

    chromeApi.windows.getCurrent((win) => {
      const windowId = win?.id;
      if (typeof windowId !== 'number') {
        return;
      }

      const handleBackdropClick = () => {
        try {
          chromeApi.runtime.sendMessage({ action: 'backdropClicked', windowId });
        } catch (err) {
          try {
            chromeApi.windows.remove(windowId);
          } catch {
            /* ignore */
          }
        }
      };

      document.body.addEventListener('click', handleBackdropClick, { once: true });
    });
  } catch (error) {
    console.warn('overlay-backdrop script error', error);
  }
})();
