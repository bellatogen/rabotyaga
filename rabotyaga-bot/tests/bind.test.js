#!/usr/bin/env node
// bind.test.js — SEC (P0): /api/bind должен брать telegramId ТОЛЬКО из подписанного
// Telegram initData, а не из тела запроса — иначе любой авторизованный подделывает
// чужую привязку (перехват пушей / выдача за менеджера).
//   • POST /api/bind: валидный initData → id берётся из initData, а не из тела;
//     telegramId, подсунутый в теле, полностью игнорируется;
//     name !== req.account → 403 (привязать можно только себя);
//     битая подпись → 403; просроченный auth_date → 403; без initData → 400.
//   • DELETE /api/bind/:name: по-прежнему требует manager (не тема этого фикса).
// Запуск: node tests/bind.test.js
'use strict';

process.env.TELEGRAM_TOKEN = 'TEST:BOT:TOKEN-123456';

const assert       = require('assert');
const crypto       = require('crypto');
const http         = require('http');
const express      = require('express');
const cookieParser = require('cookie-parser');
const { signToken, COOKIE_NAME } = require('../src/middleware/auth');
const makeBindApi  = require('../src/api/bind');

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
  const freshDate = nowSec - 60;
  const staleDate = nowSec - 25 * 60 * 60;

  const data = { kv: {}, bindings: {}, pushSettings: {} };
  const saveCalls = [];
  const saveData = () => saveCalls.push(1);
  const sentMessages = [];
  const bot = { telegram: { sendMessage: (chatId, msg) => { sentMessages.push({ chatId, msg }); return Promise.resolve(); } } };
  const getTokenMap = () => ({});

  const app = express();
  app.use(express.json());
  app.use(cookieParser());
  app.use('/api/bind', makeBindApi(data, saveData, bot, getTokenMap, BOT_TOKEN));

  const server = await new Promise(r => { const s = http.createServer(app).listen(0, () => r(s)); });
  const PORT = server.address().port;

  function cookieFor(account) { return `${COOKIE_NAME}=${signToken(account)}`; }

  async function post(p, body, cookie) {
    const res = await fetch(`http://127.0.0.1:${PORT}${p}`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json', ...(cookie ? { Cookie: cookie } : {}) },
      body: body !== undefined ? JSON.stringify(body) : undefined,
    });
    let json = null; try { json = await res.json(); } catch {}
    return { status: res.status, json };
  }
  async function del(p, cookie) {
    const res = await fetch(`http://127.0.0.1:${PORT}${p}`, {
      method: 'DELETE',
      headers: { ...(cookie ? { Cookie: cookie } : {}) },
    });
    let json = null; try { json = await res.json(); } catch {}
    return { status: res.status, json };
  }

  process.stdout.write('\n── POST /api/bind ──\n');

  await test('без авторизации → 401', async () => {
    const initData = buildInitData(BOT_TOKEN, { id: 111 }, freshDate);
    assert.strictEqual((await post('/api/bind', { name: 'Аня', initData })).status, 401);
  });

  await test('без initData → 400', async () => {
    assert.strictEqual((await post('/api/bind', { name: 'Аня' }, cookieFor('Аня'))).status, 400);
  });

  await test('валидный initData, name === свой аккаунт → 200, id из initData сохранён', async () => {
    const initData = buildInitData(BOT_TOKEN, { id: 424242, first_name: 'Аня' }, freshDate);
    const { status, json } = await post('/api/bind', { name: 'Аня', initData }, cookieFor('Аня'));
    assert.strictEqual(status, 200);
    assert.strictEqual(json.success, true);
    assert.strictEqual(data.bindings['Аня'], 424242);
    assert.strictEqual(sentMessages.length, 1);
    assert.strictEqual(sentMessages[0].chatId, 424242);
  });

  await test('SEC: telegramId, подсунутый в теле, игнорируется — берётся только из initData', async () => {
    const initData = buildInitData(BOT_TOKEN, { id: 555555, first_name: 'Петя' }, freshDate);
    const { status } = await post('/api/bind', { name: 'Петя', initData, telegramId: 999999 }, cookieFor('Петя'));
    assert.strictEqual(status, 200);
    assert.strictEqual(data.bindings['Петя'], 555555); // не 999999
  });

  await test('SEC: name чужого аккаунта (выдача за менеджера) → 403, чужая привязка не создана', async () => {
    const initData = buildInitData(BOT_TOKEN, { id: 777777, first_name: 'Атакующий' }, freshDate);
    const { status } = await post('/api/bind', { name: 'manager', initData }, cookieFor('Петя'));
    assert.strictEqual(status, 403);
    assert.notStrictEqual(data.bindings['manager'], 777777);
  });

  await test('битая подпись → 403', async () => {
    let initData = buildInitData(BOT_TOKEN, { id: 111 }, freshDate);
    initData = initData.replace(/hash=[a-f0-9]+/, 'hash=deadbeef');
    assert.strictEqual((await post('/api/bind', { name: 'Аня', initData }, cookieFor('Аня'))).status, 403);
  });

  await test('просроченный auth_date → 403', async () => {
    const initData = buildInitData(BOT_TOKEN, { id: 111 }, staleDate);
    assert.strictEqual((await post('/api/bind', { name: 'Аня', initData }, cookieFor('Аня'))).status, 403);
  });

  process.stdout.write('\n── DELETE /api/bind/:name ──\n');

  await test('обычный аккаунт → 403 (нужен manager)', async () => {
    assert.strictEqual((await del('/api/bind/Аня', cookieFor('Петя'))).status, 403);
  });

  await test('manager → 200, привязка удалена', async () => {
    const { status, json } = await del('/api/bind/Аня', cookieFor('manager'));
    assert.strictEqual(status, 200);
    assert.strictEqual(json.success, true);
    assert.ok(!('Аня' in data.bindings));
  });

  server.close();

  process.stdout.write('\n' + '─'.repeat(58) + '\n');
  process.stdout.write(`Итого: ${passed + failed} тестов | ✅ ${passed} прошло | ❌ ${failed} упало\n`);
  if (failed > 0) { process.stdout.write('\n❌ Есть упавшие тесты\n'); process.exit(1); }
  process.stdout.write('\n🎉 Все тесты прошли!\n');
})();
