// iiko.js — адаптер к iikoServer REST API.
// Переменные окружения (для дефолтного тенанта / back-compat):
//   IIKO_URL      — базовый URL, напр. https://pivnaya-karta.iiko.it
//   IIKO_LOGIN    — логин iiko
//   IIKO_PASSWORD — пароль (SHA-1 при авторизации)
// Если переменные не заданы — роуты /api/iiko/* вернут 503.
//
// SEC-8: makeIikoClient({url,login,password}) — фабрика с per-инстанс token-состоянием.
// _token/_tokenExpiry/_tokenPromise замкнуты в инстансе — два клиента не делят состояние.
// Дефолтный клиент создаётся из env для back-compat с существующими роутами.

const crypto = require('crypto');

// ── Утилиты (stateless) ──────────────────────────────────────────────────────

function sha1(str) {
  return crypto.createHash('sha1').update(str).digest('hex');
}

// Классификация категории блюда iiko → напиток / закуска / прочее.
// Правило сэтов: пара показывается только если это напиток + закуска.
const DRINK_RE = /бар|напит|пиво|пив\b|пенн|коктейл|вино|виск|ром\b|водк|лимонад|\bчай|кофе|сидр|\bэль|лагер|безалког|морс|\bсок|тоник|джин|текил|ликёр|ликер|\bшот|настойк|drink|крафт|разлив|draft|драфт|бутылочн/i;
const FOOD_RE  = /кухн|закус|\bеда|бургер|пицц|салат|снэк|снек|тапас|гриль|горяч|блюд|паст\b|\bсыр|мяс|\bфри|начос|сухар|food|стартер|основ|десерт|брускет|сэндвич|сендвич|хот-?дог|кулинар|перекус/i;

// Категории iiko, где смешаны напитки и закуски — нужна классификация по названию блюда
const AMBIGUOUS_CATS = new Set(['пивная карта', 'без скидки', 'спец.предложения', 'сэты/спец.предложения', 'неиспользуемые', '']);

function classifyCat(cat) {
  if (!cat) return 'other';
  const c = String(cat).toLowerCase().trim();
  if (AMBIGUOUS_CATS.has(c)) return 'ambiguous';
  if (DRINK_RE.test(c)) return 'drink';
  if (FOOD_RE.test(c))  return 'food';
  return 'other';
}

// Классификация по НАЗВАНИЮ блюда — используется когда категория неинформативна.
// Правила специфичны для формата iiko «Пивной Карты».
const DISH_DRINK_RE = /драфт|с\s+собой|навынос|\bдрафт\b|разлив|пиво|пив\b|лагер|стаут|портер|вайс|хефе|пилснер|пилс|ипа\b|ipa\b|эль\b|ale\b|сидр|cider|крик|gose|weiss|витте|трипель|дуббель|квадр|хеллес|хелль|дункель|урвайс|шенк|медовух|виноград|виноград/i;
const DISH_FOOD_RE  = /оливк|джерки|суджук|бастурм|ребр|рёбр|брискет|фисташк|арахис|миндал|копчен|вялен|соленый|маринов|колбас|сосиск|чипс|принглс|орех|ореховый|снек|закуск|сыр\b|бретцель|оленин|утк|пастрам|огурц|соус|сэндвич|сендвич|шоколад|мёд|мед\b/i;

function classifyDish(dishName, catName) {
  const catType = classifyCat(catName);
  if (catType !== 'ambiguous' && catType !== 'other') return catType;
  const cl = String(catName || '').toLowerCase().trim();
  if (cl === 'мерч') return 'other';
  const n = String(dishName || '').toLowerCase();
  if (/\d+\s*(кг|гр|г\b)/.test(n)) return 'food';
  if (DISH_DRINK_RE.test(n)) return 'drink';
  if (DISH_FOOD_RE.test(n)) return 'food';
  if (DRINK_RE.test(n)) return 'drink';
  if (FOOD_RE.test(n))  return 'food';
  return 'other';
}

// Карта dish → 'drink'|'food'|'other' из закэшированных источников.
function loadDishTypeMap(data) {
  const map = {};
  try {
    const abc = data?.kv?.['sales_abc:v2'];
    if (abc) {
      const parsed = JSON.parse(abc);
      for (const [name, t] of Object.entries(parsed.dishTypeMap || {})) {
        if (t && t !== 'other') map[name] = t;
      }
    }
  } catch { /* кэш повреждён */ }
  try {
    const dc = data?.kv?.['dish_cats:v1'];
    if (dc) {
      const parsed = JSON.parse(dc);
      for (const { dish, cat } of (parsed.categories || [])) {
        if (!dish || map[dish]) continue;
        const t = classifyDish(dish, cat);
        if (t !== 'other' && t !== 'ambiguous') map[dish] = t;
      }
    }
  } catch { /* кэш повреждён */ }
  return map;
}

