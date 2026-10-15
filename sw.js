const CACHE_NAME = 'hanamaru-fuda-v19';
const APP_SHELL = [
  './',
  './index.html',
  './consume.html',
  './app-enhance.js?v=17',
  './recurrence.js?v=16',
  './manifest.json',
  './icon.svg'
];

function injectEnhance(html) {
  if (!html || html.includes('app-enhance.js')) return html;
  return html.replace('</body>', '<script src="./app-enhance.js"></script>\n</body>');
}

self.addEventListener('install', (event) => {
  event.waitUntil(
    caches.open(CACHE_NAME).then((cache) => cache.addAll(APP_SHELL))
  );
  self.skipWaiting();
});

self.addEventListener('activate', (event) => {
  event.waitUntil(
    caches.keys().then((keys) => Promise.all(
      keys.filter((key) => key !== CACHE_NAME).map((key) => caches.delete(key))
    ))
  );
  self.clients.claim();
});

self.addEventListener('fetch', (event) => {
  if (event.request.method !== 'GET') return;

  const request = event.request;
  const url = new URL(request.url);
  const isNavigation = request.mode === 'navigate';
  const isHtml = request.headers.get('accept')?.includes('text/html');
  const isIndex = url.pathname.endsWith('/') || url.pathname.endsWith('/index.html');

  if ((isNavigation || isHtml) && isIndex) {
    event.respondWith(
      fetch(request).then((response) => response.text()).then((html) => {
        const injected = injectEnhance(html);
        const wrapped = new Response(injected, { headers: { 'Content-Type': 'text/html; charset=utf-8' } });
        caches.open(CACHE_NAME).then((cache) => cache.put('./index.html', wrapped.clone()));
        return wrapped;
      }).catch(() => caches.match('./index.html'))
    );
    return;
  }

  if (isNavigation || isHtml) {
    event.respondWith(
      fetch(request).then((response) => {
        const copy = response.clone();
        caches.open(CACHE_NAME).then((cache) => cache.put(request, copy));
        return response;
      }).catch(() => caches.match(request).then((cached) => cached || caches.match('./index.html')))
    );
    return;
  }

  event.respondWith(
    caches.match(request).then((cached) => {
      if (cached) return cached;
      return fetch(request).then((response) => {
        const copy = response.clone();
        caches.open(CACHE_NAME).then((cache) => cache.put(request, copy));
        return response;
      });
    })
  );
});

