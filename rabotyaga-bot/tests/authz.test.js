#!/usr/bin/env node
// authz.test.js — P0 «Привилегии/ACL» Ф1: ролевая модель с деревом прав.
//   • engine: additive-наследование, эффективные права, защита от циклов;
//   • permissions: WILDCARD, валидация, permsSatisfy;
//   • cache: резолв по account/role, изоляция тенантов;
//   • middleware: requirePermission блокирует/пускает, '*' матчит всё,
//     requireManager compat-шим, legacy-фолбэк при пустом кэше;
//   • ensureUsers: маппинг аккаунтов → роли, skip без ролей;
//   • migrate: pendingMigrations / parseVersion.
// Запуск: node tests/authz.test.js
'use strict';

const assert       = require('assert');
const http         = require('http');
const express      = require('express');
const cookieParser = require('cookie-parser');

const engine      = require('../src/authz/engine');
const perms        = require('../src/authz/permissions');
const cache        = require('../src/authz/cache');
const { ensureUsersForTenant } = require('../src/authz/ensureUsers');
const migrate      = require('../db/migrate');
const { signToken, COOKIE_NAME, requirePermission, requireManager } = require('../src/middleware/auth');

let passed = 0, failed = 0;
async function test(name, fn) {
  try { await fn(); passed++; process.stdout.write(`  ✅ ${name}\n`); }
  catch (e) { failed++; process.stdout.write(`  ❌ ${name}\n     → ${e.message}\n`); }
}

// ── Дерево ролей для тестов (id → строки как из БД) ──
// Персонал → Бар → Бармен → Шеф-бармен ; Управление → Менеджер('*')
const ROLE_ROWS = [
  { id: 'r-staff',  name: 'Персонал',    parent_role_id: null },
  { id: 'r-bar',    name: 'Бар',         parent_role_id: 'r-staff' },
  { id: 'r-barman', name: 'Бармен',      parent_role_id: 'r-bar' },
  { id: 'r-chef',   name: 'Шеф-бармен',  parent_role_id: 'r-barman' },
  { id: 'r-mgr',    name: 'Менеджер',    parent_role_id: null, is_system: true },
];
const PERM_ROWS = [
  { role_id: 'r-staff',  permission_key: 'tasks.view.own' },
  { role_id: 'r-staff',  permission_key: 'schedule.view' },
  { role_id: 'r-barman', permission_key: 'quests.complete' },
  { role_id: 'r-chef',   permission_key: 'taps.edit' },
  { role_id: 'r-mgr',    permission_key: '*' },
];

