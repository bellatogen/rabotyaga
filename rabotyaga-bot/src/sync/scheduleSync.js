// Синхронизация расписания барменов из Google Sheets.
// Обновляет только даты >= сегодня (прошлое не трогает).
// Вызывается: при старте, каждые 12 ч, по кнопке в админке.
//
// Фетч листов (API v4 + gviz-фолбэк) — sheetsFetch.js. Парсинг строк в смены — scheduleParse.js.
// Оба модуля переиспользуются в scripts/manual-schedule-import.js.

const { RU_MONTHS_NAME, parseScheduleRows } = require('./scheduleParse');
const { fetchSheetRows } = require('./sheetsFetch');

const SHEET_ID = process.env.SCHEDULE_SHEET_ID || '1HhVU_AkD4lzHKq4nJtUjlzrutnAiNSFNh-BLBN5bQzI';

// Стандартный режим: текущий месяц + следующий
function sheetsToFetch() {
  const now = new Date();
  return [0, 1].map(delta => {
    const d = new Date(now.getFullYear(), now.getMonth() + delta, 1);
    return { name: `${RU_MONTHS_NAME[d.getMonth()+1]} ${d.getFullYear()}`, year: d.getFullYear() };
  });
}

// Бэкфилл: все месяцы с fromDate по следующий месяц включительно.
// Пример: fromDate='2026-01-01' → Январь 2026 … Июль 2026 (если сейчас июнь)
function sheetsForRange(fromDate) {
  const from = new Date(fromDate + 'T00:00:00');
  const now  = new Date();
  // До следующего месяца включительно
  const endY = now.getMonth() === 11 ? now.getFullYear() + 1 : now.getFullYear();
  const endM = (now.getMonth() + 1) % 12; // 0-based
  const sheets = [];
  let y = from.getFullYear(), m = from.getMonth(); // 0-based
  while (y < endY || (y === endY && m <= endM)) {
    sheets.push({ name: `${RU_MONTHS_NAME[m+1]} ${y}`, year: y });
    m++;
    if (m > 11) { m = 0; y++; }
  }
  return sheets;
}

// Ограничение параллелизма для запросов к Google (см. docs/investigations/schedule-sync-401-2026-07-01.md —
// изначально заводилось против предполагаемого троттлинга при бэкфилле, оставлено — не мешает,
// а для API v4 у Google тоже есть квоты в единицу времени).
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

// data и saveData — ссылки из server.js (in-memory KV store)
// opts.backfill = true  → синхронизировать прошлые даты (не только >= today)
// opts.fromDate         → точка старта для бэкфилла, напр. '2026-01-01'
async function syncSchedule(data, saveData, opts = {}) {
  const { backfill = false, fromDate = null } = opts;
  const today = new Date().toISOString().slice(0, 10);
  const sheets = fromDate ? sheetsForRange(fromDate) : sheetsToFetch();

  // Сетевые запросы — параллельно (было: по очереди, до 15с на лист — бэкфилл за год
  // через 12-19 листов мог тянуться минутами). Порядок обработки результатов
  // сохраняется по sheets (не по скорости ответа), чтобы поведение «позже перезаписывает
  // раньше» осталось детерминированным, как и раньше.
  const fetched = await allSettledLimit(sheets, POOL, s => fetchSheetRows(SHEET_ID, s.name));

  let daysUpdated = 0;
  const errors = [];
  const sources = {};
  const schedule = JSON.parse(data.kv['schedule:v1'] || '{}');
  const events   = JSON.parse(data.kv['events:v1']   || '{}');

  sheets.forEach(({ name: sheetName, year }, i) => {
    const result = fetched[i];
    if (result.status === 'rejected') {
      const msg = `${sheetName}: ${result.reason.message}`;
      console.warn(`[scheduleSync] Лист "${sheetName}" не найден или ошибка: ${result.reason.message}`);
      errors.push(msg);
      return;
    }

    const { rows, source } = result.value;
    sources[sheetName] = source;

    const { schedule: daySchedule, events: dayEvents, error } = parseScheduleRows(rows, { sheetName, year, backfill, today });
    if (error) {
      console.warn(`[scheduleSync] ⚠️ ${sheetName}: ${error}`);
      errors.push(`${sheetName}: ${error}`);
      return;
    }

    Object.assign(schedule, daySchedule);
    Object.assign(events, dayEvents);
    daysUpdated += Object.keys(daySchedule).length;
  });

  data.kv['schedule:v1'] = JSON.stringify(schedule);
  data.kv['events:v1']   = JSON.stringify(events);

  const status = {
    lastRun: new Date().toISOString(),
    daysUpdated,
    error: errors.length ? errors.join('; ') : null,
    sources, // { "Июль 2026": "api-v4" | "gviz-fallback" } — прозрачность, каким путём пришли данные
  };
  data.kv['sync:schedule:status'] = JSON.stringify(status);
  saveData();

  console.log(`[scheduleSync] ✅ Обновлено ${daysUpdated} дней (листы: ${sheets.map(s=>s.name).join(', ')})`);
  return status;
}

module.exports = { syncSchedule };
