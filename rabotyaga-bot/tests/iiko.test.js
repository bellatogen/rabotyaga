#!/usr/bin/env node
// iiko.test.js — полный набор тестов адаптера iiko
// Запуск: node tests/iiko.test.js
// Не требует внешних зависимостей.

'use strict';
const assert = require('assert');

// ─── Хелперы ────────────────────────────────────────────────────────────────

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

// Загружает свежую копию модуля (без кэша), с заданными env-переменными
function loadIiko(env = {}) {
  Object.assign(process.env, {
    IIKO_URL:      'https://test.iiko.local',
    IIKO_LOGIN:    'testlogin',
    IIKO_PASSWORD: 'testpass',
    ...env,
  });
  const key = require.resolve('../src/api/iiko');
  delete require.cache[key];
  return require('../src/api/iiko');
}

// Создаёт mock fetch, возвращающий разные ответы для разных URL-паттернов
function makeFetch(handlers) {
  return async (url, opts) => {
    for (const { match, status = 200, body, bodyText, delay } of handlers) {
      if (typeof match === 'string' ? url.includes(match) : match.test(url)) {
        if (delay) await new Promise(r => setTimeout(r, delay));
        const text  = bodyText ?? JSON.stringify(body);
        const isOk  = status >= 200 && status < 300;
        return {
          ok:     isOk,
          status,
          text:   async () => text,
          json:   async () => {
            try { return JSON.parse(text); }
            catch { throw new SyntaxError('Unexpected token'); }
          },
        };
      }
    }
    throw Object.assign(new Error('ECONNREFUSED'), { code: 'ECONNREFUSED' });
  };
}

const TOKEN_HANDLER = { match: '/resto/api/auth', body: 'abc-token-123' };
const TOKEN_TEXT    = { match: '/resto/api/auth', bodyText: 'abc-token-123' };

function olapOk(rows) {
  return { match: '/resto/api/v2/reports/olap', body: { data: rows } };
}

const FAKE_DATA = {
  kv: { 'revenue:v1': '{}', 'basket:pairs:v1': '' },
};
function saveData() {}

// ─── Тесты ──────────────────────────────────────────────────────────────────

console.log('\n📋 iiko adapter — тесты устойчивости\n');

// ─── AUTH ────────────────────────────────────────────────────────────────────
console.log('── Авторизация ─────────────────────────────────────────────────');

await test('токен получен успешно', async () => {
  global.fetch = makeFetch([TOKEN_TEXT]);
  const iiko = loadIiko();
  // getDayRevenue использует getToken внутри
  global.fetch = makeFetch([TOKEN_TEXT, olapOk([{ 'OpenDate.Typed': '2026-06-01', DishDiscountSumInt: 10000, GuestNum: 10 }])]);
  const r = await iiko.getDayRevenue('2026-06-01', FAKE_DATA, saveData);
  assert.ok(r.fact === 10000, `fact=${r.fact}`);
});

await test('токен кэшируется (повторный fetch не идёт)', async () => {
  let calls = 0;
  global.fetch = async (url) => {
    if (url.includes('/auth')) calls++;
    return { ok: true, status: 200, text: async () => 'token-cached', json: async () => ({ data: [] }) };
  };
  const iiko = loadIiko();
  await iiko.getDayRevenue('2026-06-01', FAKE_DATA, saveData);
  await iiko.getDayRevenue('2026-06-02', FAKE_DATA, saveData);
  assert.strictEqual(calls, 1, `getToken вызван ${calls} раз вместо 1`);
});

await test('401 на авторизации → ошибка', async () => {
  global.fetch = makeFetch([{ match: '/auth', status: 401, body: 'Unauthorized' }]);
  const iiko = loadIiko();
  await assert.rejects(() => iiko.getDayRevenue('2026-06-01', FAKE_DATA, saveData),
    /авторизация|401/);
});

