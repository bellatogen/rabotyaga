#!/usr/bin/env node
// db.test.js — тесты адаптера PostgreSQL (db/adapter.js) на мок-пуле. SEC-8.
// Запуск: node tests/db.test.js
// Покрывает: сериализацию kv, kvGetAll/kvDelete, нормализацию telegram_id к Number,
// фильтр active, мягкую отвязку, реактивацию привязок,
// SEC-8: изоляцию kv/bindings между тенантами, новые tenant/integration методы.
'use strict';
const assert = require('assert');

// ─── Раннер ───────────────────────────────────────────────────────────────────
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
// Распознаёт SQL-запросы, что шлёт adapter.js (SEC-8: все с tenant_id).
// telegram_id хранится СТРОКОЙ — имитирует BIGINT→string из реального pg-драйвера.
function makeFakePool() {
  // { tenantId → Map<key, value> }
  const kvByTenant  = new Map();
  // { tenantId → Map<name, { telegram_id: string, active: bool }> }
  const empByTenant = new Map();
  // { tenantId → Array<{ tenant_id, name, status }> }
  const tenantsMap  = new Map();
  // { tenantId → Map<kind, { enabled, config }> }
  const intgByTenant = new Map();

  function getKv(tid) {
    if (!kvByTenant.has(tid)) kvByTenant.set(tid, new Map());
    return kvByTenant.get(tid);
  }
  function getEmp(tid) {
    if (!empByTenant.has(tid)) empByTenant.set(tid, new Map());
    return empByTenant.get(tid);
  }
  function getIntg(tid) {
    if (!intgByTenant.has(tid)) intgByTenant.set(tid, new Map());
    return intgByTenant.get(tid);
  }

  async function query(sql, params = []) {
    const s = sql.replace(/\s+/g, ' ').trim();

    // ── kv_store ──
    if (/^INSERT INTO kv_store/.test(s)) {                        // kvSet (tenant,key,value)
      getKv(params[0]).set(params[1], params[2]);
      return { rowCount: 1, rows: [] };
    }
    if (/^SELECT value FROM kv_store WHERE tenant_id/.test(s)) {  // kvGet
      const v = getKv(params[0]).get(params[1]);
      return { rows: v !== undefined ? [{ value: v }] : [] };
    }
    if (/^SELECT key, value FROM kv_store WHERE tenant_id/.test(s)) { // kvGetAll
      return { rows: [...getKv(params[0])].map(([key, value]) => ({ key, value })) };
    }
    if (/^DELETE FROM kv_store WHERE tenant_id/.test(s)) {        // kvDelete
      const had = getKv(params[0]).delete(params[1]);
      return { rowCount: had ? 1 : 0, rows: [] };
    }

    // ── employee_bindings ──
    if (/^INSERT INTO employee_bindings/.test(s)) {               // bindEmployee
      getEmp(params[0]).set(params[1], { telegram_id: String(params[2]), active: true });
      return { rowCount: 1, rows: [] };
    }
    if (/^UPDATE employee_bindings SET active = false/.test(s)) { // unbindEmployee
      const e = getEmp(params[0]).get(params[1]);
      if (e) e.active = false;
      return { rowCount: e ? 1 : 0, rows: [] };
    }
    if (/^SELECT name, telegram_id FROM employee_bindings WHERE tenant_id .* active = true/.test(s)) { // getBindings
      return { rows: [...getEmp(params[0])].filter(([, e]) => e.active).map(([name, e]) => ({ name, telegram_id: e.telegram_id })) };
    }
    if (/^SELECT name FROM employee_bindings WHERE tenant_id .* telegram_id .* active = true/.test(s)) { // getEmployeeByTelegramId
      const hit = [...getEmp(params[0])].find(([, e]) => String(e.telegram_id) === String(params[1]) && e.active);
      return { rows: hit ? [{ name: hit[0] }] : [] };
    }

    // ── tenants ──
    if (/^INSERT INTO tenants/.test(s)) {                         // createTenant (upsert)
      tenantsMap.set(params[0], { tenant_id: params[0], name: params[1], status: 'active' });
      return { rowCount: 1, rows: [] };
    }
    if (/^SELECT .* FROM tenants WHERE status = 'active'/.test(s)) { // listActiveTenants
      return { rows: [...tenantsMap.values()].filter(t => t.status === 'active') };
    }
    if (/^SELECT .* FROM tenants WHERE tenant_id/.test(s)) {     // getTenant
      const t = tenantsMap.get(params[0]);
      return { rows: t ? [t] : [] };
    }

    // ── tenant_integrations ──
    if (/^INSERT INTO tenant_integrations/.test(s)) {            // setTenantIntegration (upsert)
      getIntg(params[0]).set(params[1], { enabled: params[2], config: params[3] });
      return { rowCount: 1, rows: [] };
    }
    if (/^SELECT kind, enabled, config FROM tenant_integrations WHERE tenant_id/.test(s)) { // getTenantIntegrations
      return { rows: [...getIntg(params[0])].map(([kind, v]) => ({ kind, enabled: v.enabled, config: v.config })) };
    }

    throw new Error('необработанный SQL в мок-пуле: ' + s);
  }

  return { query, _kvByTenant: kvByTenant, _empByTenant: empByTenant, _tenantsMap: tenantsMap };
}

