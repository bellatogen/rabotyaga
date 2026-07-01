// scheduleParse.js — общая логика разбора CSV-листа расписания из Google Sheets.
// Вынесено из scheduleSync.js, чтобы одна и та же логика использовалась и автосинком
// (каждые 12ч), и ручным импорт-скриптом (scripts/manual-schedule-import.js) —
// без риска, что они когда-нибудь «разъедутся» в поведении.

'use strict';

// Колонка (0-based) → имя в приложении
const COL_NAME = { 3: 'Александр', 6: 'Павел', 9: 'Евгений', 12: 'Тимофей', 15: 'Ярослав' };
const GUEST_COL = 18;

const RU_MONTHS = {
  'января': 1, 'февраля': 2, 'марта': 3, 'апреля': 4, 'мая': 5, 'июня': 6,
  'июля': 7, 'августа': 8, 'сентября': 9, 'октября': 10, 'ноября': 11, 'декабря': 12,
};

const RU_MONTHS_NAME = ['', 'Январь', 'Февраль', 'Март', 'Апрель', 'Май', 'Июнь',
                         'Июль', 'Август', 'Сентябрь', 'Октябрь', 'Ноябрь', 'Декабрь'];

function parseDate(cell, year) {
  const m = String(cell).trim().match(/^(\d+)\s+([а-яё]+)$/i);
  if (!m) return null;
  const mon = RU_MONTHS[m[2].toLowerCase()];
  if (!mon) return null;
  return `${year}-${String(mon).padStart(2, '0')}-${m[1].padStart(2, '0')}`;
}

function parseDuration(cell) {
  const m = String(cell || '').trim().match(/^(\d+):(\d+)$/);
  if (!m) return null;
  const h = parseInt(m[1]), min = parseInt(m[2]);
  return min ? String(h + min / 60) : String(h);
}

function isWorking(cell) {
  const v = String(cell || '').trim().toLowerCase();
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

/**
 * Разбирает уже готовую матрицу строк (rows[i][col] — строка ячейки) одного листа
 * («Июль 2026» и т.п.) в { schedule, events, error }.
 *
 * Источник rows не важен — это может быть результат parseCSV(gviz-текста) ИЛИ
 * values-массив из ответа Google Sheets API v4 (values.get: response.values) —
 * оба представления идентичны по форме (массив массивов строк, 0-based колонки).
 *
 * @param {Array<Array<string>>} rows
 * @param {object} opts
 * @param {string} opts.sheetName — имя листа, напр. "Июль 2026" (для guard-проверки месяца)
 * @param {number} opts.year      — год листа
 * @param {boolean} [opts.backfill=false] — включать даты < today
 * @param {string}  [opts.today]  — YYYY-MM-DD, порог для !backfill (по умолчанию — реальное "сегодня")
 * @returns {{ schedule: object, events: object, error: string|null }}
 */
function parseScheduleRows(rows, opts) {
  const { sheetName, year, backfill = false } = opts;
  const today = opts.today || new Date().toISOString().slice(0, 10);

  // Google Sheets gviz не возвращает ошибку на несуществующий лист (всегда HTTP 200) —
  // вместо этого молча отдаёт данные другого (первого/дефолтного) листа. Сверяемся по
  // первой распознанной дате в самом контенте: если месяц не совпадает с тем, что мы просили —
  // значит, листа с таким именем ещё нет — весь лист пропускаем, чтобы не задвоить данные чужого месяца.
  const expectedMonth = String(RU_MONTHS_NAME.indexOf(sheetName.split(' ')[0])).padStart(2, '0');
  const firstIso = rows.slice(2).map(r => parseDate(r[0], year)).find(Boolean);
  if (firstIso && firstIso.slice(5, 7) !== expectedMonth) {
    return { schedule: {}, events: {}, error: `лист не найден (gviz вернул другой месяц — ${firstIso})` };
  }

  const schedule = {};
  const events = {};

  // Строки 0 и 1 — шапка
  for (let ri = 2; ri < rows.length; ri++) {
    const row = rows[ri];
    const iso = parseDate(row[0], year);
    if (!iso) continue;
    if (!backfill && iso < today) continue; // обычный режим: только будущее

    const event = (row[2] || '').trim();
    if (event) events[iso] = event;

    const dayShifts = [];

    for (const [colStr, appName] of Object.entries(COL_NAME)) {
      const col = Number(colStr);
      const status = row[col] || '';
      if (!isWorking(status)) continue;
      const start    = (row[col + 1] || '').trim();
      const duration = parseDuration(row[col + 2] || '');
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
    const guestStart = (row[GUEST_COL + 1] || '').trim();
    if (guestCell) {
      const names  = guestCell.split('/').map(s => s.trim()).filter(Boolean);
      const starts = guestStart.split('/').map(s => s.trim());
      names.forEach((gName, i) => {
        dayShifts.push({ name: gName, start: starts[i] || starts[0] || '', end: '10', report: false, sub: true, guest: true });
      });
    }

    schedule[iso] = dayShifts;
  }

  return { schedule, events, error: null };
}

/**
 * Тонкая обёртка над parseScheduleRows для источника-CSV (gviz-экспорт).
 * Сигнатура сохранена как раньше — существующие вызовы не трогаем.
 */
function parseScheduleCSV(csvText, opts) {
  return parseScheduleRows(parseCSV(csvText), opts);
}

module.exports = {
  COL_NAME, GUEST_COL, RU_MONTHS, RU_MONTHS_NAME,
  parseDate, parseDuration, isWorking, parseCSV, parseScheduleRows, parseScheduleCSV,
};
