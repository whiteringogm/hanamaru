const { test } = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const vm = require('node:vm');
const path = require('node:path');
const html = fs.readFileSync(path.join(__dirname, '../index.html'), 'utf8');
const script = html.match(/<script>([\s\S]*?)<\/script>/)[1].split("    if ('serviceWorker' in navigator)")[0];
const recurrence = fs.readFileSync(path.join(__dirname, '../recurrence.js'), 'utf8');
function app(initial, failBackup = false) {
  const memory = new Map(initial ? [['hanamaru-fuda-v2', JSON.stringify(initial)]] : []);
  const elements = new Map();
  let now = new Date('2026-10-11T09:00:00+09:00').getTime();
  class Clock extends Date { constructor(...args) { super(...(args.length ? args : [now])); } static now() { return now; } }
  const context = vm.createContext({ Date: Clock, console, document: { getElementById(id) {
    if (!elements.has(id)) elements.set(id, { value: '', disabled: false });
    return elements.get(id);
  } }, localStorage: { getItem: key => memory.get(key) || null, setItem: (key, value) => {
    if (failBackup && key === 'hanamaru-before-v16') throw new Error('Storage quota');
    memory.set(key, value);
  } },
  confirm: () => true, setTimeout: () => 0, clearTimeout: () => {} });
  vm.runInContext(recurrence, context); vm.runInContext(script, context);
  vm.runInContext("render = () => { applyRepeatReset(); save(); }; toast = () => {}; showPage = () => {}; showStamp = () => {}; showOutput = () => {}; confirmConversion = async () => true;", context);
  const run = source => vm.runInContext(source, context);
  return { run, memory, date: value => { now = new Date(value).getTime(); },
    read: () => JSON.parse(run('JSON.stringify(state)')),
    fields(values) { for (const [id, value] of Object.entries(values)) context.document.getElementById(id).value = String(value); },
    save() { run('saveTaskFromForm({ preventDefault() {} })'); } };
}
function addRepeat(a) {
  a.fields({ taskId: '', taskTitle: '定期掃除', taskCategory: '生活', taskKind: 'repeat', startKind: 'now', dueKind: 'anytime', repeatEvery: 'week', repeatInterval: 3 });
  a.save();
}
function addMonthly(a) {
  a.fields({ taskId: '', monthlyScheduleId: '', taskTitle: '家計簿登録', taskCategory: '生活', taskKind: 'monthly', monthlyDay: 5, monthlyOffset: -1, monthlyStart: '2026-08-01' });
  a.save();
}

