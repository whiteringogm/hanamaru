const CACHE_NAME = 'hanamaru-fuda-v6';
const APP_SHELL = [
  './',
  './index.html',
  './consume.html',
  './manifest.json',
  './icon.svg'
];

function patchIndex(html) {
  if (!html || !html.includes('<html')) return html;
  let patched = html;

  if (!patched.includes('id="consumeLink"')) {
    patched = patched.replace('<button class="add-top" id="newTaskBtn" type="button">札を貼る</button>', '<a class="consume-top" id="consumeLink" href="consume.html">消費</a><button class="add-top" id="newTaskBtn" type="button">札を貼る</button>');
  }

  const patchCss = `
    .consume-top { flex: 0 0 auto; min-height: 40px; padding: 8px 10px; border-radius: 16px; background: #fff; border: 1px solid var(--line); color: var(--ink); font-weight: 950; white-space: nowrap; text-decoration: none; display: inline-flex; align-items: center; }
    .list-card, #dueTasks, #anytimeVisible, #anytimeFolded, #doneTasks, .task-list { width: 100%; }
    .task { width: 100%; }
    #dueTasks:not(:empty) + #anytimeVisible:not(:empty) { margin-top: 12px; }
    .task:has(.task-due) { border-color: rgba(219, 93, 130, .62); background: linear-gradient(180deg, #fff4f7, #fff8ed); }
    .task:has(.task-due) .task-due { color: #c14667; }
    .task.recommended:not(.done) { border-color: rgba(247, 201, 72, .78); background: linear-gradient(180deg, #fffbe8, #fff8ed); }
    @media (max-width: 390px) { .consume-top { padding: 8px 8px; } }
  `;

  if (!patched.includes('#dueTasks:not(:empty) + #anytimeVisible:not(:empty)')) {
    patched = patched.replace('</style>', `${patchCss}\n  </style>`);
  }

  return patched;
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
        const patched = patchIndex(html);
        const wrapped = new Response(patched, { headers: { 'Content-Type': 'text/html; charset=utf-8' } });
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
      }).catch(() => caches.match(request))
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