await test('iiko вернул пустой токен → ошибка', async () => {
  global.fetch = makeFetch([{ match: '/auth', bodyText: '' }]);
  const iiko = loadIiko();
  await assert.rejects(() => iiko.getDayRevenue('2026-06-01', FAKE_DATA, saveData),
    /пустой токен/);
});

await test('токен в кавычках — кавычки обрезаются', async () => {
  global.fetch = makeFetch([
    { match: '/auth', bodyText: '"quoted-token-xyz"' },
    olapOk([]),
  ]);
  const iiko = loadIiko();
  // Не должно падать (кавычки обрезаются в getToken)
  await iiko.getDayRevenue('2026-06-01', FAKE_DATA, saveData);
});

await test('timeout на авторизации → пробрасывается', async () => {
  global.fetch = async () => { throw Object.assign(new Error('AbortError'), { name: 'AbortError' }); };
  const iiko = loadIiko();
  await assert.rejects(() => iiko.getDayRevenue('2026-06-01', FAKE_DATA, saveData));
});

await test('сеть недоступна (ECONNREFUSED) → ошибка', async () => {
  global.fetch = async () => { throw Object.assign(new Error('fetch failed'), { code: 'ECONNREFUSED' }); };
  const iiko = loadIiko();
  await assert.rejects(() => iiko.getDayRevenue('2026-06-01', FAKE_DATA, saveData));
});

// ─── getDayRevenue ────────────────────────────────────────────────────────────
console.log('\n── getDayRevenue ───────────────────────────────────────────────');

await test('обычный ответ: fact + guests', async () => {
  global.fetch = makeFetch([TOKEN_TEXT, olapOk([
    { 'OpenDate.Typed': '2026-06-23', DishDiscountSumInt: 150000, GuestNum: 80 },
  ])]);
  const iiko = loadIiko();
  const r = await iiko.getDayRevenue('2026-06-23', FAKE_DATA, saveData);
  assert.strictEqual(r.fact, 150000);
  assert.strictEqual(r.guests, 80);
});

await test('GuestNum не поддерживается → fallback на revenue-only', async () => {
  global.fetch = makeFetch([
    TOKEN_TEXT,
    // Первый запрос (с GuestNum) → 400
    { match: '/olap', status: 400, bodyText: 'java.lang.IllegalArgumentException: Unknown OLAP field GuestNum' },
    // Второй (fallback без GuestNum) → данные
    olapOk([{ 'OpenDate.Typed': '2026-06-23', DishDiscountSumInt: 200000 }]),
  ]);
  const iiko = loadIiko();
  const r = await iiko.getDayRevenue('2026-06-23', FAKE_DATA, saveData);
  assert.strictEqual(r.fact, 200000);
  assert.strictEqual(r.guests, 0);
});

await test('OLAP 400 (не GuestNum) → ошибка пробрасывается', async () => {
  global.fetch = makeFetch([TOKEN_TEXT, { match: '/olap', status: 400, bodyText: 'Unknown field Xyz' }]);
  const iiko = loadIiko();
  await assert.rejects(() => iiko.getDayRevenue('2026-06-23', FAKE_DATA, saveData), /OLAP HTTP 400/);
});

await test('OLAP 500 → ошибка', async () => {
  global.fetch = makeFetch([TOKEN_TEXT, { match: '/olap', status: 500, bodyText: 'Internal Server Error' }]);
  const iiko = loadIiko();
  await assert.rejects(() => iiko.getDayRevenue('2026-06-23', FAKE_DATA, saveData));
});

await test('пустой data[] → fact=0 без краша', async () => {
  global.fetch = makeFetch([TOKEN_TEXT, olapOk([])]);
  const iiko = loadIiko();
  const r = await iiko.getDayRevenue('2026-06-23', FAKE_DATA, saveData);
  assert.strictEqual(r.fact, 0);
});

await test('iiko вернул не-JSON → не крашит сервер', async () => {
  global.fetch = makeFetch([TOKEN_TEXT, { match: '/olap', bodyText: '<html>Error</html>' }]);
  const iiko = loadIiko();
  await assert.rejects(() => iiko.getDayRevenue('2026-06-23', FAKE_DATA, saveData));
});

