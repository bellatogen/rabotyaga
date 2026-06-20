// Нормы часов по сотрудникам (коридор min/max в месяц).
// SERVER: вынести в редактируемый справочник.

// Индивидуальные нормы часов в месяц (коридор). SERVER: вынести в редактируемый справочник.
export const HOUR_NORMS = {"Павел":{min:60,max:70}};
export const DEFAULT_HOUR_NORM = {min:140,max:160};
export function hourNorm(name) {
  const n = HOUR_NORMS[name] || DEFAULT_HOUR_NORM;
  return {...n, target: Math.round((n.min + n.max) / 2)};
}
