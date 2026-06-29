// tests/integrations.test.js — SEC-8 WI-9: тест API интеграций.
// Покрывает: GET /api/integrations, PUT /api/integrations/:kind,
//            фильтрацию по tenantId, отсутствие секретов в ответе.
// Mock-pool: без реального PG.
// Запуск: node tests/integrations.test.js

'use strict';

process.env.JWT_SECRET = 'test-secret-integrations';

const assert      = require('assert');
const http        = require('http');
const express     = require('express');
const cookieParser = require('cookie-parser');

let passed = 0, failed = 0;
async function test(name, fn) {
  try { await fn(); passed++; process.stdout.write(`  ✅ ${name}\n`); }
  catch (e) { failed++; process.stdout.write(`  ❌ ${name}\n     → ${e.message}\n`); }
}

// ── Mock adapter ─────────────────────────────────────────────────────────────
// Эмулирует getTenantIntegrations и setTenantIntegration в памяти.
function makeMockAdapter() {
  // { [tid]: { [kind]: { kind, enabled, config } } }
  const store = {
    pivnaya_karta: {
      iiko:           { kind: 'iiko',           enabled: true,  config: { url: 'https://pk.iiko.it', login: 'user1' } },
      mozg:           { kind: 'mozg',           enabled: true,  config: { login: 'ml1' } },
      sheets:         { kind: 'sheets',         enabled: true,  config: {} },
      manual_revenue: { kind: 'manual_revenue', enabled: true,  config: {} },
    },
    other_bar: {
      iiko: { kind: 'iiko', enabled: false, config: { url: 'https://ob.iiko.it' } },
    },
  };

  return {
    async getTenantIntegrations(tid) {
      return Object.values(store[tid] || {});
    },
    async setTenantIntegration(tid, kind, enabled, config) {
      if (!store[tid]) store[tid] = {};
      store[tid][kind] = { kind, enabled, config: config || {} };
    },
    _store: store,
  };
}

// ── HTTP helpers ─────────────────────────────────────────────────────────────
const { signToken, setAuthCookie } = require('../src/middleware/auth');
const makeIntegrationsRouter = require('../src/api/integrations');

async function makeApp(adapter) {
  const app = express();
  app.use(express.json());
  app.use(cookieParser());
  app.use('/api/integrations', makeIntegrationsRouter(adapter));
  return app;
}

function request(server, method, path, { body, cookie } = {}) {
  return new Promise((resolve, reject) => {
    const port = server.address().port;
    const opts = {
      hostname: '127.0.0.1', port, path, method,
      headers: {
        'Content-Type': 'application/json',
        ...(cookie ? { Cookie: cookie } : {}),
      },
    };
    const req = http.request(opts, res => {
      let data = '';
      res.on('data', c => data += c);
      res.on('end', () => {
        let json = null; try { json = JSON.parse(data); } catch {}
        resolve({ status: res.status || res.statusCode, json, headers: res.headers });
      });
    });
    req.on('error', reject);
    if (body) req.write(JSON.stringify(body));
    req.end();
  });
}

// Создаём JWT с tenantId (как делает requireAuth)
function makeManagerCookie(tenantId = 'pivnaya_karta') {
  const token = signToken('manager', { tenantId });
  return `rab_token=${token}`;
}
function makeBarmanCookie(tenantId = 'pivnaya_karta') {
  const token = signToken('barman', { tenantId });
  return `rab_token=${token}`;
}
function makeOtherBarCookie() {
  const token = signToken('manager', { tenantId: 'other_bar' });
  return `rab_token=${token}`;
}

