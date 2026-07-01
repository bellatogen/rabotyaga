#!/usr/bin/env node
// scripts/manual-schedule-import.js — ручной импорт расписания из Google Sheets в обход
// автосинка, когда gviz блокирует запросы именно с прод-сервера (см.
// docs/investigations/schedule-sync-401-2026-07-01.md).
//
// Компенсирует ДВА независимых сбоя автосинка:
//  1) Google gviz иногда 401'ит запросы конкретно с IP прод-сервера (вероятностно,
//     похоже на балансировку между фронтендами) — с другой машины (ноутбук, другой сервер)
//     обычно проходит нормально. Этот скрипт запускают С ЛЮБОЙ рабочей машины.
//  2) Лист месяца может ещё не существовать в самой Google-таблице — тогда скрипт
//     явно скажет "лист не найден", а не молча подставит данные другого месяца.
//
// Использование:
//   MANAGER_PASSWORD=*** node scripts/manual-schedule-import.js \
//     --sheets="Июль 2026,Август 2026" --year=2026 \
//     --host=https://rabotyaga55.ru --account=manager
//
// Параметры:
//   --sheets   обязателен. Список листов через запятую, напр. "Июль 2026,Август 2026"
//   --year     обязателен. Год листов (если листы за разные годы — запустить скрипт дважды)
//   --host     по умолчанию https://rabotyaga55.ru
//   --account  по умолчанию manager
//   --backfill добавить флаг без значения — включить прошлые даты (по умолчанию только >= сегодня)
//
// Пароль — ТОЛЬКО через переменную окружения MANAGER_PASSWORD (не аргумент, чтобы не
// оседал в истории шелла/ps). Если не задана — скрипт спросит интерактивно.
//
// Ничего не пишет напрямую в data.json на сервере — только через штатные, уже
// авторизованные API (/api/auth/login, /api/kv/:key), точно так же, как обычный менеджер
// из браузера. Мержит с текущими данными (не перезаписывает другие месяцы).

'use strict';

require('dotenv').config({ path: require('path').join(__dirname, '../.env') });

const readline = require('readline');
const { parseScheduleCSV, RU_MONTHS_NAME } = require('../src/sync/scheduleParse');

const SHEET_ID = process.env.SCHEDULE_SHEET_ID || '1qu2vBtdSboXhFUCvCjs9XZJOqWeBfo-0';

function parseArgs(argv) {
  const out = { backfill: false };
  for (const arg of argv) {
    const m = arg.match(/^--([^=]+)(?:=(.*))?$/);
    if (!m) continue;
    out[m[1]] = m[2] === undefined ? true : m[2];
  }
  return out;
}

// Простой видимый prompt (fallback, если MANAGER_PASSWORD не задан env-переменной).
// Без маскировки ввода — это дев-тул для запуска локально самим менеджером;
// усложнять raw-mode-маскировкой ради разового ручного запуска не стоит.
function ask(question) {
  return new Promise(resolve => {
    const rl = readline.createInterface({ input: process.stdin, output: process.stdout });
    rl.question(question, answer => { rl.close(); resolve(answer); });
  });
}

async function fetchSheetCSV(sheetName) {
  const url = `https://docs.google.com/spreadsheets/d/${SHEET_ID}/gviz/tq?tqx=out:csv&sheet=${encodeURIComponent(sheetName)}`;
  const res = await fetch(url, { signal: AbortSignal.timeout(20000) });
  if (!res.ok) throw new Error(`Sheets HTTP ${res.status} for "${sheetName}" (запущено с этой машины — если тоже 401, проблема не в прод-сервере)`);
  return res.text();
}

async function login(host, account, password) {
  const res = await fetch(`${host}/api/auth/login`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ account, password }),
  });
  const body = await res.json().catch(() => ({}));
  if (!res.ok) throw new Error(`Логин не прошёл: HTTP ${res.status} ${body.error || ''}`);
  const setCookie = res.headers.get('set-cookie');
  if (!setCookie) throw new Error('Логин прошёл, но сервер не вернул cookie');
  const cookie = setCookie.split(';')[0]; // "rab_token=..."
  return cookie;
}

async function getKV(host, cookie, key) {
  const res = await fetch(`${host}/api/kv/${encodeURIComponent(key)}`, { headers: { Cookie: cookie } });
  if (!res.ok) throw new Error(`GET /api/kv/${key} → HTTP ${res.status}`);
  const body = await res.json();
  return body.value ? JSON.parse(body.value) : {};
}

