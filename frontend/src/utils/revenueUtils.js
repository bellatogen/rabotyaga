// Утилиты выручки — единый источник правды для светофора и форматов.
// Импортируются в MonthAnalytics, ScheduleTab и везде, где нужен цвет по %.

/**
 * Цвет по % выполнения плана (светофор):
 *   ≥110% — синий    (перевыполнение)
 *   ≥100% — зелёный  (выполнено)
 *   ≥ 90% — жёлтый   (близко)
 *   < 90% — красный  (отстаём)
 */
export function revColor(pct) {
  if (pct >= 110) return '#5b8b9b';
  if (pct >= 100) return '#8bc47a';
  if (pct >= 90)  return '#e8a030';
  return '#e85535';
}

/**
 * Компактный формат рублей для тесных ячеек.
 *   1 527 345 → «1.5млн»
 *     127 345 → «127к»
 *         980 → «980»
 */
export function kRub(n) {
  n = Number(n) || 0;
  if (n >= 1_000_000) return (Math.round(n / 100_000) / 10) + 'млн';
  if (n >= 1000) return Math.round(n / 1000) + 'к';
  return String(Math.round(n));
}

/**
 * Вычисляет % выполнения плана и базу для него.
 *
 * Логика (приоритеты):
 *   1. Дни с обоими значениями (план + факт) — apples-to-apples.
 *      Это «таблица»: дневные планы из revenue.
 *   2. Если дневных планов нет — возвращает null.
 *
 * @param {string[]} days       — массив дат месяца «YYYY-MM-DD»
 * @param {object}  revenue     — { [date]: { plan, fact, guests } }
 * @returns {{ pct: number|null, matchedFact: number, matchedPlan: number, matchedCount: number }}
 */
export function calcMonthPct(days, revenue) {
  const fN = d => Number(revenue[d]?.fact) || 0;
  const pN = d => Number(revenue[d]?.plan) || 0;

  const matched     = days.filter(d => pN(d) > 0 && fN(d) > 0);
  const matchedFact = matched.reduce((s, d) => s + fN(d), 0);
  const matchedPlan = matched.reduce((s, d) => s + pN(d), 0);
  const pct         = matchedPlan > 0 ? Math.round((matchedFact / matchedPlan) * 100) : null;

  return { pct, matchedFact, matchedPlan, matchedCount: matched.length };
}