(async () => {
  // ─── engine: наследование ────────────────────────────────────────────────────
  process.stdout.write('\n── engine: additive-наследование ──\n');

  const idx = engine.buildEffectiveIndex(ROLE_ROWS, PERM_ROWS);

  await test('корень (Персонал) → только свои права', () => {
    assert.deepStrictEqual([...idx.get('r-staff')].sort(), ['schedule.view', 'tasks.view.own']);
  });

  await test('Бармен наследует Персонал + своё', () => {
    assert.deepStrictEqual([...idx.get('r-barman')].sort(),
      ['quests.complete', 'schedule.view', 'tasks.view.own']);
  });

  await test('Шеф-бармен ⊇ Бармен ∪ своё (вся цепочка)', () => {
    const s = idx.get('r-chef');
    ['tasks.view.own', 'schedule.view', 'quests.complete', 'taps.edit'].forEach(k =>
      assert.ok(s.has(k), `нет ${k}`));
  });

  await test('additive: ребёнок не отбирает право родителя', () => {
    // у Шеф-бармена НЕТ механизма убрать унаследованное — проверяем что база на месте
    assert.ok(idx.get('r-chef').has('tasks.view.own'));
  });

  await test('цикл в дереве не вешает computeEffective', () => {
    const cyc = [
      { id: 'a', name: 'A', parent_role_id: 'b' },
      { id: 'b', name: 'B', parent_role_id: 'a' },
    ];
    const ci = engine.buildEffectiveIndex(cyc, [{ role_id: 'a', permission_key: 'x' }, { role_id: 'b', permission_key: 'y' }]);
    assert.deepStrictEqual([...ci.get('a')].sort(), ['x', 'y']); // конечный результат, без зависания
  });

  await test('wouldCreateCycle: назначить потомка родителем → true', () => {
    assert.strictEqual(engine.wouldCreateCycle(ROLE_ROWS, 'r-bar', 'r-chef'), true);  // chef потомок bar
    assert.strictEqual(engine.wouldCreateCycle(ROLE_ROWS, 'r-chef', 'r-staff'), false); // staff предок — ок
    assert.strictEqual(engine.wouldCreateCycle(ROLE_ROWS, 'r-bar', 'r-bar'), true);   // сам себе родитель
  });

  // ─── permissions ─────────────────────────────────────────────────────────────
  process.stdout.write('\n── permissions ──\n');

  await test('isValidPermission: известный ключ и WILDCARD', () => {
    assert.ok(perms.isValidPermission('tasks.create'));
    assert.ok(perms.isValidPermission('*'));
    assert.ok(!perms.isValidPermission('nonexistent.key'));
  });

  await test('permsSatisfy: WILDCARD матчит любой ключ', () => {
    assert.ok(perms.permsSatisfy(new Set(['*']), 'staff.manage'));
    assert.ok(perms.permsSatisfy(new Set(['staff.manage']), 'staff.manage'));
    assert.ok(!perms.permsSatisfy(new Set(['tasks.view.own']), 'staff.manage'));
    assert.ok(!perms.permsSatisfy(null, 'x'));
  });

  // ─── cache: резолв + изоляция тенантов ─────────────────────────────────────────
  process.stdout.write('\n── cache: резолв прав + изоляция тенантов ──\n');

  cache._reset();
  cache._seed('pivnaya_karta', {
    roleRows: ROLE_ROWS, permRows: PERM_ROWS,
    userRows: [
      { account: 'Аня',     role_id: 'r-barman', telegram_id: 111, active: true },
      { account: 'manager', role_id: 'r-mgr',    telegram_id: 222, active: true },
      { account: 'Уволен',  role_id: 'r-barman', telegram_id: 333, active: false },
    ],
  });

  await test('резолв по account → эффективные права роли', () => {
    const s = cache.resolvePermissionsForAccount('pivnaya_karta', 'Аня');
    assert.ok(s.has('quests.complete') && s.has('tasks.view.own'));
  });

  await test('неактивный пользователь → null', () => {
    assert.strictEqual(cache.resolvePermissionsForAccount('pivnaya_karta', 'Уволен'), null);
  });

  await test('изоляция тенантов: Аня из pivnaya_karta не резолвится в чужом тенанте', () => {
    assert.strictEqual(cache.resolvePermissionsForAccount('other_bar', 'Аня'), null);
  });

  await test('резолв по roleId', () => {
    assert.ok(cache.resolvePermissionsForRole('pivnaya_karta', 'r-mgr').has('*'));
    assert.strictEqual(cache.resolvePermissionsForRole('pivnaya_karta', 'r-unknown'), null);
  });

  // ─── middleware: requirePermission / requireManager ────────────────────────────
  process.stdout.write('\n── middleware: requirePermission / requireManager ──\n');

  const app = express();
  app.use(cookieParser());
  app.get('/needs-quests', requirePermission('quests.complete'), (req, res) => res.json({ ok: true }));
  app.get('/needs-staff',  requirePermission('staff.manage'),   (req, res) => res.json({ ok: true }));
  app.get('/manager-only', requireManager, (req, res) => res.json({ ok: true }));
  const server = await new Promise(r => { const s = http.createServer(app).listen(0, () => r(s)); });
  const PORT = server.address().port;

  function cookieFor(account, opts) { return `${COOKIE_NAME}=${signToken(account, opts)}`; }
  async function get(p, cookie) {
    const res = await fetch(`http://127.0.0.1:${PORT}${p}`, { headers: cookie ? { Cookie: cookie } : {} });
    return res.status;
  }

  // Кэш уже засеян выше: Аня=Бармен, manager='*'.
  await test('Бармен с правом quests.complete → 200', async () => {
    assert.strictEqual(await get('/needs-quests', cookieFor('Аня')), 200);
  });
  await test('Бармен без staff.manage → 403', async () => {
    assert.strictEqual(await get('/needs-staff', cookieFor('Аня')), 403);
  });
  await test('manager (*) проходит любое requirePermission → 200', async () => {
    assert.strictEqual(await get('/needs-staff', cookieFor('manager')), 200);
  });
  await test('requireManager: manager → 200, Бармен → 403', async () => {
    assert.strictEqual(await get('/manager-only', cookieFor('manager')), 200);
    assert.strictEqual(await get('/manager-only', cookieFor('Аня')), 403);
  });
  await test('без cookie → 401', async () => {
    assert.strictEqual(await get('/needs-quests'), 401);
  });

  // Legacy-фолбэк: пустой кэш (миграция не применена / PG down)
  await test('legacy-фолбэк: пустой кэш → developer админ, обычный аккаунт нет', async () => {
    cache._reset();
    assert.strictEqual(await get('/manager-only', cookieFor('developer')), 200); // legacy admin
    assert.strictEqual(await get('/manager-only', cookieFor('Аня')), 403);       // не admin, прав нет
    assert.strictEqual(await get('/needs-quests', cookieFor('Аня')), 403);
  });

  server.close();

  // ─── ensureUsers: миграция аккаунтов ───────────────────────────────────────────
  process.stdout.write('\n── ensureUsers: миграция аккаунтов → роли ──\n');

  const SEED_ROLES = [
    { id: 'r-barman', name: 'Бармен' },
    { id: 'r-head',   name: 'Шеф-бармен' },
    { id: 'r-mgr',    name: 'Менеджер' },
    { id: 'r-dev',    name: 'developer' },
  ];
  function fakeAdapter(roles) {
    const upserts = [];
    return {
      getRoles: async () => roles,
      upsertUser: async (tid, account, tg, roleId) => upserts.push({ tid, account, tg, roleId }),
      _upserts: upserts,
    };
  }

  await test('маппинг: manager→Менеджер, developer→developer, profiles.role→роль, дефолт→Бармен', async () => {
    const a = fakeAdapter(SEED_ROLES);
    const td = {
      kv: {
        'auth:v1': JSON.stringify({ manager: 'x', developer: 'y', 'Аня': 'z' }),
        'profiles:v1': JSON.stringify([
          { name: 'Аня',   role: 'barman' },
          { name: 'Борис', role: 'head_barman' },
          { name: 'Гость', role: 'unknown_role' },
        ]),
      },
      bindings: { 'Аня': 111, 'Борис': 222 },
    };
    await ensureUsersForTenant('pivnaya_karta', td, a);
    const by = Object.fromEntries(a._upserts.map(u => [u.account, u.roleId]));
    assert.strictEqual(by['manager'],   'r-mgr');
    assert.strictEqual(by['developer'], 'r-dev');
    assert.strictEqual(by['Аня'],       'r-barman');
    assert.strictEqual(by['Борис'],     'r-head');
    assert.strictEqual(by['Гость'],     'r-barman'); // неизвестная роль → дефолт
    // telegram_id прокидывается из bindings
    assert.strictEqual(a._upserts.find(u => u.account === 'Аня').tg, 111);
    // все вызовы скоупятся правильным tenantId (изоляция)
    assert.ok(a._upserts.every(u => u.tid === 'pivnaya_karta'));
  });

  await test('нет ролей (миграция 005 не применена) → skip, без upsert', async () => {
    const a = fakeAdapter([]);
    const res = await ensureUsersForTenant('pivnaya_karta', { kv: { 'auth:v1': '{"manager":"x"}' }, bindings: {} }, a);
    assert.strictEqual(res.skipped, 'no-roles');
    assert.strictEqual(a._upserts.length, 0);
  });

  // ─── migrate runner (чистые функции) ───────────────────────────────────────────
  process.stdout.write('\n── migrate: pendingMigrations / parseVersion ──\n');

  await test('parseVersion берёт числовой префикс', () => {
    assert.strictEqual(migrate.parseVersion('005_roles.sql'), '005');
    assert.strictEqual(migrate.parseVersion('not_a_migration.sql'), null);
  });

  await test('pendingMigrations отбрасывает применённые', () => {
    const all = ['001_a.sql', '002_b.sql', '004_c.sql', '005_d.sql'];
    assert.deepStrictEqual(migrate.pendingMigrations(all, ['001', '002', '004']), ['005_d.sql']);
    assert.deepStrictEqual(migrate.pendingMigrations(all, []), all);
  });

  // ─── Итог ───
  process.stdout.write('\n' + '─'.repeat(58) + '\n');
  process.stdout.write(`Итого: ${passed + failed} тестов | ✅ ${passed} прошло | ❌ ${failed} упало\n`);
  if (failed > 0) { process.stdout.write('\n❌ Есть упавшие тесты\n'); process.exit(1); }
  process.stdout.write('\n🎉 Все тесты прошли!\n');
})();
