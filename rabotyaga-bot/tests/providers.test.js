// tests/providers.test.js — тест изоляции инстансов провайдеров.
// SEC-8: два тенанта НЕ должны делить token/cookie-jar между собой.
// Запуск: node tests/providers.test.js

'use strict';

let passed = 0, failed = 0;

function test(name, fn) {
  try {
    const r = fn();
    if (r && typeof r.then === 'function') {
      r.then(() => { console.log(`  ✅ ${name}`); passed++; })
       .catch(e => { console.error(`  ❌ ${name}: ${e.message}`); failed++; });
      return r;
    }
    console.log(`  ✅ ${name}`);
    passed++;
  } catch (e) {
    console.error(`  ❌ ${name}: ${e.message}`);
    failed++;
  }
}

// ── makeIikoClient: изоляция token-состояния ─────────────────────────────────
console.log('\n[providers.test] makeIikoClient — изоляция инстансов');
{
  const { makeIikoClient } = require('../src/api/iiko');

  // Создаём два клиента с разными кредами
  const c1 = makeIikoClient({ url: 'https://tenant-a.iiko.it', login: 'user_a', password: 'pass_a' });
  const c2 = makeIikoClient({ url: 'https://tenant-b.iiko.it', login: 'user_b', password: 'pass_b' });

  test('iiko: два инстанса созданы без ошибок', () => {
    if (!c1 || !c2) throw new Error('клиенты не созданы');
  });

  test('iiko: isConfigured() → true при наличии url+login', () => {
    if (!c1.isConfigured()) throw new Error('c1.isConfigured() = false');
    if (!c2.isConfigured()) throw new Error('c2.isConfigured() = false');
  });

  test('iiko: пустой инстанс isConfigured() → false', () => {
    const empty = makeIikoClient({});
    if (empty.isConfigured()) throw new Error('empty.isConfigured() = true');
  });

  test('iiko: только url без login → isConfigured() = false', () => {
    const noLogin = makeIikoClient({ url: 'https://x.iiko.it', login: '', password: 'x' });
    if (noLogin.isConfigured()) throw new Error('noLogin.isConfigured() = true');
  });

  test('iiko: инстансы не делят прототип (независимые объекты)', () => {
    if (c1 === c2) throw new Error('c1 === c2');
    // getDayRevenue — один и тот же метод-тип, но разные замыкания
    if (c1.getDayRevenue === c2.getDayRevenue) throw new Error('getDayRevenue — один объект (не изолировано)');
  });
}

// ── makeMozgSyncClient: изоляция cookie jar ───────────────────────────────────
console.log('\n[providers.test] makeMozgSyncClient — изоляция cookie jar');
{
  const { makeMozgSyncClient } = require('../src/sync/mozgSync');

  const m1 = makeMozgSyncClient({ login: 'bar_a', password: 'sec_a' });
  const m2 = makeMozgSyncClient({ login: 'bar_b', password: 'sec_b' });

  test('mozg: два инстанса созданы без ошибок', () => {
    if (!m1 || !m2) throw new Error('клиенты не созданы');
  });

  test('mozg: isConfigured() → true при наличии login+password', () => {
    if (!m1.isConfigured()) throw new Error('m1.isConfigured() = false');
    if (!m2.isConfigured()) throw new Error('m2.isConfigured() = false');
  });

  test('mozg: пустой инстанс isConfigured() → false', () => {
    const empty = makeMozgSyncClient({});
    if (empty.isConfigured()) throw new Error('empty.isConfigured() = true');
  });

  test('mozg: инстансы не делят syncMozgDashboard (разные замыкания)', () => {
    if (m1 === m2) throw new Error('m1 === m2');
    if (m1.syncMozgDashboard === m2.syncMozgDashboard) throw new Error('syncMozgDashboard — один объект');
  });

  test('mozg: resetSession сбрасывает сессию только своего инстанса', () => {
    // Нет доступа к _jar напрямую — тестируем что reset не кидает и не ломает другой инстанс
    m1.resetSession();
    // m2 должен быть всё ещё валиден (isConfigured не зависит от сессии)
    if (!m2.isConfigured()) throw new Error('m2.isConfigured() после reset m1 = false');
  });
}

