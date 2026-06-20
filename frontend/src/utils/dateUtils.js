// Утилиты для работы с датами и идентификаторами

import { MONTHS_RU } from '../constants/locale.js';

/** Генерирует короткий уникальный id */
export const uid = () => Math.random().toString(36).slice(2, 9);

/** Строка сегодняшней даты YYYY-MM-DD */
export const todayStr = () => new Date().toISOString().slice(0, 10);

/** Текущее время в ISO 8601 */
export const nowISO = () => new Date().toISOString();

/** Парсит строку времени HH:MM в минуты от полуночи */
export const hmm = s => {
  if (!s) return 0;
  const [h, m] = s.split(':').map(Number);
  return h * 60 + (m || 0);
};

/** Форматирует дату YYYY-MM-DD как "1 Января" */
export const fmtDate = ds => {
  const d = new Date(ds);
  return `${d.getDate()} ${MONTHS_RU[d.getMonth()]}`;
};

/** Прибавляет n дней к дате YYYY-MM-DD */
export const addDays = (ds, n) => {
  const d = new Date(ds);
  d.setDate(d.getDate() + n);
  return d.toISOString().slice(0, 10);
};

/** Возвращает массив из n дат назад начиная с ds */
export const rangeDays = (ds, n) => Array.from({length: n}, (_, i) => addDays(ds, -i));
