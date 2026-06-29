#!/usr/bin/env node
// pushApi.test.js — тесты REST редактора пушей (Item 5, src/api/push.js):
//   • CRUD push:v1.defs (GET/PUT/DELETE, запрет удаления system);
//   • PUT /recipients/:name — переключение + edge-trigger уведомление управляющим;
//   • GET /stats — срез byName.
// Поднимаем роутер на временном express-приложении, ходим через global fetch
// с валидной manager-cookie. sender — мок (не пишет в push-log, не шлёт в Telegram).
// Запуск: node tests/pushApi.test.js
'use strict';
const assert        = require('assert');
const http          = require('http');
const express       = require('express');
const cookieParser  = require('cookie-parser');
const { signToken, COOKIE_NAME } = require('../src/middleware/auth');
const makePushApi   = require('../src/api/push');
const { ensurePushModel } = require('../src/push/model');

let passed = 0, failed = 0;
async function test(name, fn) {
  try { await fn(); passed++; process.stdout.write(`  ✅ ${name}\n`); }
  catch (e) { failed++; process.stdout.write(`  ❌ ${name}\n     → ${e.message}\n`); }
}

// Мок-sender: ловит вызовы доставки, отдаёт менеджеров для edge-trigger.
function mockSender() {
  const calls = { sent: [], skipped: [] };
  return {
    resolveAudienceNames: (aud) => {
      if (aud && Array.isArray(aud.roles) && aud.roles.includes('manager')) return ['Павел'];
      return [];
    },
    sendPush: async (bot, chatId, msg, type, opts) => {
      calls.sent.push({ chatId, msg, type, name: opts && opts.name });
      return true;
    },
    recordSkip: (name, pushId, reason) => calls.skipped.push({ name, pushId, reason }),
    _calls: calls,
  };
}

function mkData(bindings = {}) {
  const data = {
    kv: {
      'profiles:v1': JSON.stringify([
        { name: 'Павел',   role: 'manager' },
        { name: 'Тимофей', role: 'barman' },
        { name: 'Андрей',  role: 'barman' },
      ]),
    },
    bindings,
    pushSettings: {},
  };
  ensurePushModel(data, () => {}); // сидирует push:v1 (4 system-defs + recipients)
  return data;
}

