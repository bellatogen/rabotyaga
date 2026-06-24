// Синхронизация расписания барменов из Google Sheets.
// Обновляет только даты >= сегодня (прошлое не трогает).
// Вызывается: при старте, каждые 12 ч, по кнопке в админке.

const SHEET_ID = process.env.SCHEDULE_SHEET_ID || '1qu2vBtdSboXhFUCvCjs9XZJOqWeBfo-0';

// Колонка (0-based) → имя в приложении
const COL_NAME = { 3:'Александр', 6:'Павел', 9:'Евгений', 12:'Тимофей', 15:'Ярослав' };
const GUEST_COL = 18;

const RU_MONTHS = {
  'января':1,'февраля':2,'марта':3,'апреля':4,'мая':5,'июня':6,
  'июля':7,'августа':8,'сентября':9,'октября':10,'ноября':11,'декабря':12,
};

const RU_MONTHS_NAME = ['','Январь','Февраль','Март','Апрель','Май','Июнь',
                        'Июль','Август','Сентябрь','Октябрь','Ноябрь','Декабрь'];

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

function parseDate(cell, year) {
  const m = String(cell).trim().match(/^(\d+)\s+([а-яё]+)$/i);
  if (!m) return null;
  const mon = RU_MONTHS[m[2].toLowerCase()];
  if (!mon) return null;
  return `${year}-${String(mon).padStart(2,'0')}-${m[1].padStart(2,'0')}`;
}

function parseDuration(cell) {
  const m = String(cell||'').trim().match(/^(\d+):(\d+)$/);
  if (!m) return null;
  const h = parseInt(m[1]), min = parseInt(m[2]);
  return min ? String(h + min/60) : String(h);
}

function isWorking(cell) {
  const v = String(cell||'').trim().toLowerCase();
  return v && v !== 'выходной' && v !== 'отпуск' && v !== 'б/л' && v !== 'больничный';
}

function parseCSV(csv) {
  return csv.split('\n').map(line => {
    const cols = []; let cur = '', inQ = false;
    for (let i = 0; i < line.length; i++) {
      if (line[i] === '"') { inQ = !inQ; continue; }
      if (line[i] === ',' && !inQ) { cols.push(cur); cur = ''; continue; }
      cur += line[i];
    }
    cols.push(cur);
    return cols;
  });
}

async function fetchSheet(sheetName) {
  const url = `https://docs.google.com/spreadsheets/d/${SHEET_ID}/gviz/tq?tqx=out:csv&sheet=${encodeURIComponent(sheetName)}`;
  const res = await fetch(url, { signal: AbortSignal.timeout(15000) });
  if (!res.ok) throw new Error(`Sheets HTTP ${res.status} for "${sheetName}"`);
  return res.text();
}

// data и saveData — ссылки из server.js (in-memory KV store)
// opts.backfill = true  → синхронизировать прошлые даты (не только >= today)
// opts.fromDate         → точка старта для бэкфилла, напр. '2026-01-01'
async function syncSchedule(data, saveData, opts = {}) {
  const { backfill = false, fromDate = null } = opts;
  const today = new Date().toISOString().slice(0, 10);
  const sheets = fromDate ? sheetsForRange(fromDate) : sheetsToFetch();

  let daysUpdated = 0;
  const schedule = JSON.parse(data.kv['schedule:v1'] || '{}');
  const events   = JSON.parse(data.kv['events:v1']   || '{}');

  for (const { name: sheetName, year } of sheets) {
    let csv;
    try {
      csv = await fetchSheet(sheetName);
    } catch (e) {
      console.warn(`[scheduleSync] Лист "${sheetName}" не найден или ошибка: ${e.message}`);
      continue;
    }

    const rows = parseCSV(csv);
    // Строки 0 и 1 — шапка
    for (let ri = 2; ri < rows.length; ri++) {
      const row = rows[ri];
      const iso = parseDate(row[0], year);
      if (!iso) continue;
      if (!backfill && iso < today) continue; // обычный режим: только будущее

      const event = (row[2] || '').trim();
      if (event) events[iso] = event;
      else if (events[iso] === undefined) {} // не трогать если не было

      const dayShifts = [];

      for (const [colStr, appName] of Object.entries(COL_NAME)) {
        const col = Number(colStr);
        const status = row[col] || '';
        if (!isWorking(status)) continue;
        const start    = (row[col+1] || '').trim();
        const duration = parseDuration(row[col+2] || '');
        dayShifts.push({
          name:   appName,
          start:  start || '',
          end:    duration || '12',
          report: /\(отчёт\)/i.test(status),
          sub:    false,
          guest:  false,
        });
      }

      // Гостевые смены
      const guestCell  = (row[GUEST_COL] || '').trim();
      const guestStart = (row[GUEST_COL+1] || '').trim();
      if (guestCell) {
        const names  = guestCell.split('/').map(s => s.trim()).filter(Boolean);
        const starts = guestStart.split('/').map(s => s.trim());
        names.forEach((gName, i) => {
          dayShifts.push({ name: gName, start: starts[i]||starts[0]||'', end:'10', report:false, sub:true, guest:true });
        });
      }

      schedule[iso] = dayShifts;
      daysUpdated++;
    }
  }

  data.kv['schedule:v1'] = JSON.stringify(schedule);
  data.kv['events:v1']   = JSON.stringify(events);

  const status = { lastRun: new Date().toISOString(), daysUpdated, error: null };
  data.kv['sync:schedule:status'] = JSON.stringify(status);
  saveData();

  console.log(`[scheduleSync] ✅ Обновлено ${daysUpdated} дней (листы: ${sheets.map(s=>s.name).join(', ')})`);
  return status;
}

module.exports = { syncSchedule };
