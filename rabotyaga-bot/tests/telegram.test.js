#!/usr/bin/env node
// telegram.test.js — SEC-7: проверка Telegram initData + эндпоинт /api/auth/telegram.
//   • verifyInitData: валидная подпись / битая подпись / просроченный auth_date;
//   • POST /api/auth/telegram: валидный → 200 + cookie + tgVerified; битый → 403;
//     просроченный → 403; непривязанный tg id → 403;
//   • парольный /login по-прежнему работает + минимум пароля 8 символов.
// Запуск: node tests/telegram.test.js
'use strict';

// ВАЖНО: токен бота читается в src/api/auth.js на этапе require — задаём ДО импорта.
process.env.TELEGRAM_TOKEN = 'TEST:BOT:TOKEN-123456';

const assert       = require('assert');
const crypto       = require('crypto');
const http         = require('http');
const express      = require('express');
const cookieParser = require('cookie-parser');
const { verifyInitData } = require('../src/middleware/telegram');
const { COOKIE_NAME }    = require('../src/middleware/auth');
const makeAuthApi        = require('../src/api/auth');

const BOT_TOKEN = process.env.TELEGRAM_TOKEN;

let passed = 0, failed = 0;
async function test(name, fn) {
  try { await fn(); passed++; process.stdout.write(`  ✅ ${name}\n`); }
  catch (e) { failed++; process.stdout.write(`  ❌ ${name}\n     → ${e.message}\n`); }
}

// Собрать валидный initData с корректной подписью (как это делает Telegram WebApp).
function buildInitData(botToken, userObj, authDate) {
  const params = new URLSearchParams();
  params.set('auth_date', String(authDate));
  params.set('query_id', 'AAHtest123');
  params.set('user', JSON.stringify(userObj));
  const pairs = [];
  for (const [k, v] of params.entries()) pairs.push(`${k}=${v}`);
  pairs.sort();
  const dcs = pairs.join('\n');
  const secret = crypto.createHmac('sha256', 'WebAppData').update(botToken).digest();
  const hash = crypto.createHmac('sha256', secret).update(dcs).digest('hex');
  params.set('hash', hash);
  return params.toString();
}

