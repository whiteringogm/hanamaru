const CACHE_NAME = 'hanamaru-fuda-v10';
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
    'conversionHistory: []\n      };',
    'conversionHistory: [],\n        rewardHistory: [],\n        earnedTotal: 0\n      };'
  );

  patched = patched.replace(
    'merged.totalStamps = Number.isFinite(Number(merged.totalStamps)) ? Number(merged.totalStamps) : 0;\n      merged.recommendations = merged.recommendations && typeof merged.recommendations === \'object\' ? merged.recommendations : {};\n      merged.conversionHistory = Array.isArray(merged.conversionHistory) ? merged.conversionHistory.slice(0, 3) : [];',
    'merged.totalStamps = Number.isFinite(Number(merged.totalStamps)) ? Number(merged.totalStamps) : 0;\n      merged.rewardHistory = Array.isArray(merged.rewardHistory) ? merged.rewardHistory.slice(0, 20) : [];\n      const spentTotal = merged.rewardHistory.reduce((sum, item) => sum + (Number(item.cost) || 0), 0);\n      merged.earnedTotal = Math.max(Number(merged.earnedTotal) || 0, merged.totalStamps + spentTotal);\n      merged.recommendations = merged.recommendations && typeof merged.recommendations === \'object\' ? merged.recommendations : {};\n      merged.conversionHistory = Array.isArray(merged.conversionHistory) ? merged.conversionHistory.slice(0, 3) : [];'
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
        if (!done && a.dueKind !== 'dated' && b.dueKind !== 'dated') {
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
    'data.createdAt = state.tasks[index].createdAt;\n        data.sortOrder = data.dueKind === \'anytime\' ? Date.now() : (state.tasks[index].sortOrder || 0);\n        data.completed = state.tasks[index].completed;'
  );

  patched = patched.replace(
    'state.tasks.push(data);',
    'data.sortOrder = data.dueKind === \'anytime\' ? Date.now() : 0;\n        state.tasks.push(data);'
  );

  patched = patched.replace(
    `function convertCompleted() {
      const targets = convertibleTasks();
      if (!targets.length) { toast('花丸にする完了札がない。'); return; }
      lastUndo = JSON.stringify(state);
      const now = new Date().toISOString();
      lastConvertedItems = targets.map(t => ({ ...t }));
      targets.forEach(task => {
        if (task.kind === 'repeat') {
          const key = periodKey(task);
          task.stampedPeriods = task.stampedPeriods || {};
          task.stampedPeriods[key] = now;
          task.activePeriodKey = key;
          task.completed = true;
          task.completedAt = task.completedAt || now;
        }
      });
      const removeIds = new Set(targets.filter(t => t.kind === 'single').map(t => t.id));
      state.tasks = state.tasks.filter(t => !removeIds.has(t.id));
      state.totalStamps += targets.length;
      save();
      const outputText = buildOutput(targets);
      state.conversionHistory.unshift({ id: makeId(), createdAt: now, count: targets.length, items: targets.map(t => t.title), text: outputText });
      state.conversionHistory = state.conversionHistory.slice(0, 3);
      save();
      $('undoBtn').disabled = false;
      showStamp();
      showOutput(targets);
      render();
    }`,
    `function confirmConversion(targets) {
      return new Promise(resolve => {
        let modal = $('confirmConvertModal');
        if (!modal) {
          modal = document.createElement('div');
          modal.className = 'modal-backdrop';
          modal.id = 'confirmConvertModal';
          modal.innerHTML = \`<div class="modal"><div class="modal-head"><h2>花丸に変換する札</h2><button class="btn small ghost" id="confirmConvertCancelTop" type="button">閉じる</button></div><p class="subtext">完了札を確認。変換すると単発は消え、繰り返しはこの周期で花丸化済みになる。</p><div class="confirm-list" id="confirmConvertList"></div><div class="row wrap"><button class="btn primary" id="confirmConvertYes" type="button">変換</button><button class="btn" id="confirmConvertNo" type="button">キャンセル</button></div></div>\`;
          document.body.appendChild(modal);
          modal.addEventListener('click', event => { if (event.target === modal) modal.classList.remove('show'); });
        }
        $('confirmConvertList').innerHTML = targets.map(t => \`<div class="confirm-item">・\${escapeHtml(t.title)}</div>\`).join('');
        const finish = result => { modal.classList.remove('show'); resolve(result); };
        $('confirmConvertYes').onclick = () => finish(true);
        $('confirmConvertNo').onclick = () => finish(false);
        $('confirmConvertCancelTop').onclick = () => finish(false);
        modal.classList.add('show');
      });
    }

    function milestoneFor(total) {
      const list = [
        { n: 10, title: '芽吹き札', msg: '枯れ枝に最初の芽。' },
        { n: 30, title: '小花係', msg: '小さい花が増えてきた。' },
        { n: 50, title: '花丸職人', msg: '花丸の手つきが安定。' },
        { n: 100, title: '百花丸', msg: '100個到達。約束のご褒美圏。' },
        { n: 300, title: '満開管理人', msg: 'かなり咲いている。' },
        { n: 500, title: '花畑所有者', msg: 'もう庭がある。' },
        { n: 1000, title: '千輪花丸', msg: '桁がおかしい。良い意味で。' }
      ];
      return list.filter(item => total >= item.n).at(-1) || null;
    }

    async function convertCompleted() {
      const targets = convertibleTasks();
      if (!targets.length) { toast('花丸にする完了札がない。'); return; }
      const ok = await confirmConversion(targets);
      if (!ok) return;
      lastUndo = JSON.stringify(state);
      const now = new Date().toISOString();
      const spentBefore = Array.isArray(state.rewardHistory) ? state.rewardHistory.reduce((sum, item) => sum + (Number(item.cost) || 0), 0) : 0;
      const earnedBefore = Math.max(Number(state.earnedTotal) || 0, (Number(state.totalStamps) || 0) + spentBefore);
      lastConvertedItems = targets.map(t => ({ ...t }));
      targets.forEach(task => {
        if (task.kind === 'repeat') {
          const key = periodKey(task);
          task.stampedPeriods = task.stampedPeriods || {};
          task.stampedPeriods[key] = now;
          task.activePeriodKey = key;
          task.completed = true;
          task.completedAt = task.completedAt || now;
        }
      });
      const removeIds = new Set(targets.filter(t => t.kind === 'single').map(t => t.id));
      state.tasks = state.tasks.filter(t => !removeIds.has(t.id));
      state.totalStamps += targets.length;
      const spentAfter = Array.isArray(state.rewardHistory) ? state.rewardHistory.reduce((sum, item) => sum + (Number(item.cost) || 0), 0) : 0;
      state.earnedTotal = Math.max(Number(state.earnedTotal) || 0, state.totalStamps + spentAfter, earnedBefore + targets.length);
      const unlocked = milestoneFor(state.earnedTotal);
      const beforeUnlocked = milestoneFor(earnedBefore);
      save();
      const outputText = buildOutput(targets);
      state.conversionHistory.unshift({ id: makeId(), createdAt: now, count: targets.length, items: targets.map(t => t.title), text: outputText, balanceAfter: state.totalStamps, earnedTotalAfter: state.earnedTotal });
      state.conversionHistory = state.conversionHistory.slice(0, 3);
      save();
      $('undoBtn').disabled = false;
      showStamp();
      showOutput(targets);
      render();
      if (unlocked && (!beforeUnlocked || unlocked.n !== beforeUnlocked.n)) setTimeout(() => toast(\`称号「\${unlocked.title}」獲得。\${unlocked.msg}\`), 900);
    }`
  );

  patched = patched.replace(
    `function renderHistory(container) {
      container.innerHTML = '';
      if (!state.conversionHistory.length) {
        const empty = document.createElement('div');
        empty.className = 'empty';
        empty.textContent = '履歴なし。';
        container.appendChild(empty);
        return;
      }
      state.conversionHistory.slice(0, 3).forEach((entry, index) => {
        const box = document.createElement('div');
        box.className = 'card';
        box.style.margin = '0';
        const title = document.createElement('div');
        title.className = 'task-title';
        title.textContent = \`\${index + 1}. \${formatDateTime(entry.createdAt)} / \${entry.count}枚\`;
        const text = document.createElement('textarea');
        text.value = entry.text;
        const copy = document.createElement('button');
        copy.type = 'button';
        copy.className = 'btn primary';
        copy.textContent = 'この履歴をコピー';
        copy.addEventListener('click', () => copyText(entry.text, '履歴をコピー。'));
        box.append(title, text, copy);
        container.appendChild(box);
      });
    }`,
    `function renderHistory(container) {
      container.innerHTML = '';
      const rewardHistory = Array.isArray(state.rewardHistory) ? state.rewardHistory : [];
      const spentTotal = rewardHistory.reduce((sum, item) => sum + (Number(item.cost) || 0), 0);
      const earnedTotal = Math.max(Number(state.earnedTotal) || 0, (Number(state.totalStamps) || 0) + spentTotal);
      const currentMilestone = milestoneFor(earnedTotal);
      const nextMilestone = [10, 30, 50, 100, 300, 500, 1000].find(n => n > earnedTotal);
      const bloom = earnedTotal >= 1000 ? '🌸🌸🌸🌳🌸🌸🌸' : earnedTotal >= 500 ? '🌸🌸🌳🌸🌸' : earnedTotal >= 300 ? '🌸🌳🌸' : earnedTotal >= 100 ? '🌸🌳' : earnedTotal >= 30 ? '🌱🌳' : '枯れ木 🌳';
      const summary = document.createElement('div');
      summary.className = 'card achievement-card';
      summary.style.margin = '0';
      summary.innerHTML = \`<div class="achievement-tree">\${bloom}</div><div class="task-title">\${currentMilestone ? '称号：' + escapeHtml(currentMilestone.title) : '称号：芽待ち'}</div><div class="subtext">獲得累計 \${earnedTotal} / 消費累計 \${spentTotal} / 現在 \${state.totalStamps}</div><div class="subtext">\${currentMilestone ? escapeHtml(currentMilestone.msg) : 'まずは10花丸で芽吹き。'}\${nextMilestone ? ' 次は' + nextMilestone + '花丸。' : ' 到達称号はひとまず全開放。'}</div>\`;
      container.appendChild(summary);

      if (state.conversionHistory.length) {
        const head = document.createElement('h3');
        head.textContent = '直近の変換';
        container.appendChild(head);
        state.conversionHistory.slice(0, 3).forEach((entry, index) => {
          const box = document.createElement('div');
          box.className = 'card';
          box.style.margin = '0';
          const title = document.createElement('div');
          title.className = 'task-title';
          title.textContent = \`\${index + 1}. \${formatDateTime(entry.createdAt)} / +\${entry.count}枚\`;
          const text = document.createElement('textarea');
          text.value = entry.text;
          const copy = document.createElement('button');
          copy.type = 'button';
          copy.className = 'btn primary';
          copy.textContent = 'この履歴をコピー';
          copy.addEventListener('click', () => copyText(entry.text, '履歴をコピー。'));
          box.append(title, text, copy);
          container.appendChild(box);
        });
      }

      const rewardHead = document.createElement('h3');
      rewardHead.textContent = '消費ログ';
      container.appendChild(rewardHead);
      if (!rewardHistory.length) {
        const empty = document.createElement('div');
        empty.className = 'empty';
        empty.textContent = '消費ログなし。';
        container.appendChild(empty);
        return;
      }
      rewardHistory.slice(0, 10).forEach(entry => {
        const box = document.createElement('div');
        box.className = 'card reward-log';
        box.style.margin = '0';
        box.innerHTML = \`<div class="task-title">-\${Number(entry.cost) || 0} 花丸</div><div class="subtext">\${formatDateTime(entry.createdAt)}</div><div>\${escapeHtml(entry.title || 'ご褒美')}</div>\`;
        container.appendChild(box);
      });
    }`
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
    .confirm-list { display: grid; gap: 7px; margin: 10px 0; max-height: 45vh; overflow: auto; }
    .confirm-item { padding: 9px 10px; border-radius: 13px; border: 1px solid var(--line); background: #fff; font-weight: 800; }
    .achievement-card { background: linear-gradient(180deg, #fff8fb, #fffdf8); }
    .achievement-tree { font-size: 32px; line-height: 1.1; margin-bottom: 8px; }
    .reward-log .task-title { color: #a16207; }
    @media (max-width: 390px) { .consume-top { padding: 8px 8px; } .convert-top { padding: 8px 10px; } .bottom-ai { min-width: 70px; } }
  `;

  if (!patched.includes('.confirm-list {')) {
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
