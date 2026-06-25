#!/usr/bin/env node
// db.test.js — тесты адаптера PostgreSQL (db/adapter.js) на мок-пуле.
// Запуск: node tests/db.test.js
// Покрывает: сериализацию kv, kvGetAll/kvDelete, нормализацию telegram_id к Number,
// фильтр active, мягкую отвязку и реактивацию привязок — регрессионно-критичные
// инварианты миграции на PostgreSQL.
'use strict';
const assert = require('assert');

// ─── Раннер (тот же стиль, что tests/iiko.test.js) ───────────────────────────
let passed = 0, failed = 0;

async function test(name, fn) {
  try {
    await fn();
    passed++;
    process.stdout.write(`  ✅ ${name}\n`);
  } catch (e) {
    failed++;
    process.stdout.write(`  ❌ ${name}\n     → ${e.message}\n`);
  }
}

// ─── Мок pg-пула ─────────────────────────────────────────────────────────────
// Распознаёт ровно те SQL-запросы, что шлёт adapter.js, и держит данные в Map.
// telegram_id хранится СТРОКОЙ — имитирует BIGINT→string из реального pg-драйвера
// (именно поэтому adapter нормализует его к Number в getBindings).
function makeFakePool() {
  const kv  = new Map();   // key  -> value (string)
  const emp = new Map();   // name -> { telegram_id: string, active: bool }

  async function query(sql, params = []) {
    const s = sql.replace(/\s+/g, ' ').trim();

    // ── kv_store ──
    if (/^INSERT INTO kv_store/.test(s)) {       // kvSet (upsert)
      kv.set(params[0], params[1]);
      return { rowCount: 1, rows: [] };
    }
    if (/^SELECT value FROM kv_store WHERE key/.test(s)) { // kvGet
      const v = kv.get(params[0]);
      return { rows: v !== undefined ? [{ value: v }] : [] };
    }
    if (/^SELECT key, value FROM kv_store/.test(s)) {      // kvGetAll
      return { rows: [...kv].map(([key, value]) => ({ key, value })) };
    }
    if (/^DELETE FROM kv_store WHERE key/.test(s)) {       // kvDelete
      const had = kv.delete(params[0]);
      return { rowCount: had ? 1 : 0, rows: [] };
    }

    // ── employee_bindings ──
    if (/^INSERT INTO employee_bindings/.test(s)) {        // bindEmployee (active=true)
      emp.set(params[0], { telegram_id: String(params[1]), active: true });
      return { rowCount: 1, rows: [] };
    }
    if (/^UPDATE employee_bindings SET active = false/.test(s)) { // unbindEmployee
      const e = emp.get(params[0]);
      if (e) e.active = false;
      return { rowCount: e ? 1 : 0, rows: [] };
    }
    if (/^SELECT name, telegram_id FROM employee_bindings WHERE active = true/.test(s)) { // getBindings
      return { rows: [...emp].filter(([, e]) => e.active).map(([name, e]) => ({ name, telegram_id: e.telegram_id })) };
    }
    if (/^SELECT name FROM employee_bindings WHERE telegram_id/.test(s)) { // getEmployeeByTelegramId
      const hit = [...emp].find(([, e]) => String(e.telegram_id) === String(params[0]) && e.active);
      return { rows: hit ? [{ name: hit[0] }] : [] };
    }

    throw new Error('необработанный SQL в мок-пуле: ' + s);
  }

  return { query, _kv: kv, _emp: emp };
}

// Загружает свежий adapter поверх подменённого pool из кэша require.
function loadAdapter(fakePool) {
  const poolKey    = require.resolve('../db/pool');
  const adapterKey = require.resolve('../db/adapter');
  require.cache[poolKey] = { id: poolKey, filename: poolKey, loaded: true, exports: fakePool };
  delete require.cache[adapterKey];
  return require('../db/adapter');
}

