// status.js — бэкенд-порт расчёта статуса смены сотрудника.
//
// Эталон — frontend/src/utils/staffUtils.js:getShiftStatus. Нужен планировщику
// пушей для статус-гейтинга (suppressStatuses): кому слать «закрытие смены» и т.п.
// Перенесён ТОЛЬКО getShiftStatus — staffNorm/staffCheck (и их зависимость HOLIDAYS)
// к статусу отношения не имеют, поэтому не портировались. Транзитивные зависимости
// самого getShiftStatus — лишь hmm() и addDays(), инлайнятся ниже.
'use strict';

// Парсит "HH:MM" в минуты от полуночи (порт frontend/src/utils/dateUtils.js:hmm).
function hmm(s) {
  if (!s) return 0;
  const [h, m] = String(s).split(':').map(Number);
  return h * 60 + (m || 0);
}

// Прибавляет n дней к дате YYYY-MM-DD (порт frontend/src/utils/dateUtils.js:addDays).
function addDays(ds, n) {
  const d = new Date(ds);
  d.setDate(d.getDate() + n);
  return d.toISOString().slice(0, 10);
}

/**
 * Статус сотрудника на дату. Идентичен фронтовому getShiftStatus.
 * Override (sick/vacation/business_trip) перекрывает расписание.
 * @param {string} name — имя сотрудника (ключ системы)
 * @param {string} ds   — дата YYYY-MM-DD
 * @param {object} schedule  — schedule:v1: { [ds]: [{ name, start, end }] }
 * @param {Array}  overrides — status_overrides:v1: [{ name, status, from, until }]
 * @param {Date}   now       — текущий момент (для on_shift/today_shift/worked)
 * @returns {"on_shift"|"today_shift"|"worked"|"tomorrow_shift"|"day_off"|"sick"|"vacation"|"business_trip"}
 */
function getShiftStatus(name, ds, schedule, overrides, now) {
  const ovs = Array.isArray(overrides) ? overrides : [];
  const ov = ovs.find(o => o.name === name && o.from <= ds && (!o.until || o.until >= ds));
  if (ov) return ov.status;
  const sch = schedule || {};
  const todayShifts = (sch[ds] || []).filter(s => s.name === name);
  if (!todayShifts.length) {
    if ((sch[addDays(ds, 1)] || []).some(s => s.name === name)) return 'tomorrow_shift';
    return 'day_off';
  }
  const sh = todayShifts[0];
  const nowM = now.getHours() * 60 + now.getMinutes();
  const startM = hmm(sh.start), endM = Math.min(startM + hmm(sh.end), 1440);
  if (nowM >= startM && nowM < endM) return 'on_shift';
  if (nowM >= 360 && nowM < startM) return 'today_shift';
  if (nowM >= endM) return 'worked';
  return 'today_shift';
}

/**
 * Удобная обёртка: достаёт schedule:v1 + status_overrides:v1 из in-memory data.kv.
 * @param {object} data — { kv: { 'schedule:v1', 'status_overrides:v1' } }
 */
function getShiftStatusFromData(data, name, ds, now = new Date()) {
  let schedule = {}, overrides = [];
  try { schedule = JSON.parse(data?.kv?.['schedule:v1'] || '{}'); } catch { schedule = {}; }
  try { overrides = JSON.parse(data?.kv?.['status_overrides:v1'] || '[]'); } catch { overrides = []; }
  return getShiftStatus(name, ds, schedule, overrides, now);
}

module.exports = { getShiftStatus, getShiftStatusFromData };
