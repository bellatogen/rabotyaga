#!/usr/bin/env node
// shift.test.js — тесты бэкенд-фундамента редактора пушей (Чанк A):
//   • src/shift/isToday.js          — правило актуальности задачи (дедуп копий);
//   • src/shift/status.js           — порт getShiftStatus;
//   • src/push/model.js             — модель push:v1 + миграция хранилищ.
// Запуск: node tests/shift.test.js
'use strict';
const assert = require('assert');

let passed = 0, failed = 0;
async function test(name, fn) {
  try { await fn(); passed++; process.stdout.write(`  ✅ ${name}\n`); }
  catch (e) { failed++; process.stdout.write(`  ❌ ${name}\n     → ${e.message}\n`); }
}

const { isToday } = require('../src/shift/isToday');
const { getShiftStatus } = require('../src/shift/status');
const { migratePushModel, defaultDefs, seedRecipients } = require('../src/push/model');

// ─── isToday ──────────────────────────────────────────────────────────────────
// Эталонная копия правила из frontend/src/utils/taskUtils.js — тест на идентичность.
// Если правило меняется, оба должны меняться синхронно (фронт + бэкенд-модуль).
function isTodayReference(task, ds) {
  if (task.kind === 'irregular') return false;
  if (task.from && ds < task.from) return false;
  if (task.until && ds > task.until) return false;
  if (task.repeat === 'once') return task.date === ds;
  if (['daily', 'opening', 'closing'].includes(task.repeat)) return true;
  if (task.repeat === 'workday') { const d = new Date(ds).getDay(); return d !== 0 && d !== 6; }
  if (task.repeat === 'weekly') return task.dayOfWeek === new Date(ds).getDay();
  return false;
}

