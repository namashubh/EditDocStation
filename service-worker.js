const CACHE_NAME = 'edit-doc-station-v3';
const APP_SHELL = [
  './',
  './index.html',
  './manifest.webmanifest',
  './static/logo.svg',
  './static/style.css?v=pages-5',
  './static/vendor/pdf-lib.min.js',
  './static/vendor/jszip.min.js',
  './static/vendor/background/lucide.min.js',
  './static/browser-tools.js?v=pages-4',
  './static/background-engine.js?v=background-1',
  './static/background-editor.js?v=background-1',
  './static/app.js?v=pages-8'
];

self.addEventListener('install', event => {
  event.waitUntil(caches.open(CACHE_NAME).then(cache => cache.addAll(APP_SHELL)).then(() => self.skipWaiting()));
});

self.addEventListener('activate', event => {
  event.waitUntil(caches.keys().then(keys => Promise.all(
    keys.filter(key => key.startsWith('edit-doc-station-') && key !== CACHE_NAME).map(key => caches.delete(key))
  )).then(() => self.clients.claim()));
});

self.addEventListener('fetch', event => {
  const request = event.request;
  const url = new URL(request.url);
  if (request.method !== 'GET' || url.origin !== self.location.origin) return;

  event.respondWith(caches.open(CACHE_NAME).then(async cache => {
    const cached = await cache.match(request);
    const refreshWhenOnline = request.mode === 'navigate' || ['script', 'style', 'worker'].includes(request.destination);
    if (cached && !refreshWhenOnline) return cached;
    try {
      const response = await fetch(request);
      if (response.ok && response.type === 'basic') cache.put(request, response.clone()).catch(() => {});
      return response;
    } catch {
      if (cached) return cached;
      if (request.mode === 'navigate') return cache.match(new URL('index.html', self.registration.scope));
      return Response.error();
    }
  }));
});