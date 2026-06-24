// Синхронизация плановой выручки из Google Sheets.
//
// Источник: таблица с вкладками «Январь 2026», «Февраль 2026» и т.д.
// Структура строки: col0=DD.MM.YYYY, col2=план ₽, col3=план гостей.
//
// Обновляет поля plan/planGuests в revenue:v1.
// Факт (fact/guests) и прочие поля НЕ трогает.
//
// Переменная окружения: REVENUE_PLAN_SHEET_ID (опционально — есть дефолт).

const REVENUE_PLAN_SHEET_ID =
  process.env.REVENUE_PLAN_SHEET_ID || '1Git6XfP-GMVlrkeGHwDTCgd-Hqrc3-56';

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

// Разбирает CSV-строки. Возвращает { 'YYYY-MM-DD': { plan, planGuests } }.
function parseCSV(text) {
  const result = {};
  for (const line of text.split('\n')) {
    const cols = line.split(',').map(c => c.replace(/^"|"$/g, '').trim());
    if (!cols[0] || !/^\d{2}\.\d{2}\.\d{4}$/.test(cols[0])) continue;
    const [day, mon, yr] = cols[0].split('.');
    const iso       = `${yr}-${mon}-${day}`;
    const plan      = cols[2] ? Number(cols[2].replace(/\s/g, '')) : null;
    const planGuests = cols[3] ? Number(cols[3].replace(/\s/g, '')) : null;
    if (plan > 0) result[iso] = { plan, planGuests: planGuests || null };
  }
  return result;
}

async function fetchPlanSheet(sheetName) {
  const url = `https://docs.google.com/spreadsheets/d/${REVENUE_PLAN_SHEET_ID}/gviz/tq`
    + `?tqx=out:csv&sheet=${encodeURIComponent(sheetName)}`;
  const res = await fetch(url, { signal: AbortSignal.timeout(12000) });
  if (!res.ok) throw new Error(`Sheets HTTP ${res.status} for "${sheetName}"`);
  return res.text();
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

  for (const { name: sheetName } of sheets) {
    let csv;
    try {
      csv = await fetchPlanSheet(sheetName);
    } catch (e) {
      const msg = `${sheetName}: ${e.message}`;
      console.warn(`[revenueSync] ⚠️ ${msg}`);
      errors.push(msg);
      continue;
    }

    const planData = parseCSV(csv);
    const count    = Object.keys(planData).length;

    if (count === 0) {
      console.warn(`[revenueSync] Лист "${sheetName}" пуст или не распознан`);
      continue;
    }

    for (const [date, { plan, planGuests }] of Object.entries(planData)) {
      if (!revenue[date]) revenue[date] = {};
      revenue[date].plan = plan;
      if (planGuests != null) revenue[date].planGuests = planGuests;
      daysUpdated++;
    }
    updatedSheets.push(`${sheetName} (${count})`);
  }

  data.kv['revenue:v1'] = JSON.stringify(revenue);

  const status = {
    lastRun: new Date().toISOString(),
    daysUpdated,
    sheets: updatedSheets,
    errors: errors.length ? errors : null,
  };
  data.kv['sync:revenue:plan:status'] = JSON.stringify(status);
  saveData();

  console.log(`[revenueSync] ✅ план: ${daysUpdated} дней (${updatedSheets.join(', ')})`);
  return status;
}

module.exports = { syncRevenuePlan };
