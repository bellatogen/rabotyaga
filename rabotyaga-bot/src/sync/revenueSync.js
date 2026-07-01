// Синхронизация плановой выручки из Google Sheets.
//
// Источник: таблица с вкладками «Январь 2026», «Февраль 2026» и т.д.
// Структура строки: col0=DD.MM.YYYY, col2=план ₽, col3=план гостей.
//
// Обновляет поля plan/planGuests в revenue:v1.
// Факт (fact/guests) и прочие поля НЕ трогает.
//
// Переменная окружения: REVENUE_PLAN_SHEET_ID (опционально — есть дефолт).
// Фетч листов (API v4 + gviz-фолбэк) — sheetsFetch.js (общий с scheduleSync.js).

const { fetchSheetRows } = require('./sheetsFetch');

const REVENUE_PLAN_SHEET_ID =
  process.env.REVENUE_PLAN_SHEET_ID || '15iH2MwCmvd6KnC67OS02eq7DNuQSPCa6TuIIdXV0Omc';

const RU_MONTHS_NAME = [
  '', 'Январь', 'Февраль', 'Март', 'Апрель', 'Май', 'Июнь',
  'Июль', 'Август', 'Сентябрь', 'Октябрь', 'Ноябрь', 'Декабрь',
];

// Возвращает массив вкладок для загрузки: от fromDate (или января текущего года)
// по текущий месяц включительно.
function sheetsForPlan(fromDate) {
  const now  = new Date();
  const from = fromDate
    ? new Date(fromDate + 'T00:00:00')
    : new Date(now.getFullYear(), 0, 1); // январь текущего года

  const sheets = [];
  let y = from.getFullYear(), m = from.getMonth(); // 0-based
  while (y < now.getFullYear() || (y === now.getFullYear() && m <= now.getMonth())) {
    sheets.push({ name: `${RU_MONTHS_NAME[m + 1]} ${y}` });
    if (++m > 11) { m = 0; y++; }
  }
  return sheets;
}

// Разбирает уже готовую матрицу строк (rows[i][col]) в { 'YYYY-MM-DD': { plan, planGuests } }.
// Источник rows — либо values из Sheets API v4, либо parseCSV(gviz-текста) — обе формы
// идентичны по виду (массив массивов строк), кавычки уже сняты на уровне sheetsFetch.js.
function parsePlanRows(rows) {
  const result = {};
  for (const row of rows) {
    const c0 = (row[0] || '').trim();
    if (!c0 || !/^\d{2}\.\d{2}\.\d{4}$/.test(c0)) continue;
    const [day, mon, yr] = c0.split('.');
    const iso = `${yr}-${mon}-${day}`;
    const c2 = (row[2] || '').trim();
    const c3 = (row[3] || '').trim();
    const plan        = c2 ? Number(c2.replace(/\s/g, '')) : null;
    const planGuests  = c3 ? Number(c3.replace(/\s/g, '')) : null;
    if (plan > 0) result[iso] = { plan, planGuests: planGuests || null };
  }
  return result;
}

// Ограничение параллелизма для запросов к Google (см. такой же allSettledLimit в scheduleSync.js).
const POOL = 3;
async function allSettledLimit(items, limit, fn) {
  const results = new Array(items.length);
  let cursor = 0;
  const worker = async () => {
    while (cursor < items.length) {
      const i = cursor++;
      try { results[i] = { status: 'fulfilled', value: await fn(items[i], i) }; }
      catch (reason) { results[i] = { status: 'rejected', reason }; }
    }
  };
  await Promise.all(Array.from({ length: Math.min(limit, items.length) }, worker));
  return results;
}

// Синхронизирует плановые данные из Google Sheets в revenue:v1.
// opts.fromDate — начало периода (по умолчанию: 1 января текущего года).
async function syncRevenuePlan(data, saveData, opts = {}) {
  const sheets  = sheetsForPlan(opts.fromDate || null);
  let revenue;
  try { revenue = JSON.parse(data.kv['revenue:v1'] || '{}'); }
  catch (e) {
    console.error('[revenueSync] revenue:v1 повреждён — начинаем с пустого объекта:', e.message);
    revenue = {};
  }

  let daysUpdated   = 0;
  const updatedSheets = [];
  const errors        = [];
  const sources        = {};

  // Сетевые запросы — параллельно (было последовательно — тот же эффект, что и в scheduleSync).
  const fetched = await allSettledLimit(sheets, POOL, s => fetchSheetRows(REVENUE_PLAN_SHEET_ID, s.name));

  sheets.forEach(({ name: sheetName }, i) => {
    const result = fetched[i];
    if (result.status === 'rejected') {
      const msg = `${sheetName}: ${result.reason.message}`;
      console.warn(`[revenueSync] ⚠️ ${msg}`);
      errors.push(msg);
      return;
    }

    const { rows, source } = result.value;
    sources[sheetName] = source;

    const planData = parsePlanRows(rows);
    const count    = Object.keys(planData).length;

    if (count === 0) {
      console.warn(`[revenueSync] Лист "${sheetName}" пуст или не распознан`);
      return;
    }

    // gviz не возвращает ошибку на несуществующий лист — может тихо отдать другой месяц
    // (см. такую же проверку в scheduleSync.js). Здесь даты в ячейках уже полные (DD.MM.YYYY),
    // поэтому просто сверяем YYYY-MM первой даты с ожидаемым из имени листа.
    const [expMonthName, expYear] = sheetName.split(' ');
    const expMonth = String(RU_MONTHS_NAME.indexOf(expMonthName)).padStart(2, '0');
    const firstDate = Object.keys(planData).sort()[0];
    if (firstDate.slice(0, 7) !== `${expYear}-${expMonth}`) {
      const msg = `${sheetName}: лист не найден (вернулся другой месяц — ${firstDate})`;
      console.warn(`[revenueSync] ⚠️ ${msg}`);
      errors.push(msg);
      return;
    }

    for (const [date, { plan, planGuests }] of Object.entries(planData)) {
      if (!revenue[date]) revenue[date] = {};
      revenue[date].plan = plan;
      if (planGuests != null) revenue[date].planGuests = planGuests;
      daysUpdated++;
    }
    updatedSheets.push(`${sheetName} (${count})`);
  });

  data.kv['revenue:v1'] = JSON.stringify(revenue);

  const status = {
    lastRun: new Date().toISOString(),
    daysUpdated,
    sheets: updatedSheets,
    errors: errors.length ? errors : null,
    sources,
  };
  data.kv['sync:revenue:plan:status'] = JSON.stringify(status);
  saveData();

  console.log(`[revenueSync] ✅ план: ${daysUpdated} дней (${updatedSheets.join(', ')})`);
  return status;
}

module.exports = { syncRevenuePlan };