(async () => {
  const sender = mockSender();
  const data = mkData({ 'Павел': 111 }); // менеджер с привязкой — получатель edge-trigger
  const app = express();
  app.use(express.json());
  app.use(cookieParser());
  app.use('/api/push', makePushApi(sender, data, () => {}, {/* bot truthy */}));

  const server = await new Promise(r => { const s = http.createServer(app).listen(0, () => r(s)); });
  const PORT = server.address().port;
  const token = signToken('manager');
  const COOKIE = `${COOKIE_NAME}=${token}`;

  const COOKIE_ANDREY = `${COOKIE_NAME}=${signToken('Андрей')}`; // бармен — для self-проверок
  async function req(method, p, body, cookie = COOKIE) {
    const res = await fetch(`http://127.0.0.1:${PORT}${p}`, {
      method,
      headers: { 'Content-Type': 'application/json', 'Cookie': cookie },
      body: body !== undefined ? JSON.stringify(body) : undefined,
    });
    let json = null; try { json = await res.json(); } catch {}
    return { status: res.status, json };
  }

  // ─── CRUD defs ───────────────────────────────────────────────────────────────
  process.stdout.write('\n── push/defs CRUD ──\n');

  await test('GET /defs → 4 system-defs + recipients из ростера', async () => {
    const { status, json } = await req('GET', '/api/push/defs');
    assert.strictEqual(status, 200);
    assert.strictEqual(json.defs.length, 4);
    assert.ok(json.defs.every(d => d.system));
    assert.deepStrictEqual(Object.keys(json.recipients).sort(), ['Андрей', 'Павел', 'Тимофей']);
  });

  await test('PUT /defs создаёт пользовательский def (system:false)', async () => {
    const { status, json } = await req('PUT', '/api/push/defs', {
      id: 'promo', title: 'Промо', contentSource: 'static',
      template: 'Привет, {{имя}}!', schedule: { time: '12:00', days: 'daily' }, audience: 'all',
    });
    assert.strictEqual(status, 200);
    assert.strictEqual(json.def.system, false);
    const list = (await req('GET', '/api/push/defs')).json.defs;
    assert.strictEqual(list.length, 5);
  });

  await test('PUT /defs правит system-def, но contentSource фиксирован', async () => {
    const { status, json } = await req('PUT', '/api/push/defs', {
      id: 'day_before', title: 'За сутки', enabled: false,
      contentSource: 'static', // попытка подмены — должна игнорироваться
      schedule: { time: '19:30', days: 'daily' }, audience: 'all',
    });
    assert.strictEqual(status, 200);
    assert.strictEqual(json.def.contentSource, 'tasks_tomorrow'); // не подменился
    assert.strictEqual(json.def.enabled, false);
    assert.strictEqual(json.def.schedule.time, '19:30');
    assert.strictEqual(json.def.system, true);
  });

  await test('PUT /defs отклоняет некорректное время', async () => {
    const { status } = await req('PUT', '/api/push/defs', {
      id: 'promo', title: 'Промо', contentSource: 'static',
      schedule: { time: '99:99', days: 'daily' }, audience: 'all',
    });
    assert.strictEqual(status, 400);
  });

  await test('DELETE /defs/:id удаляет пользовательский', async () => {
    const { status, json } = await req('DELETE', '/api/push/defs/promo');
    assert.strictEqual(status, 200);
    assert.ok(json.success);
    assert.strictEqual((await req('GET', '/api/push/defs')).json.defs.length, 4);
  });

  await test('DELETE /defs/:id запрещён для system (403)', async () => {
    const { status } = await req('DELETE', '/api/push/defs/day_before');
    assert.strictEqual(status, 403);
  });

  // ─── recipients + edge-trigger ────────────────────────────────────────────────
  process.stdout.write('\n── push/recipients (edge-trigger mute) ──\n');

  await test('PUT enabled:false (true→false) → уведомление менеджерам', async () => {
    sender._calls.sent.length = 0;
    const { status, json } = await req('PUT', '/api/push/recipients/Тимофей', { enabled: false, by: 'manager' });
    assert.strictEqual(status, 200);
    assert.strictEqual(json.recipient.enabled, false);
    assert.strictEqual(json.recipient.mutedBy, 'manager');
    assert.ok(json.recipient.mutedAt);
    assert.strictEqual(json.managersNotified, 1);              // Павел получил
    assert.strictEqual(sender._calls.sent[0].type, 'pushMuted');
    assert.strictEqual(sender._calls.sent[0].chatId, '111');
  });

  await test('повторное enabled:false (false→false) → без уведомления', async () => {
    sender._calls.sent.length = 0;
    const { json } = await req('PUT', '/api/push/recipients/Тимофей', { enabled: false });
    assert.strictEqual(json.managersNotified, 0);
    assert.strictEqual(sender._calls.sent.length, 0);
  });

  await test('PUT enabled:true сбрасывает mutedAt/mutedBy, без уведомления', async () => {
    sender._calls.sent.length = 0;
    const { json } = await req('PUT', '/api/push/recipients/Тимофей', { enabled: true });
    assert.strictEqual(json.recipient.enabled, true);
    assert.strictEqual(json.recipient.mutedAt, null);
    assert.strictEqual(json.recipient.mutedBy, null);
    assert.strictEqual(json.managersNotified, 0);
  });

  await test('self-mute (by:self, своя cookie) → mutedBy:self + уведомление', async () => {
    sender._calls.sent.length = 0;
    const { status, json } = await req('PUT', '/api/push/recipients/Андрей', { enabled: false, by: 'self' }, COOKIE_ANDREY);
    assert.strictEqual(status, 200);
    assert.strictEqual(json.recipient.mutedBy, 'self');
    assert.strictEqual(json.managersNotified, 1);
  });

  await test('self-mute чужого имени (by:self) → 403', async () => {
    const { status } = await req('PUT', '/api/push/recipients/Тимофей', { enabled: false, by: 'self' }, COOKIE_ANDREY);
    assert.strictEqual(status, 403);
  });

  await test('бармен без by:self (попытка manager-режима) → 403', async () => {
    const { status } = await req('PUT', '/api/push/recipients/Андрей', { enabled: true }, COOKIE_ANDREY);
    assert.strictEqual(status, 403);
  });

  await test('manager возвращает Андрею enabled:true (очистка после self-mute)', async () => {
    const { status, json } = await req('PUT', '/api/push/recipients/Андрей', { enabled: true });
    assert.strictEqual(status, 200);
    assert.strictEqual(json.recipient.enabled, true);
  });

  await test('PUT без enabled (не boolean) → 400', async () => {
    const { status } = await req('PUT', '/api/push/recipients/Андрей', { foo: 1 });
    assert.strictEqual(status, 400);
  });

  // ─── stats ────────────────────────────────────────────────────────────────────
  process.stdout.write('\n── push/stats ──\n');

  await test('GET /stats → success + срез byName', async () => {
    const { status, json } = await req('GET', '/api/push/stats');
    assert.strictEqual(status, 200);
    assert.ok(json.success);
    assert.strictEqual(typeof json.byName, 'object');
    assert.strictEqual(typeof json.byUser, 'object');
  });

  // ─── auth-гейт ──────────────────────────────────────────────────────────────
  await test('без cookie → 401', async () => {
    const res = await fetch(`http://127.0.0.1:${PORT}/api/push/defs`);
    assert.strictEqual(res.status, 401);
  });

  server.close();

  process.stdout.write('\n' + '─'.repeat(58) + '\n');
  process.stdout.write(`Итого: ${passed + failed} тестов | ✅ ${passed} прошло | ❌ ${failed} упало\n`);
  if (failed > 0) { process.stdout.write('\n❌ Есть упавшие тесты\n'); process.exit(1); }
  process.stdout.write('\n🎉 Все тесты прошли!\n');
})();
