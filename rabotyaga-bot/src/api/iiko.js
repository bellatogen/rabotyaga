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

let _token       = null;
let _tokenExpiry = 0;

function sha1(str) {
  return crypto.createHash('sha1').update(str).digest('hex');
}

async function getToken() {
  if (_token && Date.now() < _tokenExpiry) return _token;
  const url = `${IIKO_URL}/resto/api/auth?login=${encodeURIComponent(IIKO_LOGIN)}&pass=${sha1(IIKO_PASSWORD)}`;
  const res = await fetch(url, { signal: AbortSignal.timeout(8000) });
  if (!res.ok) throw new Error(`iiko авторизация: HTTP ${res.status}`);
  const text = (await res.text()).trim().replace(/^"|"$/g, '');
  if (!text || text.length < 8) throw new Error('iiko вернул пустой токен');
  _token       = text;
  _tokenExpiry = Date.now() + 50 * 60 * 1000;
  console.log('[iiko] токен получен');
  return _token;
}

function invalidateToken() { _token = null; _tokenExpiry = 0; }

// Внутренний запрос OLAP за один день. Возвращает сумму в рублях.
async function fetchOlapForDate(date, token) {
  const body = {
    reportType: 'SALES', buildSummary: 'false',
    groupByRowFields: ['OpenDate.Typed'],
    aggregateFields: ['DishDiscountSumInt'],
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
  if (!res.ok) { const t = await res.text().catch(()=>''); throw new Error(`iiko OLAP HTTP ${res.status}: ${t.slice(0,200)}`); }
  const json = await res.json();
  // В этой версии iiko DishDiscountSumInt = итоговая сумма по чекам
  let sum = 0;
  for (const row of (json.data || [])) sum += Number(row.DishDiscountSumInt || 0);
  return Math.round(sum);
}

// Получить выручку за один день. Если переданы data+saveData — сохраняет в revenue:v1,
// включая запрос за аналогичный день прошлого года (YoY).
async function getDayRevenue(date, data, saveData) {
  if (!IIKO_URL || !IIKO_LOGIN) {
    throw Object.assign(new Error('iiko не настроен: задайте IIKO_URL и IIKO_LOGIN в .env'), { status: 503 });
  }

  const token = await getToken();
  const fact  = await fetchOlapForDate(date, token);
  console.log(`[iiko] выручка за ${date}: ${fact} ₽`);

  let lastYear = null;

  if (data && saveData) {
    const revenue = JSON.parse(data.kv?.['revenue:v1'] || '{}');
    if (!revenue[date]) revenue[date] = {};
    if (fact > 0) revenue[date].fact = fact;

    // YoY — тот же день, прошлый год
    try {
      const lyDate = new Date(date + 'T00:00:00');
      lyDate.setFullYear(lyDate.getFullYear() - 1);
      const lyStr = lyDate.toISOString().slice(0, 10);
      const lyFact = await fetchOlapForDate(lyStr, token);
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

  return { fact, lastYear };
}

// Синхронизация выручки за текущий месяц — для кнопки в админке
async function syncRevenue(data, saveData) {
  if (!IIKO_URL || !IIKO_LOGIN) {
    throw Object.assign(new Error('iiko не настроен: задайте IIKO_URL и IIKO_LOGIN в .env'), { status: 503 });
  }

  const now  = new Date();
  const from = `${now.getFullYear()}-${String(now.getMonth()+1).padStart(2,'0')}-01`;
  const to   = now.toISOString().slice(0, 10);

  const token = await getToken();
  const body = {
    reportType: 'SALES', buildSummary: 'false',
    groupByRowFields: ['OpenDate.Typed'],
    aggregateFields: ['DishDiscountSumInt'],
    filters: { 'OpenDate.Typed': { filterType:'DateRange', periodType:'CUSTOM', from, to, includeLow:true, includeHigh:true } },
  };

  const url = `${IIKO_URL}/resto/api/v2/reports/olap?key=${token}`;
  const res = await fetch(url, {
    method: 'POST', headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify(body), signal: AbortSignal.timeout(20000),
  });
  if (res.status === 401) { invalidateToken(); throw Object.assign(new Error('iiko: сессия истекла'), { status: 401 }); }
  if (!res.ok) { const t = await res.text(); throw new Error(`iiko OLAP ${res.status}: ${t.slice(0,200)}`); }

  const json = await res.json();
  const revenue = JSON.parse(data.kv['revenue:v1'] || '{}');
  let updated = 0;

  for (const row of (json.data || [])) {
    const iso  = String(row['OpenDate.Typed'] || '').slice(0, 10);
    if (!iso) continue;
    const fact = Math.round(Number(row.DishDiscountSumInt || 0));
    if (fact > 0) {
      if (!revenue[iso]) revenue[iso] = {};
      revenue[iso].fact = fact;
      updated++;
    }
  }

  data.kv['revenue:v1'] = JSON.stringify(revenue);
  saveData();
  console.log(`[iiko] syncRevenue: обновлено ${updated} дней (${from}–${to})`);
  return { updated, from, to };
}

module.exports = { getDayRevenue, syncRevenue };