// Загружает свежий adapter поверх подменённого pool.
function loadAdapter(fakePool) {
  const poolKey    = require.resolve('../db/pool');
  const adapterKey = require.resolve('../db/adapter');
  require.cache[poolKey] = { id: poolKey, filename: poolKey, loaded: true, exports: fakePool };
  delete require.cache[adapterKey];
  return require('../db/adapter');
}

// ─── Тесты kv ─────────────────────────────────────────────────────────────────
(async () => {
  process.stdout.write('\n── db/adapter.js — kv_store ──\n');

  await test('kvSet строки сохраняет как есть, kvGet возвращает её', async () => {
    const a = loadAdapter(makeFakePool());
    await a.kvSet('pivnaya_karta', 'tasks:v4', '[{"id":1}]');
    assert.strictEqual(await a.kvGet('pivnaya_karta', 'tasks:v4'), '[{"id":1}]');
  });

  await test('kvSet объекта сериализует в JSON-строку', async () => {
    const pool = makeFakePool();
    const a = loadAdapter(pool);
    await a.kvSet('pivnaya_karta', 'cfg:v1', { a: 1, b: 'x' });
    assert.strictEqual(pool._kvByTenant.get('pivnaya_karta').get('cfg:v1'), '{"a":1,"b":"x"}');
  });

  await test('kvGet несуществующего ключа → null', async () => {
    const a = loadAdapter(makeFakePool());
    assert.strictEqual(await a.kvGet('pivnaya_karta', 'нет:v1'), null);
  });

  await test('kvGetAll возвращает все ключи тенанта', async () => {
    const a = loadAdapter(makeFakePool());
    await a.kvSet('pivnaya_karta', 'a:v1', '1');
    await a.kvSet('pivnaya_karta', 'b:v1', '2');
    const all = await a.kvGetAll('pivnaya_karta');
    assert.deepStrictEqual(all, { 'a:v1': '1', 'b:v1': '2' });
  });

  await test('kvDelete удаляет ключ (не воскресает в kvGetAll)', async () => {
    const a = loadAdapter(makeFakePool());
    await a.kvSet('pivnaya_karta', 'tmp:v1', 'x');
    await a.kvDelete('pivnaya_karta', 'tmp:v1');
    assert.strictEqual(await a.kvGet('pivnaya_karta', 'tmp:v1'), null);
    assert.deepStrictEqual(await a.kvGetAll('pivnaya_karta'), {});
  });

  // ── SEC-8: изоляция kv между тенантами ──
  await test('kvSet тенанта A не виден в kvGetAll тенанта B', async () => {
    const a = loadAdapter(makeFakePool());
    await a.kvSet('tenant_a', 'shared_key', 'val_a');
    const allB = await a.kvGetAll('tenant_b');
    assert.deepStrictEqual(allB, {});
  });

  await test('два тенанта хранят разные значения под одним ключом', async () => {
    const a = loadAdapter(makeFakePool());
    await a.kvSet('tenant_a', 'revenue:v1', '{"2026-01-01":{"fact":100}}');
    await a.kvSet('tenant_b', 'revenue:v1', '{"2026-01-01":{"fact":200}}');
    const valA = await a.kvGet('tenant_a', 'revenue:v1');
    const valB = await a.kvGet('tenant_b', 'revenue:v1');
    assert.ok(valA.includes('100'));
    assert.ok(valB.includes('200'));
    assert.notStrictEqual(valA, valB);
  });

  process.stdout.write('\n── db/adapter.js — employee_bindings ──\n');

  await test('getBindings нормализует telegram_id к Number (регрессия BIGINT→string)', async () => {
    const a = loadAdapter(makeFakePool());
    await a.bindEmployee('pivnaya_karta', 'Антон', 243024100);
    const b = await a.getBindings('pivnaya_karta');
    assert.strictEqual(b['Антон'], 243024100);
    assert.strictEqual(typeof b['Антон'], 'number');
  });

  await test('несколько имён на один Telegram допустимы (нет UNIQUE на telegram_id)', async () => {
    const a = loadAdapter(makeFakePool());
    await a.bindEmployee('pivnaya_karta', 'Антон', 243024100);
    await a.bindEmployee('pivnaya_karta', 'Павел', 243024100);
    const b = await a.getBindings('pivnaya_karta');
    assert.strictEqual(b['Антон'], 243024100);
    assert.strictEqual(b['Павел'], 243024100);
  });

  await test('unbindEmployee мягко скрывает привязку (active=false)', async () => {
    const a = loadAdapter(makeFakePool());
    await a.bindEmployee('pivnaya_karta', 'Павел', 243024100);
    await a.unbindEmployee('pivnaya_karta', 'Павел');
    assert.strictEqual('Павел' in (await a.getBindings('pivnaya_karta')), false);
  });

  await test('bindEmployee реактивирует ранее отвязанного (active=true)', async () => {
    const a = loadAdapter(makeFakePool());
    await a.bindEmployee('pivnaya_karta', 'Павел', 243024100);
    await a.unbindEmployee('pivnaya_karta', 'Павел');
    await a.bindEmployee('pivnaya_karta', 'Павел', 243024100);
    assert.strictEqual((await a.getBindings('pivnaya_karta'))['Павел'], 243024100);
  });

  await test('getEmployeeByTelegramId находит активного, не находит отвязанного', async () => {
    const a = loadAdapter(makeFakePool());
    await a.bindEmployee('pivnaya_karta', 'Антон', 243024100);
    assert.strictEqual(await a.getEmployeeByTelegramId('pivnaya_karta', 243024100), 'Антон');
    await a.unbindEmployee('pivnaya_karta', 'Антон');
    assert.strictEqual(await a.getEmployeeByTelegramId('pivnaya_karta', 243024100), null);
  });

  // ── SEC-8: изоляция bindings между тенантами ──
  await test('привязки тенанта A не видны тенанту B', async () => {
    const a = loadAdapter(makeFakePool());
    await a.bindEmployee('tenant_a', 'Антон', 111);
    const bB = await a.getBindings('tenant_b');
    assert.deepStrictEqual(bB, {});
  });

  process.stdout.write('\n── db/adapter.js — tenants / tenant_integrations ──\n');

  await test('createTenant идемпотентен (повторный вызов не бросает)', async () => {
    const a = loadAdapter(makeFakePool());
    await a.createTenant('bar_dva', 'Бар Два');
    await a.createTenant('bar_dva', 'Бар Два v2'); // повтор — не должен бросить
    const t = await a.getTenant('bar_dva');
    assert.ok(t !== null);
    assert.strictEqual(t.tenant_id, 'bar_dva');
  });

  await test('listActiveTenants возвращает созданных тенантов', async () => {
    const a = loadAdapter(makeFakePool());
    await a.createTenant('tenant_a', 'А');
    await a.createTenant('tenant_b', 'Б');
    const list = await a.listActiveTenants();
    const ids = list.map(r => r.tenant_id);
    assert.ok(ids.includes('tenant_a'));
    assert.ok(ids.includes('tenant_b'));
  });

  await test('getTenant несуществующего → null', async () => {
    const a = loadAdapter(makeFakePool());
    const t = await a.getTenant('nonexistent');
    assert.strictEqual(t, null);
  });

  await test('setTenantIntegration upsert: enabled=true, потом false', async () => {
    const a = loadAdapter(makeFakePool());
    await a.setTenantIntegration('pivnaya_karta', 'iiko', true, { url: 'http://x' });
    await a.setTenantIntegration('pivnaya_karta', 'iiko', false, null);
    const intgs = await a.getTenantIntegrations('pivnaya_karta');
    const iiko = intgs.find(i => i.kind === 'iiko');
    assert.ok(iiko !== undefined);
    assert.strictEqual(iiko.enabled, false);
  });

  await test('интеграции тенанта A не видны тенанту B', async () => {
    const a = loadAdapter(makeFakePool());
    await a.setTenantIntegration('tenant_a', 'iiko', true);
    const intgsB = await a.getTenantIntegrations('tenant_b');
    assert.deepStrictEqual(intgsB, []);
  });

  // ─── Итог ───
  process.stdout.write('\n' + '─'.repeat(58) + '\n');
  process.stdout.write(`Итого: ${passed + failed} тестов | ✅ ${passed} прошло | ❌ ${failed} упало\n`);
  if (failed > 0) { process.stdout.write('\n❌ Есть упавшие тесты\n'); process.exit(1); }
  process.stdout.write('\n🎉 Все тесты прошли!\n');
})();
