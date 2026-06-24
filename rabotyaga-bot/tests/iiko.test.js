#!/usr/bin/env node
// iiko.test.js — тесты устойчивости адаптера iiko
// Запуск: node tests/iiko.test.js
'use strict';
const assert = require('assert');

// ─── Раннер ─────────────────────────────────────────────────────────────────
let passed = 0, failed = 0;
const results = [];

async function test(name, fn) {
  try {
    await fn();
    passed++;
    results.push({ ok: true, name });
    process.stdout.write(`  ✅ ${name}\n`);
  } catch (e) {
    failed++;
    results.push({ ok: false, name, err: e.message });
    process.stdout.write(`  ❌ ${name}\n     → ${e.message}\n`);
  }
}

// ─── Хелперы ────────────────────────────────────────────────────────────────

// Загружает свежую копию модуля (без кэша), с заданными env-переменными
function loadIiko(env = {}) {
  process.env.IIKO_URL      = 'IIKO_URL'      in env ? env.IIKO_URL      : 'https://test.iiko.local';
  process.env.IIKO_LOGIN    = 'IIKO_LOGIN'    in env ? env.IIKO_LOGIN    : 'testlogin';
  process.env.IIKO_PASSWORD = 'IIKO_PASSWORD' in env ? env.IIKO_PASSWORD : 'testpass';
  const key = require.resolve('../src/api/iiko');
  delete require.cache[key];
  return require('../src/api/iiko');
}

// Последовательный мок fetch — каждый вызов потребляет следующий handler;
// последний повторяется если вызовов больше чем handlers.
function seqFetch(...handlers) {
  let i = 0;
  return async (url, opts) => {
    const h = handlers[Math.min(i++, handlers.length - 1)];
    if (h.throw) throw h.throw;
    if (h.delay) await new Promise(r => setTimeout(r, h.delay));
    const status  = h.status ?? 200;
    const rawText = h.bodyText !== undefined ? h.bodyText : JSON.stringify(h.body ?? {});
    return {
      ok:     status >= 200 && status < 300,
      status,
      text:   async () => rawText,
      json:   async () => { try { return JSON.parse(rawText); } catch { throw new SyntaxError('Unexpected token'); } },
    };
  };
}

const AUTH_OK    = { bodyText: 'abc-token-123' };
const OLAP_EMPTY = { body: { data: [] } };

function olapRows(...rows) { return { body: { data: rows } }; }

function makeBasketRows(orders) {
  const rows = [];
  orders.forEach((items, i) => {
    items.forEach(dish => rows.push({
      'OpenDate.Typed': '2026-06-23',
      FiscalChequeNumber: String(i + 1).padStart(4, '0'),
      DishName: dish,
      DishAmountInt: 1,
    }));
  });
  return rows;
}

const mkData  = () => ({ kv: { 'revenue:v1': '{}' } });
const noop    = () => {};

// ─── Тесты ──────────────────────────────────────────────────────────────────

