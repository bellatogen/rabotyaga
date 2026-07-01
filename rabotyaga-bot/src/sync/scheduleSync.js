// Синхронизация расписания барменов из Google Sheets.
// Обновляет только даты >= сегодня (прошлое не трогает).
// Вызывается: при старте, каждые 12 ч, по кнопке в админке.
//
// Парсинг CSV вынесен в scheduleParse.js — используется и здесь, и в
// scripts/manual-schedule-import.js (ручной импорт в обход блокировки Google, см. там).

const { RU_MONTHS_NAME, parseScheduleCSV } = require('./scheduleParse');

const SHEET_ID = process.env.SCHEDULE_SHEET_ID || '1qu2vBtdSboXhFUCvCjs9XZJOqWeBfo-0';

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

const sleep = ms => new Promise(r => setTimeout(r, ms));

// Ограничение параллелизма для запросов к gviz.
// gviz с серверных IP (особенно на холодном старте контейнера) чувствителен к «залпам»:
// одновременная пачка запросов провоцирует 401/429. Гоним не более POOL запросов разом.
// Порядок результатов сохраняется по items, семантика — как у Promise.allSettled.
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

// Замечено: Google gviz иногда отвечает 401/429 — не только на всплеск параллельных запросов,
// но и вероятностно (похоже на балансировку между разными фронтендами Google — часть отдаёт
// 200, часть 401 на один и тот же документ в одну и ту же секунду). Ретраи с бэкоффом+джиттером
// помогают чаще, чем без них, но НЕ гарантируют успех — см. docs/investigations/ (если заведён)
// и scripts/manual-schedule-import.js как resilient fallback, когда автосинк не проходит совсем.
// Node отправляет User-Agent: 'node' по умолчанию — подставляем браузерный UA (не панацея, но и не вредит).
const BROWSER_UA = 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/124.0.0.0 Safari/537.36';

async function fetchSheet(sheetName, attempt = 1) {
  const url = `https://docs.google.com/spreadsheets/d/${SHEET_ID}/gviz/tq?tqx=out:csv&sheet=${encodeURIComponent(sheetName)}`;
  const res = await fetch(url, { signal: AbortSignal.timeout(15000), headers: { 'User-Agent': BROWSER_UA } });
  if (!res.ok) {
    if ((res.status === 401 || res.status === 429 || res.status >= 500) && attempt < 4) {
      // Экспоненциальный бэкофф + джиттер: одинаковые синхронные ретраи сами по себе
      // выглядят как «залп» и провоцируют 401/429 — джиттер их размазывает во времени.
      await sleep(3000 * attempt + Math.floor(Math.random() * 1500));
      return fetchSheet(sheetName, attempt + 1);
    }
    throw new Error(`Sheets HTTP ${res.status} for "${sheetName}"`);
  }
  return res.text();
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
  const fetched = await allSettledLimit(sheets, POOL, s => fetchSheet(s.name));

  let daysUpdated = 0;
  const errors = [];
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

    const { schedule: daySchedule, events: dayEvents, error } = parseScheduleCSV(result.value, { sheetName, year, backfill, today });
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
  };
  data.kv['sync:schedule:status'] = JSON.stringify(status);
  saveData();

  console.log(`[scheduleSync] ✅ Обновлено ${daysUpdated} дней (листы: ${sheets.map(s=>s.name).join(', ')})`);
  return status;
}

module.exports = { syncSchedule };