await test('null/undefined в строках OLAP → не крашит', async () => {
  global.fetch = makeFetch([TOKEN_TEXT, olapOk([
    { 'OpenDate.Typed': null, DishDiscountSumInt: null, GuestNum: undefined },
    { 'OpenDate.Typed': '2026-06-23', DishDiscountSumInt: 5000, GuestNum: 0 },
  ])]);
  const iiko = loadIiko();
  const r = await iiko.getDayRevenue('2026-06-23', FAKE_DATA, saveData);
  assert.strictEqual(r.fact, 5000);
});

await test('YoY запрос падает → основной результат всё равно возвращается', async () => {
  let olapCalls = 0;
  global.fetch = async (url) => {
    if (url.includes('/auth')) return { ok:true, status:200, text: async ()=>'tok', json: async()=>({}) };
    olapCalls++;
    if (olapCalls === 1) {
      // Первый OLAP (текущий день) — успех
      return { ok:true, status:200, text: async()=>'{}', json: async()=>({ data:[{DishDiscountSumInt:99000,GuestNum:50}] }) };
    }
    // YoY — падает
    throw new Error('YoY network error');
  };
  const iiko = loadIiko();
  const r = await iiko.getDayRevenue('2026-06-23', FAKE_DATA, saveData);
  assert.strictEqual(r.fact, 99000);
  assert.strictEqual(r.lastYear, null);
});

await test('IIKO_URL не задан → 503', async () => {
  const iiko = loadIiko({ IIKO_URL: '' });
  await assert.rejects(() => iiko.getDayRevenue('2026-06-23', FAKE_DATA, saveData), /503/);
});

await test('данные сохраняются в KV', async () => {
  const fakeData = { kv: { 'revenue:v1': '{}' } };
  let saved = false;
  global.fetch = makeFetch([TOKEN_TEXT, olapOk([{ DishDiscountSumInt: 77000, GuestNum: 40 }])]);
  const iiko = loadIiko();
  await iiko.getDayRevenue('2026-06-23', fakeData, () => { saved = true; });
  assert.ok(saved, 'saveData не вызван');
  const kv = JSON.parse(fakeData.kv['revenue:v1']);
  assert.strictEqual(kv['2026-06-23']?.fact, 77000);
  assert.strictEqual(kv['2026-06-23']?.guests, 40);
  assert.ok(kv['2026-06-23']?.avgCheck > 0, 'avgCheck не посчитан');
});

await test('401 от OLAP → токен инвалидируется', async () => {
  let authCalls = 0;
  global.fetch = async (url) => {
    if (url.includes('/auth')) { authCalls++; return { ok:true,status:200,text:async()=>'fresh-tok',json:async()=>({}) }; }
    if (authCalls < 2) return { ok:false, status:401, text:async()=>'',json:async()=>({}) };
    return { ok:true,status:200,text:async()=>'{}',json:async()=>({data:[]}) };
  };
  const iiko = loadIiko();
  // Первый вызов получит 401 на OLAP, должен инвалидировать токен и выбросить ошибку
  await assert.rejects(() => iiko.getDayRevenue('2026-06-23', FAKE_DATA, saveData), /истекла/);
});

// ─── syncRevenue ─────────────────────────────────────────────────────────────
console.log('\n── syncRevenue ─────────────────────────────────────────────────');

