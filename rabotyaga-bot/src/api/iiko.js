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
    if (ageH < 20) return parsed;
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
  const body = {
    reportType: 'SALES', buildSummary: 'false',
    groupByRowFields: ['OpenDate.Typed', 'FiscalChequeNumber', 'DishName'],
    aggregateFields: ['DishAmountInt'],
    filters: { 'OpenDate.Typed': { filterType:'DateRange', periodType:'CUSTOM', from, to, includeLow:true, includeHigh:true } },
  };

  const url = `${IIKO_URL}/resto/api/v2/reports/olap?key=${token}`;
  const res = await fetch(url, {
    method: 'POST', headers: {'Content-Type':'application/json'},
    body: JSON.stringify(body), signal: AbortSignal.timeout(30_000),
  });
  if (res.status === 401) { invalidateToken(); throw Object.assign(new Error('iiko: сессия истекла'), { status: 401 }); }
  if (!res.ok) { const t = await res.text(); throw new Error(`iiko basket OLAP ${res.status}: ${t.slice(0,200)}`); }

  const json = await res.json();
  const rows = json.data || [];
  console.log(`[iiko/basket] строк из iiko: ${rows.length}, период: ${from}–${to}`);

  // Строим map: orderId → Set<dishes>
  const orderItems = {};
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
  }

  const orders = Object.values(orderItems).map(s => [...s]).filter(arr => arr.length >= 2);
  const totalOrders  = orders.length;
  const totalChecks  = Object.keys(orderItems).length;
  console.log(`[iiko/basket] чеков: ${totalChecks}, чеков с 2+ блюдами: ${totalOrders}`);

  if (totalOrders < 10) {
    // Кэшируем даже пустой результат — иначе каждый вызов без данных бьёт в iiko.
    // Пользователь может сбросить кэш кнопкой «Обновить» (force=1).
    const result = { pairs: [], totalChecks, from, to, ts: new Date().toISOString() };
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
      return {
        a, b, count,
        support:  Math.round(support * 100),
        confAB:   Math.round(confAB  * 100),
        confBA:   Math.round(confBA  * 100),
        lift:     Math.round(lift    * 100) / 100,
        score,
      };
    })
    .filter(p => p.lift > 1.05 && p.confAB >= 10)
    .sort((a, b) => b.score - a.score)
    .slice(0, 30);

  // totalChecks — полное кол-во чеков за период (для UI); totalOrders — только чеки с 2+ блюдами (для алгоритма)
  const result = { pairs, totalChecks, from, to, ts: new Date().toISOString() };
  if (data && saveData) { data.kv[CACHE_KEY] = JSON.stringify(result); saveData(); }
  console.log(`[iiko/basket] пар найдено: ${pairs.length}`);
  return result;
}

module.exports = { getDayRevenue, syncRevenue, syncRevenueRange, getBasketPairs };