test('completion is the anchor even if stamp conversion happens days later', async () => {
  const a = app(); addRepeat(a);
  a.run('toggleTask(state.tasks[0].id)');
  assert.equal(a.read().tasks[0].nextOccurrenceDate, '2026-11-01');
  a.date('2026-10-20T09:00:00+09:00');
  await a.run('convertCompleted()');
  assert.equal(a.read().totalStamps, 1);
  assert.equal(a.read().tasks[0].nextOccurrenceDate, '2026-11-01');
  await a.run('convertCompleted()');
  assert.equal(a.read().totalStamps, 1);
  a.date('2026-11-01T09:00:00+09:00'); a.run('render()');
  assert.equal(a.read().tasks[0].completed, false);
});
test('unchecking completion clears the planned date; interval edits retain earned stamps', async () => {
  const a = app(); addRepeat(a); a.run('toggleTask(state.tasks[0].id)'); a.run('toggleTask(state.tasks[0].id)');
  assert.equal(a.read().tasks[0].nextOccurrenceDate, '');
  a.run('toggleTask(state.tasks[0].id)'); await a.run('convertCompleted()');
  a.fields({ taskId: a.read().tasks[0].id, repeatInterval: 4 }); a.save();
  assert.equal(a.read().tasks[0].nextOccurrenceDate, '2026-11-08');
  assert.equal(a.run('convertibleTasks().length'), 0);
  assert.equal(a.read().totalStamps, 1);
});
test('monthly generation, completion, conversion and Undo preserve the other months', async () => {
  const a = app(); addMonthly(a);
  assert.equal(a.read().tasks.length, 3);
  a.run('toggleTask(state.tasks[0].id)'); await a.run('convertCompleted()');
  assert.equal(a.read().tasks.length, 2);
  assert.equal(a.read().totalStamps, 1);
  a.run('undoConvert()');
  assert.equal(a.read().tasks.length, 3);
  assert.equal(a.read().tasks[0].completed, true);
  assert.equal(a.read().totalStamps, 0);
  await a.run('convertCompleted()');
  const reloaded = app(a.read()); reloaded.run('render()');
  assert.equal(reloaded.read().tasks.length, 2);
  assert.equal(reloaded.read().tasks[0].title, '家計簿登録 2026年8月分');
});
test('editing a monthly schedule preserves completed names and cursor', () => {
  const a = app(); addMonthly(a); a.run('toggleTask(state.tasks[0].id)');
  a.fields({ monthlyScheduleId: a.read().monthlySchedules[0].id, taskTitle: '家計簿入力', monthlyDay: 20 }); a.save();
  assert.equal(a.read().tasks.length, 3);
  assert.equal(a.read().tasks[0].title, '家計簿登録 2026年7月分');
  assert.equal(a.read().tasks[1].title, '家計簿入力 2026年8月分');
  assert.equal(a.read().monthlySchedules[0].lastGeneratedMonth, '2026-10');
  a.date('2026-11-19T09:00:00+09:00'); a.run('render()');
  assert.equal(a.read().tasks.length, 3);
  a.date('2026-11-20T09:00:00+09:00'); a.run('render()');
  assert.equal(a.read().tasks.length, 4);
});
test('a legacy monthly card can be adopted without duplicating its month', () => {
  const a = app({ version: 3, tasks: [{ id: 'legacy', title: '家計簿登録７月分', category: '生活', kind: 'repeat', repeatEvery: 'month', dueKind: 'dated', dueDate: '2026-08-05' }], totalStamps: 12 });
  a.fields({ taskId: 'legacy', monthlyScheduleId: '', taskTitle: '家計簿登録', taskCategory: '生活', taskKind: 'monthly', monthlyDay: 5, monthlyOffset: -1, monthlyStart: '2026-08-01' }); a.save();
  assert.equal(a.read().tasks.length, 3);
  assert.equal(a.read().tasks[0].id, 'legacy');
  assert.equal(a.read().tasks[0].title, '家計簿登録 2026年7月分');
  assert.equal(a.read().totalStamps, 12);
});
test('legacy migration retains groups, templates, balance and history and makes a backup', () => {
  const original = { version: 3, totalStamps: 19, earnedTotal: 29, tasks: [{ id: 'legacy', title: '掃除', kind: 'repeat', repeatEvery: 'week', repeatInterval: 3, stampedPeriods: { old: '2026-10-10T09:00:00+09:00' }, activePeriodKey: 'new' }],
    taskGroups: { legacy: { groupId: 'g', groupTitle: 'まとめ' } }, settings: { aiPromptTemplate: 'custom', outputTemplate: 'custom-output' },
    conversionHistory: [{ id: 'h', count: 1 }], rewardHistory: [{ cost: 10 }] };
  const a = app(original); a.run('render()');
  assert.equal(a.read().totalStamps, 19); assert.equal(a.read().earnedTotal, 29);
  assert.deepEqual(a.read().taskGroups, original.taskGroups);
  assert.equal(a.read().settings.aiPromptTemplate, 'custom');
  assert.equal(a.read().conversionHistory[0].id, 'h');
  assert.deepEqual(JSON.parse(a.memory.get('hanamaru-before-v16')), original);
  assert.equal(a.read().tasks[0].nextOccurrenceDate, '2026-10-31');
  const restored = app(a.read()); restored.run('render()');
  assert.equal(restored.run('convertibleTasks().length'), 0);
});
test('unconverted old repeat and new occurrence can each earn exactly one stamp', async () => {
  const a = app(); addRepeat(a); a.run('toggleTask(state.tasks[0].id)');
  a.date('2026-11-01T09:00:00+09:00'); a.run('render()');
  assert.equal(a.read().tasks.length, 2);
  a.run('toggleTask(state.tasks[0].id)'); await a.run('convertCompleted()');
  assert.equal(a.read().totalStamps, 2); assert.equal(a.read().tasks.length, 1);
  await a.run('convertCompleted()'); assert.equal(a.read().totalStamps, 2);
});
test('deleting one month does not stop or duplicate its monthly schedule', () => {
  const a = app(); addMonthly(a); a.run('deleteTask(state.tasks[0].id)'); a.run('render()');
  assert.equal(a.read().tasks.length, 2);
  assert.equal(a.read().monthlySchedules[0].active, true);
  a.date('2026-11-05T09:00:00+09:00'); a.run('render()'); assert.equal(a.read().tasks.length, 3);
});