await test('bulk sync обновляет KV по дням', async () => {
  const fakeData = { kv: { 'revenue:v1': '{}' } };
  global.fetch = makeFetch([TOKEN_TEXT, olapOk([
    { 'OpenDate.Typed': '2026-06-01', DishDiscountSumInt: 100000, GuestNum: 50 },
    { 'OpenDate.Typed': '2026-06-02', DishDiscountSumInt: 120000, GuestNum: 60 },
    { 'OpenDate.Typed': '2026-06-03', DishDiscountSumInt: 0,      GuestNum: 0  },
  ])]);
  const iiko = loadIiko();
  const r = await iiko.syncRevenue(fakeData, () => {});
  assert.strictEqual(r.updated, 2, `updated=${r.updated}`);
  const kv = JSON.parse(fakeData.kv['revenue:v1']);
  assert.strictEqual(kv['2026-06-01'].fact, 100000);
  assert.strictEqual(kv['2026-06-01'].guests, 50);
  assert.strictEqual(kv['2026-06-02'].avgCheck, 2000);
  assert.ok(!kv['2026-06-03'], 'нулевой день не должен писаться');
});

await test('sync не перетирает существующий plan', async () => {
  const fakeData = { kv: { 'revenue:v1': JSON.stringify({ '2026-06-01': { plan: 200000 } }) } };
  global.fetch = makeFetch([TOKEN_TEXT, olapOk([
    { 'OpenDate.Typed': '2026-06-01', DishDiscountSumInt: 150000, GuestNum: 70 },
  ])]);
  const iiko = loadIiko();
  await iiko.syncRevenue(fakeData, () => {});
  const kv = JSON.parse(fakeData.kv['revenue:v1']);
  assert.strictEqual(kv['2026-06-01'].plan, 200000, 'plan затёрт!');
  assert.strictEqual(kv['2026-06-01'].fact, 150000);
});

// ─── getBasketPairs ──────────────────────────────────────────────────────────
console.log('\n── getBasketPairs ──────────────────────────────────────────────');

