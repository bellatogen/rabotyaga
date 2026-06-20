// Утилиты для расчёта штата и статуса смены

import { HOLIDAYS } from '../constants/schedule.js';
import { hmm, addDays } from './dateUtils.js';

// Пуш о закрытии можно слать только после 23:30 (бар закрывается, отчёты сданы)
export const PUSH_GATE_MIN = 23 * 60 + 30;
export const afterPushGate = now => (now.getHours() * 60 + now.getMinutes()) >= PUSH_GATE_MIN;

/** Возвращает норматив штата на дату с учётом событий */
export function staffNorm(ds, events) {
  const dow = new Date(ds).getDay();
  const ev = (events[ds] || "").toLowerCase();
  const holiday = HOLIDAYS.includes(ds);
  if ([3, 5, 6].includes(dow) || holiday)
    return {count:3, thirdFrom:"18:00", reason: holiday ? "праздник" : "пт/сб/ср"};
  if (dow === 0 && ev.includes("стерео"))
    return {count:3, thirdFrom:"18:00", reason:"Стерео 55"};
  return {count:2, thirdFrom:null, reason:"будний"};
}

/** Проверяет соответствие расписания нормативу */
export function staffCheck(ds, schedule, events) {
  const norm = staffNorm(ds, events);
  const shifts = (schedule[ds] || []).filter(s => !s.guest);
  const actual = shifts.length;
  const hasEvening = shifts.some(s => hmm(s.start) >= hmm("18:00"));
  let ok = actual >= norm.count;
  let msg = "";
  if (actual < norm.count)
    msg = `Не хватает ${norm.count - actual} чел. (норма ${norm.count}, в графике ${actual})`;
  else if (norm.thirdFrom && !hasEvening && actual >= 3)
    msg = "Норма закрыта, но нет смены с 18:00";
  return {norm, actual, ok, msg, hasEvening};
}

/** Определяет текущий статус сотрудника на дату */
export function getShiftStatus(name, ds, schedule, overrides, now) {
  const ov = overrides.find(o => o.name === name && o.from <= ds && (!o.until || o.until >= ds));
  if (ov) return ov.status;
  const todayShifts = (schedule[ds] || []).filter(s => s.name === name);
  if (!todayShifts.length) {
    if ((schedule[addDays(ds, 1)] || []).some(s => s.name === name)) return "tomorrow_shift";
    return "day_off";
  }
  const sh = todayShifts[0];
  const nowM = now.getHours() * 60 + now.getMinutes();
  const startM = hmm(sh.start), endM = Math.min(startM + hmm(sh.end), 1440);
  if (nowM >= startM && nowM < endM) return "on_shift";
  if (nowM >= 360 && nowM < startM) return "today_shift";
  if (nowM >= endM) return "worked";
  return "today_shift";
}