async function putKV(host, cookie, key, valueObj) {
  const res = await fetch(`${host}/api/kv/${encodeURIComponent(key)}`, {
    method: 'PUT',
    headers: { 'Content-Type': 'application/json', Cookie: cookie },
    body: JSON.stringify({ value: JSON.stringify(valueObj) }),
  });
  const body = await res.json().catch(() => ({}));
  if (!res.ok) throw new Error(`PUT /api/kv/${key} → HTTP ${res.status} ${body.error || ''}`);
}

async function main() {
  const args = parseArgs(process.argv.slice(2));
  const host = (args.host || 'https://rabotyaga55.ru').replace(/\/$/, '');
  const account = args.account || 'manager';
  const year = Number(args.year);
  const sheetNames = String(args.sheets || '').split(',').map(s => s.trim()).filter(Boolean);

  if (!year || !sheetNames.length) {
    console.error('Использование: node scripts/manual-schedule-import.js --sheets="Июль 2026,Август 2026" --year=2026 [--host=...] [--account=manager] [--backfill]');
    process.exit(1);
  }
  for (const name of sheetNames) {
    if (!RU_MONTHS_NAME.includes(name.split(' ')[0])) {
      console.error(`❌ Не похоже на имя листа расписания: "${name}" (ожидается "<Месяц> <Год>", напр. "Июль 2026")`);
      process.exit(1);
    }
  }

  let password = process.env.MANAGER_PASSWORD;
  if (!password) {
    password = await ask(`Пароль для ${account}@${host} (лучше используйте MANAGER_PASSWORD env, чтобы не светить в терминале): `);
  }
  if (!password) { console.error('❌ Пароль не задан'); process.exit(1); }

  console.log(`🔑 Вход как ${account} на ${host}...`);
  const cookie = await login(host, account, password);
  console.log('✅ Авторизован');

  const today = new Date().toISOString().slice(0, 10);
  const mergedSchedule = await getKV(host, cookie, 'schedule:v1');
  const mergedEvents   = await getKV(host, cookie, 'events:v1');
  console.log(`📥 Текущее состояние на сервере: ${Object.keys(mergedSchedule).length} дней в schedule:v1`);

  let daysUpdated = 0;
  const errors = [];

  for (const sheetName of sheetNames) {
    console.log(`\n📄 Лист "${sheetName}"...`);
    let csv;
    try {
      csv = await fetchSheetCSV(sheetName);
    } catch (e) {
      console.error(`  ❌ Не удалось скачать: ${e.message}`);
      errors.push(`${sheetName}: ${e.message}`);
      continue;
    }

    const { schedule, events, error } = parseScheduleCSV(csv, { sheetName, year, backfill: !!args.backfill, today });
    if (error) {
      console.error(`  ❌ ${error}`);
      errors.push(`${sheetName}: ${error}`);
      continue;
    }

    const count = Object.keys(schedule).length;
    console.log(`  ✅ Распознано ${count} дней`);
    Object.assign(mergedSchedule, schedule);
    Object.assign(mergedEvents, events);
    daysUpdated += count;
  }

  if (daysUpdated === 0) {
    console.error('\n❌ Ни одного дня не обновлено — данные на сервер НЕ отправлены.');
    if (errors.length) console.error('Ошибки:\n  ' + errors.join('\n  '));
    process.exit(1);
  }

  console.log(`\n📤 Отправка на сервер: ${daysUpdated} дней...`);
  await putKV(host, cookie, 'schedule:v1', mergedSchedule);
  await putKV(host, cookie, 'events:v1', mergedEvents);

  // Прозрачность для будущих расследований: видно, что данные попали не через автосинк.
  await putKV(host, cookie, 'sync:schedule:status', {
    lastRun: new Date().toISOString(),
    daysUpdated,
    error: errors.length ? errors.join('; ') : null,
    source: 'manual-import',
  });

  console.log(`✅ Готово. Обновлено ${daysUpdated} дней.`);
  if (errors.length) {
    console.log('⚠️  Частичные ошибки:\n  ' + errors.join('\n  '));
    process.exit(1);
  }
}

main().catch(e => {
  console.error('❌', e.message);
  process.exit(1);
});
