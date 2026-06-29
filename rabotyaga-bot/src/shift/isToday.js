// isToday.js — единый бэкенд-модуль правила «актуальна ли задача на дату».
//
// ЯКОРЬ ДЕДУПА: это каноническая бэкенд-копия правила isToday().
// Фронтовый близнец — frontend/src/utils/taskUtils.js (export const isToday).
// Бэкенд (ESM↔CJS барьер не даёт держать один физический файл на оба слоя)
// импортирует ЭТОТ модуль из server.js, scheduler.js и sender.js.
// При изменении правила меняем здесь И во фронтовом близнеце; идентичность
// зафиксирована тестом tests/shift.test.js.
'use strict';

/**
 * Применима ли задача к дате ds (YYYY-MM-DD).
 * @param {object} task — задача из tasks:v4
 * @param {string} ds   — дата YYYY-MM-DD
 * @returns {boolean}
 */
function isToday(task, ds) {
  if (task.kind === 'irregular') return false;
  if (task.from && ds < task.from) return false;
  if (task.until && ds > task.until) return false;
  if (task.repeat === 'once') return task.date === ds;
  if (['daily', 'opening', 'closing'].includes(task.repeat)) return true;
  if (task.repeat === 'workday') { const d = new Date(ds).getDay(); return d !== 0 && d !== 6; }
  if (task.repeat === 'weekly') return task.dayOfWeek === new Date(ds).getDay();
  return false;
}

module.exports = { isToday };
