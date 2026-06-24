// Адаптер к iikoServer REST API — получение факта выручки за день.
// Переменные окружения:
//   IIKO_URL      — базовый URL сервера, напр. https://pivnaya-karta.iiko.it
//   IIKO_LOGIN    — логин пользователя iiko
//   IIKO_PASSWORD — пароль (SHA-1 при авторизации)
// Если переменные не заданы — маршрут /api/iiko/revenue вернёт 503.

const crypto = require('crypto');

const IIKO_URL      = (process.env.IIKO_URL      || '').replace(/\/+$/, '');
const IIKO_LOGIN    =  process.env.IIKO_LOGIN    || '';
const IIKO_PASSWORD =  process.env.IIKO_PASSWORD || '';

let _token        = null;
let _tokenExpiry  = 0;
let _tokenPromise = null; // защита от гонки при параллельных вызовах

function sha1(str) {
  return crypto.createHash('sha1').update(str).digest('hex');
}

// ── Классификация категории блюда iiko → напиток / закуска / прочее ──
// Правило сэтов: пара показывается только если это напиток + закуска.
// Сопоставление по ключевым словам в названии категории (регистронезависимо).
const DRINK_RE = /бар|напит|пиво|пив\b|пенн|коктейл|вино|виск|ром\b|водк|лимонад|\bчай|кофе|сидр|\bэль|лагер|безалког|морс|\bсок|тоник|джин|текил|ликёр|ликер|\bшот|настойк|drink/i;
const FOOD_RE  = /кухн|закус|\bеда|бургер|пицц|салат|снэк|снек|тапас|гриль|горяч|блюд|паст\b|\bсыр|мяс|\bфри|начос|сухар|food|стартер|основ|десерт|десерт|брускет|сэндвич|сендвич|хот-?дог/i;

function classifyCat(cat) {
  if (!cat) return 'other';
  const c = String(cat).toLowerCase();
  if (DRINK_RE.test(c)) return 'drink';
  if (FOOD_RE.test(c))  return 'food';
  return 'other';
}

