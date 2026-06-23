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
// Возвращает { fact: number } — факт выручки в рублях.
async function getDayRevenue(date) {
  if (!IIKO_URL || !IIKO_LOGIN) {
    throw Object.assign(new Error('iiko не настроен: задайте IIKO_URL и IIKO_LOGIN в .env'), { status: 503 });
  }

  const token = await getToken();

  const body = {
    reportType: 'SALES',
    buildSummary: 'true',
    groupByRowFields: ['OpenDate.Typed'],
    aggregateFields: ['DishAmountInt', 'DishDiscountSumInt'],
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
  let amount = 0, discount = 0;
  if (json.summary) {
    amount   = Number(json.summary.DishAmountInt   ?? 0);
    discount = Number(json.summary.DishDiscountSumInt ?? 0);
  } else if (Array.isArray(json.data)) {
    for (const row of json.data) {
      amount   += Number(row.DishAmountInt   ?? 0);
      discount += Number(row.DishDiscountSumInt ?? 0);
    }
  }

  // DishDiscountSumInt = выручка в рублях (уже итоговая сумма)
  // DishAmountInt = количество порций (не деньги)
  const fact = Math.round(discount);
  console.log(`[iiko] выручка за ${date}: ${fact} ₽ (amount=${amount}, discount=${discount})`);
  return { fact };
}

module.exports = { getDayRevenue };
