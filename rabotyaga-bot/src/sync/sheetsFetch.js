// sheetsFetch.js — универсальный фетч листа Google Sheets в rows[][].
//
// Основной путь: официальный Google Sheets API v4 (ключ GOOGLE_SHEETS_API_KEY) —
// не подвержен анти-абуз-механизму анонимного gviz-экспорта.
// Фолбэк: анонимный gviz CSV-экспорт (старый способ) — автоматически, на любую ошибку
// API v4 (сеть, квота, отсутствие ключа, что угодно). См. разбор инцидента:
// docs/investigations/schedule-sync-401-2026-07-01.md
//
// ВАЖНО: Sheets API v4 работает ТОЛЬКО с нативным форматом Google Sheets — если
// таблица на самом деле загруженный .xlsx-файл в Drive, API вернёт 400
// FAILED_PRECONDITION "must not be an Office file". В этом случае (и в любом другом
// сбое API) автоматически используется gviz-фолбэк, который с Office-файлами работает.
//
// Используется в scheduleSync.js, revenueSync.js и scripts/manual-schedule-import.js —
// единая логика фетча+ретраев+фолбэка, чтобы не дублировать и не расходиться.

'use strict';

const { parseCSV } = require('./scheduleParse');

const API_KEY = process.env.GOOGLE_SHEETS_API_KEY || '';

// Диапазон с запасом по колонкам (до U — с запасом под GUEST_COL=18 + соседнюю) и строкам
// (до 500 — с запасом под месяц с любым количеством строк шапки/данных).
const RANGE_SUFFIX = 'A1:U500';

const BROWSER_UA = 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/124.0.0.0 Safari/537.36';

const sleep = ms => new Promise(r => setTimeout(r, ms));

async function fetchViaApi(sheetId, sheetName, attempt = 1) {
  const range = encodeURIComponent(`'${sheetName}'!${RANGE_SUFFIX}`);
  const url = `https://sheets.googleapis.com/v4/spreadsheets/${sheetId}/values/${range}?key=${API_KEY}`;
  const res = await fetch(url, { signal: AbortSignal.timeout(15000) });
  if (!res.ok) {
    // 429 (квота) / 5xx — транзиентно, стоит ретраить. 400/403/404 — нет смысла (не изменится).
    if ((res.status === 429 || res.status >= 500) && attempt < 3) {
      await sleep(1500 * attempt + Math.floor(Math.random() * 500));
      return fetchViaApi(sheetId, sheetName, attempt + 1);
    }
    const body = await res.text().catch(() => '');
    throw new Error(`Sheets API v4 HTTP ${res.status} for "${sheetName}": ${body.slice(0, 200)}`);
  }
  const json = await res.json();
  return json.values || [];
}

async function fetchViaGviz(sheetId, sheetName, attempt = 1) {
  const url = `https://docs.google.com/spreadsheets/d/${sheetId}/gviz/tq?tqx=out:csv&sheet=${encodeURIComponent(sheetName)}`;
  const res = await fetch(url, { signal: AbortSignal.timeout(15000), headers: { 'User-Agent': BROWSER_UA } });
  if (!res.ok) {
    if ((res.status === 401 || res.status === 429 || res.status >= 500) && attempt < 4) {
      // Экспоненциальный бэкофф + джиттер — см. docs/investigations/schedule-sync-401-2026-07-01.md
      await sleep(3000 * attempt + Math.floor(Math.random() * 1500));
      return fetchViaGviz(sheetId, sheetName, attempt + 1);
    }
    throw new Error(`gviz HTTP ${res.status} for "${sheetName}"`);
  }
  return parseCSV(await res.text());
}

/**
 * Фетчит один лист Google Sheets, возвращает rows[][] независимо от того, каким путём
 * данные получены. API v4 — основной путь (если задан GOOGLE_SHEETS_API_KEY), при любой
 * его ошибке — автоматический фолбэк на gviz.
 *
 * @param {string} sheetId
 * @param {string} sheetName
 * @returns {Promise<{ rows: Array<Array<string>>, source: 'api-v4'|'gviz-fallback' }>}
 */
async function fetchSheetRows(sheetId, sheetName) {
  if (API_KEY) {
    try {
      const rows = await fetchViaApi(sheetId, sheetName);
      return { rows, source: 'api-v4' };
    } catch (e) {
      console.warn(`[sheetsFetch] Sheets API v4 не сработал для "${sheetName}" (${e.message}) — переключаюсь на gviz-фолбэк`);
    }
  }
  const rows = await fetchViaGviz(sheetId, sheetName);
  return { rows, source: 'gviz-fallback' };
}

module.exports = { fetchSheetRows };
