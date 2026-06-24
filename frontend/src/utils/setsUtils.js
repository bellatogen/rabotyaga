// Утилиты для «сэтов» (напиток + закуска) — общая логика фильтра и маржи.
// Пары приходят из GET /api/iiko/basket с полями drinkSnack, margin, score.

export const pairKey = p => `${p.a}|||${p.b}`;

// Эвристика по названию — fallback, когда iiko не отдаёт категории (catA/catB/typeA/typeB).
function looksLikeDrink(name) {
  const n = (name || '').toLowerCase();
  return /пиво|пилс|лагер|эль|стаут|портер|вино|шампан|просекко|кава|виски|водк|джин|ром|текил|коньяк|бренди|сидр|медовух|квас|пунш|глинтвейн|напиток|коктейл|дра(ф|фт)|розлив|бокал|кружк/.test(n);
}
function looksLikeFood(name) {
  const n = (name || '').toLowerCase();
  return /закус|снек|чипс|орех|сухар|мясн|колбас|сыр|хлеб|соус|дип|паст|пиц|бургер|сэндвич|ролл|суш|салат|суп|горяч|горячее|блюд|порци/.test(n);
}

// Пара «напиток+закуска» по названиям (когда категории недоступны).
function heuristicDrinkSnack(p) {
  const a = p.a, b = p.b;
  return (looksLikeDrink(a) && looksLikeFood(b)) || (looksLikeFood(a) && looksLikeDrink(b));
}

// Явно «оба напитка» или «оба еда» — такие пары отбрасываем.
function looksLikeSameKind(p) {
  const bothDrink = looksLikeDrink(p.a) && looksLikeDrink(p.b);
  const bothFood  = looksLikeFood(p.a) && looksLikeFood(p.b);
  return bothDrink || bothFood;
}

// Истинно «напиток+закуска». Предпочитаем категории iiko (typeA/typeB),
// иначе — флаг drinkSnack, иначе — эвристика по названию.
export function isDrinkSnack(p) {
  const ta = p.typeA, tb = p.typeB;
  const haveTypes = ta && tb && ta !== 'unknown' && tb !== 'unknown';
  if (haveTypes) {
    return (ta === 'drink' && tb === 'food') || (ta === 'food' && tb === 'drink');
  }
  if (p.drinkSnack) return true;
  return heuristicDrinkSnack(p);
}

// Только напиток+закуска. Если категорий нет — fallback по названию (см. isDrinkSnack).
export function filterDrinkSnack(pairs = []) {
  return pairs.filter(isDrinkSnack);
}

// Топ-N сэтов: приоритет напиток+закуска, сортировка по марже, затем по score.
// Если явных пар нет — берём общий список, но отсеиваем «оба напитка / оба еда».
export function pickDailySets(pairs = [], n = 3) {
  let pool = pairs.filter(isDrinkSnack);
  if (!pool.length) pool = pairs.filter(p => !looksLikeSameKind(p));
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