// ─── Тесты ───────────────────────────────────────────────────────────────────
(async () => {
  process.stdout.write('\n── db/adapter.js ──\n');

  await test('kvSet строки сохраняет как есть, kvGet возвращает её', async () => {
    const a = loadAdapter(makeFakePool());
    await a.kvSet('tasks:v4', '[{"id":1}]');
    assert.strictEqual(await a.kvGet('tasks:v4'), '[{"id":1}]');
  });

  await test('kvSet объекта сериализует в JSON-строку', async () => {
    const pool = makeFakePool();
    const a = loadAdapter(pool);
    await a.kvSet('cfg:v1', { a: 1, b: 'x' });
    assert.strictEqual(pool._kv.get('cfg:v1'), '{"a":1,"b":"x"}');
  });

  await test('kvGet несуществующего ключа → null', async () => {
    const a = loadAdapter(makeFakePool());
    assert.strictEqual(await a.kvGet('нет:v1'), null);
  });

  await test('kvGetAll возвращает все ключи разом', async () => {
    const a = loadAdapter(makeFakePool());
    await a.kvSet('a:v1', '1');
    await a.kvSet('b:v1', '2');
    const all = await a.kvGetAll();
    assert.deepStrictEqual(all, { 'a:v1': '1', 'b:v1': '2' });
  });

  await test('kvDelete удаляет ключ (не воскресает в kvGetAll)', async () => {
    const a = loadAdapter(makeFakePool());
    await a.kvSet('tmp:v1', 'x');
    await a.kvDelete('tmp:v1');
    assert.strictEqual(await a.kvGet('tmp:v1'), null);
    assert.deepStrictEqual(await a.kvGetAll(), {});
  });

  await test('getBindings нормализует telegram_id к Number (регрессия BIGINT→string)', async () => {
    const a = loadAdapter(makeFakePool());
    await a.bindEmployee('Антон', 243024100);
    const b = await a.getBindings();
    assert.strictEqual(b['Антон'], 243024100);
    assert.strictEqual(typeof b['Антон'], 'number');
  });

  await test('несколько имён на один Telegram допустимы (нет UNIQUE на telegram_id)', async () => {
    const a = loadAdapter(makeFakePool());
    await a.bindEmployee('Антон', 243024100);
    await a.bindEmployee('Павел', 243024100);
    const b = await a.getBindings();
    assert.strictEqual(b['Антон'], 243024100);
    assert.strictEqual(b['Павел'], 243024100);
  });

  await test('unbindEmployee мягко скрывает привязку (active=false)', async () => {
    const a = loadAdapter(makeFakePool());
    await a.bindEmployee('Павел', 243024100);
    await a.unbindEmployee('Павел');
    assert.strictEqual('Павел' in (await a.getBindings()), false);
  });

  await test('bindEmployee реактивирует ранее отвязанного (active=true)', async () => {
    const a = loadAdapter(makeFakePool());
    await a.bindEmployee('Павел', 243024100);
    await a.unbindEmployee('Павел');
    await a.bindEmployee('Павел', 243024100);   // повторная привязка
    assert.strictEqual((await a.getBindings())['Павел'], 243024100);
  });

  await test('getEmployeeByTelegramId находит активного, не находит отвязанного', async () => {
    const a = loadAdapter(makeFakePool());
    await a.bindEmployee('Антон', 243024100);
    assert.strictEqual(await a.getEmployeeByTelegramId(243024100), 'Антон');
    await a.unbindEmployee('Антон');
    assert.strictEqual(await a.getEmployeeByTelegramId(243024100), null);
  });

  // ─── Итог ───
  process.stdout.write('\n' + '─'.repeat(58) + '\n');
  process.stdout.write(`Итого: ${passed + failed} тестов | ✅ ${passed} прошло | ❌ ${failed} упало\n`);
  if (failed > 0) { process.stdout.write('\n❌ Есть упавшие тесты\n'); process.exit(1); }
  process.stdout.write('\n🎉 Все тесты прошли!\n');
})();