test('a failed optional migration backup does not replace existing data with defaults', () => {
  const a = app({ version: 3, totalStamps: 19, tasks: [{ id: 'saved', title: '保存済みの札' }] }, true);
  assert.equal(a.read().totalStamps, 19);
  assert.equal(a.read().tasks[0].id, 'saved');
});

test('deleting a monthly schedule can retain its cards as independent tasks', () => {
  const a = app(); addMonthly(a);
  const id = a.read().monthlySchedules[0].id;
  a.run('state.totalStamps = 8; state.conversionHistory = [{ id: "saved" }];');
  a.run('deleteMonthlySchedule(' + JSON.stringify(id) + ', false)');
  assert.equal(a.read().monthlySchedules.length, 0);
  assert.equal(a.read().tasks.length, 3);
  assert(a.read().tasks.every(t => !t.monthlyScheduleId));
  a.date('2027-01-05T09:00:00+09:00'); a.run('render()');
  assert.equal(a.read().tasks.length, 3);
  assert.equal(a.read().totalStamps, 8);
  assert.equal(a.read().conversionHistory[0].id, 'saved');
});

test('deleting a monthly schedule and its cards preserves unrelated tasks and earned stamps', () => {
  const a = app(); addMonthly(a); addRepeat(a);
  const id = a.read().monthlySchedules[0].id;
  a.run('state.totalStamps = 8; state.conversionHistory = [{ id: "saved" }]; lastUndo = "stale";');
  a.run('deleteMonthlySchedule(' + JSON.stringify(id) + ', true)');
  assert.equal(a.read().monthlySchedules.length, 0);
  assert.equal(a.read().tasks.length, 1);
  assert.equal(a.read().tasks[0].title, '定期掃除');
  assert.equal(Object.keys(a.read().taskGroups).length, 0);
  assert.equal(a.read().totalStamps, 8);
  assert.equal(a.read().conversionHistory[0].id, 'saved');
  assert.equal(a.run('lastUndo'), null);
});

test('an early repeat revival retains earned stamps and schedules from the new completion', async () => {
  const a = app(); addRepeat(a); a.run('toggleTask(state.tasks[0].id)'); await a.run('convertCompleted()');
  const oldKey = a.read().tasks[0].activePeriodKey;
  a.date('2026-10-15T21:00:00+09:00');
  a.run('reviveRepeatTask(state.tasks[0].id)');
  assert.equal(a.read().totalStamps, 1);
  assert.equal(a.read().conversionHistory.length, 1);
  assert.equal(a.read().tasks[0].completed, false);
  assert.equal(a.read().tasks[0].nextOccurrenceDate, '');
  assert(a.read().tasks[0].stampedPeriods[oldKey]);
  a.run('reviveRepeatTask(state.tasks[0].id)');
  assert.equal(a.read().tasks.length, 1);
  a.run('toggleTask(state.tasks[0].id)');
  assert.equal(a.read().tasks[0].nextOccurrenceDate, '2026-11-05');
  await a.run('convertCompleted()');
  assert.equal(a.read().totalStamps, 2);
  await a.run('convertCompleted()');
  assert.equal(a.read().totalStamps, 2);
});

test('revival retains an unconverted completion and also unlocks a future-start repeat', async () => {
  const a = app(); addRepeat(a); a.run('toggleTask(state.tasks[0].id)');
  a.run('reviveRepeatTask(state.tasks[0].id)');
  assert.equal(a.read().tasks.length, 2);
  assert.equal(a.read().tasks[1].completed, true);
  assert.equal(a.read().tasks[1].kind, 'single');
  assert.equal(a.read().tasks[0].completed, false);
  await a.run('convertCompleted()');
  assert.equal(a.read().totalStamps, 1);
  a.run('state.tasks[0].startKind = "dated"; state.tasks[0].startDate = "2026-12-01";');
  a.run('reviveRepeatTask(state.tasks[0].id)');
  assert.equal(a.run('isFutureTask(state.tasks[0])'), false);
  assert.equal(a.read().totalStamps, 1);
});
