#!/usr/bin/env node
// quests.test.js — тесты квест-системы (src/api/quests.js, rewards.js, xp.js + model.js):
//   • инициализация модели в data.kv (PG-backed), без top-level утечек;
//   • квесты: pool (admin-гейт), PUT-валидация, weekly, авто-назначение смены, complete;
//   • XP: деление floor, персист в kv, стрик-бонус >=5, double-complete;
//   • награды: redeem (списание spent, нехватка XP), pending/fulfill, PUT;
//   • xp: профиль + лидерборд (сортировка по per_shift_avg).
// Роутеры поднимаем на временном express, ходим через global fetch с cookie.
// Запуск: node tests/quests.test.js
'use strict';
const assert       = require('assert');
const http         = require('http');
const express      = require('express');
const cookieParser = require('cookie-parser');
const { signToken, COOKIE_NAME } = require('../src/middleware/auth');
const makeQuestsApi  = require('../src/api/quests');
const makeRewardsApi = require('../src/api/rewards');
const makeXpApi      = require('../src/api/xp');
const model = require('../src/quests/model');

let passed = 0, failed = 0;
async function test(name, fn) {
  try { await fn(); passed++; process.stdout.write(`  ✅ ${name}\n`); }
  catch (e) { failed++; process.stdout.write(`  ❌ ${name}\n     → ${e.message}\n`); }
}