// Топ-N сэтов дня — только напиток+закуска, приоритет по марже.
function pickDailySets(result, n = 3) {
  const pairs = result?.pairs || [];
  let pool = pairs.filter(p => p.drinkSnack);
  if (!pool.length) pool = pairs;
  return [...pool].sort((x, y) => {
    const mx = x.margin ?? -1, my = y.margin ?? -1;
    if (my !== mx) return my - mx;
    return (y.score || 0) - (x.score || 0);
  }).slice(0, n);
}

// ── SEC-8: фабрика клиента ───────────────────────────────────────────────────

/**
 * Создаёт iiko-клиент с замкнутым token-состоянием.
 * @param {{url?:string, login?:string, password?:string}} opts
 * @returns объект с методами getDayRevenue, syncRevenue, syncRevenueRange, …
 */
function makeIikoClient({ url = '', login = '', password = '' } = {}) {
  const _url      = (url || '').replace(/\/+$/, '');
  const _login    = login    || '';
  const _password = password || '';

  // Замкнутое token-состояние — инстансы не делят его между собой.
  let _token        = null;
  let _tokenExpiry  = 0;
  let _tokenPromise = null;

  function _invalidateToken() { _token = null; _tokenExpiry = 0; }

  async function _getToken() {
    if (_token && Date.now() < _tokenExpiry) return _token;
    if (_tokenPromise) return _tokenPromise;
    _tokenPromise = (async () => {
      try {
        const authUrl = `${_url}/resto/api/auth?login=${encodeURIComponent(_login)}&pass=${sha1(_password)}`;
        const res = await fetch(authUrl, { signal: AbortSignal.timeout(8000) });
        if (!res.ok) throw new Error(`iiko авторизация: HTTP ${res.status}`);
        const text = (await res.text()).trim().replace(/^"|"$/g, '');
        if (!text || text.length < 8) throw new Error('iiko вернул пустой токен');
        _token       = text;
        _tokenExpiry = Date.now() + 50 * 60 * 1000;
        console.log('[iiko] токен получен');
        return _token;
      } finally {
        _tokenPromise = null;
      }
    })();
    return _tokenPromise;
  }

  // ── Проверка настройки ──────────────────────────────────────────────────

  function isConfigured() {
    return !!(_url && _login);
  }

  // ── Внутренние OLAP-запросы ──────────────────────────────────────────────

  // Запрос выручки+гостей за один день.
  // GuestNum suммируется только по заказам с ненулевой выручкой (регрессия: commit 69bc3bd).
  async function _fetchOlapForDate(date, token) {
    const body = {
      reportType: 'SALES', buildSummary: 'false',
      groupByRowFields: ['OpenDate.Typed', 'OrderNum'],
      aggregateFields: ['DishDiscountSumInt', 'GuestNum'],
      filters: {
        'OpenDate.Typed': {
          filterType: 'DateRange', periodType: 'CUSTOM',
          from: date, to: date, includeLow: true, includeHigh: true,
        },
      },
    };
    const olap_url = `${_url}/resto/api/v2/reports/olap?key=${token}`;
    const res = await fetch(olap_url, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(body),
      signal: AbortSignal.timeout(15000),
    });
    if (res.status === 401) { _invalidateToken(); throw Object.assign(new Error('iiko: сессия истекла'), { status: 401 }); }
    if (!res.ok) {
      const t = await res.text().catch(() => '');
      if (t.includes('GuestNum') || t.includes('Unknown OLAP field')) {
        console.warn('[iiko] GuestNum не поддерживается, запрашиваем только выручку');
        return _fetchOlapRevenueOnly(date, token);
      }
      throw new Error(`iiko OLAP HTTP ${res.status}: ${t.slice(0, 200)}`);
    }
    const json = await res.json();
    let fact = 0, guests = 0;
    for (const row of (json.data || [])) {
      const rowFact = Number(row.DishDiscountSumInt || 0);
      fact += rowFact;
      if (rowFact > 0) guests += Number(row.GuestNum || 0);
    }
    return { fact: Math.round(fact), guests };
  }

  // Fallback: только выручка (без GuestNum)
  async function _fetchOlapRevenueOnly(date, token) {
    const body = {
      reportType: 'SALES', buildSummary: 'false',
      groupByRowFields: ['OpenDate.Typed'],
      aggregateFields: ['DishDiscountSumInt'],
      filters: { 'OpenDate.Typed': { filterType: 'DateRange', periodType: 'CUSTOM', from: date, to: date, includeLow: true, includeHigh: true } },
    };
    const olap_url = `${_url}/resto/api/v2/reports/olap?key=${token}`;
    const res = await fetch(olap_url, { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify(body), signal: AbortSignal.timeout(15000) });
    if (res.status === 401) { _invalidateToken(); throw Object.assign(new Error('iiko: сессия истекла'), { status: 401 }); }
    if (!res.ok) { const t = await res.text().catch(() => ''); throw new Error(`iiko OLAP ${res.status}: ${t.slice(0, 200)}`); }
    let json;
    try { json = await res.json(); } catch { throw new Error('iiko вернул невалидный JSON (fallback)'); }
    let fact = 0;
    for (const row of (json.data || [])) fact += Number(row.DishDiscountSumInt || 0);
    return { fact: Math.round(fact), guests: 0 };
  }

  // Вспомогательный: OLAP-запрос количества блюд за период.
  async function _fetchDishCounts(from, to, token) {
    const olap_url = `${_url}/resto/api/v2/reports/olap?key=${token}`;
    const mkBody = withCat => ({
      reportType: 'SALES', buildSummary: 'false',
      groupByRowFields: withCat ? ['DishName', 'DishCategory'] : ['DishName'],
      aggregateFields: ['DishAmountInt'],
      filters: {
        'OpenDate.Typed': { filterType: 'DateRange', periodType: 'CUSTOM', from, to, includeLow: true, includeHigh: true },
      },
    });
    const post = b => fetch(olap_url, {
      method: 'POST', headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(b), signal: AbortSignal.timeout(15_000),
    });
    let res = await post(mkBody(true));
    let hasCat = true;
    if (res.status === 401) { _invalidateToken(); throw Object.assign(new Error('iiko: сессия истекла'), { status: 401 }); }
    if (!res.ok) {
      const t = await res.text().catch(() => '');
      if (t.includes('DishCategory') || t.includes('Unknown OLAP field')) {
        hasCat = false;
        res = await post(mkBody(false));
        if (res.status === 401) { _invalidateToken(); throw Object.assign(new Error('iiko: сессия истекла'), { status: 401 }); }
        if (!res.ok) { const t2 = await res.text().catch(() => ''); throw new Error(`iiko OLAP ${res.status}: ${t2.slice(0, 200)}`); }
      } else {
        throw new Error(`iiko OLAP ${res.status}: ${t.slice(0, 200)}`);
      }
    }
    let json; try { json = await res.json(); } catch { throw new Error('iiko вернул невалидный JSON (sales-abc)'); }
    const counts = {}, cats = {};
    for (const row of (json.data || [])) {
      const name  = (row['DishName'] || '').trim();
      const count = Math.round(Number(row['DishAmountInt'] || 0));
      if (!name || count <= 0) continue;
      counts[name] = (counts[name] || 0) + count;
      if (hasCat) {
        const cat = (row['DishCategory'] || '').trim();
        if (cat && !cats[name]) cats[name] = cat;
      }
    }
    return { counts, cats };
  }

  // ── Публичные методы ──────────────────────────────────────────────────────

  // Получить выручку за один день. Если data+saveData переданы — сохраняет в revenue:v1.
  async function getDayRevenue(date, data, saveData) {
    if (!isConfigured()) {
      throw Object.assign(new Error('iiko не настроен: задайте IIKO_URL и IIKO_LOGIN в .env'), { status: 503 });
    }
    const token = await _getToken();
    const { fact, guests } = await _fetchOlapForDate(date, token);
    console.log(`[iiko] выручка за ${date}: ${fact} ₽, гостей: ${guests}`);

    let lastYear = null;
    if (data && saveData) {
      const revenue = JSON.parse(data.kv?.['revenue:v1'] || '{}');
      if (!revenue[date]) revenue[date] = {};
      if (fact > 0)   revenue[date].fact   = fact;
      if (guests > 0) revenue[date].guests = guests;
      if (fact > 0 && guests > 0) revenue[date].avgCheck = Math.round(fact / guests);
      try {
        const lyDate = new Date(date + 'T00:00:00');
        lyDate.setFullYear(lyDate.getFullYear() - 1);
        const lyStr = lyDate.toISOString().slice(0, 10);
        const { fact: lyFact } = await _fetchOlapForDate(lyStr, token);
        if (lyFact > 0) {
          revenue[date].lastYear = lyFact;
          lastYear = lyFact;
          console.log(`[iiko] прошлый год (${lyStr}): ${lyFact} ₽`);
        }
      } catch (e) {
        console.warn('[iiko] YoY ошибка:', e.message);
      }
      data.kv['revenue:v1'] = JSON.stringify(revenue);
      saveData();
    }
    return { fact, lastYear, guests };
  }

  // Синхронизация выручки за текущий месяц.
  async function syncRevenue(data, saveData) {
    const now  = new Date();
    const from = `${now.getFullYear()}-${String(now.getMonth() + 1).padStart(2, '0')}-01`;
    const to   = now.toISOString().slice(0, 10);
    return syncRevenueRange(from, to, data, saveData);
  }

  // Универсальный диапазонный sync выручки (основной + GuestNum-fallback).
  // GuestNum суммируется только по заказам с ненулевой выручкой — регрессионный инвариант.
  async function syncRevenueRange(from, to, data, saveData) {
    if (!isConfigured()) {
      throw Object.assign(new Error('iiko не настроен: задайте IIKO_URL и IIKO_LOGIN в .env'), { status: 503 });
    }
    const token = await _getToken();
    const bodyFull = {
      reportType: 'SALES', buildSummary: 'false',
      groupByRowFields: ['OpenDate.Typed', 'OrderNum'],
      aggregateFields: ['DishDiscountSumInt', 'GuestNum'],
      filters: { 'OpenDate.Typed': { filterType: 'DateRange', periodType: 'CUSTOM', from, to, includeLow: true, includeHigh: true } },
    };
    const olap_url = `${_url}/resto/api/v2/reports/olap?key=${token}`;
    let res = await fetch(olap_url, {
      method: 'POST', headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(bodyFull), signal: AbortSignal.timeout(60_000),
    });
    let useGuests = true;
    if (res.status === 401) { _invalidateToken(); throw Object.assign(new Error('iiko: сессия истекла'), { status: 401 }); }
    if (!res.ok) {
      const t = await res.text().catch(() => '');
      if (t.includes('GuestNum') || t.includes('Unknown OLAP field')) {
        console.warn('[iiko/range] GuestNum не поддерживается, запрашиваем только выручку');
        useGuests = false;
        const bodyPlain = { ...bodyFull, aggregateFields: ['DishDiscountSumInt'], groupByRowFields: ['OpenDate.Typed', 'OrderNum'] };
        res = await fetch(olap_url, {
          method: 'POST', headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify(bodyPlain), signal: AbortSignal.timeout(60_000),
        });
        if (res.status === 401) { _invalidateToken(); throw Object.assign(new Error('iiko: сессия истекла'), { status: 401 }); }
        if (!res.ok) { const t2 = await res.text().catch(() => ''); throw new Error(`iiko OLAP ${res.status}: ${t2.slice(0, 200)}`); }
      } else {
        throw new Error(`iiko OLAP ${res.status}: ${t.slice(0, 200)}`);
      }
    }
    let json;
    try { json = await res.json(); } catch { throw new Error('iiko syncRevenueRange вернул невалидный JSON'); }
    const revenue = JSON.parse(data.kv['revenue:v1'] || '{}');
    const acc = {};
    for (const row of (json.data || [])) {
      const iso    = String(row['OpenDate.Typed'] || '').slice(0, 10);
      if (!iso) continue;
      const rowFact   = Number(row.DishDiscountSumInt || 0);
      // Гостей считаем только по заказам с ненулевой выручкой (исключаем отменённые)
      const rowGuests = (useGuests && rowFact > 0) ? Number(row.GuestNum || 0) : 0;
      if (!acc[iso]) acc[iso] = { fact: 0, guests: 0 };
      acc[iso].fact   += rowFact;
      acc[iso].guests += rowGuests;
    }
    let updated = 0;
    for (const [iso, { fact, guests }] of Object.entries(acc)) {
      const f = Math.round(fact);
      if (f <= 0) continue;
      if (!revenue[iso]) revenue[iso] = {};
      revenue[iso].fact = f;
      if (guests > 0) {
        revenue[iso].guests   = Math.round(guests);
        revenue[iso].avgCheck = Math.round(f / guests);
      }
      updated++;
    }
    data.kv['revenue:v1'] = JSON.stringify(revenue);
    saveData();
    console.log(`[iiko] syncRevenueRange: обновлено ${updated} дней (${from}–${to})`);
    return { updated, from, to };
  }

  // Анализ корзины — пары блюд (кэш 20 ч).
  async function getBasketPairs(data, saveData) {
    const CACHE_KEY = 'basket:pairs:v4';
    const cached = data.kv?.[CACHE_KEY];
    if (cached) {
      const parsed = JSON.parse(cached);
      const ageH = (Date.now() - new Date(parsed.ts).getTime()) / 3_600_000;
      if (ageH < 20 && parsed.v === 4) return parsed;
    }
    if (!isConfigured()) {
      throw Object.assign(new Error('iiko не настроен'), { status: 503 });
    }
    const token = await _getToken();
    const to   = new Date().toISOString().slice(0, 10);
    const from = new Date(Date.now() - 14 * 86_400_000).toISOString().slice(0, 10);
    const olap_url = `${_url}/resto/api/v2/reports/olap?key=${token}`;
    const baseGroup = ['OpenDate.Typed', 'FiscalChequeNumber', 'DishName'];
    const bodyFull = {
      reportType: 'SALES', buildSummary: 'false',
      groupByRowFields: [...baseGroup, 'DishCategory'],
      aggregateFields: ['DishAmountInt', 'DishDiscountSumInt', 'ProductCostBase.ProductCostBase'],
      filters: { 'OpenDate.Typed': { filterType: 'DateRange', periodType: 'CUSTOM', from, to, includeLow: true, includeHigh: true } },
    };
    const postOlap = b => fetch(olap_url, {
      method: 'POST', headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(b), signal: AbortSignal.timeout(30_000),
    });
    let res = await postOlap(bodyFull);
    let hasExtra = true;
    if (res.status === 401) { _invalidateToken(); throw Object.assign(new Error('iiko: сессия истекла'), { status: 401 }); }
    if (!res.ok) {
      const t = await res.text().catch(() => '');
      if (t.includes('DishCategory') || t.includes('ProductCostBase') || t.includes('Unknown OLAP field')) {
        console.warn('[iiko/basket] категория/себестоимость не поддерживаются — базовый запрос');
        hasExtra = false;
        res = await postOlap({ ...bodyFull, groupByRowFields: baseGroup, aggregateFields: ['DishAmountInt'] });
        if (res.status === 401) { _invalidateToken(); throw Object.assign(new Error('iiko: сессия истекла'), { status: 401 }); }
        if (!res.ok) { const t2 = await res.text().catch(() => ''); throw new Error(`iiko basket OLAP ${res.status}: ${t2.slice(0, 200)}`); }
      } else {
        throw new Error(`iiko basket OLAP ${res.status}: ${t.slice(0, 200)}`);
      }
    }
    const json = await res.json();
    const rows = json.data || [];
    console.log(`[iiko/basket] строк из iiko: ${rows.length}, период: ${from}–${to}`);
    const orderItems = {};
    const dishCat  = {};
    const dishRev  = {};
    const dishCost = {};
    for (const row of rows) {
      const date    = String(row['OpenDate.Typed']     || '').slice(0, 10);
      const cheque  = String(row['FiscalChequeNumber'] || '').trim();
      const orderId = date && cheque ? `${date}:${cheque}` : null;
      const dish    = (row['DishName'] || '').trim();
      if (!orderId || !dish || dish.length > 80) continue;
      if (!orderItems[orderId]) orderItems[orderId] = new Set();
      orderItems[orderId].add(dish);
      if (hasExtra) {
        const cat = (row['DishCategory'] || '').trim();
        if (cat && !dishCat[dish]) dishCat[dish] = cat;
        dishRev[dish]  = (dishRev[dish]  || 0) + Number(row['DishDiscountSumInt'] || 0);
        dishCost[dish] = (dishCost[dish] || 0) + Number(row['ProductCostBase.ProductCostBase'] || 0);
      }
    }
    const dishMargin = dish => {
      const rev = dishRev[dish] || 0, cost = dishCost[dish] || 0;
      if (rev <= 0 || cost <= 0) return null;
      return Math.round((rev - cost) / rev * 100);
    };
    const orders      = Object.values(orderItems).map(s => [...s]).filter(arr => arr.length >= 2);
    const totalOrders = orders.length;
    const totalChecks = Object.keys(orderItems).length;
    console.log(`[iiko/basket] чеков: ${totalChecks}, чеков с 2+ блюдами: ${totalOrders}`);
    if (totalOrders < 10) {
      const result = { pairs: [], totalChecks, from, to, hasCategories: hasExtra, dishTypeMap: {}, v: 4, ts: new Date().toISOString() };
      if (data && saveData) { data.kv[CACHE_KEY] = JSON.stringify(result); saveData(); }
      return result;
    }
    const itemCount = {};
    const coOccur   = {};
    for (const items of orders) {
      for (const item of items) itemCount[item] = (itemCount[item] || 0) + 1;
      for (let i = 0; i < items.length; i++) {
        for (let j = i + 1; j < items.length; j++) {
          const key = [items[i], items[j]].sort().join('\x00');
          coOccur[key] = (coOccur[key] || 0) + 1;
        }
      }
    }
    const fallbackTypeMap = loadDishTypeMap(data);
    const pairs = Object.entries(coOccur)
      .filter(([, cnt]) => cnt >= 3)
      .map(([key, count]) => {
        const [a, b] = key.split('\x00');
        const support = count / totalOrders;
        const confAB  = count / (itemCount[a] || 1);
        const confBA  = count / (itemCount[b] || 1);
        const lift    = confAB / ((itemCount[b] || 1) / totalOrders);
        const score   = lift * support * Math.sqrt(count);
        const catA = dishCat[a] || '', catB = dishCat[b] || '';
        let typeA = classifyDish(a, catA), typeB = classifyDish(b, catB);
        if (typeA === 'other') typeA = fallbackTypeMap[a] || typeA;
        if (typeB === 'other') typeB = fallbackTypeMap[b] || typeB;
        const drinkSnack = (typeA === 'drink' && typeB === 'food') || (typeA === 'food' && typeB === 'drink');
        const marginA = dishMargin(a), marginB = dishMargin(b);
        const ms = [marginA, marginB].filter(m => m != null);
        const margin = ms.length ? Math.round(ms.reduce((s, m) => s + m, 0) / ms.length) : null;
        return { a, b, count, support: Math.round(support * 100), confAB: Math.round(confAB * 100), confBA: Math.round(confBA * 100), lift: Math.round(lift * 100) / 100, score, catA, catB, typeA, typeB, drinkSnack, marginA, marginB, margin };
      })
      .filter(p => p.lift > 1.05 && p.confAB >= 10)
      .sort((a, b) => b.score - a.score)
      .slice(0, 30);
    const dishTypeMap = {};
    for (const p of pairs) {
      if (p.typeA && p.typeA !== 'other') dishTypeMap[p.a] = p.typeA;
      if (p.typeB && p.typeB !== 'other') dishTypeMap[p.b] = p.typeB;
    }
    const result = { pairs, totalChecks, from, to, hasCategories: hasExtra, dishTypeMap, v: 3, ts: new Date().toISOString() };
    if (data && saveData) { data.kv[CACHE_KEY] = JSON.stringify(result); saveData(); }
    console.log(`[iiko/basket] пар найдено: ${pairs.length} (категории: ${hasExtra ? 'да' : 'нет'})`);
    return result;
  }

  // ABC-анализ продаж: DishName + DishAmountInt.
  async function getSalesABC(data, saveData) {
    const CACHE_KEY = 'sales_abc:v2';
    const CACHE_TTL = 30 * 60 * 1000;
    const MIN_ITEMS = 5;
    if (data.kv?.[CACHE_KEY]) {
      const cached = JSON.parse(data.kv[CACHE_KEY]);
      const effectiveTTL = cached.ttl || CACHE_TTL;
      if (Date.now() - cached.ts < effectiveTTL) return cached;
    }
    if (!isConfigured()) {
      throw Object.assign(new Error('iiko не настроен: задайте IIKO_URL и IIKO_LOGIN в .env'), { status: 503 });
    }
    const token = await _getToken();
    const nowMs = Date.now() + 3 * 3_600_000;
    const d0 = new Date(nowMs).toISOString().slice(0, 10);
    const d1 = new Date(nowMs - 86_400_000).toISOString().slice(0, 10);
    const d3 = new Date(nowMs - 3 * 86_400_000).toISOString().slice(0, 10);
    let { counts: dishMap, cats: dishCats } = await _fetchDishCounts(d0, d0, token);
    let periodLabel = 'сегодня', from = d0, to = d0;
    if (Object.keys(dishMap).length < MIN_ITEMS) {
      ({ counts: dishMap, cats: dishCats } = await _fetchDishCounts(d1, d1, token));
      periodLabel = 'вчера'; from = to = d1;
    }
    if (Object.keys(dishMap).length < MIN_ITEMS) {
      ({ counts: dishMap, cats: dishCats } = await _fetchDishCounts(d3, d0, token));
      periodLabel = 'за 3 дня'; from = d3; to = d0;
    }
    const dishTypeMap = {};
    for (const [name, cat] of Object.entries(dishCats || {})) {
      const t = classifyDish(name, cat);
      dishTypeMap[name] = (t === 'ambiguous') ? 'other' : t;
    }
    const sorted = Object.entries(dishMap).map(([name, count]) => ({ name, count })).sort((a, b) => b.count - a.count).slice(0, 60);
    const total = sorted.reduce((s, i) => s + i.count, 0);
    let cumSum = 0;
    for (const item of sorted) {
      cumSum += item.count;
      const pct = total > 0 ? cumSum / total : 1;
      item.abcGroup = pct <= 0.80 ? 'A' : pct <= 0.95 ? 'B' : 'C';
    }
    const marginDataRaw = data.kv?.['margin_data:v1'];
    const marginData    = marginDataRaw ? JSON.parse(marginDataRaw) : null;
    const thresholdRaw  = data.kv?.['margin_threshold:v1'];
    const threshold     = thresholdRaw ? Number(thresholdRaw) : 60;
    const autoMap = {};
    if (marginData?.hasMarginData) {
      for (const item of (marginData.items || [])) {
        if (item.margin != null) autoMap[item.name] = item.margin >= threshold;
      }
    }
    const manualRaw = Object.keys(autoMap).length === 0 ? data.kv?.['margin_items:v1'] : null;
    const manualSet = manualRaw ? new Set(JSON.parse(manualRaw)) : new Set();
    const items = sorted.map(item => {
      const isMargin = Object.keys(autoMap).length > 0 ? (autoMap[item.name] === true) : manualSet.has(item.name);
      let status;
      if (item.abcGroup === 'A')       status = 'green';
      else if (isMargin)               status = 'yellow';
      else if (item.abcGroup === 'C')  status = 'red';
      else                             status = 'grey';
      return { name: item.name, count: item.count, abcGroup: item.abcGroup, isMargin, status };
    });
    const ttlOverride = periodLabel !== 'сегодня' ? 5 * 60 * 1000 : null;
    const result = { ts: Date.now(), date: to, from, to, periodLabel, items, dishTypeMap, ttl: ttlOverride || CACHE_TTL };
    if (data && saveData) { data.kv[CACHE_KEY] = JSON.stringify(result); saveData(); }
    console.log(`[iiko/sales-abc] ${periodLabel} (${from}–${to}): ${items.length} позиций`);
    return result;
  }

  // Анализ маржинальности за 30 дней.
  async function getMarginData(data, saveData) {
    const CACHE_KEY = 'margin_data:v1';
    const CACHE_TTL = 24 * 60 * 60 * 1000;
    if (data.kv?.[CACHE_KEY]) {
      const cached = JSON.parse(data.kv[CACHE_KEY]);
      if (Date.now() - new Date(cached.ts).getTime() < CACHE_TTL) return cached;
    }
    if (!isConfigured()) {
      throw Object.assign(new Error('iiko не настроен'), { status: 503 });
    }
    const token = await _getToken();
    const nowMs = Date.now() + 3 * 3_600_000;
    const to    = new Date(nowMs).toISOString().slice(0, 10);
    const from  = new Date(nowMs - 30 * 86_400_000).toISOString().slice(0, 10);
    const olap_url = `${_url}/resto/api/v2/reports/olap?key=${token}`;
    const bodyFull = {
      reportType: 'SALES', buildSummary: 'false',
      groupByRowFields: ['DishName'],
      aggregateFields: ['DishDiscountSumInt', 'DishAmountInt', 'ProductCostBase.ProductCostBase'],
      filters: { 'OpenDate.Typed': { filterType: 'DateRange', periodType: 'CUSTOM', from, to, includeLow: true, includeHigh: true } },
    };
    let res = await fetch(olap_url, { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify(bodyFull), signal: AbortSignal.timeout(30_000) });
    if (res.status === 401) { _invalidateToken(); throw Object.assign(new Error('iiko: сессия истекла'), { status: 401 }); }
    let hasCost = true;
    if (!res.ok) {
      const t = await res.text().catch(() => '');
      if (t.includes('ProductCostBase') || t.includes('Unknown OLAP field')) {
        hasCost = false;
        console.warn('[iiko/margin] ProductCostBase не поддерживается, запрашиваем без себестоимости');
        const bodyPlain = { ...bodyFull, aggregateFields: ['DishDiscountSumInt', 'DishAmountInt'] };
        res = await fetch(olap_url, { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify(bodyPlain), signal: AbortSignal.timeout(30_000) });
        if (res.status === 401) { _invalidateToken(); throw Object.assign(new Error('iiko: сессия истекла'), { status: 401 }); }
        if (!res.ok) { const t2 = await res.text().catch(() => ''); throw new Error(`iiko margin OLAP ${res.status}: ${t2.slice(0, 200)}`); }
      } else {
        throw new Error(`iiko margin OLAP ${res.status}: ${t.slice(0, 200)}`);
      }
    }
    let json;
    try { json = await res.json(); } catch { throw new Error('iiko вернул невалидный JSON (margin)'); }
    const resultItems = [];
    for (const row of (json.data || [])) {
      const name    = (row['DishName'] || '').trim();
      const revenue = Math.round(Number(row['DishDiscountSumInt'] || 0));
      const count   = Math.round(Number(row['DishAmountInt'] || 0));
      const cost    = hasCost ? Math.round(Number(row['ProductCostBase.ProductCostBase'] || 0)) : 0;
      if (!name || revenue <= 0) continue;
      const margin = (hasCost && cost > 0) ? Math.round((revenue - cost) / revenue * 100) : null;
      resultItems.push({ name, revenue, count, cost, margin });
    }
    resultItems.sort((a, b) => {
      if (a.margin != null && b.margin != null) return b.margin - a.margin;
      if (a.margin != null) return -1;
      if (b.margin != null) return 1;
      return b.revenue - a.revenue;
    });
    const coveredCount  = resultItems.filter(i => i.margin != null).length;
    const totalCount    = resultItems.length;
    const hasMarginData = hasCost && coveredCount > 0;
    let reason;
    if (!hasCost)                       reason = 'field_unsupported';
    else if (totalCount === 0)          reason = 'no_sales';
    else if (coveredCount === 0)        reason = 'no_cost_data';
    else if (coveredCount < totalCount) reason = 'partial';
    else                                reason = 'ok';
    const result = { items: resultItems, hasMarginData, reason, coveredCount, totalCount, from, to, ts: new Date().toISOString() };
    if (data && saveData) { data.kv[CACHE_KEY] = JSON.stringify(result); saveData(); }
    console.log(`[iiko/margin] ${totalCount} позиций, маржа у ${coveredCount}, reason=${reason}`);
    return result;
  }

  // Диагностика: все уникальные пары DishName + DishCategory за 14 дней.
  async function getDishCategories(data, saveData) {
    const CACHE_KEY = 'dish_cats:v1';
    const CACHE_TTL = 2 * 60 * 60 * 1000;
    if (data?.kv?.[CACHE_KEY]) {
      const cached = JSON.parse(data.kv[CACHE_KEY]);
      if (Date.now() - new Date(cached.ts).getTime() < CACHE_TTL) return cached;
    }
    if (!isConfigured()) {
      throw Object.assign(new Error('iiko не настроен'), { status: 503 });
    }
    const token = await _getToken();
    const to   = new Date().toISOString().slice(0, 10);
    const from = new Date(Date.now() - 14 * 86_400_000).toISOString().slice(0, 10);
    const olap_url = `${_url}/resto/api/v2/reports/olap?key=${token}`;
    const body = {
      reportType: 'SALES', buildSummary: 'false',
      groupByRowFields: ['DishName', 'DishCategory'],
      aggregateFields: ['DishAmountInt'],
      filters: { 'OpenDate.Typed': { filterType: 'DateRange', periodType: 'CUSTOM', from, to, includeLow: true, includeHigh: true } },
    };
    const res = await fetch(olap_url, { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify(body), signal: AbortSignal.timeout(30_000) });
    if (res.status === 401) { _invalidateToken(); throw Object.assign(new Error('iiko: сессия истекла'), { status: 401 }); }
    if (!res.ok) {
      const t = await res.text().catch(() => '');
      if (t.includes('DishCategory') || t.includes('Unknown OLAP field')) {
        throw Object.assign(new Error('iiko не поддерживает поле DishCategory в OLAP'), { status: 422 });
      }
      throw new Error(`iiko dish-categories OLAP ${res.status}: ${t.slice(0, 200)}`);
    }
    let json; try { json = await res.json(); } catch { throw new Error('iiko вернул невалидный JSON (dish-categories)'); }
    const seen = new Set(), categories = [], distinct = new Set();
    for (const row of (json.data || [])) {
      const dish = (row['DishName'] || '').trim();
      const cat  = (row['DishCategory'] || '').trim();
      if (!dish) continue;
      const k = `${dish}\x00${cat}`;
      if (seen.has(k)) continue;
      seen.add(k);
      categories.push({ dish, cat, type: classifyCat(cat) });
      if (cat) distinct.add(cat);
    }
    categories.sort((x, y) => (x.cat || '').localeCompare(y.cat || '') || x.dish.localeCompare(y.dish));
    const result = { categories, distinctCats: [...distinct].sort(), from, to, ts: new Date().toISOString() };
    if (data && saveData) { data.kv[CACHE_KEY] = JSON.stringify(result); saveData(); }
    console.log(`[iiko/dish-cats] ${categories.length} пар dish+cat, уникальных категорий: ${distinct.size}`);
    return result;
  }

  // Продажи блюд за произвольный период — для кокпита кранов.
  async function getDishSalesCounts(from, to) {
    if (!isConfigured()) {
      throw Object.assign(new Error('iiko не настроен'), { status: 503 });
    }
    const token = await _getToken();
    const { counts, cats } = await _fetchDishCounts(from, to, token);
    return { counts, cats, from, to };
  }

  return {
    isConfigured,
    getDayRevenue,
    syncRevenue,
    syncRevenueRange,
    getBasketPairs,
    getSalesABC,
    getMarginData,
    getDishCategories,
    getDishSalesCounts,
  };
}

// ── Дефолтный клиент (back-compat для существующих роутов и scheduler) ────────
// module-функции ниже делегируют к нему — API наружу не меняется.

const _defaultClient = makeIikoClient({
  url:      (process.env.IIKO_URL || '').replace(/\/+$/, ''),
  login:    process.env.IIKO_LOGIN    || '',
  password: process.env.IIKO_PASSWORD || '',
});

module.exports = {
  makeIikoClient,
  pickDailySets,
  getDayRevenue:       (...args) => _defaultClient.getDayRevenue(...args),
  syncRevenue:         (...args) => _defaultClient.syncRevenue(...args),
  syncRevenueRange:    (...args) => _defaultClient.syncRevenueRange(...args),
  getBasketPairs:      (...args) => _defaultClient.getBasketPairs(...args),
  getSalesABC:         (...args) => _defaultClient.getSalesABC(...args),
  getMarginData:       (...args) => _defaultClient.getMarginData(...args),
  getDishCategories:   (...args) => _defaultClient.getDishCategories(...args),
  getDishSalesCounts:  (...args) => _defaultClient.getDishSalesCounts(...args),
};
