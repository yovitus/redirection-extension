// overlay_inject.js
(function(){
  try {
    // If an overlay already exists, don't add another
    if (document.getElementById('__ext_overlay_div')) return;

    const overlay = document.createElement('div');
    overlay.id = '__ext_overlay_div';
    Object.assign(overlay.style, {
      position: 'fixed',
      left: '0',
      top: '0',
      width: '100%',
      height: '100%',
      background: 'rgba(0,0,0,0.65)',
      zIndex: '2147483647', // max z-index
      pointerEvents: 'auto',
      backdropFilter: 'blur(2px)'
    });

    // clicking the overlay will send a message to the background to close the popup overlay
    // clicking anywhere should close the overlay/popup
    overlay.addEventListener('click', () => {
      try { chrome.runtime.sendMessage({ action: 'closeOverlayFromTab' }); } catch (e) {}
    }, { once: true });

    // Add a small hint
    const hint = document.createElement('div');
    Object.assign(hint.style, {
      position: 'fixed',
      right: '12px',
      top: '12px',
      color: '#fff',
      background: 'rgba(0,0,0,0.3)',
      padding: '6px 8px',
      borderRadius: '6px',
      fontFamily: 'sans-serif',
      fontSize: '12px',
      zIndex: '2147483647'
    });

    overlay.appendChild(hint);
    document.documentElement.appendChild(overlay);

    // Listen for a message to remove the overlay
    chrome.runtime.onMessage.addListener((msg, sender, sendResponse) => {
      if (msg && msg.action === 'removeOverlay') {
        const el = document.getElementById('__ext_overlay_div');
        if (el && el.parentNode) el.parentNode.removeChild(el);
        try { chrome.runtime.onMessage.removeListener(() => {}); } catch (e) {}
        sendResponse && sendResponse({ success: true });
      }
    });
  } catch (e) {
    console.warn('overlay-inject error', e);
  }
})();
