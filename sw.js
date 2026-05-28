const CACHE_NAME = 'hanamaru-fuda-v9';
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

  patched = patched.replace(
    '<button class="add-top" id="newTaskBtn" type="button">札を貼る</button>',
    '<a class="consume-top" id="consumeLink" href="consume.html">消費</a><button class="convert-top" id="convertBtn" type="button">変換</button>'
  );

  patched = patched.replace(
    '<button class="tool-btn" id="refreshReco" type="button">おすすめ</button>\n          <button class="tool-btn" id="openAiTools" type="button">AI</button>\n          <button class="tool-btn" id="openHistory" type="button">履歴</button>',
    '<button class="tool-btn icon-tool" id="refreshReco" type="button" aria-label="おすすめ更新">🔄</button>\n          <button class="tool-btn icon-tool" id="undoBtn" type="button" aria-label="Undo" disabled>↩️</button>\n          <button class="tool-btn" id="openHistory" type="button">履歴</button>'
  );

  patched = patched.replace(
    '<button class="btn gold" id="convertBtn" type="button">花丸スタンプ変換</button>\n      <button class="btn" id="undoBtn" type="button" disabled>Undo</button>',
    '<button class="btn gold bottom-add" id="newTaskBtn" type="button">札を貼る</button>\n      <button class="btn bottom-ai" id="openAiTools" type="button">AI</button>'
  );

  patched = patched.replace(
    "$('convertBtn').textContent = count ? `花丸スタンプ変換（${count}）` : '花丸スタンプ変換';",
    "$('convertBtn').textContent = count ? `変換 ${count}` : '変換';"
  );

  patched = patched.replace(
    'createdAt: task.createdAt || new Date().toISOString()\n      };',
    'createdAt: task.createdAt || new Date().toISOString(),\n        sortOrder: Math.floor(Number(task.sortOrder) || 0)\n      };'
  );

  patched = patched.replace(
    `function sortTasks(tasks, done = false) {
      return [...tasks].sort((a, b) => {
        if (!done && a.dueKind === 'dated' && b.dueKind === 'dated') return String(a.dueDate).localeCompare(String(b.dueDate));
        if (done) return String(b.completedAt || '').localeCompare(String(a.completedAt || ''));
        return String(a.createdAt).localeCompare(String(b.createdAt));
      });
    }`,
    `function sortTasks(tasks, done = false) {
      return [...tasks].sort((a, b) => {
        if (!done) {
          const manual = (Number(b.sortOrder) || 0) - (Number(a.sortOrder) || 0);
          if (manual !== 0) return manual;
        }
        if (!done && a.dueKind === 'dated' && b.dueKind === 'dated') return String(a.dueDate).localeCompare(String(b.dueDate));
        if (done) return String(b.completedAt || '').localeCompare(String(a.completedAt || ''));
        return String(a.createdAt).localeCompare(String(b.createdAt));
      });
    }`
  );

  patched = patched.replace(
    'data.createdAt = state.tasks[index].createdAt;\n        data.completed = state.tasks[index].completed;',
    'data.createdAt = state.tasks[index].createdAt;\n        data.sortOrder = Date.now();\n        data.completed = state.tasks[index].completed;'
  );

  patched = patched.replace(
    'state.tasks.push(data);',
    'data.sortOrder = Date.now();\n        state.tasks.push(data);'
  );

  const patchCss = `
    .consume-top { flex: 0 0 auto; min-height: 40px; padding: 8px 10px; border-radius: 16px; background: #fff; border: 1px solid var(--line); color: var(--ink); font-weight: 950; white-space: nowrap; text-decoration: none; display: inline-flex; align-items: center; }
    .convert-top { flex: 0 0 auto; min-height: 40px; padding: 8px 13px; border-radius: 16px; background: var(--accent); color: #fff; font-weight: 950; white-space: nowrap; box-shadow: 0 8px 20px rgba(219, 93, 130, .22); }
    .convert-top:disabled { opacity: .62; }
    .icon-tool { min-width: 44px; font-size: 21px; line-height: 1; padding: 5px 8px; }
    .bottom-add { font-size: 26px; font-weight: 950; min-height: 54px; }
    .bottom-ai { min-width: 74px; font-size: 21px; font-weight: 950; min-height: 54px; background: #fff; }
    .list-card, #dueTasks, #anytimeVisible, #anytimeFolded, #doneTasks, .task-list { width: 100%; }
    .task { width: 100%; }
    #dueTasks:not(:empty) + #anytimeVisible:not(:empty) { margin-top: 12px; }
    .task:has(.task-due) { border-color: rgba(219, 93, 130, .62); background: linear-gradient(180deg, #fff4f7, #fff8ed); }
    .task:has(.task-due) .task-due { color: #c14667; }
    .task.recommended:not(.done) { border-color: rgba(247, 201, 72, .78); background: linear-gradient(180deg, #fffbe8, #fff8ed); }
    @media (max-width: 390px) { .consume-top { padding: 8px 8px; } .convert-top { padding: 8px 10px; } .bottom-ai { min-width: 70px; } }
  `;

  if (!patched.includes('.bottom-ai { min-width: 74px;')) {
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
