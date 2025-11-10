// overlay_backdrop.js
(function(){
  try {
    const chromeApi = chrome;
    chromeApi.windows.getCurrent((win) => {
      const myId = win && win.id;
      document.body.addEventListener('click', () => {
        try {
          chromeApi.runtime.sendMessage({ action: 'backdropClicked', windowId: myId });
        } catch (e) {
          try { chromeApi.windows.remove(myId); } catch (err) {}
        }
      }, { once: true });
    });
  } catch (e) {
    console.warn('overlay_backdrop script error', e);
  }
})();