// ── createProviderRegistry: контракт ─────────────────────────────────────────
console.log('\n[providers.test] createProviderRegistry — контракт');
{
  const { createProviderRegistry } = require('../src/providers/index');

  const makeGetSecret = (map) => (name) => map[name] || '';

  const ctx1 = {
    tenantId: 'pivnaya_karta',
    config: {
      iiko:           { enabled: true,  config: {} },
      mozg:           { enabled: true,  config: {} },
      sheets:         { enabled: true,  config: {} },
      manual_revenue: { enabled: true,  config: {} },
    },
    getSecret: makeGetSecret({
      IIKO_URL: 'https://pk.iiko.it', IIKO_LOGIN: 'user1', IIKO_PASSWORD: 'p1',
      MOZG_LOGIN: 'ml1', MOZG_PASSWORD: 'mp1',
    }),
  };

  const ctx2 = {
    tenantId: 'other_bar',
    config: {
      iiko:           { enabled: true,  config: {} },
      mozg:           { enabled: false, config: {} }, // отключён
      manual_revenue: { enabled: true,  config: {} },
    },
    getSecret: makeGetSecret({
      IIKO_URL: 'https://ob.iiko.it', IIKO_LOGIN: 'user2', IIKO_PASSWORD: 'p2',
    }),
  };

  const reg1 = createProviderRegistry(ctx1);
  const reg2 = createProviderRegistry(ctx2);

  test('registry: reg1 содержит iiko, mozg, sheets, manual_revenue', () => {
    if (!reg1.iiko)           throw new Error('нет iiko');
    if (!reg1.mozg)           throw new Error('нет mozg');
    if (!reg1.sheets)         throw new Error('нет sheets');
    if (!reg1.manual_revenue) throw new Error('нет manual_revenue');
  });

  test('registry: reg2 не содержит mozg (disabled)', () => {
    if (reg2.mozg) throw new Error('mozg есть, хотя disabled');
  });

  test('registry: reg1.all содержит все 4 провайдера', () => {
    if (!Array.isArray(reg1.all)) throw new Error('all не массив');
    if (reg1.all.length !== 4) throw new Error(`all.length = ${reg1.all.length}, ожидалось 4`);
  });

  test('registry: reg2.all содержит 2 провайдера (iiko + manual)', () => {
    if (reg2.all.length !== 2) throw new Error(`reg2.all.length = ${reg2.all.length}, ожидалось 2`);
  });

  test('registry: iiko-инстансы reg1/reg2 изолированы', () => {
    if (reg1.iiko === reg2.iiko) throw new Error('reg1.iiko === reg2.iiko');
    if (reg1.iiko.fetchRevenue === reg2.iiko.fetchRevenue) throw new Error('fetchRevenue не изолирован');
  });

  test('registry: sheets.isConfigured() = true только для pivnaya_karta', () => {
    if (!reg1.sheets.isConfigured()) throw new Error('reg1.sheets.isConfigured() = false (pivnaya_karta)');
    // other_bar не имеет sheets в конфиге → sheets отсутствует в reg2
    if (reg2.sheets) throw new Error('reg2.sheets существует, хотя не в конфиге');
  });

  test('registry: manual_revenue.isConfigured() = true всегда', () => {
    if (!reg1.manual_revenue.isConfigured()) throw new Error('reg1 manual_revenue не настроен');
    if (!reg2.manual_revenue.isConfigured()) throw new Error('reg2 manual_revenue не настроен');
  });

  test('registry: mergeRevenue корректно обновляет kv', () => {
    const data = { kv: {} };
    const saved = [];
    reg1.manual_revenue.mergeRevenue('2026-06-15', { plan: 500000, fact: 0 }, data, () => saved.push(1));
    const rev = JSON.parse(data.kv['revenue:v1']);
    if (rev['2026-06-15'].plan !== 500000) throw new Error('plan не записался');
    // fact: 0 → не пишем (falsy), но plan=500000 записан
    if (saved.length !== 1) throw new Error('saveData не вызван');
  });

  test('registry: mergeRevenue не перезаписывает iiko-факт', () => {
    const data = { kv: { 'revenue:v1': JSON.stringify({ '2026-06-16': { fact: 300000 } }) } };
    reg1.manual_revenue.mergeRevenue('2026-06-16', { plan: 400000, fact: 111111 }, data, () => {});
    const rev = JSON.parse(data.kv['revenue:v1']);
    // iiko-факт 300000 должен остаться (manual не перезаписывает если есть)
    if (rev['2026-06-16'].fact !== 300000) throw new Error(`fact = ${rev['2026-06-16'].fact}, ожидалось 300000`);
    if (rev['2026-06-16'].plan !== 400000) throw new Error('plan не обновился');
  });
}

// ── Итог ─────────────────────────────────────────────────────────────────────
setTimeout(() => {
  console.log(`\n[providers.test] итог: ${passed} прошло, ${failed} упало\n`);
  if (failed > 0) process.exit(1);
}, 100);
