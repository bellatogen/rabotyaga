'use strict';
// Одноразовая миграция квест-системы.
// Безопасно создаёт kv-ключи quests:v1 / rewards:v1 / xp_ledger:v1 / streaks:v1 /
// reward_log:v1 в data.json (PG-backed store), НЕ трогая существующие данные.
// Также переносит legacy top-level поля (quests/rewards/...) в kv, если они там были.
// Идемпотентно — повторный запуск ничего не ломает.
//
// Запуск:  node scripts/migrate-quests.js
// (сервер также инициализирует модель сам при старте — этот скрипт для ручного прогона)
const fs = require('fs');
const path = require('path');
const { ensureQuestModel, KEYS } = require('../src/quests/model');

const DATA_FILE = process.env.DATA_FILE || path.join(__dirname, '..', 'data.json');

let data = { kv: {}, bindings: {}, pushSettings: {}, adminUsers: [] };
if (fs.existsSync(DATA_FILE)) {
  try {
    data = JSON.parse(fs.readFileSync(DATA_FILE, 'utf8'));
    if (!data.kv) data.kv = {};
  } catch (e) {
    console.error('❌ Не удалось прочитать data.json:', e.message);
    process.exit(1);
  }
} else {
  console.log('ℹ️  data.json не найден — будет создан новый.');
}

const snapshot = (d) => JSON.stringify(Object.values(KEYS).map(k => d.kv[k] ?? null));

const before = snapshot(data);
ensureQuestModel(data, null); // мутирует data.kv, не сохраняет
const after = snapshot(data);

if (before === after) {
  console.log('✅ Квест-ключи уже на месте — изменений не требуется.');
  process.exit(0);
}

// Резервная копия перед записью
try {
  if (fs.existsSync(DATA_FILE)) fs.copyFileSync(DATA_FILE, DATA_FILE + '.bak');
} catch (e) {
  console.warn('⚠️  Не удалось создать резервную копию:', e.message);
}

fs.writeFileSync(DATA_FILE, JSON.stringify(data, null, 2));
const pool = JSON.parse(data.kv[KEYS.quests]).pool;
const rewards = JSON.parse(data.kv[KEYS.rewards]);
console.log('✅ Миграция выполнена. Квест-ключи в data.kv (синкаются в PostgreSQL):');
console.log(`   • ${KEYS.quests}: ${pool.length} квестов`);
console.log(`   • ${KEYS.rewards}: ${rewards.length} наград`);
console.log(`   • ${KEYS.xp_ledger} / ${KEYS.streaks} / ${KEYS.reward_log}: инициализированы.`);
console.log(`   • Резервная копия: ${DATA_FILE}.bak`);
