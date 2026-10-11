const { test } = require('node:test');
const assert = require('node:assert/strict');
const R = require('../recurrence.js');

function repeat(overrides = {}) {
  return { id: 'r', title: '定期作業', kind: 'repeat', repeatEvery: 'week', repeatInterval: 3,
    completed: false, completedAt: null, activePeriodKey: 'old-period', stampedPeriods: {},
    startKind: 'now', dueKind: 'anytime', ...overrides };
}
function monthly(overrides = {}) {
  return R.normalizeSchedule({ id: 's', title: '家計簿登録', category: '生活', day: 5,
    monthOffset: -1, startDate: '2026-08-01', ...overrides }, '2026-10-11');
}
function stateFor(schedule) { return { tasks: [], monthlySchedules: [schedule] }; }
const normalize = task => ({ completed: false, stampedPeriods: {}, ...task });

test('a late completion schedules three full weeks from the completion day', () => {
  assert.equal(R.nextDate('2026-10-11', repeat()), '2026-11-01');
  assert.equal(R.nextDate('2026-10-20', repeat()), '2026-11-10');
});
test('months and years clamp to the last day without using the original due anchor', () => {
  const t = repeat({ repeatEvery: 'month', repeatInterval: 1, dueAnchor: { day: 31, endOfMonth: true } });
  assert.equal(R.nextDate('2026-01-31', t), '2026-02-28');
  assert.equal(R.nextDate('2028-01-31', t), '2028-02-29');
  assert.equal(R.nextDate('2026-02-28', t), '2026-03-28');
  assert.equal(R.nextDate('2026-10-11', t), '2026-11-11');
  assert.equal(R.nextDate('2028-02-29', { ...t, repeatEvery: 'year' }), '2029-02-28');
});
test('legacy stamped tasks retain their stamp and recover a full interval', () => {
  const t = repeat({ stampedPeriods: { previous: '2026-10-10T12:00:00+09:00' } });
  R.normalizeRepeat(t, '2026-10-11');
  assert.equal(t.completed, true);
  assert.equal(t.activePeriodKey, 'previous');
  assert.equal(t.nextOccurrenceDate, '2026-10-31');
  const snapshot = JSON.stringify(t);
  R.normalizeRepeat(t, '2026-10-12');
  assert.equal(JSON.stringify(t), snapshot);
});
test('legacy pending completions are not mistakenly counted as stamped', () => {
  const t = repeat({ completed: true, completedAt: '2026-10-11T12:00:00+09:00', stampedPeriods: { previous: '2026-09-01T12:00:00+09:00' } });
  R.normalizeRepeat(t, '2026-10-11');
  assert.equal(t.activePeriodKey, 'old-period');
  assert.equal(t.stampedPeriods[t.activePeriodKey], undefined);
});
test('unconverted completion survives the next recurrence and is archived only once', () => {
  const t = repeat({ completed: true, completedAt: '2026-10-11T12:00:00+09:00' });
  const state = { tasks: [t], taskGroups: { r: { groupId: 'g', groupTitle: '作業' } } };
  R.advanceRepeats(state, '2026-10-31', () => 'archive');
  assert.equal(state.tasks.length, 1);
  R.advanceRepeats(state, '2026-11-01', () => 'archive');
  assert.equal(state.tasks.length, 2);
  assert.equal(t.completed, false);
  assert.equal(t.startDate, '2026-11-01');
  assert.equal(state.tasks[1].completedAt, '2026-10-11T12:00:00+09:00');
  assert.equal(state.tasks[1].kind, 'single');
  assert.equal(state.taskGroups.archive.groupId, 'g');
  R.advanceRepeats(state, '2027-02-01', () => 'extra');
  assert.equal(state.tasks.length, 2);
});
test('converted repeats reset once and receive a new unclaimed cycle key', () => {
  const t = repeat({ completed: true, completedAt: '2026-10-11T12:00:00+09:00', stampedPeriods: { 'old-period': '2026-10-12T12:00:00+09:00' }, dueKind: 'dated', dueDate: '2026-09-01' });
  const state = { tasks: [t] };
  R.advanceRepeats(state, '2026-11-01', () => 'unused');
  assert.equal(state.tasks.length, 1);
  assert.equal(t.dueDate, '2026-11-01');
  assert.equal(t.completed, false);
  assert.equal(t.stampedPeriods[t.activePeriodKey], undefined);
});
test('monthly cards wait until the configured day then accumulate separate months', () => {
  const state = stateFor(monthly());
  R.generateMonthly(state, '2026-08-04', normalize);
  assert.equal(state.tasks.length, 0);
  R.generateMonthly(state, '2026-08-05', normalize);
  assert.equal(state.tasks[0].title, '家計簿登録 2026年7月分');
  R.generateMonthly(state, '2026-10-11', normalize);
  assert.deepEqual(state.tasks.map(t => t.occurrenceMonth), ['2026-08', '2026-09', '2026-10']);
  assert.equal(new Set(state.tasks.map(t => t.id)).size, 3);
  assert.equal(new Set(Object.values(state.taskGroups).map(g => g.groupId)).size, 1);
  state.tasks[0].completed = true;
  assert.equal(state.tasks[1].completed, false);
});
test('converted or deleted monthly cards do not reappear after reload', () => {
  const state = stateFor(monthly());
  R.generateMonthly(state, '2026-10-11', normalize);
  state.tasks = [];
  const restored = JSON.parse(JSON.stringify(state));
  R.generateMonthly(restored, '2026-10-11', normalize);
  assert.equal(restored.tasks.length, 0);
  R.generateMonthly(restored, '2026-11-05', normalize);
  assert.equal(restored.tasks.length, 1);
});
test('31st monthly dates clamp, leap years and December/January offsets work', () => {
  assert.equal(R.occurrenceDate('2026-02', 31), '2026-02-28');
  assert.equal(R.occurrenceDate('2028-02', 31), '2028-02-29');
  assert.equal(R.monthlyTitle(monthly(), '2027-01'), '家計簿登録 2026年12月分');
  const state = stateFor(monthly({ day: 31, startDate: '2026-02-01', monthOffset: 0 }));
  R.generateMonthly(state, '2026-02-27', normalize);
  assert.equal(state.tasks.length, 0);
  R.generateMonthly(state, '2026-02-28', normalize);
  assert.equal(state.tasks[0].title, '家計簿登録 2026年2月分');
});
test('start dates and pausing do not fabricate older monthly work', () => {
  const state = stateFor(monthly({ startDate: '2026-08-10' }));
  R.generateMonthly(state, '2026-08-31', normalize);
  assert.equal(state.tasks.length, 0);
  R.generateMonthly(state, '2026-09-05', normalize);
  assert.equal(state.tasks.length, 1);
  state.monthlySchedules[0].active = false;
  R.generateMonthly(state, '2027-01-01', normalize);
  assert.equal(state.tasks.length, 1);
});
