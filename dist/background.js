"use strict";
(() => {
  // src/extension/background.ts
  self.addEventListener("install", () => {
    console.log("Service worker installed (TS)");
  });
  self.addEventListener("activate", () => {
    console.log("Service worker activated (TS)");
  });
  self.addEventListener("message", (event) => {
    console.log("Background received message", event.data);
    if (self.clients) {
      self.clients.matchAll().then((clients) => {
        clients.forEach((client) => client.postMessage({ echo: event.data }));
      });
    }
  });
})();