(async () => {
  const data = {
    kv: {
      'profiles:v1': JSON.stringify([
        { name: 'Аня',    role: 'barman' },
        { name: 'Петя',   role: 'barman' },
        { name: 'Богдан', role: 'barman' },
      ]),
    },
    bindings: {},
    pushSettings: {},
  };
  model.ensureQuestModel(data, () => {});
  // Преднастройка: Богдану 1000 XP (для redeem), Ане стрик 4 дня (для бонуса на 5-й).
  model.setLedgers(data, { 'Богдан': { total: 1000, spent: 0, per_shift_history: [{ shiftId: 'seed', xp: 1000 }], per_shift_avg: 1000 } });
  model.setStreaks(data, { 'Аня': { current: 4, best: 4, last_shift_date: '2026-06-23' } });

  const app = express();
  app.use(express.json());
  app.use(cookieParser());
  const noop = () => {};
  app.use('/api/quests',  makeQuestsApi(data, noop));
  app.use('/api/rewards', makeRewardsApi(data, noop));
  app.use('/api/xp',      makeXpApi(data, noop));

  const server = await new Promise(r => { const s = http.createServer(app).listen(0, () => r(s)); });
  const PORT = server.address().port;
  const MGR = `${COOKIE_NAME}=${signToken('manager')}`;
  const BAR = `${COOKIE_NAME}=${signToken('Аня', { tgVerified: true })}`; // бармен (не менеджер), личность подтверждена через Telegram
  const BAR_NOTG = `${COOKIE_NAME}=${signToken('Аня')}`; // бармен без tg-подтверждения (парольный вход)

  async function req(method, p, body, cookie = MGR) {
    const res = await fetch(`http://127.0.0.1:${PORT}${p}`, {
      method,
      headers: { 'Content-Type': 'application/json', 'Cookie': cookie },
      body: body !== undefined ? JSON.stringify(body) : undefined,
    });
    let json = null; try { json = await res.json(); } catch {}
    return { status: res.status, json };
  }

  // ─── модель / хранение ────────────────────────────────────────────────────────
  process.stdout.write('\n── model / storage ──\n');

  await test('данные в data.kv (PG-backed), без top-level утечек', () => {
    assert.ok(data.kv['quests:v1'] && data.kv['rewards:v1'] && data.kv['xp_ledger:v1']);
    assert.ok(data.kv['streaks:v1'] && data.kv['reward_log:v1']);
    assert.strictEqual(data.quests, undefined);
    assert.strictEqual(data.rewards, undefined);
    assert.strictEqual(data.xp_ledger, undefined);
  });

  await test('дефолтный пул = 5 квестов, наград = 6', () => {
    assert.strictEqual(model.loadQuests(data).pool.length, 5);
    assert.strictEqual(model.loadRewards(data).length, 6);
  });

  // ─── квесты: pool / PUT / weekly ──────────────────────────────────────────────
  process.stdout.write('\n── quests: pool / PUT / weekly ──\n');

  await test('GET /pool (manager) → 5 квестов', async () => {
    const { status, json } = await req('GET', '/api/quests/pool');
    assert.strictEqual(status, 200);
    assert.strictEqual(json.pool.length, 5);
  });

  await test('GET /pool барменом → 403', async () => {
    assert.strictEqual((await req('GET', '/api/quests/pool', undefined, BAR)).status, 403);
  });

  await test('GET /pool без cookie → 401', async () => {
    const res = await fetch(`http://127.0.0.1:${PORT}/api/quests/pool`);
    assert.strictEqual(res.status, 401);
  });

  await test('PUT /:id меняет xp/active', async () => {
    const { status, json } = await req('PUT', '/api/quests/q1', { xp: 600, active: false });
    assert.strictEqual(status, 200);
    assert.strictEqual(json.quest.xp, 600);
    assert.strictEqual(json.quest.active, false);
    // вернём обратно — q1 нужен активным для остальных тестов
    await req('PUT', '/api/quests/q1', { xp: 500, active: true });
  });

  await test('PUT /:id с xp<=0 → 400', async () => {
    assert.strictEqual((await req('PUT', '/api/quests/q1', { xp: 0 })).status, 400);
  });

  await test('PUT /:id несуществующего → 404', async () => {
    assert.strictEqual((await req('PUT', '/api/quests/zzz', { xp: 10 })).status, 404);
  });

  await test('POST /weekly создаёт челлендж', async () => {
    const { status, json } = await req('POST', '/api/quests/weekly', { description: 'Тест', xp: 1000, deadline: '2026-07-05' });
    assert.strictEqual(status, 200);
    assert.strictEqual(json.weekly_challenge.xp, 1000);
    assert.strictEqual(model.loadQuests(data).weekly_challenge.description, 'Тест');
  });

  await test('POST /weekly без description → 400', async () => {
    assert.strictEqual((await req('POST', '/api/quests/weekly', { xp: 10, deadline: '2026-07-05' })).status, 400);
  });

  await test('GET /weekly/progress → 0 (нет weekly-redeem)', async () => {
    const { status, json } = await req('GET', '/api/quests/weekly/progress', undefined, BAR);
    assert.strictEqual(status, 200);
    assert.strictEqual(json.progress_xp, 0);
    assert.ok(json.weekly_challenge);
  });

  // ─── смена: авто-назначение + complete ────────────────────────────────────────
  process.stdout.write('\n── quests: shift assign + complete ──\n');

  let assignedQuestId;
  await test('GET /shift/:id авто-назначает 3 уникальных активных квеста', async () => {
    const { status, json } = await req('GET', '/api/quests/shift/S1', undefined, BAR);
    assert.strictEqual(status, 200);
    assert.strictEqual(json.quests.length, 3);
    const ids = json.quests.map(q => q.id);
    assert.strictEqual(new Set(ids).size, 3);
    assert.ok(json.quests.every(q => q.completed === false));
    assignedQuestId = ids[0];
  });

  await test('GET /shift/:id идемпотентен (тот же набор)', async () => {
    const { json } = await req('GET', '/api/quests/shift/S1', undefined, BAR);
    assert.strictEqual(json.quests.map(q => q.id).join(','), (await req('GET', '/api/quests/shift/S1', undefined, BAR)).json.quests.map(q => q.id).join(','));
    assert.strictEqual(json.quests[0].id, assignedQuestId);
  });

  await test('POST /complete делит XP floor и пишет в kv', async () => {
    const sq = model.loadQuests(data).shift_quests['S1'].quests.find(q => q.id === assignedQuestId);
    const expectedEach = Math.floor(sq.xp / 2);
    const { status, json } = await req('POST', '/api/quests/complete',
      { shiftId: 'S1', questId: assignedQuestId, bartenderIds: ['Петя', 'Богдан'], shiftDate: '2026-06-24' }, BAR);
    assert.strictEqual(status, 200);
    assert.strictEqual(json.xp_awarded_each, expectedEach);
    // персист: перечитываем из kv
    const led = model.loadLedgers(data);
    assert.strictEqual(led['Петя'].total, expectedEach);
    // Богдан: было 1000 + доля
    assert.strictEqual(led['Богдан'].total, 1000 + expectedEach);
    // квест отмечен выполненным
    assert.strictEqual(model.loadQuests(data).shift_quests['S1'].quests.find(q => q.id === assignedQuestId).completed, true);
  });

  await test('POST /complete повторно тот же квест → 400', async () => {
    const { status } = await req('POST', '/api/quests/complete',
      { shiftId: 'S1', questId: assignedQuestId, bartenderIds: ['Петя'], shiftDate: '2026-06-24' }, BAR);
    assert.strictEqual(status, 400);
  });

  await test('POST /complete пустой bartenderIds → 400', async () => {
    const { status } = await req('POST', '/api/quests/complete',
      { shiftId: 'S1', questId: assignedQuestId, bartenderIds: [], shiftDate: '2026-06-24' }, BAR);
    assert.strictEqual(status, 400);
  });

  await test('POST /complete несуществующая смена → 404', async () => {
    const { status } = await req('POST', '/api/quests/complete',
      { shiftId: 'NOPE', questId: 'q1', bartenderIds: ['Петя'], shiftDate: '2026-06-24' }, BAR);
    assert.strictEqual(status, 404);
  });

  await test('SEC-7: POST /complete без tgVerified → 403', async () => {
    const { status } = await req('POST', '/api/quests/complete',
      { shiftId: 'S1', questId: assignedQuestId, bartenderIds: ['Петя'], shiftDate: '2026-06-24' }, BAR_NOTG);
    assert.strictEqual(status, 403);
  });

  await test('стрик-бонус +150 при current>=5 (Аня: 4→5)', async () => {
    // отдельная смена для Ани (single), дата = consecutive к last_shift_date 2026-06-23
    const a = await req('GET', '/api/quests/shift/S2', undefined, BAR);
    const qid = a.json.quests[0].id;
    const sqXp = model.loadQuests(data).shift_quests['S2'].quests.find(q => q.id === qid).xp;
    const { status, json } = await req('POST', '/api/quests/complete',
      { shiftId: 'S2', questId: qid, bartenderIds: ['Аня'], shiftDate: '2026-06-24' }, BAR);
    assert.strictEqual(status, 200);
    assert.strictEqual(json.streak_bonus, 150);
    assert.strictEqual(json.new_totals['Аня'].streak, 5);
    assert.strictEqual(json.new_totals['Аня'].total, sqXp + 150);
    assert.strictEqual(model.loadStreaks(data)['Аня'].best, 5);
  });

  // ─── награды ──────────────────────────────────────────────────────────────────
  process.stdout.write('\n── rewards ──\n');

  await test('GET /?active=true → только активные', async () => {
    const { json } = await req('GET', '/api/rewards?active=true', undefined, BAR);
    assert.ok(json.rewards.every(r => r.active));
  });

  let logId;
  await test('POST /redeem списывает spent (Богдан r1, цена 800)', async () => {
    const before = model.loadLedgers(data)['Богдан'];
    const avail0 = (before.total || 0) - (before.spent || 0); // >= 1000, +доля от complete
    const totalBefore = before.total;
    const { status, json } = await req('POST', '/api/rewards/redeem', { bartenderId: 'Богдан', rewardId: 'r1' }, BAR);
    logId = json && json.reward && json.reward.id;
    assert.strictEqual(status, 200);
    assert.strictEqual(json.remaining_xp, avail0 - 800);
    assert.strictEqual(json.reward.status, 'pending');
    // total не уменьшился (списание только в spent)
    assert.strictEqual(model.loadLedgers(data)['Богдан'].total, totalBefore);
    assert.strictEqual(model.loadLedgers(data)['Богдан'].spent, 800);
  });

  await test('POST /redeem при нехватке XP → 400', async () => {
    const { status } = await req('POST', '/api/rewards/redeem', { bartenderId: 'Богдан', rewardId: 'r1' }, BAR);
    assert.strictEqual(status, 400); // остаток < 800
  });

  await test('SEC-7: POST /redeem без tgVerified → 403', async () => {
    const { status } = await req('POST', '/api/rewards/redeem', { bartenderId: 'Богдан', rewardId: 'r1' }, BAR_NOTG);
    assert.strictEqual(status, 403);
  });

  await test('GET /pending (manager) → есть запись', async () => {
    const { status, json } = await req('GET', '/api/rewards/pending');
    assert.strictEqual(status, 200);
    assert.ok(json.pending.some(e => e.id === logId));
  });

  await test('GET /pending барменом → 403', async () => {
    assert.strictEqual((await req('GET', '/api/rewards/pending', undefined, BAR)).status, 403);
  });

  await test('POST /fulfill/:logId → fulfilled', async () => {
    const { status, json } = await req('POST', `/api/rewards/fulfill/${logId}`);
    assert.strictEqual(status, 200);
    assert.strictEqual(json.reward.status, 'fulfilled');
    assert.ok(json.reward.fulfilledAt);
  });

  await test('POST /fulfill повторно → 400', async () => {
    assert.strictEqual((await req('POST', `/api/rewards/fulfill/${logId}`)).status, 400);
  });

  await test('PUT /rewards/:id с xp_cost<=0 → 400', async () => {
    assert.strictEqual((await req('PUT', '/api/rewards/r1', { xp_cost: -5 })).status, 400);
  });

  // ─── xp ───────────────────────────────────────────────────────────────────────
  process.stdout.write('\n── xp ──\n');

  await test('GET /xp/:id → профиль с available = total - spent', async () => {
    const { status, json } = await req('GET', '/api/xp/Богдан', undefined, BAR);
    assert.strictEqual(status, 200);
    assert.strictEqual(json.available, json.total - json.spent);
    assert.ok(Array.isArray(json.per_shift_history));
  });

  await test('GET /xp/:id неизвестного → нули', async () => {
    const { json } = await req('GET', '/api/xp/Призрак', undefined, BAR);
    assert.strictEqual(json.total, 0);
    assert.strictEqual(json.available, 0);
  });

  await test('GET /xp/leaderboard сортирован по per_shift_avg DESC', async () => {
    const { status, json } = await req('GET', '/api/xp/leaderboard', undefined, BAR);
    assert.strictEqual(status, 200);
    for (let i = 1; i < json.leaderboard.length; i++) {
      assert.ok(json.leaderboard[i - 1].per_shift_avg >= json.leaderboard[i].per_shift_avg);
    }
    assert.ok(json.leaderboard.every(e => e.name && e.bartenderId));
  });

  server.close();

  process.stdout.write('\n' + '─'.repeat(58) + '\n');
  process.stdout.write(`Итого: ${passed + failed} тестов | ✅ ${passed} прошло | ❌ ${failed} упало\n`);
  if (failed > 0) { process.stdout.write('\n❌ Есть упавшие тесты\n'); process.exit(1); }
  process.stdout.write('\n🎉 Все тесты прошли!\n');
})();