(async () => {
  const adapter = makeMockAdapter();
  const app     = await makeApp(adapter);
  const server  = await new Promise(r => { const s = http.createServer(app).listen(0, () => r(s)); });

  console.log('\n── GET /api/integrations ──');

  await test('без cookie → 401', async () => {
    const { status } = await request(server, 'GET', '/api/integrations');
    assert.strictEqual(status, 401);
  });

  await test('с cookie manager → 200 + список для pivnaya_karta', async () => {
    const { status, json } = await request(server, 'GET', '/api/integrations', { cookie: makeManagerCookie() });
    assert.strictEqual(status, 200);
    assert.ok(json.ok);
    assert.ok(Array.isArray(json.integrations));
    assert.strictEqual(json.integrations.length, 4); // iiko + mozg + sheets + manual_revenue
  });

  await test('с cookie barman → 200 (read доступен всем авторизованным)', async () => {
    const { status, json } = await request(server, 'GET', '/api/integrations', { cookie: makeBarmanCookie() });
    assert.strictEqual(status, 200);
    assert.ok(json.ok);
  });

  await test('секреты не попадают в ответ (нет password/token/secret)', async () => {
    // В mock-store iiko.config содержит 'login' но не 'password' — проверяем фильтрацию
    const store = adapter._store;
    store.pivnaya_karta.iiko.config = { url: 'https://x.iiko.it', login: 'u', password: 'SECRET', api_key: 'KEY' };
    const { json } = await request(server, 'GET', '/api/integrations', { cookie: makeManagerCookie() });
    const iiko = json.integrations.find(i => i.kind === 'iiko');
    assert.ok(iiko, 'iiko не найден в ответе');
    assert.strictEqual(iiko.config.password, undefined, 'password попал в ответ!');
    assert.strictEqual(iiko.config.api_key,  undefined, 'api_key попал в ответ!');
    assert.strictEqual(iiko.config.url,   'https://x.iiko.it');
    assert.strictEqual(iiko.config.login, 'u');
    // Восстанавливаем
    store.pivnaya_karta.iiko.config = { url: 'https://pk.iiko.it', login: 'user1' };
  });

  await test('тенант other_bar → видит только свои интеграции', async () => {
    const { json } = await request(server, 'GET', '/api/integrations', { cookie: makeOtherBarCookie() });
    assert.strictEqual(json.integrations.length, 1);
    assert.strictEqual(json.integrations[0].kind, 'iiko');
    assert.strictEqual(json.integrations[0].enabled, false);
  });

  await test('изоляция: other_bar не видит integrations pivnaya_karta', async () => {
    const { json: pk  } = await request(server, 'GET', '/api/integrations', { cookie: makeManagerCookie() });
    const { json: ob  } = await request(server, 'GET', '/api/integrations', { cookie: makeOtherBarCookie() });
    const pkKinds = pk.integrations.map(i => i.kind).sort();
    const obKinds = ob.integrations.map(i => i.kind);
    assert.ok(pkKinds.includes('mozg'),           'pivnaya_karta должна иметь mozg');
    assert.ok(!obKinds.includes('mozg'),           'other_bar не должна иметь mozg');
    assert.ok(!obKinds.includes('manual_revenue'), 'other_bar не должна иметь manual_revenue');
  });

  console.log('\n── PUT /api/integrations/:kind ──');

  await test('барман не может PUT → 403', async () => {
    const { status } = await request(server, 'PUT', '/api/integrations/iiko',
      { body: { enabled: false }, cookie: makeBarmanCookie() });
    assert.strictEqual(status, 403);
  });

  await test('без cookie → 401', async () => {
    const { status } = await request(server, 'PUT', '/api/integrations/iiko',
      { body: { enabled: false } });
    assert.strictEqual(status, 401);
  });

  await test('manager PUT → 200, enabled обновлён', async () => {
    const { status, json } = await request(server, 'PUT', '/api/integrations/iiko',
      { body: { enabled: false, config: { url: 'https://new.iiko.it' } }, cookie: makeManagerCookie() });
    assert.strictEqual(status, 200);
    assert.ok(json.ok);
    assert.strictEqual(json.enabled, false);
    assert.strictEqual(json.config.url, 'https://new.iiko.it');
    // Восстанавливаем
    await request(server, 'PUT', '/api/integrations/iiko',
      { body: { enabled: true, config: { url: 'https://pk.iiko.it' } }, cookie: makeManagerCookie() });
  });

  await test('PUT без enabled → 400', async () => {
    const { status } = await request(server, 'PUT', '/api/integrations/mozg',
      { body: { config: {} }, cookie: makeManagerCookie() });
    assert.strictEqual(status, 400);
  });

  await test('PUT с секретами в config → секреты не сохраняются', async () => {
    await request(server, 'PUT', '/api/integrations/mozg',
      { body: { enabled: true, config: { login: 'ml_new', password: 'SECRET', token: 'TKN' } }, cookie: makeManagerCookie() });
    const { json } = await request(server, 'GET', '/api/integrations', { cookie: makeManagerCookie() });
    const mozg = json.integrations.find(i => i.kind === 'mozg');
    assert.strictEqual(mozg.config.password, undefined);
    assert.strictEqual(mozg.config.token,    undefined);
    assert.strictEqual(mozg.config.login,    'ml_new');
  });

  await test('PUT от other_bar не влияет на pivnaya_karta', async () => {
    await request(server, 'PUT', '/api/integrations/iiko',
      { body: { enabled: false }, cookie: makeOtherBarCookie() });
    const { json } = await request(server, 'GET', '/api/integrations', { cookie: makeManagerCookie() });
    const pkIiko = json.integrations.find(i => i.kind === 'iiko');
    assert.strictEqual(pkIiko.enabled, true, 'pivnaya_karta/iiko должна оставаться enabled');
  });

  server.close();
  console.log(`\n[integrations.test] итог: ${passed} прошло, ${failed} упало\n`);
  if (failed > 0) process.exit(1);
})();