(async () => {
  process.stdout.write('\n── src/shift/isToday.js ──\n');

  await test('irregular никогда не today', () => {
    assert.strictEqual(isToday({ kind: 'irregular', repeat: 'daily' }, '2026-06-28'), false);
  });
  await test('daily/opening/closing — всегда', () => {
    ['daily', 'opening', 'closing'].forEach(r =>
      assert.strictEqual(isToday({ repeat: r }, '2026-06-28'), true));
  });
  await test('once совпадает только по дате', () => {
    assert.strictEqual(isToday({ repeat: 'once', date: '2026-06-28' }, '2026-06-28'), true);
    assert.strictEqual(isToday({ repeat: 'once', date: '2026-06-27' }, '2026-06-28'), false);
  });
  await test('workday: будни да, выходные нет', () => {
    assert.strictEqual(isToday({ repeat: 'workday' }, '2026-06-26'), true);  // пт
    assert.strictEqual(isToday({ repeat: 'workday' }, '2026-06-27'), false); // сб
    assert.strictEqual(isToday({ repeat: 'workday' }, '2026-06-28'), false); // вс
  });
  await test('weekly — по dayOfWeek', () => {
    assert.strictEqual(isToday({ repeat: 'weekly', dayOfWeek: 0 }, '2026-06-28'), true);  // вс
    assert.strictEqual(isToday({ repeat: 'weekly', dayOfWeek: 1 }, '2026-06-28'), false);
  });
  await test('from/until ограничивают окно', () => {
    const t = { repeat: 'daily', from: '2026-06-01', until: '2026-06-30' };
    assert.strictEqual(isToday(t, '2026-05-31'), false);
    assert.strictEqual(isToday(t, '2026-06-15'), true);
    assert.strictEqual(isToday(t, '2026-07-01'), false);
  });
  await test('идентичность фронтовому правилу на сетке кейсов', () => {
    const tasks = [
      { repeat: 'daily' }, { repeat: 'opening' }, { repeat: 'closing' },
      { repeat: 'workday' }, { repeat: 'weekly', dayOfWeek: 3 },
      { repeat: 'once', date: '2026-06-28' }, { kind: 'irregular', repeat: 'daily' },
      { repeat: 'daily', from: '2026-06-10', until: '2026-06-20' },
    ];
    const days = ['2026-06-05', '2026-06-15', '2026-06-26', '2026-06-27', '2026-06-28', '2026-07-01'];
    tasks.forEach(t => days.forEach(d =>
      assert.strictEqual(isToday(t, d), isTodayReference(t, d), `mismatch ${JSON.stringify(t)} @ ${d}`)));
  });

  // ─── getShiftStatus ───────────────────────────────────────────────────────
  process.stdout.write('\n── src/shift/status.js ──\n');

  const sched = {
    '2026-06-28': [{ name: 'Павел', start: '18:00', end: '11:00' }], // 18:00 → +11ч = 05:00 след.дня (clamp 1440)
    '2026-06-29': [{ name: 'Тимофей', start: '13:00', end: '10:00' }],
  };
  const noOv = [];

  await test('override перекрывает расписание', () => {
    const ov = [{ name: 'Павел', status: 'sick', from: '2026-06-27', until: '2026-06-30' }];
    assert.strictEqual(getShiftStatus('Павел', '2026-06-28', sched, ov, new Date('2026-06-28T20:00:00')), 'sick');
  });
  await test('override без until открыт вправо', () => {
    const ov = [{ name: 'Павел', status: 'vacation', from: '2026-06-01', until: '' }];
    assert.strictEqual(getShiftStatus('Павел', '2026-06-28', sched, ov, new Date('2026-06-28T20:00:00')), 'vacation');
  });
  await test('нет смены сегодня, есть завтра → tomorrow_shift', () => {
    assert.strictEqual(getShiftStatus('Тимофей', '2026-06-28', sched, noOv, new Date('2026-06-28T12:00:00')), 'tomorrow_shift');
  });
  await test('нет смены ни сегодня, ни завтра → day_off', () => {
    assert.strictEqual(getShiftStatus('Андрей', '2026-06-28', sched, noOv, new Date('2026-06-28T12:00:00')), 'day_off');
  });
  await test('в окне смены → on_shift', () => {
    assert.strictEqual(getShiftStatus('Павел', '2026-06-28', sched, noOv, new Date('2026-06-28T20:00:00')), 'on_shift');
  });
  await test('до начала смены (после 6:00) → today_shift', () => {
    assert.strictEqual(getShiftStatus('Павел', '2026-06-28', sched, noOv, new Date('2026-06-28T10:00:00')), 'today_shift');
  });
  await test('после окончания смены → worked', () => {
    // start 18:00 (1080) + end 11ч (660) = 1740 → clamp 1440 → конец «в полночь»; 23:50 < 1440 → ещё on_shift.
    // Берём смену с явным окончанием в пределах суток для worked.
    const s2 = { '2026-06-28': [{ name: 'Павел', start: '11:00', end: '02:00' }] }; // 11:00 + 2ч = 13:00
    assert.strictEqual(getShiftStatus('Павел', '2026-06-28', s2, noOv, new Date('2026-06-28T15:00:00')), 'worked');
  });

  // ─── migratePushModel / model.js ──────────────────────────────────────────
  process.stdout.write('\n── src/push/model.js ──\n');

  await test('defaultDefs: 4 предустановленных, все system', () => {
    const defs = defaultDefs();
    assert.strictEqual(defs.length, 4);
    assert.ok(defs.every(d => d.system === true));
    assert.deepStrictEqual(defs.map(d => d.id).sort(), ['close_shift', 'day_before', 'personal_tasks', 'sets']);
  });
  await test('close_shift подавляется на отсутствии, личные/за-день — нет', () => {
    const byId = Object.fromEntries(defaultDefs().map(d => [d.id, d]));
    assert.deepStrictEqual(byId.close_shift.suppressStatuses, ['day_off', 'sick', 'vacation', 'business_trip']);
    assert.deepStrictEqual(byId.day_before.suppressStatuses, []);
    assert.deepStrictEqual(byId.personal_tasks.suppressStatuses, []);
    assert.strictEqual(byId.personal_tasks.audience, 'assigned');
  });
  await test('seedRecipients: по ростеру, дефолт enabled:true', () => {
    const r = seedRecipients([{ name: 'Павел' }, { name: 'Тимофей' }]);
    assert.deepStrictEqual(Object.keys(r).sort(), ['Павел', 'Тимофей']);
    assert.deepStrictEqual(r['Павел'], { enabled: true, mutedAt: null, mutedBy: null });
  });
  await test('миграция: recipients из profiles + схлопывание per-user enabled', () => {
    const { model } = migratePushModel({
      profiles: [{ name: 'Павел' }, { name: 'Тимофей' }],
      bindings: { 'Павел': 111, 'Тимофей': 222 },
      perUserSettings: {
        '111': { enabled: false, notifications: { personalTasks: true } }, // отключён → enabled:false
        '222': { enabled: true },
      },
    });
    assert.strictEqual(model.recipients['Павел'].enabled, false);
    assert.strictEqual(model.recipients['Павел'].mutedBy, 'manager');
    assert.strictEqual(model.recipients['Тимофей'].enabled, true);
  });
  await test('миграция: globalSettings.jobs накладываются на defs', () => {
    const { model } = migratePushModel({
      profiles: [],
      globalSettings: {
        jobs: { dayBefore: { enabled: false, time: '21:30' } },
        templates: { dayBefore: 'Привет {{имя}}' },
      },
    });
    const db = model.defs.find(d => d.id === 'day_before');
    assert.strictEqual(db.enabled, false);
    assert.strictEqual(db.schedule.time, '21:30');
    assert.strictEqual(db.template, 'Привет {{имя}}');
  });
  await test('миграция: нерезолвимый pushSettings дропается с логом', () => {
    const { model, log } = migratePushModel({
      profiles: [{ name: 'Павел' }],
      bindings: {}, // нет привязок → 999 не резолвится
      perUserSettings: { '999': { enabled: false } },
    });
    assert.ok(log.some(l => /999/.test(l) && /дроп/i.test(l)));
    assert.strictEqual(model.recipients['Павел'].enabled, true); // не задет
  });
  await test('миграция: коллизия telegramId на два имени → лог, первое выигрывает', () => {
    const { model, log } = migratePushModel({
      profiles: [{ name: 'Павел' }, { name: 'Тимофей' }],
      bindings: { 'Павел': 111, 'Тимофей': 111 }, // один id на двоих
      perUserSettings: { '111': { enabled: false } },
    });
    assert.ok(log.some(l => /111/.test(l)));
    // Первое имя (Павел) получает enabled:false; второе не задето схлопыванием.
    assert.strictEqual(model.recipients['Павел'].enabled, false);
    assert.strictEqual(model.recipients['Тимофей'].enabled, true);
  });

  // ─── Итог ───
  process.stdout.write('\n' + '─'.repeat(58) + '\n');
  process.stdout.write(`Итого: ${passed + failed} тестов | ✅ ${passed} прошло | ❌ ${failed} упало\n`);
  if (failed > 0) { process.stdout.write('\n❌ Есть упавшие тесты\n'); process.exit(1); }
  process.stdout.write('\n🎉 Все тесты прошли!\n');
})();
