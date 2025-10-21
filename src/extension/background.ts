self.addEventListener('install', () => {
  console.log('Service worker installed (TS)');
});

self.addEventListener('activate', () => {
  console.log('Service worker activated (TS)');
});

self.addEventListener('message', (event: MessageEvent) => {
  console.log('Background received message', event.data);
  if ((self as any).clients) {
    (self as any).clients.matchAll().then((clients: any[]) => {
      clients.forEach((client) => client.postMessage({ echo: event.data }));
    });
  }
});
