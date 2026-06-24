// Утилиты для «сэтов» (напиток + закуска) — общая логика фильтра и маржи.
// Пары приходят из GET /api/iiko/basket с полями drinkSnack, margin, score.

export const pairKey = p => `${p.a}|||${p.b}`;

// Убираем контейнерные суффиксы («с собой», объём) из имени перед матчингом —
// iiko часто отдаёт «IPA 0,5л с собой» или «Лагер 1,0 с собой».
function stripContainerSuffix(name) {
  return (name || '')
    // объём с буквой л: «0,5л», «0.33л», «1л», «1,0л»
    .replace(/\s*\d+[,.]\d*\s*л\b/gi, ' ')
    // целый объём без запятой: «1л», «2л»
    .replace(/\s*\d+\s*л\b/gi, ' ')
    // только цифра+запятая без «л» в конце слова: «1,0» «0,5»
    .replace(/\s+\d+[,.]\d+\s*/g, ' ')
    // суффиксы «с собой», «навынос», «to go», «мл»
    .replace(/\s*(с\s+собой|навынос|to go|\d+\s*мл)\s*/gi, ' ')
    .replace(/\s+/g, ' ').trim();
}

// Эвристика по названию — fallback, когда iiko не отдаёт категории.
function looksLikeDrink(name) {
  const n = stripContainerSuffix(name).toLowerCase();
  return /пиво|пилс|лагер|эль|стаут|портер|вино|шампан|просекко|кава|виски|водк|джин|ром|текил|коньяк|бренди|сидр|медовух|квас|пунш|глинтвейн|напиток|коктейл|дра(ф|фт)|розлив|разлив|бокал|кружк|ale|ipa|lager|stout|porter|weizen|weiss|wit\b|saison|pilsner|pilsener|pils|gose|sour\b|cider|mead|craft|крафт|palm\b|chimay|duvel|leffe|hoegaarden|hoeg|kriek|trappist|abbey|белое|тёмное|темное|светлое|нефильтр|фильтр|бочков|разлив|дримтим|dreamteam|lockdown|локдаун|on\s+the\s+bon|speckled\s+hen|speckled|спеклед|олд\s+спекл|hен/.test(n);
}
function looksLikeFood(name) {
  const n = stripContainerSuffix(name).toLowerCase();
  return /закус|снек|снэк|чипс|орех|сухар|мясн|колбас|сыр|хлеб|соус|дип|паст|пиц|бургер|сэндвич|сендвич|ролл|суш|салат|суп|горяч|горячее|блюд|порци|начос|тапас|гриль|перекус/.test(n);
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

// Истинно «напиток+закуска». Порядок определения типа:
//  1) категории iiko (typeA/typeB), если оба известны (не 'other'/'unknown');
//  2) карта dishTypeMap из ABC (если передана) — переопределяет неизвестные типы;
//  3) эвристика по названию (флаг drinkSnack / looksLikeDrink+looksLikeFood).
export function isDrinkSnack(p, dishTypeMap = null) {
  const known = t => t && t !== 'unknown' && t !== 'other';
  const isDS  = (ta, tb) => (ta === 'drink' && tb === 'food') || (ta === 'food' && tb === 'drink');

  let ta = p.typeA, tb = p.typeB;
  // 1. Категории iiko
  if (known(ta) && known(tb)) return isDS(ta, tb);

  // 2. Карта типов из ABC
  if (dishTypeMap) {
    if (!known(ta)) ta = dishTypeMap[p.a] || ta;
    if (!known(tb)) tb = dishTypeMap[p.b] || tb;
    if (known(ta) && known(tb)) return isDS(ta, tb);
  }

  // 3. Эвристика по названию
  if (p.drinkSnack) return true;
  return heuristicDrinkSnack(p);
}

// Только напиток+закуска. Если категорий нет — fallback по названию (см. isDrinkSnack).
export function filterDrinkSnack(pairs = [], dishTypeMap = null) {
  return pairs.filter(p => isDrinkSnack(p, dishTypeMap));
}

// Отсортированный пул пар напиток+закуска (не ограниченный по n).
// Не делает fallback на пиво+пиво — лучше вернуть пустой список.
export function drinkFoodPool(pairs = [], dishTypeMap = null) {
  const pool = pairs.filter(p => isDrinkSnack(p, dishTypeMap));
  return [...pool].sort((a, b) => {
    const ma = a.margin ?? -1, mb = b.margin ?? -1;
    if (mb !== ma) return mb - ma;
    return (b.score || 0) - (a.score || 0);
  });
}

// Топ-N сэтов со смещением (для кнопки «ещё»).
export function pickDailySets(pairs = [], n = 3, dishTypeMap = null, offset = 0) {
  return drinkFoodPool(pairs, dishTypeMap).slice(offset, offset + n);
}

// Топ-N маржинальных позиций по отдельности (когда пар нет).
// Из всех блюд в парах, которые выглядят как напитки — исключаем, берём только остальные;
// если вообще нет закусок — берём маржинальные напитки (лучше что-то, чем ничего).
export function pickTopMarginItems(pairs = [], n = 3, dishTypeMap = null) {
  const seen = new Set();
  const items = [];
  for (const p of pairs) {
    for (const [name, typeKey] of [[p.a, p.typeA], [p.b, p.typeB]]) {
      if (seen.has(name)) continue;
      seen.add(name);
      const type = (dishTypeMap && dishTypeMap[name]) || typeKey;
      const margin = name === p.a ? p.marginA : p.marginB;
      items.push({ name, type, margin: margin ?? p.margin ?? null });
    }
  }
  // Предпочитаем закуски, потом всё остальное
  const food  = items.filter(i => i.type === 'food' || looksLikeFood(i.name));
  const mixed = food.length >= n ? food : items;
  return [...mixed]
    .sort((a, b) => (b.margin ?? -1) - (a.margin ?? -1))
    .slice(0, n);
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