async function getToken() {
  if (_token && Date.now() < _tokenExpiry) return _token;
  // Один Promise на всех: параллельные вызовы ждут один fetch вместо N
  if (_tokenPromise) return _tokenPromise;
  _tokenPromise = (async () => {
    try {
      const url = `${IIKO_URL}/resto/api/auth?login=${encodeURIComponent(IIKO_LOGIN)}&pass=${sha1(IIKO_PASSWORD)}`;
      const res = await fetch(url, { signal: AbortSignal.timeout(8000) });
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

function invalidateToken() { _token = null; _tokenExpiry = 0; }

// Внутренний запрос OLAP за один день.
// Возвращает { fact, guests } — выручка + кол-во гостей.
// guests может быть 0 если iiko не вернул поле GuestNum.
async function fetchOlapForDate(date, token) {
  const body = {
    reportType: 'SALES', buildSummary: 'false',
    groupByRowFields: ['OpenDate.Typed'],
    // GuestNum — кол-во персон в заказе; может отсутствовать в старых версиях iiko
    aggregateFields: ['DishDiscountSumInt', 'GuestNum'],
    filters: {
      'OpenDate.Typed': {
        filterType: 'DateRange', periodType: 'CUSTOM',
        from: date, to: date, includeLow: true, includeHigh: true,
      },
    },
  };
  const url = `${IIKO_URL}/resto/api/v2/reports/olap?key=${token}`;
  const res = await fetch(url, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify(body),
    signal: AbortSignal.timeout(15000),
  });
  if (res.status === 401) { invalidateToken(); throw Object.assign(new Error('iiko: сессия истекла'), { status: 401 }); }
  if (!res.ok) {
    const t = await res.text().catch(()=>'');
    // Если GuestNum неизвестен — повторяем без него
    // Проверяем что именно это поле GuestNum неизвестно (а не другое)
    if (t.includes('GuestNum') || t.includes('Unknown OLAP field')) {
      console.warn('[iiko] GuestNum не поддерживается, запрашиваем только выручку');
      return fetchOlapRevenueOnly(date, token);
    }
    throw new Error(`iiko OLAP HTTP ${res.status}: ${t.slice(0,200)}`);
  }
  const json = await res.json();
  let fact = 0, guests = 0;
  for (const row of (json.data || [])) {
    fact   += Number(row.DishDiscountSumInt || 0);
    guests += Number(row.GuestNum           || 0);
  }
  return { fact: Math.round(fact), guests };
}

// Запрос только выручки (fallback если GuestNum не поддерживается)
async function fetchOlapRevenueOnly(date, token) {
  const body = {
    reportType: 'SALES', buildSummary: 'false',
    groupByRowFields: ['OpenDate.Typed'],
    aggregateFields: ['DishDiscountSumInt'],
    filters: { 'OpenDate.Typed': { filterType:'DateRange', periodType:'CUSTOM', from:date, to:date, includeLow:true, includeHigh:true } },
  };
  const url = `${IIKO_URL}/resto/api/v2/reports/olap?key=${token}`;
  const res = await fetch(url, { method:'POST', headers:{'Content-Type':'application/json'}, body:JSON.stringify(body), signal:AbortSignal.timeout(15000) });
  if (res.status === 401) { invalidateToken(); throw Object.assign(new Error('iiko: сессия истекла'), { status: 401 }); }
  if (!res.ok) { const t = await res.text().catch(()=>''); throw new Error(`iiko OLAP ${res.status}: ${t.slice(0,200)}`); }
  let json;
  try { json = await res.json(); } catch { throw new Error('iiko вернул невалидный JSON (fallback)'); }
  let fact = 0;
  for (const row of (json.data || [])) fact += Number(row.DishDiscountSumInt || 0);
  return { fact: Math.round(fact), guests: 0 };
}

// Получить выручку за один день. Если переданы data+saveData — сохраняет в revenue:v1,
// включая запрос за аналогичный день прошлого года (YoY).
async function getDayRevenue(date, data, saveData) {
  if (!IIKO_URL || !IIKO_LOGIN) {
    throw Object.assign(new Error('iiko не настроен: задайте IIKO_URL и IIKO_LOGIN в .env'), { status: 503 });
  }

  const token = await getToken();
  const { fact, guests } = await fetchOlapForDate(date, token);
  console.log(`[iiko] выручка за ${date}: ${fact} ₽, гостей: ${guests}`);

  let lastYear = null;

  if (data && saveData) {
    const revenue = JSON.parse(data.kv?.['revenue:v1'] || '{}');
    if (!revenue[date]) revenue[date] = {};
    if (fact > 0)   revenue[date].fact   = fact;
    if (guests > 0) revenue[date].guests = guests;
    // Средний чек
    if (fact > 0 && guests > 0) revenue[date].avgCheck = Math.round(fact / guests);

    // YoY — тот же день, прошлый год
    try {
      const lyDate = new Date(date + 'T00:00:00');
      lyDate.setFullYear(lyDate.getFullYear() - 1);
      const lyStr = lyDate.toISOString().slice(0, 10);
      const { fact: lyFact } = await fetchOlapForDate(lyStr, token);
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

// Синхронизация выручки за текущий месяц — обёртка для кнопки в админке
async function syncRevenue(data, saveData) {
  const now  = new Date();
  const from = `${now.getFullYear()}-${String(now.getMonth()+1).padStart(2,'0')}-01`;
  const to   = now.toISOString().slice(0, 10);
  return syncRevenueRange(from, to, data, saveData);
}

// ── Универсальный диапазонный sync выручки (основной + fallback) ──────────────
// Используется как обычным syncRevenue (текущий месяц), так и backfill (с января).
// timeout увеличен до 60с для широких диапазонов.
async function syncRevenueRange(from, to, data, saveData) {
  if (!IIKO_URL || !IIKO_LOGIN) {
    throw Object.assign(new Error('iiko не настроен: задайте IIKO_URL и IIKO_LOGIN в .env'), { status: 503 });
  }
  const token = await getToken();

  // Запрос с GuestNum (полная версия)
  const bodyFull = {
    reportType: 'SALES', buildSummary: 'false',
    groupByRowFields: ['OpenDate.Typed'],
    aggregateFields: ['DishDiscountSumInt', 'GuestNum'],
    filters: { 'OpenDate.Typed': { filterType:'DateRange', periodType:'CUSTOM', from, to, includeLow:true, includeHigh:true } },
  };
  const url = `${IIKO_URL}/resto/api/v2/reports/olap?key=${token}`;
  let res = await fetch(url, {
    method: 'POST', headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify(bodyFull), signal: AbortSignal.timeout(60_000),
  });

  let useGuests = true;
  if (res.status === 401) { invalidateToken(); throw Object.assign(new Error('iiko: сессия истекла'), { status: 401 }); }
  if (!res.ok) {
    const t = await res.text().catch(() => '');
    if (t.includes('GuestNum') || t.includes('Unknown OLAP field')) {
      // Fallback — без GuestNum
      console.warn('[iiko/range] GuestNum не поддерживается, запрашиваем только выручку');
      useGuests = false;
      const bodyPlain = { ...bodyFull, aggregateFields: ['DishDiscountSumInt'] };
      res = await fetch(url, {
        method: 'POST', headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(bodyPlain), signal: AbortSignal.timeout(60_000),
      });
      if (res.status === 401) { invalidateToken(); throw Object.assign(new Error('iiko: сессия истекла'), { status: 401 }); }
      if (!res.ok) { const t2 = await res.text().catch(() => ''); throw new Error(`iiko OLAP ${res.status}: ${t2.slice(0,200)}`); }
    } else {
      throw new Error(`iiko OLAP ${res.status}: ${t.slice(0,200)}`);
    }
  }

  let json;
  try { json = await res.json(); } catch { throw new Error('iiko syncRevenueRange вернул невалидный JSON'); }

  const revenue = JSON.parse(data.kv['revenue:v1'] || '{}');
  let updated = 0;
  for (const row of (json.data || [])) {
    const iso    = String(row['OpenDate.Typed'] || '').slice(0, 10);
    if (!iso) continue;
    const fact   = Math.round(Number(row.DishDiscountSumInt || 0));
    const guests = useGuests ? Math.round(Number(row.GuestNum || 0)) : 0;
    if (fact > 0) {
      if (!revenue[iso]) revenue[iso] = {};
      revenue[iso].fact = fact;
      if (guests > 0) {
        revenue[iso].guests   = guests;
        revenue[iso].avgCheck = Math.round(fact / guests);
      }
      updated++;
    }
  }
  data.kv['revenue:v1'] = JSON.stringify(revenue);
  saveData();
  console.log(`[iiko] syncRevenueRange: обновлено ${updated} дней (${from}–${to})`);
  return { updated, from, to };
}

// Fallback для syncRevenue: только выручка без GuestNum (legacy, оставлен для совместимости)
async function syncRevenueRevenueOnly(data, saveData) {
  const now  = new Date();
  const from = `${now.getFullYear()}-${String(now.getMonth()+1).padStart(2,'0')}-01`;
  const to   = now.toISOString().slice(0, 10);
  return syncRevenueRange(from, to, data, saveData);
}

// Анализ корзины (маркет баскет) — пары блюд, которые часто берут вместе.
// Результат кэшируется в KV (обновляется раз в 20 часов).
async function getBasketPairs(data, saveData) {
  // Проверяем кэш
  const CACHE_KEY = 'basket:pairs:v1';
  const cached = data.kv?.[CACHE_KEY];
  if (cached) {
    const parsed = JSON.parse(cached);
    const ageH = (Date.now() - new Date(parsed.ts).getTime()) / 3_600_000;
    // v<2 — старая схема без категорий/маржи, пересчитываем
    if (ageH < 20 && parsed.v === 2) return parsed;
  }

  if (!IIKO_URL || !IIKO_LOGIN) {
    throw Object.assign(new Error('iiko не настроен'), { status: 503 });
  }

  const token = await getToken();

  const to   = new Date().toISOString().slice(0, 10);
  const from = new Date(Date.now() - 14 * 86_400_000).toISOString().slice(0, 10);

  // Запрашиваем: каждый чек (фискальный номер) с перечнем блюд
  // FiscalChequeNumber — группируемое поле, уникально идентифицирует чек
  // (UniqOrderId не группируем: Grouping is not allowed)
  const url = `${IIKO_URL}/resto/api/v2/reports/olap?key=${token}`;
  // Полный запрос: + категория блюда (правило «напиток+закуска») и
  // выручка/себестоимость (расчёт маржи). На старых версиях iiko этих полей
  // может не быть — тогда откат к базовому запросу без категорий и маржи.
  const baseGroup = ['OpenDate.Typed', 'FiscalChequeNumber', 'DishName'];
  const bodyFull = {
    reportType: 'SALES', buildSummary: 'false',
    groupByRowFields: [...baseGroup, 'DishCategory'],
    aggregateFields: ['DishAmountInt', 'DishDiscountSumInt', 'ProductCostBase.ProductCostBase'],
    filters: { 'OpenDate.Typed': { filterType:'DateRange', periodType:'CUSTOM', from, to, includeLow:true, includeHigh:true } },
  };
  const postOlap = b => fetch(url, {
    method: 'POST', headers: {'Content-Type':'application/json'},
    body: JSON.stringify(b), signal: AbortSignal.timeout(30_000),
  });

  let res = await postOlap(bodyFull);
  let hasExtra = true; // есть ли категория + маржа в ответе
  if (res.status === 401) { invalidateToken(); throw Object.assign(new Error('iiko: сессия истекла'), { status: 401 }); }
  if (!res.ok) {
    const t = await res.text().catch(() => '');
    if (t.includes('DishCategory') || t.includes('ProductCostBase') || t.includes('Unknown OLAP field')) {
      console.warn('[iiko/basket] категория/себестоимость не поддерживаются — базовый запрос');
      hasExtra = false;
      res = await postOlap({ ...bodyFull, groupByRowFields: baseGroup, aggregateFields: ['DishAmountInt'] });
      if (res.status === 401) { invalidateToken(); throw Object.assign(new Error('iiko: сессия истекла'), { status: 401 }); }
      if (!res.ok) { const t2 = await res.text().catch(() => ''); throw new Error(`iiko basket OLAP ${res.status}: ${t2.slice(0,200)}`); }
    } else {
      throw new Error(`iiko basket OLAP ${res.status}: ${t.slice(0,200)}`);
    }
  }

  const json = await res.json();
  const rows = json.data || [];
  console.log(`[iiko/basket] строк из iiko: ${rows.length}, период: ${from}–${to}`);

  // Строим map: orderId → Set<dishes>; попутно — категория/выручка/себестоимость по блюду
  const orderItems = {};
  const dishCat  = {};   // dish → сырое имя категории
  const dishRev  = {};   // dish → суммарная выручка за период
  const dishCost = {};   // dish → суммарная себестоимость за период
  for (const row of rows) {
    // Чек ID = дата + фискальный номер (вместе уникальны)
    const date    = String(row['OpenDate.Typed']      || '').slice(0, 10);
    const cheque  = String(row['FiscalChequeNumber']  || '').trim();
    // FiscalChequeNumber в iiko сбрасывается ежедневно (1,2,3,…) —
    // уникальность обеспечивается только в паре с датой.
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

  // Маржа по блюду, %: (выручка − себестоимость) / выручка. null — нет данных о себестоимости.
  const dishMargin = dish => {
    const rev = dishRev[dish] || 0, cost = dishCost[dish] || 0;
    if (rev <= 0 || cost <= 0) return null;
    return Math.round((rev - cost) / rev * 100);
  };

  const orders = Object.values(orderItems).map(s => [...s]).filter(arr => arr.length >= 2);
  const totalOrders  = orders.length;
  const totalChecks  = Object.keys(orderItems).length;
  console.log(`[iiko/basket] чеков: ${totalChecks}, чеков с 2+ блюдами: ${totalOrders}`);

  if (totalOrders < 10) {
    // Кэшируем даже пустой результат — иначе каждый вызов без данных бьёт в iiko.
    // Пользователь может сбросить кэш кнопкой «Обновить» (force=1).
    const result = { pairs: [], totalChecks, from, to, hasCategories: hasExtra, v: 2, ts: new Date().toISOString() };
    if (data && saveData) { data.kv[CACHE_KEY] = JSON.stringify(result); saveData(); }
    return result;
  }

  // Ко-оккуррентность
  const itemCount   = {};
  const coOccur     = {};

  for (const items of orders) {
    for (const item of items) itemCount[item] = (itemCount[item] || 0) + 1;
    for (let i = 0; i < items.length; i++) {
      for (let j = i + 1; j < items.length; j++) {
        const key = [items[i], items[j]].sort().join('\x00');
        coOccur[key] = (coOccur[key] || 0) + 1;
      }
    }
  }

  // Ассоциативные правила: support, confidence, lift
  const pairs = Object.entries(coOccur)
    .filter(([, cnt]) => cnt >= 3)
    .map(([key, count]) => {
      const [a, b] = key.split('\x00');
      const support = count / totalOrders;
      const confAB  = count / (itemCount[a] || 1);
      const confBA  = count / (itemCount[b] || 1);
      const lift    = confAB / ((itemCount[b] || 1) / totalOrders);
      const score   = lift * support * Math.sqrt(count);
      // Категории + маржа для правила «напиток+закуска» и ранжирования
      const catA = dishCat[a] || '', catB = dishCat[b] || '';
      const typeA = classifyCat(catA), typeB = classifyCat(catB);
      const drinkSnack = (typeA === 'drink' && typeB === 'food') ||
                         (typeA === 'food'  && typeB === 'drink');
      const marginA = dishMargin(a), marginB = dishMargin(b);
      const ms = [marginA, marginB].filter(m => m != null);
      const margin = ms.length ? Math.round(ms.reduce((s, m) => s + m, 0) / ms.length) : null;
      return {
        a, b, count,
        support:  Math.round(support * 100),
        confAB:   Math.round(confAB  * 100),
        confBA:   Math.round(confBA  * 100),
        lift:     Math.round(lift    * 100) / 100,
        score,
        catA, catB, typeA, typeB, drinkSnack,
        marginA, marginB, margin,
      };
    })
    .filter(p => p.lift > 1.05 && p.confAB >= 10)
    .sort((a, b) => b.score - a.score)
    .slice(0, 30);

  // totalChecks — полное кол-во чеков за период (для UI); totalOrders — только чеки с 2+ блюдами (для алгоритма)
  const result = { pairs, totalChecks, from, to, hasCategories: hasExtra, v: 2, ts: new Date().toISOString() };
  if (data && saveData) { data.kv[CACHE_KEY] = JSON.stringify(result); saveData(); }
  console.log(`[iiko/basket] пар найдено: ${pairs.length} (категории: ${hasExtra ? 'да' : 'нет'})`);
  return result;
}

// Топ-N сэтов дня из результата getBasketPairs:
// только напиток+закуска, приоритет по марже, затем по score.
// Если категорий нет (старый iiko) — берём общий список пар.
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

// Анализ маржинальности за 30 дней по всем блюдам.
// Использует ProductCostBase.ProductCostBase (себестоимость); fallback — без маржи (только выручка/кол-во)
async function getMarginData(data, saveData) {
  const CACHE_KEY = 'margin_data:v1';
  const CACHE_TTL = 24 * 60 * 60 * 1000; // 24 часа

  if (data.kv?.[CACHE_KEY]) {
    const cached = JSON.parse(data.kv[CACHE_KEY]);
    if (Date.now() - new Date(cached.ts).getTime() < CACHE_TTL) return cached;
  }

  if (!IIKO_URL || !IIKO_LOGIN) {
    throw Object.assign(new Error('iiko не настроен'), { status: 503 });
  }

  const token = await getToken();
  const nowMs = Date.now() + 3 * 3_600_000; // UTC+3
  const to    = new Date(nowMs).toISOString().slice(0, 10);
  const from  = new Date(nowMs - 30 * 86_400_000).toISOString().slice(0, 10);

  const url = `${IIKO_URL}/resto/api/v2/reports/olap?key=${token}`;

  // Пробуем с себестоимостью
  const bodyFull = {
    reportType: 'SALES', buildSummary: 'false',
    groupByRowFields: ['DishName'],
    aggregateFields: ['DishDiscountSumInt', 'DishAmountInt', 'ProductCostBase.ProductCostBase'],
    filters: {
      'OpenDate.Typed': { filterType:'DateRange', periodType:'CUSTOM', from, to, includeLow:true, includeHigh:true },
    },
  };

  let res = await fetch(url, {
    method: 'POST', headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify(bodyFull), signal: AbortSignal.timeout(30_000),
  });
  if (res.status === 401) { invalidateToken(); throw Object.assign(new Error('iiko: сессия истекла'), { status: 401 }); }

  let hasCost = true;
  if (!res.ok) {
    const t = await res.text().catch(() => '');
    if (t.includes('ProductCostBase') || t.includes('Unknown OLAP field')) {
      hasCost = false;
      console.warn('[iiko/margin] ProductCostBase не поддерживается, запрашиваем без себестоимости');
      const bodyPlain = { ...bodyFull, aggregateFields: ['DishDiscountSumInt', 'DishAmountInt'] };
      res = await fetch(url, {
        method: 'POST', headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(bodyPlain), signal: AbortSignal.timeout(30_000),
      });
      if (res.status === 401) { invalidateToken(); throw Object.assign(new Error('iiko: сессия истекла'), { status: 401 }); }
      if (!res.ok) { const t2 = await res.text().catch(() => ''); throw new Error(`iiko margin OLAP ${res.status}: ${t2.slice(0,200)}`); }
    } else {
      throw new Error(`iiko margin OLAP ${res.status}: ${t.slice(0, 200)}`);
    }
  }

  let json;
  try { json = await res.json(); } catch { throw new Error('iiko вернул невалидный JSON (margin)'); }

  const items = [];
  for (const row of (json.data || [])) {
    const name    = (row['DishName'] || '').trim();
    const revenue = Math.round(Number(row['DishDiscountSumInt'] || 0));
    const count   = Math.round(Number(row['DishAmountInt'] || 0));
    const cost    = hasCost ? Math.round(Number(row['ProductCostBase.ProductCostBase'] || 0)) : 0;
    if (!name || revenue <= 0) continue;
    const margin  = (hasCost && cost > 0) ? Math.round((revenue - cost) / revenue * 100) : null;
    items.push({ name, revenue, count, cost, margin });
  }

  // Сортировка: сначала по марже убывание, затем по выручке
  items.sort((a, b) => {
    if (a.margin != null && b.margin != null) return b.margin - a.margin;
    if (a.margin != null) return -1;
    if (b.margin != null) return 1;
    return b.revenue - a.revenue;
  });

  const hasMarginData = hasCost && items.some(i => i.margin != null);
  const result = { items, hasMarginData, from, to, ts: new Date().toISOString() };
  if (data && saveData) { data.kv[CACHE_KEY] = JSON.stringify(result); saveData(); }
  console.log(`[iiko/margin] ${items.length} позиций, маржа: ${hasMarginData ? 'есть' : 'нет (себестоимость iiko не предаёт)'}`);
  return result;
}

// Вспомогательная функция: OLAP-запрос количества блюд за период
async function fetchDishCounts(from, to, token) {
  const body = {
    reportType: 'SALES', buildSummary: 'false',
    groupByRowFields: ['DishName'],
    aggregateFields: ['DishAmountInt'],
    filters: {
      'OpenDate.Typed': { filterType:'DateRange', periodType:'CUSTOM', from, to, includeLow:true, includeHigh:true },
    },
  };
  const url = `${IIKO_URL}/resto/api/v2/reports/olap?key=${token}`;
  const res = await fetch(url, {
    method: 'POST', headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify(body), signal: AbortSignal.timeout(15_000),
  });
  if (res.status === 401) { invalidateToken(); throw Object.assign(new Error('iiko: сессия истекла'), { status: 401 }); }
  if (!res.ok) { const t = await res.text().catch(() => ''); throw new Error(`iiko OLAP ${res.status}: ${t.slice(0, 200)}`); }
  let json; try { json = await res.json(); } catch { throw new Error('iiko вернул невалидный JSON (sales-abc)'); }
  const map = {};
  for (const row of (json.data || [])) {
    const name  = (row['DishName'] || '').trim();
    const count = Math.round(Number(row['DishAmountInt'] || 0));
    if (!name || count <= 0) continue;
    map[name] = (map[name] || 0) + count;
  }
  return map;
}

// ABC-анализ продаж: DishName + DishAmountInt.
// Fallback: сегодня → вчера → последние 3 дня (если < MIN_ITEMS позиций).
// isMargin из margin_data:v1 (авто) или margin_items:v1 (ручной fallback).
async function getSalesABC(data, saveData) {
  const CACHE_KEY = 'sales_abc:v1';
  const CACHE_TTL = 30 * 60 * 1000; // 30 минут
  const MIN_ITEMS = 5; // минимум позиций для показа сот

  if (data.kv?.[CACHE_KEY]) {
    const cached = JSON.parse(data.kv[CACHE_KEY]);
    const effectiveTTL = cached.ttl || CACHE_TTL;
    if (Date.now() - cached.ts < effectiveTTL) return cached;
  }

  if (!IIKO_URL || !IIKO_LOGIN) {
    throw Object.assign(new Error('iiko не настроен: задайте IIKO_URL и IIKO_LOGIN в .env'), { status: 503 });
  }

  const token  = await getToken();
  const nowMs  = Date.now() + 3 * 3_600_000; // UTC+3
  const d0     = new Date(nowMs).toISOString().slice(0, 10);                   // сегодня
  const d1     = new Date(nowMs - 86_400_000).toISOString().slice(0, 10);     // вчера
  const d3     = new Date(nowMs - 3 * 86_400_000).toISOString().slice(0, 10); // 3 дня назад

  // Сегодня
  let dishMap     = await fetchDishCounts(d0, d0, token);
  let periodLabel = 'сегодня';
  let from = d0, to = d0;

  // Если мало данных — вчера
  if (Object.keys(dishMap).length < MIN_ITEMS) {
    dishMap     = await fetchDishCounts(d1, d1, token);
    periodLabel = 'вчера';
    from = to   = d1;
  }

  // Если мало — последние 3 дня
  if (Object.keys(dishMap).length < MIN_ITEMS) {
    dishMap     = await fetchDishCounts(d3, d0, token);
    periodLabel = 'за 3 дня';
    from = d3; to = d0;
  }

  // Сортируем по убыванию продаж для ABC
  const sorted = Object.entries(dishMap)
    .map(([name, count]) => ({ name, count }))
    .sort((a, b) => b.count - a.count)
    .slice(0, 60); // показываем не более 60 позиций

  // ABC по кумулятивной доле: A — до 80%, B — до 95%, C — остальные
  const total = sorted.reduce((s, i) => s + i.count, 0);
  let cumSum = 0;
  for (const item of sorted) {
    cumSum += item.count;
    const pct = total > 0 ? cumSum / total : 1;
    item.abcGroup = pct <= 0.80 ? 'A' : pct <= 0.95 ? 'B' : 'C';
  }

  // Маржинальность: сначала авто-данные из margin_data:v1, затем ручный список margin_items:v1
  const marginDataRaw   = data.kv?.['margin_data:v1'];
  const marginData      = marginDataRaw ? JSON.parse(marginDataRaw) : null;
  const thresholdRaw    = data.kv?.['margin_threshold:v1'];
  const threshold       = thresholdRaw ? Number(thresholdRaw) : 60;

  // Бнаружаем autoMap: name → true/false если есть данные о марже
  const autoMap = {};
  if (marginData?.hasMarginData) {
    for (const item of (marginData.items || [])) {
      if (item.margin != null) autoMap[item.name] = item.margin >= threshold;
    }
  }

  // Fallback: если авто-данных нет — ручной список
  const manualRaw = Object.keys(autoMap).length === 0 ? data.kv?.['margin_items:v1'] : null;
  const manualSet = manualRaw ? new Set(JSON.parse(manualRaw)) : new Set();

  // Статус для фронта
  // green  = группа A (лидеры)
  // yellow = маржинальная позиция НЕ в группе A (нужно продавать активнее)
  // red    = группа C, не маржинальная (застой)
  // grey   = группа B, не маржинальная (середнячок)
  const items = sorted.map(item => {
    const isMargin = Object.keys(autoMap).length > 0
      ? (autoMap[item.name] === true)
      : manualSet.has(item.name);
    let status;
    if (item.abcGroup === 'A')  status = 'green';
    else if (isMargin)          status = 'yellow';
    else if (item.abcGroup === 'C') status = 'red';
    else                        status = 'grey';
    return { name: item.name, count: item.count, abcGroup: item.abcGroup, isMargin, status };
  });

  // Если данные не за сегодня — сокращаем TTL до 5 мин, чтобы не пропустить открытие смены
  const ttlOverride = periodLabel !== 'сегодня' ? 5 * 60 * 1000 : null;
  const result = { ts: Date.now(), date: to, from, to, periodLabel, items, ttl: ttlOverride || CACHE_TTL };
  if (data && saveData) { data.kv[CACHE_KEY] = JSON.stringify(result); saveData(); }
  console.log(`[iiko/sales-abc] ${periodLabel} (${from}–${to}): ${items.length} позиций (A:${items.filter(i=>i.abcGroup==='A').length}, B:${items.filter(i=>i.abcGroup==='B').length}, C:${items.filter(i=>i.abcGroup==='C').length})`);
  return result;
}

module.exports = { getDayRevenue, syncRevenue, syncRevenueRange, getBasketPairs, getSalesABC, getMarginData };