(async () => {
  const nowSec = Math.floor(Date.now() / 1000);
  const freshDate = nowSec - 60;            // минуту назад — свежий
  const staleDate = nowSec - 25 * 60 * 60;  // 25ч назад — просрочен

  // ─── unit: verifyInitData ─────────────────────────────────────────────────────
  process.stdout.write('\n── verifyInitData ──\n');

  await test('валидная подпись → ok, user.id извлечён', () => {
    const initData = buildInitData(BOT_TOKEN, { id: 12345, first_name: 'Аня' }, freshDate);
    const v = verifyInitData(initData, BOT_TOKEN);
    assert.strictEqual(v.ok, true);
    assert.strictEqual(v.user.id, 12345);
  });

  await test('битая подпись (подменён user) → ok:false', () => {
    let initData = buildInitData(BOT_TOKEN, { id: 12345 }, freshDate);
    // подменяем user уже после подписи — hash перестаёт сходиться
    initData = initData.replace(/user=[^&]*/, `user=${encodeURIComponent(JSON.stringify({ id: 99999 }))}`);
    const v = verifyInitData(initData, BOT_TOKEN);
    assert.strictEqual(v.ok, false);
  });

  await test('чужой botToken → ok:false', () => {
    const initData = buildInitData(BOT_TOKEN, { id: 12345 }, freshDate);
    const v = verifyInitData(initData, 'ДРУГОЙ:ТОКЕН');
    assert.strictEqual(v.ok, false);
  });

  await test('просроченный auth_date (>24ч) → ok:false с причиной', () => {
    const initData = buildInitData(BOT_TOKEN, { id: 12345 }, staleDate);
    const v = verifyInitData(initData, BOT_TOKEN);
    assert.strictEqual(v.ok, false);
    assert.ok(/просроч/i.test(v.reason));
  });

  await test('нет hash → ok:false', () => {
    const v = verifyInitData('auth_date=' + freshDate + '&user=%7B%7D', BOT_TOKEN);
    assert.strictEqual(v.ok, false);
  });

  // ─── эндпоинт POST /api/auth/telegram ─────────────────────────────────────────
  process.stdout.write('\n── POST /api/auth/telegram ──\n');

  const data = { kv: {}, bindings: { 'Аня': 12345 }, pushSettings: {} };
  const app = express();
  app.use(express.json());
  app.use(cookieParser());
  app.use('/api/auth', makeAuthApi(data, () => {}));
  const server = await new Promise(r => { const s = http.createServer(app).listen(0, () => r(s)); });
  const PORT = server.address().port;

  async function post(p, body, cookie) {
    const res = await fetch(`http://127.0.0.1:${PORT}${p}`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json', ...(cookie ? { Cookie: cookie } : {}) },
      body: body !== undefined ? JSON.stringify(body) : undefined,
    });
    let json = null; try { json = await res.json(); } catch {}
    return { status: res.status, json, setCookie: res.headers.get('set-cookie') };
  }

  await test('валидный initData привязанного → 200 + account + tgVerified + cookie', async () => {
    const initData = buildInitData(BOT_TOKEN, { id: 12345, first_name: 'Аня' }, freshDate);
    const { status, json, setCookie } = await post('/api/auth/telegram', { initData });
    assert.strictEqual(status, 200);
    assert.strictEqual(json.account, 'Аня');
    assert.strictEqual(json.tgVerified, true);
    assert.ok(setCookie && setCookie.includes(COOKIE_NAME));
  });

  await test('битый initData → 403', async () => {
    let initData = buildInitData(BOT_TOKEN, { id: 12345 }, freshDate);
    initData = initData.replace(/hash=[a-f0-9]+/, 'hash=deadbeef');
    assert.strictEqual((await post('/api/auth/telegram', { initData })).status, 403);
  });

  await test('просроченный initData → 403', async () => {
    const initData = buildInitData(BOT_TOKEN, { id: 12345 }, staleDate);
    assert.strictEqual((await post('/api/auth/telegram', { initData })).status, 403);
  });

  await test('валидный, но непривязанный tg id → 403', async () => {
    const initData = buildInitData(BOT_TOKEN, { id: 777777 }, freshDate);
    assert.strictEqual((await post('/api/auth/telegram', { initData })).status, 403);
  });

  await test('без initData → 400', async () => {
    assert.strictEqual((await post('/api/auth/telegram', {})).status, 400);
  });

  // ─── парольный /login по-прежнему работает + минимум 8 ─────────────────────────
  process.stdout.write('\n── /login (fallback) + минимум пароля 8 ──\n');

  await test('первый вход паролем < 8 → 400', async () => {
    assert.strictEqual((await post('/api/auth/login', { account: 'Петя', password: '123' })).status, 400);
  });

  await test('первый вход паролем >= 8 → 200 (firstLogin)', async () => {
    const { status, json } = await post('/api/auth/login', { account: 'Петя', password: 'parol123' });
    assert.strictEqual(status, 200);
    assert.strictEqual(json.firstLogin, true);
  });

  await test('повторный вход верным паролем → 200', async () => {
    const { status, json } = await post('/api/auth/login', { account: 'Петя', password: 'parol123' });
    assert.strictEqual(status, 200);
    assert.strictEqual(json.ok, true);
  });

  await test('вход неверным паролем → 401', async () => {
    assert.strictEqual((await post('/api/auth/login', { account: 'Петя', password: 'wrongpass' })).status, 401);
  });

  server.close();

  process.stdout.write('\n' + '─'.repeat(58) + '\n');
  process.stdout.write(`Итого: ${passed + failed} тестов | ✅ ${passed} прошло | ❌ ${failed} упало\n`);
  if (failed > 0) { process.stdout.write('\n❌ Есть упавшие тесты\n'); process.exit(1); }
  process.stdout.write('\n🎉 Все тесты прошли!\n');
})();
