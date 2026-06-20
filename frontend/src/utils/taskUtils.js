// Дополнительные импорты для расширенных функций (nextDue, dueLabel, buildDaySummary)
import { REPEAT_OPTS } from '../constants/locale.js';
import { fmtDate, addDays } from './dateUtils.js';

export const todayStr = () => new Date().toISOString().slice(0, 10);

export const isDone = (v) => v === true || (v && typeof v === 'object' && !!v.done);

export const isToday = (task, ds = todayStr()) => {
  if (task.kind === 'irregular') return false;
  if (task.from && ds < task.from) return false;
  if (task.until && ds > task.until) return false;
  if (task.repeat === 'once') return task.date === ds;
  if (['daily', 'opening', 'closing'].includes(task.repeat)) return true;
  if (task.repeat === 'workday') {
    const d = new Date(ds).getDay();
    return d !== 0 && d !== 6;
  }
  if (task.repeat === 'weekly') return task.dayOfWeek === new Date(ds).getDay();
  return false;
};

export const getTodayTasks = (tasks, ds = todayStr()) => {
  return tasks.filter(t => !t.archived && isToday(t, ds));
};

export const getTaskDoneStatus = (taskId, history, ds = todayStr()) => {
  return isDone(history[`${taskId}::${ds}`]);
};

export const formatDate = (dateStr) => {
  const d = new Date(dateStr + 'T00:00:00');
  return d.toLocaleDateString('ru-RU', { weekday: 'short', month: 'short', day: 'numeric' });
};

export const getDayOfWeekRu = (dateStr) => {
  const d = new Date(dateStr + 'T00:00:00');
  const days = ['Вск', 'Пнд', 'Втр', 'Срд', 'Чтв', 'Птн', 'Сбт'];
  return days[d.getDay()];
};

/** Извлекает детали выполнения: {done, ts, by} или null */
export const doneInfo = v => (v && typeof v === 'object') ? v : (v === true ? {done:true, ts:null, by:null} : null);

/** Возвращает ближайшую дату, когда задача актуальна, начиная с fromDs */
export function nextDue(task, fromDs) {
  if (task.repeat === 'once') return task.date;
  if (['daily','opening','closing'].includes(task.repeat)) return fromDs;
  if (task.repeat === 'workday') {
    let d = fromDs;
    for (let i = 0; i < 7; i++) { const dw = new Date(d).getDay(); if (dw !== 0 && dw !== 6) return d; d = addDays(d, 1); }
    return fromDs;
  }
  if (task.repeat === 'weekly') {
    let d = fromDs;
    for (let i = 0; i < 8; i++) { if (new Date(d).getDay() === task.dayOfWeek) return d; d = addDays(d, 1); }
    return fromDs;
  }
  return fromDs;
}

/** Возвращает метку срока задачи: {dueDate, text, overdue} */
export function dueLabel(task, ds) {
  if (task.kind === 'irregular') return {dueDate:'irregular', text:'нерегулярная · требует внимания', overdue:false};
  if (task.repeat === 'once') { const overdue = task.date < ds; return {dueDate:task.date, text:fmtDate(task.date), overdue}; }
  const nd = nextDue(task, ds);
  const rl = REPEAT_OPTS.find(r => r.id === task.repeat)?.label || task.repeat;
  const period = task.until ? ` (до ${fmtDate(task.until)})` : '';
  return {dueDate:nd, text:`${rl} · ${nd === ds ? 'сегодня' : fmtDate(nd)}${period}`, overdue:false};
}

/** Строит сводку дня: кол-во задач, выполненных, незакрытых, нерегулярных */
export function buildDaySummary(tasks, history, ds) {
  const reg = tasks.filter(t => !t.archived && t.kind !== 'irregular' && isToday(t, ds));
  const done = reg.filter(t => isDone(history[`${t.id}::${ds}`]));
  const notDone = reg.filter(t => !isDone(history[`${t.id}::${ds}`]));
  const irregOpen = tasks.filter(t => !t.archived && t.kind === 'irregular' && !isDone(history[`${t.id}::irregular`]));
  return {date:ds, total:reg.length, done:done.length, notDone, irregOpen};
}
