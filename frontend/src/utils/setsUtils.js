// Утилиты для «сэтов» (напиток + закуска) — общая логика фильтра и маржи.
// Пары приходят из GET /api/iiko/basket с полями drinkSnack, margin, score.

export const pairKey = p => `${p.a}|||${p.b}`;

// Только напиток+закуска. Если категорий нет (старый iiko / поле не пришло) —
// drinkSnack у всех false, и фильтр вернёт пусто — это обрабатывает вызывающий.
export function filterDrinkSnack(pairs = []) {
  return pairs.filter(p => p.drinkSnack);
}

// Топ-N сэтов: приоритет напиток+закуска, сортировка по марже, затем по score.
// Если напиток+закуска нет — берём общий список пар (graceful fallback).
export function pickDailySets(pairs = [], n = 3) {
  let pool = pairs.filter(p => p.drinkSnack);
  if (!pool.length) pool = pairs;
  return [...pool].sort((a, b) => {
    const ma = a.margin ?? -1, mb = b.margin ?? -1;
    if (mb !== ma) return mb - ma;
    return (b.score || 0) - (a.score || 0);
  }).slice(0, n);
}

// Ключи топ-N по марже среди переданных пар — для аннотации «маржинальная позиция».
export function topMarginKeys(pairs = [], n = 3) {
  return new Set(
    pairs.filter(p => p.margin != null)
      .sort((a, b) => b.margin - a.margin)
      .slice(0, n)
      .map(pairKey),
  );
}

// Текст для гоу-листа из пары.
export function setGoText(p) {
  const conf = Math.max(p.confAB || 0, p.confBA || 0);
  const m = p.margin != null ? `, маржа ~${p.margin}%` : '';
  return `${p.a} + ${p.b} — предлагай сетом (${conf}% берут вместе${m})`;
}
