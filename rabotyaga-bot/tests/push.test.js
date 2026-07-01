#!/usr/bin/env node
// push.test.js — тесты универсального исполнителя пушей (Item 4):
//   • src/push/sender.js    — resolveAudienceNames / renderPush (чистые хелперы);
//   • src/push/scheduler.js — defDue (расписание) и runDef (гейтинг доставки).
// Доставка (sendPush) пишет в push-log.json — здесь подменяется мок-sender,
// чтобы тесты не трогали файл и не били в Telegram.
// Запуск: node tests/push.test.js
'use strict';
const assert = require('assert');

let passed = 0, failed = 0;
async function test(name, fn) {
  try { await fn(); passed++; process.stdout.write(`  ✅ ${name}\n`); }
  catch (e) { failed++; process.stdout.write(`  ❌ ${name}\n     → ${e.message}\n`); }
}

const makeSender = require('../src/push/sender');
const { escapeHtml } = require('../src/push/sender');
const { defDue, runDef } = require('../src/push/scheduler');

// data-заглушка для фабрики sender (profiles/bindings из памяти).
function mkData(extra = {}) {
  return {
    kv: {
      'profiles:v1': JSON.stringify([
        { name: 'Павел',   role: 'manager' },
        { name: 'Тимофей', role: 'barman' },
        { name: 'Андрей',  role: 'barman' },
      ]),
      'schedule:v1': '{}',
      'status_overrides:v1': '[]',
      ...(extra.kv || {}),
    },
    bindings: extra.bindings || {},
    pushSettings: {},
  };
}

