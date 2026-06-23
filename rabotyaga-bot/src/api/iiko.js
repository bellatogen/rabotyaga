// Адаптер к iikoServer REST API — получение факта выручки за день.
// Переменные окружения:
//   IIKO_URL      — базовый URL сервера, напр. http://192.168.1.10:9900
//   IIKO_LOGIN    — логин пользователя iiko
//   IIKO_PASSWORD — пароль (передаём SHA-1 при авторизации)
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
  _tokenExpiry = Date.now() + 50 * 60 * 1000; // 50 мин (токен живёт ~60 мин)
  console.log('[iiko] токен получен');
  return _token;
}

// Сбросить кэш токена (при 401 от API)
function invalidateToken() { _token = null; _tokenExpiry = 0; }

// Запрос OLAP-отчёта по продажам за один день.
// date — строка 'YYYY-MM-DD'.
// Если переданы data и saveData — результат сохраняется в revenue:v1 KV (чтобы не делать повторный запрос).
async function getDayRevenue(date, data, saveData) {
  if (!IIKO_URL || !IIKO_LOGIN) {
    throw Object.assign(new Error('iiko не настроен: задайте IIKO_URL и IIKO_LOGIN в .env'), { status: 503 });
  }

  const token = await getToken();

  const body = {
    reportType: 'SALES',
    buildSummary: 'true',
    groupByRowFields: ['OpenDate.Typed'],
    // DishSumInt — сумма без скидок, DishDiscountSumInt — размер скидок.
    // Чистая выручка = DishSumInt − DishDiscountSumInt
    aggregateFields: ['DishDiscountSumInt'],
    filters: {
      'OpenDate.Typed': {
        filterType: 'DateRange',
        periodType: 'CUSTOM',
        from: date,
        to: date,
        includeLow: true,
        includeHigh: true,
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

  if (res.status === 401) {
    invalidateToken();
    throw Object.assign(new Error('iiko: сессия истекла, повторите запрос'), { status: 401 });
  }
  if (!res.ok) {
    const txt = await res.text().catch(() => '');
    throw new Error(`iiko OLAP HTTP ${res.status}: ${txt.slice(0, 300)}`);
  }

  const json = await res.json();

  // Суммируем DishAmountInt − DishDiscountSumInt по сводной строке или по всем строкам
  let fact = 0;
  // В этой версии iiko DishDiscountSumInt = чистая выручка (итоговая сумма по чекам)
  if (json.summary) {
    fact = Math.round(Number(json.summary.DishDiscountSumInt ?? 0));
  } else if (Array.isArray(json.data)) {
    for (const row of json.data) fact += Number(row.DishDiscountSumInt ?? 0);
    fact = Math.round(fact);
  }
  console.log(`[iiko] выручка за ${date}: ${fact} ₽`);

  // Сохраняем в KV если переданы data/saveData (чтобы фронтенд увидел при следующей загрузке)
  if (data && saveData && fact > 0) {
    const revenue = JSON.parse(data.kv?.['revenue:v1'] || '{}');
    if (!revenue[date]) revenue[date] = {};
    revenue[date].fact = fact;
    data.kv['revenue:v1'] = JSON.stringify(revenue);
    saveData();
  }

  return { fact };
}

// Синхронизация выручки за текущий месяц — для кнопки в админке
async function syncRevenue(data, saveData) {
  if (!IIKO_URL || !IIKO_LOGIN) {
    throw Object.assign(new Error('iiko не настроен: задайте IIKO_URL и IIKO_LOGIN в .env'), { status: 503 });
  }

  const now = new Date();
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
  const res = await fetch(url, { method:'POST', headers:{'Content-Type':'application/json'}, body:JSON.stringify(body), signal:AbortSignal.timeout(20000) });

  if (res.status === 401) { invalidateToken(); throw Object.assign(new Error('iiko: сессия истекла, повторите'), { status:401 }); }
  if (!res.ok) { const t = await res.text(); throw new Error(`iiko OLAP ${res.status}: ${t.slice(0,200)}`); }

  const json = await res.json();
  const revenue = JSON.parse(data.kv['revenue:v1'] || '{}');
  let updated = 0;

  for (const row of (json.data || [])) {
    const iso = String(row['OpenDate.Typed'] || '').slice(0, 10);
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
