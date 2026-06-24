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

// Отсортированный пул пар напиток+закуска — «серые лошадки» первыми.
// Серая лошадка = высокая маржа + редко заказывают (маржа↓ / count↑).
// Не делает fallback на пиво+пиво — лучше вернуть пустой список.
export function drinkFoodPool(pairs = [], dishTypeMap = null) {
  const pool = pairs.filter(p => isDrinkSnack(p, dishTypeMap));
  // Сначала маржа убывает, при равной марже — редко заказываемые (count↑ = популярные → вниз)
  return [...pool].sort((a, b) => {
    const ma = a.margin ?? -1, mb = b.margin ?? -1;
    if (mb !== ma) return mb - ma;
    // Одинаковая маржа: предпочитаем реже заказываемые (серые лошадки)
    return (a.count || 0) - (b.count || 0);
  });
}

// Топ-N сэтов со смещением (для кнопки «ещё»).
export function pickDailySets(pairs = [], n = 3, dishTypeMap = null, offset = 0) {
  return drinkFoodPool(pairs, dishTypeMap).slice(offset, offset + n);
}

// Топ маржинальных позиций по отдельности с пагинацией (когда пар нет).
// Серые лошадки: маржа↓ / count↑ (редко заказываемые маржинальные — не топ-продавцы).
export function buildSoloPool(pairs = [], dishTypeMap = null) {
  const seen = new Set();
  const items = [];
  for (const p of pairs) {
    for (const side of ['a', 'b']) {
      const name    = p[side];
      const typeKey = side === 'a' ? p.typeA : p.typeB;
      const margin  = side === 'a' ? p.marginA : p.marginB;
      const count   = p.count || 0;
      if (seen.has(name)) continue;
      seen.add(name);
      const type = (dishTypeMap && dishTypeMap[name]) || typeKey;
      items.push({ name, type, margin: margin ?? p.margin ?? null, count });
    }
  }
  // Предпочитаем закуски, потом всё; при равной марже — реже заказываемые
  const food  = items.filter(i => i.type === 'food' || looksLikeFood(i.name));
  const pool  = food.length > 0 ? food : items;
  return [...pool].sort((a, b) => {
    const ma = a.margin ?? -1, mb = b.margin ?? -1;
    if (mb !== ma) return mb - ma;
    return (a.count || 0) - (b.count || 0); // реже = серая лошадка
  });
}

// Совместимость — старый вызов
export function pickTopMarginItems(pairs = [], n = 3, dishTypeMap = null) {
  return buildSoloPool(pairs, dishTypeMap).slice(0, n);
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