(async () => {
  // ─── resolveAudienceNames ───────────────────────────────────────────────────
  process.stdout.write('\n── sender.resolveAudienceNames ──\n');
  const s = makeSender(mkData(), () => {});

  await test('audience "all" → весь ростер', () => {
    assert.deepStrictEqual(s.resolveAudienceNames('all').sort(), ['Андрей', 'Павел', 'Тимофей']);
  });
  await test('audience {roles} → по роли', () => {
    assert.deepStrictEqual(s.resolveAudienceNames({ roles: ['manager'] }), ['Павел']);
    assert.deepStrictEqual(s.resolveAudienceNames({ roles: ['barman'] }).sort(), ['Андрей', 'Тимофей']);
  });
  await test('audience {names} → явный список', () => {
    assert.deepStrictEqual(s.resolveAudienceNames({ names: ['Тимофей'] }), ['Тимофей']);
  });
  await test('audience "assigned" → переданный assignedNames', () => {
    assert.deepStrictEqual(s.resolveAudienceNames('assigned', ['Андрей']), ['Андрей']);
    assert.deepStrictEqual(s.resolveAudienceNames('assigned', null), []);
  });

  // ─── renderPush ────────────────────────────────────────────────────────────
  process.stdout.write('\n── sender.renderPush (диспетчеризация contentSource) ──\n');

  await test('tasks_tomorrow: подстановка {tasks} + дефолт шаблона', () => {
    const def = { contentSource: 'tasks_tomorrow', template: '' };
    const msg = s.renderPush(def, 'Павел', { tasksText: '1. Открыть бар' });
    assert.ok(msg.includes('1. Открыть бар'));
    assert.ok(!msg.includes('{tasks}'));
  });
  await test('tasks_today_personal: нет задач → null', () => {
    const def = { contentSource: 'tasks_today_personal', template: '' };
    assert.strictEqual(s.renderPush(def, 'Павел', { personalByName: {} }), null);
  });
  await test('tasks_today_personal: есть задачи → текст по имени', () => {
    const def = { contentSource: 'tasks_today_personal', template: '' };
    const shared = { personalByName: { 'Павел': [{ title: 'Касса', assignedBy: 'Шеф' }] } };
    const msg = s.renderPush(def, 'Павел', shared);
    assert.ok(msg.includes('Касса'));
  });
  await test('sets: пустой setsText → null', () => {
    assert.strictEqual(s.renderPush({ contentSource: 'sets', template: '' }, 'Павел', { setsText: '' }), null);
  });
  await test('sets: непустой → подстановка {sets}', () => {
    const msg = s.renderPush({ contentSource: 'sets', template: '' }, 'Павел', { setsText: '1. Пиво + Чипсы' });
    assert.ok(msg.includes('Пиво + Чипсы'));
  });
  await test('close_checklist: дефолтный чек-лист', () => {
    const msg = s.renderPush({ contentSource: 'close_checklist', template: '' }, 'Павел', {});
    assert.ok(msg.includes('Чек-лист'));
  });
  await test('кастомный template с {{имя}}', () => {
    const def = { contentSource: 'static', template: 'Привет, {{имя}}!' };
    assert.strictEqual(s.renderPush(def, 'Павел', {}), 'Привет, Павел!');
  });
  await test('static с пустым шаблоном → null (слать нечего)', () => {
    assert.strictEqual(s.renderPush({ contentSource: 'static', template: '' }, 'Павел', {}), null);
  });

  // ─── SEC: экранирование пользовательских данных (XSS в parse_mode:'HTML') ───
  process.stdout.write('\n── SEC: escapeHtml в substVars/renderPush ──\n');

  await test('escapeHtml экранирует &, <, >, ", \'', () => {
    assert.strictEqual(escapeHtml(`<b>&"'</b>`), '&lt;b&gt;&amp;&quot;&#39;&lt;/b&gt;');
  });

  await test('{{имя}} с HTML-разметкой в имени → экранируется', () => {
    const def = { contentSource: 'static', template: 'Привет, {{имя}}!' };
    const msg = s.renderPush(def, '<a href="evil">Павел</a>', {});
    assert.ok(!msg.includes('<a href'));
    assert.ok(msg.includes('&lt;a href=&quot;evil&quot;&gt;Павел&lt;/a&gt;'));
  });

  await test('tasks_tomorrow: HTML в названии задачи → экранируется', () => {
    const def = { contentSource: 'tasks_tomorrow', template: '' };
    const msg = s.renderPush(def, 'Павел', { tasksText: '1. <script>alert(1)</script>' });
    assert.ok(!msg.includes('<script>'));
    assert.ok(msg.includes('&lt;script&gt;'));
  });

  await test('tasks_today_personal: HTML в полях задачи → экранируется', () => {
    const def = { contentSource: 'tasks_today_personal', template: '' };
    const shared = { personalByName: { 'Павел': [{ title: '<b>Касса</b>', assignedBy: 'Шеф<i>х</i>', context: '<a href="x">тут</a>' }] } };
    const msg = s.renderPush(def, 'Павел', shared);
    assert.ok(!/<b>|<i>|<a /.test(msg));
    assert.ok(msg.includes('&lt;b&gt;Касса&lt;/b&gt;'));
  });

  await test('sets: HTML в setsText → экранируется', () => {
    const msg = s.renderPush({ contentSource: 'sets', template: '' }, 'Павел', { setsText: '<u>Пиво</u> + Чипсы' });
    assert.ok(!msg.includes('<u>'));
    assert.ok(msg.includes('&lt;u&gt;'));
  });

  // ─── defDue (расписание) ────────────────────────────────────────────────────
  process.stdout.write('\n── scheduler.defDue ──\n');
  const T = '2026-06-28'; // воскресенье (weekday=0)

  await test('совпала минута + daily → due', () => {
    const def = { id: 'x', schedule: { time: '20:00', days: 'daily' } };
    assert.strictEqual(defDue(def, 1200, 0, T, {}), true);   // 20:00 = 1200
    assert.strictEqual(defDue(def, 1201, 0, T, {}), false);
  });
  await test('уже отправлено сегодня → не due', () => {
    const def = { id: 'x', schedule: { time: '20:00', days: 'daily' } };
    assert.strictEqual(defDue(def, 1200, 0, T, { x: T }), false);
  });
  await test('days[] не содержит сегодня → не due', () => {
    const def = { id: 'x', schedule: { time: '20:00', days: [1, 2, 3] } }; // пн-ср
    assert.strictEqual(defDue(def, 1200, 0, T, {}), false); // вс не входит
  });
  await test('days[] содержит сегодня → due', () => {
    const def = { id: 'x', schedule: { time: '20:00', days: [0, 6] } }; // вс/сб
    assert.strictEqual(defDue(def, 1200, 0, T, {}), true);
  });
  await test('нет time → не due', () => {
    assert.strictEqual(defDue({ id: 'x', schedule: {} }, 1200, 0, T, {}), false);
  });

  // ─── runDef (гейтинг доставки) ──────────────────────────────────────────────
  process.stdout.write('\n── scheduler.runDef (гейтинг) ──\n');

  // Мок-sender: ловит вызовы, не пишет в push-log и не шлёт в Telegram.
  function mockSender(names, renderImpl) {
    const calls = { sent: [], skipped: [] };
    return {
      resolveAudienceNames: () => names,
      recordSkip: (name, pushId, reason) => calls.skipped.push({ name, pushId, reason }),
      renderPush: renderImpl || ((def, name) => `msg:${name}`),
      sendPush: async (bot, chatId, msg, type, opts) => {
        calls.sent.push({ chatId, msg, type, name: opts && opts.name });
        return true;
      },
      _calls: calls,
    };
  }
  const ctxBase = (recipients) => ({ today: T, now: new Date('2026-06-28T12:00:00'), recipients, assignedNames: [] });

  await test('recipient enabled:false → skip «отключены», без отправки', async () => {
    const ms = mockSender(['Тимофей']);
    const data = mkData({ bindings: { 'Тимофей': 555 } });
    await runDef(null, data, ms, { id: 'd', audience: 'all', suppressStatuses: [] }, {}, ctxBase({ 'Тимофей': { enabled: false } }));
    assert.strictEqual(ms._calls.sent.length, 0);
    assert.ok(ms._calls.skipped.some(x => /отключены/i.test(x.reason)));
  });

  await test('статус в suppressStatuses → skip «подавлено»', async () => {
    const ms = mockSender(['Андрей']);
    const data = mkData({ bindings: { 'Андрей': 777 } }); // нет смен → day_off
    await runDef(null, data, ms, { id: 'd', audience: 'all', suppressStatuses: ['day_off'] }, {}, ctxBase({}));
    assert.strictEqual(ms._calls.sent.length, 0);
    assert.ok(ms._calls.skipped.some(x => /Подавлено/i.test(x.reason)));
  });

  await test('нет привязки Telegram → skip «не привязан»', async () => {
    const ms = mockSender(['Андрей']);
    const data = mkData({ bindings: {} });
    await runDef(null, data, ms, { id: 'd', audience: 'all', suppressStatuses: [] }, {}, ctxBase({}));
    assert.strictEqual(ms._calls.sent.length, 0);
    assert.ok(ms._calls.skipped.some(x => /привязан/i.test(x.reason)));
  });

  await test('renderPush=null (нечего слать) → нет ни отправки, ни skip', async () => {
    const ms = mockSender(['Андрей'], () => null);
    const data = mkData({ bindings: { 'Андрей': 777 } });
    await runDef(null, data, ms, { id: 'd', audience: 'all', suppressStatuses: [] }, {}, ctxBase({}));
    assert.strictEqual(ms._calls.sent.length, 0);
    assert.strictEqual(ms._calls.skipped.length, 0);
  });

  await test('happy path → sendPush с chatId, type=def.id, name', async () => {
    const ms = mockSender(['Андрей']);
    const data = mkData({ bindings: { 'Андрей': 777 } });
    await runDef(null, data, ms, { id: 'day_before', audience: 'all', suppressStatuses: [] }, {}, ctxBase({ 'Андрей': { enabled: true } }));
    assert.strictEqual(ms._calls.sent.length, 1);
    const c = ms._calls.sent[0];
    assert.strictEqual(c.chatId, '777');
    assert.strictEqual(c.type, 'day_before');
    assert.strictEqual(c.name, 'Андрей');
  });

  await test('suppressStatuses пуст → личные доходят и на выходном (day_off)', async () => {
    const ms = mockSender(['Андрей']);
    const data = mkData({ bindings: { 'Андрей': 777 } }); // day_off
    await runDef(null, data, ms, { id: 'personal_tasks', audience: 'assigned', suppressStatuses: [] }, {}, ctxBase({}));
    assert.strictEqual(ms._calls.sent.length, 1); // несмотря на day_off
  });

  // ─── Итог ───
  process.stdout.write('\n' + '─'.repeat(58) + '\n');
  process.stdout.write(`Итого: ${passed + failed} тестов | ✅ ${passed} прошло | ❌ ${failed} упало\n`);
  if (failed > 0) { process.stdout.write('\n❌ Есть упавшие тесты\n'); process.exit(1); }
  process.stdout.write('\n🎉 Все тесты прошли!\n');
})();
