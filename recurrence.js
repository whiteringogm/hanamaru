(function (root) {
  'use strict';
  const dateKey = date => `${date.getFullYear()}-${String(date.getMonth() + 1).padStart(2, '0')}-${String(date.getDate()).padStart(2, '0')}`;
  const parseDate = value => { const [y, m, d] = value.split('-').map(Number); return new Date(y, m - 1, d || 1); };
  const validDate = value => typeof value === 'string' && /^\d{4}-\d{2}-\d{2}$/.test(value) && dateKey(parseDate(value)) === value;
  const validMonth = value => typeof value === 'string' && validDate(`${value}-01`);
  const integer = (value, fallback, min, max) => Math.min(max, Math.max(min, Math.floor(Number(value) || fallback)));
  function addMonths(value, count, day) {
    const date = parseDate(value);
    const target = new Date(date.getFullYear(), date.getMonth() + count, 1);
    target.setDate(Math.min(day || date.getDate(), new Date(target.getFullYear(), target.getMonth() + 1, 0).getDate()));
    return dateKey(target);
  }
  function nextDate(value, task) {
    const count = integer(task.repeatInterval, 1, 1, 999);
    if (task.repeatEvery === 'month') return addMonths(value, count);
    if (task.repeatEvery === 'year') return addMonths(value, count * 12);
    const date = parseDate(value);
    date.setDate(date.getDate() + count * (task.repeatEvery === 'week' ? 7 : 1));
    return dateKey(date);
  }
  function normalizeRepeat(task, today) {
    task.repeatInterval = integer(task.repeatInterval, 1, 1, 999);
    task.repeatCycle = integer(task.repeatCycle, 0, 0, Number.MAX_SAFE_INTEGER);
    task.activePeriodKey = task.activePeriodKey || `completion:${task.id}:${task.repeatCycle}`;
    if (task.repeatSchema !== 1) {
      const hadPendingCompletion = task.completed && !task.stampedPeriods?.[task.activePeriodKey];
      const latest = Object.entries(task.stampedPeriods || {}).filter(([, at]) => Number.isFinite(Date.parse(at))).sort((a, b) => Date.parse(b[1]) - Date.parse(a[1]))[0];
      // Older versions may already have cleared completedAt at a calendar boundary.
      const completedAt = task.completedAt || (latest && latest[1]);
      if (completedAt && Number.isFinite(Date.parse(completedAt))) {
        const next = nextDate(dateKey(new Date(completedAt)), task);
        if (task.completed || next > today) {
          task.completed = true;
          task.completedAt = completedAt;
          task.nextOccurrenceDate = next;
          if (latest && !task.stampedPeriods[task.activePeriodKey] && !hadPendingCompletion) task.activePeriodKey = latest[0];
        }
      }
      task.repeatSchema = 1;
    }
    if (task.completed && !validDate(task.nextOccurrenceDate) && task.completedAt && Number.isFinite(Date.parse(task.completedAt))) {
      task.nextOccurrenceDate = nextDate(dateKey(new Date(task.completedAt)), task);
    }
    return task;
  }
  function advanceRepeats(state, today, makeId) {
    const pending = [];
    for (const task of state.tasks) {
      if (task.kind !== 'repeat') continue;
      normalizeRepeat(task, today);
      if (!task.completed || !validDate(task.nextOccurrenceDate) || task.nextOccurrenceDate > today) continue;
      if (!task.stampedPeriods[task.activePeriodKey]) {
        // Keep an unconverted completion as its own card when the next cycle starts.
        const archive = { ...task, id: makeId(), kind: 'single', nextOccurrenceDate: '', repeatArchive: true, startKind: 'now', startDate: '' };
        pending.push(archive);
        if (state.taskGroups?.[task.id]) state.taskGroups[archive.id] = { ...state.taskGroups[task.id] };
      }
      task.startKind = 'dated';
      task.startDate = task.nextOccurrenceDate;
      if (task.dueKind === 'dated') task.dueDate = task.nextOccurrenceDate;
      task.completed = false;
      task.completedAt = null;
      task.nextOccurrenceDate = '';
      task.repeatCycle += 1;
      task.activePeriodKey = `completion:${task.id}:${task.repeatCycle}`;
    }
    state.tasks.push(...pending);
  }
  function normalizeSchedule(input, today) {
    if (!input || !String(input.title || '').trim()) return null;
    return {
      ...input,
      title: String(input.title).trim(),
      day: integer(input.day, 1, 1, 31),
      monthOffset: Number(input.monthOffset) === -1 ? -1 : 0,
      startDate: validDate(input.startDate) ? input.startDate : today,
      lastGeneratedMonth: validMonth(input.lastGeneratedMonth) ? input.lastGeneratedMonth : '',
      active: input.active !== false
    };
  }
  function occurrenceDate(month, day) { return addMonths(`${month}-01`, 0, day); }
  function monthlyTitle(schedule, month) {
    const target = addMonths(`${month}-01`, schedule.monthOffset);
    return `${schedule.title} ${target.slice(0, 4)}年${Number(target.slice(5, 7))}月分`;
  }
  function generateMonthly(state, today, normalizeTask) {
    state.taskGroups = state.taskGroups || {};
    for (const schedule of state.monthlySchedules || []) {
      if (!schedule.active) continue;
      const startMonth = schedule.startDate.slice(0, 7);
      let month = schedule.lastGeneratedMonth ? addMonths(`${schedule.lastGeneratedMonth}-01`, 1).slice(0, 7) : startMonth;
      if (month < startMonth) month = startMonth;
      while (month <= today.slice(0, 7)) {
        const starts = occurrenceDate(month, schedule.day);
        if (starts > today) break;
        if (starts >= schedule.startDate) {
          const id = `monthly_${schedule.id}_${month}`;
          if (!state.tasks.some(t => t.id === id || (t.monthlyScheduleId === schedule.id && t.occurrenceMonth === month))) {
            state.tasks.push(normalizeTask({
              id, title: monthlyTitle(schedule, month), category: schedule.category,
              kind: 'single', startKind: 'dated', startDate: starts, dueKind: 'anytime',
              monthlyScheduleId: schedule.id, occurrenceMonth: month,
              createdAt: `${starts}T00:00:00`, sortOrder: -Number(month.replace('-', ''))
            }));
            state.taskGroups[id] = { groupId: `monthly_${schedule.id}`, groupTitle: schedule.title };
          }
        }
        // Remember issued months even after a card is converted or deleted.
        schedule.lastGeneratedMonth = month;
        month = addMonths(`${month}-01`, 1).slice(0, 7);
      }
    }
  }
  const api = { dateKey, validDate, validMonth, addMonths, nextDate, normalizeRepeat, advanceRepeats, normalizeSchedule, occurrenceDate, monthlyTitle, generateMonthly };
  if (typeof module !== 'undefined' && module.exports) module.exports = api;
  root.HanamaruRecurrence = api;
})(typeof globalThis !== 'undefined' ? globalThis : this);