(async () => {

// ── Авторизация ──────────────────────────────────────────────────────────────
console.log('\n── Авторизация ─────────────────────────────────────────────────');

await test('токен получен успешно', async () => {
  global.fetch = seqFetch(AUTH_OK, olapRows({ DishDiscountSumInt: 10000, GuestNum: 10 }), OLAP_EMPTY);
  const iiko = loadIiko();
  const r = await iiko.getDayRevenue('2026-06-01', mkData(), noop);
  assert.strictEqual(r.fact, 10000);
});

await test('токен кэшируется — второй getDayRevenue не идёт на /auth', async () => {
  let authCalls = 0;
  global.fetch = async (url) => {
    if (url.includes('/auth')) authCalls++;
    return { ok: true, status: 200, text: async () => 'cached-tok', json: async () => ({ data: [] }) };
  };
  const iiko = loadIiko();
  await iiko.getDayRevenue('2026-06-01', mkData(), noop);
  await iiko.getDayRevenue('2026-06-02', mkData(), noop);
  assert.strictEqual(authCalls, 1);
});

await test('параллельные getToken → только один fetch на /auth', async () => {
  let authCalls = 0;
  global.fetch = async (url) => {
    if (url.includes('/auth')) { authCalls++; await new Promise(r => setTimeout(r, 20)); }
    return { ok: true, status: 200, text: async () => 'para-tok', json: async () => ({ data: [] }) };
  };
  const iiko = loadIiko();
  // Три параллельных вызова при пустом кэше
  await Promise.all([
    iiko.getDayRevenue('2026-06-01', mkData(), noop),
    iiko.getDayRevenue('2026-06-02', mkData(), noop),
    iiko.getDayRevenue('2026-06-03', mkData(), noop),
  ]);
  assert.strictEqual(authCalls, 1, `authCalls=${authCalls}, ожидалось 1`);
});

await test('401 на авторизации → ошибка', async () => {
  global.fetch = seqFetch({ status: 401, bodyText: 'Unauthorized' });
  const iiko = loadIiko();
  await assert.rejects(() => iiko.getDayRevenue('2026-06-01', mkData(), noop), /авторизация|401/);
});

await test('пустой токен → ошибка', async () => {
  global.fetch = seqFetch({ bodyText: '' });
  const iiko = loadIiko();
  await assert.rejects(() => iiko.getDayRevenue('2026-06-01', mkData(), noop), /пустой токен/);
});

await test('токен в кавычках → кавычки обрезаются', async () => {
  global.fetch = seqFetch({ bodyText: '"quoted-token-xyz"' }, OLAP_EMPTY, OLAP_EMPTY);
  const iiko = loadIiko();
  await iiko.getDayRevenue('2026-06-01', mkData(), noop); // не должно упасть
});

await test('AbortError на авторизации → пробрасывается', async () => {
  global.fetch = seqFetch({ throw: Object.assign(new Error('AbortError'), { name: 'AbortError' }) });
  const iiko = loadIiko();
  await assert.rejects(() => iiko.getDayRevenue('2026-06-01', mkData(), noop));
});

await test('ECONNREFUSED на авторизации → ошибка', async () => {
  global.fetch = seqFetch({ throw: Object.assign(new Error('fetch failed'), { code: 'ECONNREFUSED' }) });
  const iiko = loadIiko();
  await assert.rejects(() => iiko.getDayRevenue('2026-06-01', mkData(), noop));
});

// ── getDayRevenue ─────────────────────────────────────────────────────────────
console.log('\n── getDayRevenue ───────────────────────────────────────────────');

await test('обычный ответ: fact + guests', async () => {
  global.fetch = seqFetch(
    AUTH_OK,
    olapRows({ DishDiscountSumInt: 150000, GuestNum: 80 }),
    OLAP_EMPTY, // YoY
  );
  const iiko = loadIiko();
  const r = await iiko.getDayRevenue('2026-06-23', mkData(), noop);
  assert.strictEqual(r.fact,   150000);
  assert.strictEqual(r.guests, 80);
});

await test('GuestNum не поддерживается → fallback revenue-only', async () => {
  global.fetch = seqFetch(
    AUTH_OK,
    { status: 400, bodyText: 'java.lang.IllegalArgumentException: Unknown OLAP field GuestNum' },
    olapRows({ DishDiscountSumInt: 200000 }), // fallback
    OLAP_EMPTY, // YoY
  );
  const iiko = loadIiko();
  const r = await iiko.getDayRevenue('2026-06-23', mkData(), noop);
  assert.strictEqual(r.fact,   200000);
  assert.strictEqual(r.guests, 0);
});

await test('OLAP 400 (другое поле, не GuestNum) → ошибка', async () => {
  global.fetch = seqFetch(AUTH_OK, { status: 400, bodyText: 'Некорректный запрос' });
  const iiko = loadIiko();
  await assert.rejects(() => iiko.getDayRevenue('2026-06-23', mkData(), noop), /OLAP HTTP 400/);
});

await test('OLAP 500 → ошибка', async () => {
  global.fetch = seqFetch(AUTH_OK, { status: 500, bodyText: 'Internal Server Error' });
  const iiko = loadIiko();
  await assert.rejects(() => iiko.getDayRevenue('2026-06-23', mkData(), noop));
});

await test('пустой data[] → fact=0, guests=0', async () => {
  global.fetch = seqFetch(AUTH_OK, OLAP_EMPTY, OLAP_EMPTY);
  const iiko = loadIiko();
  const r = await iiko.getDayRevenue('2026-06-23', mkData(), noop);
  assert.strictEqual(r.fact,   0);
  assert.strictEqual(r.guests, 0);
});

await test('ответ не-JSON → пробрасывает ошибку (не крашит процесс)', async () => {
  global.fetch = seqFetch(AUTH_OK, { bodyText: '<html>Error 503</html>' });
  const iiko = loadIiko();
  await assert.rejects(() => iiko.getDayRevenue('2026-06-23', mkData(), noop));
});

await test('null/undefined в строках OLAP → не крашит', async () => {
  global.fetch = seqFetch(
    AUTH_OK,
    olapRows(
      { DishDiscountSumInt: null, GuestNum: undefined },
      { DishDiscountSumInt: 5000, GuestNum: 3 },
    ),
    OLAP_EMPTY,
  );
  const iiko = loadIiko();
  const r = await iiko.getDayRevenue('2026-06-23', mkData(), noop);
  assert.strictEqual(r.fact, 5000);
});

await test('YoY запрос падает → основной результат возвращается', async () => {
  global.fetch = seqFetch(
    AUTH_OK,
    olapRows({ DishDiscountSumInt: 99000, GuestNum: 50 }),
    { throw: new Error('YoY сеть недоступна') },
  );
  const iiko = loadIiko();
  const r = await iiko.getDayRevenue('2026-06-23', mkData(), noop);
  assert.strictEqual(r.fact,     99000);
  assert.strictEqual(r.lastYear, null);
});

await test('IIKO_URL не задан → 503', async () => {
  const iiko = loadIiko({ IIKO_URL: '' });
  await assert.rejects(() => iiko.getDayRevenue('2026-06-23', mkData(), noop), /не настроен/);
});

await test('данные сохраняются в KV с avgCheck', async () => {
  const fakeData = mkData();
  let saved = false;
  global.fetch = seqFetch(AUTH_OK, olapRows({ DishDiscountSumInt: 77000, GuestNum: 40 }), OLAP_EMPTY);
  const iiko = loadIiko();
  await iiko.getDayRevenue('2026-06-23', fakeData, () => { saved = true; });
  assert.ok(saved, 'saveData не вызван');
  const kv = JSON.parse(fakeData.kv['revenue:v1']);
  assert.strictEqual(kv['2026-06-23'].fact,     77000);
  assert.strictEqual(kv['2026-06-23'].guests,   40);
  assert.strictEqual(kv['2026-06-23'].avgCheck, 1925);
});

await test('401 от OLAP → токен инвалидируется, ошибка "истекла"', async () => {
  global.fetch = seqFetch(AUTH_OK, { status: 401, bodyText: '' });
  const iiko = loadIiko();
  await assert.rejects(() => iiko.getDayRevenue('2026-06-23', mkData(), noop), /истекла/);
});

// ── syncRevenue ──────────────────────────────────────────────────────────────
console.log('\n── syncRevenue ─────────────────────────────────────────────────');

await test('bulk sync обновляет KV по дням', async () => {
  const fakeData = mkData();
  global.fetch = seqFetch(AUTH_OK, olapRows(
    { 'OpenDate.Typed': '2026-06-01', DishDiscountSumInt: 100000, GuestNum: 50 },
    { 'OpenDate.Typed': '2026-06-02', DishDiscountSumInt: 120000, GuestNum: 60 },
    { 'OpenDate.Typed': '2026-06-03', DishDiscountSumInt: 0,      GuestNum: 0  },
  ));
  const iiko = loadIiko();
  const r = await iiko.syncRevenue(fakeData, noop);
  assert.strictEqual(r.updated, 2);
  const kv = JSON.parse(fakeData.kv['revenue:v1']);
  assert.strictEqual(kv['2026-06-01'].fact,     100000);
  assert.strictEqual(kv['2026-06-01'].guests,   50);
  assert.strictEqual(kv['2026-06-02'].avgCheck, 2000);
  assert.ok(!kv['2026-06-03'], 'нулевой день не должен писаться');
});

await test('sync не перетирает существующий plan', async () => {
  const fakeData = { kv: { 'revenue:v1': JSON.stringify({ '2026-06-01': { plan: 200000 } }) } };
  global.fetch = seqFetch(AUTH_OK, olapRows({ 'OpenDate.Typed': '2026-06-01', DishDiscountSumInt: 150000, GuestNum: 70 }));
  const iiko = loadIiko();
  await iiko.syncRevenue(fakeData, noop);
  const kv = JSON.parse(fakeData.kv['revenue:v1']);
  assert.strictEqual(kv['2026-06-01'].plan, 200000, 'plan затёрт!');
  assert.strictEqual(kv['2026-06-01'].fact, 150000);
});

await test('syncRevenue: GuestNum не поддерживается → fallback', async () => {
  const fakeData = mkData();
  global.fetch = seqFetch(
    AUTH_OK,
    { status: 400, bodyText: 'Unknown OLAP field GuestNum' },
    olapRows({ 'OpenDate.Typed': '2026-06-01', DishDiscountSumInt: 90000 }),
  );
  const iiko = loadIiko();
  const r = await iiko.syncRevenue(fakeData, noop);
  assert.strictEqual(r.updated, 1);
  const kv = JSON.parse(fakeData.kv['revenue:v1']);
  assert.strictEqual(kv['2026-06-01'].fact, 90000);
});

await test('syncRevenue 401 → ошибка "истекла"', async () => {
  global.fetch = seqFetch(AUTH_OK, { status: 401, bodyText: '' });
  const iiko = loadIiko();
  await assert.rejects(() => iiko.syncRevenue(mkData(), noop), /истекла/);
});

// ── getBasketPairs ───────────────────────────────────────────────────────────
console.log('\n── getBasketPairs ──────────────────────────────────────────────');

await test('пары с высоким lift найдены', async () => {
  const orders = Array.from({ length: 50 }, (_, i) =>
    i < 35 ? ['Пиво 0.5', 'Сухарики'] : ['Вино', 'Сыр']
  );
  global.fetch = seqFetch(AUTH_OK, { body: { data: makeBasketRows(orders) } });
  const fakeData = { kv: {} };
  const iiko = loadIiko();
  const r = await iiko.getBasketPairs(fakeData, noop);
  assert.ok(r.pairs.length > 0, 'пар не найдено');
  const pair = r.pairs.find(p =>
    (p.a === 'Пиво 0.5' && p.b === 'Сухарики') ||
    (p.a === 'Сухарики' && p.b === 'Пиво 0.5')
  );
  assert.ok(pair, 'Пиво+Сухарики не в результате');
  assert.ok(pair.lift > 1, `lift=${pair.lift}`);
});

await test('кэш актуальный (<20ч) → fetch не вызывается', async () => {
  let fetchCalls = 0;
  global.fetch = async () => { fetchCalls++; throw new Error('не должен вызываться'); };
  const freshTs = new Date(Date.now() - 1000).toISOString();
  const fakeData = { kv: { 'basket:pairs:v1': JSON.stringify({
    pairs: [{ a: 'A', b: 'B', lift: 1.5, count: 10, confAB: 30, confBA: 20, support: 5, score: 1 }],
    totalOrders: 100, from: '2026-06-09', to: '2026-06-23', ts: freshTs,
  }) } };
  const iiko = loadIiko();
  const r = await iiko.getBasketPairs(fakeData, noop);
  assert.strictEqual(fetchCalls, 0, 'fetch вызван при живом кэше');
  assert.strictEqual(r.pairs[0].a, 'A');
});

await test('устаревший кэш (>20ч) → перезапрашивает данные', async () => {
  let fetchCalls = 0;
  const oldTs = new Date(Date.now() - 21 * 3_600_000).toISOString();
  const fakeData = { kv: { 'basket:pairs:v1': JSON.stringify({
    pairs: [], totalOrders: 0, from: '', to: '', ts: oldTs,
  }) } };
  global.fetch = async (url) => {
    fetchCalls++;
    if (url.includes('/auth')) return { ok: true, status: 200, text: async () => 'valid-token-12345', json: async () => ({}) };
    return { ok: true, status: 200, text: async () => '{}', json: async () => ({ data: makeBasketRows([]) }) };
  };
  const iiko = loadIiko();
  await iiko.getBasketPairs(fakeData, noop);
  assert.ok(fetchCalls >= 2, `fetch вызван ${fetchCalls} раз`);
});

await test('мало заказов (<10 с 2+ блюдами) → пустые пары, без краша', async () => {
  const orders = [['Пиво', 'Сухарики'], ['Пиво', 'Вино']]; // 2 заказа
  global.fetch = seqFetch(AUTH_OK, { body: { data: makeBasketRows(orders) } });
  const fakeData = { kv: {} };
  const iiko = loadIiko();
  const r = await iiko.getBasketPairs(fakeData, noop);
  assert.deepStrictEqual(r.pairs, []);
});

await test('одноблюдные заказы → пар нет', async () => {
  const orders = Array.from({ length: 30 }, () => ['Пиво']);
  global.fetch = seqFetch(AUTH_OK, { body: { data: makeBasketRows(orders) } });
  const fakeData = { kv: {} };
  const iiko = loadIiko();
  const r = await iiko.getBasketPairs(fakeData, noop);
  assert.deepStrictEqual(r.pairs, []);
});

await test('блюдо с именем >80 символов → пропускается', async () => {
  const longDish = 'А'.repeat(90);
  const orders = Array.from({ length: 20 }, () => ['Пиво', longDish]);
  global.fetch = seqFetch(AUTH_OK, { body: { data: makeBasketRows(orders) } });
  const fakeData = { kv: {} };
  const iiko = loadIiko();
  const r = await iiko.getBasketPairs(fakeData, noop);
  assert.deepStrictEqual(r.pairs, []);
});

await test('случайные пары (lift≤1.05) отфильтровываются', async () => {
  // Каждый заказ — уникальные блюда → нет ко-оккуренций
  const orders = Array.from({ length: 20 }, (_, i) => [`Блюдо_${i}_A`, `Блюдо_${i}_B`]);
  global.fetch = seqFetch(AUTH_OK, { body: { data: makeBasketRows(orders) } });
  const fakeData = { kv: {} };
  const iiko = loadIiko();
  const r = await iiko.getBasketPairs(fakeData, noop);
  assert.deepStrictEqual(r.pairs, []);
});

await test('пустой FiscalChequeNumber → строки пропускаются', async () => {
  const rows = [
    { 'OpenDate.Typed': '2026-06-23', FiscalChequeNumber: '',   DishName: 'Пиво', DishAmountInt: 1 },
    { 'OpenDate.Typed': '2026-06-23', FiscalChequeNumber: null, DishName: 'Вино', DishAmountInt: 1 },
  ];
  global.fetch = seqFetch(AUTH_OK, { body: { data: rows } });
  const fakeData = { kv: {} };
  const iiko = loadIiko();
  const r = await iiko.getBasketPairs(fakeData, noop);
  assert.deepStrictEqual(r.pairs, []);
});

await test('basket OLAP 400 → ошибка содержит статус', async () => {
  global.fetch = seqFetch(AUTH_OK, { status: 400, bodyText: 'Grouping is not allowed for field FiscalChequeNumber' });
  const fakeData = { kv: {} };
  const iiko = loadIiko();
  await assert.rejects(() => iiko.getBasketPairs(fakeData, noop), /400/);
});

await test('basket: IIKO_URL не задан → 503', async () => {
  const iiko = loadIiko({ IIKO_URL: '' });
  await assert.rejects(() => iiko.getBasketPairs(mkData(), noop), /не настроен/);
});

await test('basket: результат сохраняется в KV', async () => {
  const orders = Array.from({ length: 50 }, (_, i) =>
    i < 40 ? ['Нагетсы', 'Соус Барбекю'] : ['Стейк', 'Вино']
  );
  const fakeData = { kv: {} };
  let saved = false;
  global.fetch = seqFetch(AUTH_OK, { body: { data: makeBasketRows(orders) } });
  const iiko = loadIiko();
  await iiko.getBasketPairs(fakeData, () => { saved = true; });
  assert.ok(saved, 'saveData не вызван');
  assert.ok(fakeData.kv['basket:pairs:v1'], 'KV не записан');
  const cached = JSON.parse(fakeData.kv['basket:pairs:v1']);
  assert.ok(cached.ts, 'нет поля ts');
  assert.ok(Array.isArray(cached.pairs));
});

// ─── Итоги ───────────────────────────────────────────────────────────────────
console.log(`\n${'─'.repeat(58)}`);
console.log(`Итого: ${passed + failed} тестов | ✅ ${passed} прошло | ❌ ${failed} упало`);
if (failed > 0) {
  console.log('\nУпавшие:');
  results.filter(r => !r.ok).forEach(r => console.log(`  ✗ ${r.name}\n    ${r.err}`));
  process.exit(1);
} else {
  console.log('\n🎉 Все тесты прошли!\n');
}

})();
