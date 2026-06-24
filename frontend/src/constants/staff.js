// Нормы часов по сотрудникам (коридор min/max в месяц).
// Хранятся в KV hour_norms:v1 и редактируются управляющим прямо в дашборде.
// DEFAULT_HOUR_NORMS — seed при первом запуске (пока KV пустой).

export const DEFAULT_HOUR_NORM  = { min: 140, max: 160 };
export const DEFAULT_HOUR_NORMS = {
  "Павел": { min: 60, max: 70 }, // совместитель
};

/**
 * Норма часов для сотрудника.
 * @param {string} name
 * @param {Object} hourNorms — runtime-данные из KV (hour_norms:v1)
 */
export function hourNorm(name, hourNorms = {}) {
  const n = hourNorms[name] || DEFAULT_HOUR_NORM;
  return { ...n, target: Math.round((n.min + n.max) / 2) };
}