function makeBasketRows(orders) {
  // orders: [['BlockA', 'BlockB'], ['BlockA', 'BlockC'], ...]
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

await test('пары с высоким lift найдены', async () => {
  const orders = Array.from({ length: 50 }, (_, i) =>
    i % 3 === 0 ? ['Пиво 0.5', 'Сухарики', 'Лимонад'] :
    i % 3 === 1 ? ['Пиво 0.5', 'Сухарики'] :
                  ['Вино', 'Сыр']
  );
  global.fetch = makeFetch([TOKEN_TEXT, olapOk(makeBasketRows(orders))]);
  const fakeData = { kv: {} };
  const iiko = loadIiko();
  const r = await iiko.getBasketPairs(fakeData, saveData);
  assert.ok(r.pairs.length > 0, 'пар не найдено');
  const pair = r.pairs.find(p =>
    (p.a === 'Пиво 0.5' && p.b === 'Сухарики') ||
    (p.a === 'Сухарики' && p.b === 'Пиво 0.5')
  );
  assert.ok(pair, 'Пиво+Сухарики не в топе');
  assert.ok(pair.lift > 1, `lift=${pair.lift} не > 1`);
});

await test('кэш возвращается без fetch', async () => {
  let fetchCalls = 0;
  global.fetch = async () => { fetchCalls++; throw new Error('не должен вызываться'); };
  const freshTs  = new Date(Date.now() - 1000).toISOString(); // 1 сек назад
  const fakeData = { kv: { 'basket:pairs:v1': JSON.stringify({ pairs:[{a:'A',b:'B',lift:1.5,count:10,confAB:30,confBA:20,support:5,score:1}], totalOrders:100, from:'2026-06-09', to:'2026-06-23', ts: freshTs }) } };
  const iiko = loadIiko();
  const r = await iiko.getBasketPairs(fakeData, saveData);
  assert.strictEqual(fetchCalls, 0, 'fetch вызван при живом кэше');
  assert.strictEqual(r.pairs[0].a, 'A');
});

await test('устаревший кэш (>20ч) → перезапрашивает', async () => {
  let fetchCalls = 0;
  const oldTs = new Date(Date.now() - 21 * 3_600_000).toISOString();
  const fakeData = { kv: { 'basket:pairs:v1': JSON.stringify({ pairs:[], totalOrders:0, from:'', to:'', ts: oldTs }) } };
  global.fetch = async (url) => {
    fetchCalls++;
    if (url.includes('/auth')) return { ok:true,status:200,text:async()=>'tok',json:async()=>({}) };
    return { ok:true,status:200,text:async()=>'{}',json:async()=>({ data:makeBasketRows([]) }) };
  };
  const iiko = loadIiko();
  await iiko.getBasketPairs(fakeData, saveData);
  assert.ok(fetchCalls >= 2, `fetch вызван ${fetchCalls} раз — кэш не протух`);
});

await test('мало заказов (<10 с 2+ блюдами) → пустые пары без краша', async () => {
  const orders = [['Пиво', 'Сухарики'], ['Пиво', 'Вино']]; // 2 заказа
  global.fetch = makeFetch([TOKEN_TEXT, olapOk(makeBasketRows(orders))]);
  const fakeData = { kv: {} };
  const iiko = loadIiko();
  const r = await iiko.getBasketPairs(fakeData, saveData);
  assert.deepStrictEqual(r.pairs, []);
});

await test('заказы только из одного блюда → пар нет', async () => {
  const orders = Array.from({ length: 30 }, () => ['Пиво']);
  global.fetch = makeFetch([TOKEN_TEXT, olapOk(makeBasketRows(orders))]);
  const fakeData = { kv: {} };
  const iiko = loadIiko();
  const r = await iiko.getBasketPairs(fakeData, saveData);
  assert.deepStrictEqual(r.pairs, []);
});

await test('блюдо с длинным именем (>80 символов) → пропускается', async () => {
  const longName = 'А'.repeat(90);
  const orders = [['Пиво', longName], ['Пиво', longName], ['Пиво', longName], ['Пиво', longName]];
  global.fetch = makeFetch([TOKEN_TEXT, olapOk(makeBasketRows(orders))]);
  const fakeData = { kv: {} };
  const iiko = loadIiko();
  const r = await iiko.getBasketPairs(fakeData, saveData);
  // longName отфильтрован — пар нет
  assert.deepStrictEqual(r.pairs, []);
});

await test('случайные пары (lift<1.05) отфильтровываются', async () => {
  // Каждый заказ — уникальная пара (нет повторений) → lift ≈ 1
  const orders = Array.from({ length: 20 }, (_, i) => [`БлюдоA_${i}`, `БлюдоB_${i}`]);
  global.fetch = makeFetch([TOKEN_TEXT, olapOk(makeBasketRows(orders))]);
  const fakeData = { kv: {} };
  const iiko = loadIiko();
  const r = await iiko.getBasketPairs(fakeData, saveData);
  assert.deepStrictEqual(r.pairs, []);
});

await test('FiscalChequeNumber пустой → строки пропускаются', async () => {
  const rows = [
    { 'OpenDate.Typed': '2026-06-23', FiscalChequeNumber: '', DishName: 'Пиво', DishAmountInt: 1 },
    { 'OpenDate.Typed': '2026-06-23', FiscalChequeNumber: null, DishName: 'Вино', DishAmountInt: 1 },
  ];
  global.fetch = makeFetch([TOKEN_TEXT, olapOk(rows)]);
  const fakeData = { kv: {} };
  const iiko = loadIiko();
  const r = await iiko.getBasketPairs(fakeData, saveData);
  assert.deepStrictEqual(r.pairs, []);
});

await test('OLAP 400 на basket → ошибка (не крашит процесс)', async () => {
  global.fetch = makeFetch([TOKEN_TEXT, { match: '/olap', status: 400, bodyText: 'Grouping is not allowed for field FiscalChequeNumber' }]);
  const fakeData = { kv: {} };
  const iiko = loadIiko();
  await assert.rejects(() => iiko.getBasketPairs(fakeData, saveData), /400/);
});

await test('basket: iiko не настроен → 503', async () => {
  const iiko = loadIiko({ IIKO_URL: '' });
  await assert.rejects(() => iiko.getBasketPairs(FAKE_DATA, saveData), /503/);
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
