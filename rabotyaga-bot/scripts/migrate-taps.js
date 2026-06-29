'use strict';
// Одноразовая миграция кокпита кранов.
// Безопасно создаёт kv-ключи tap_config:v1 (дефолты) и taps:v1 (сид из 21 крана)
// в data.json (PG-backed store), НЕ трогая существующие данные.
// Идемпотентно — повторный запуск ничего не ломает.
//
// Запуск:  node scripts/migrate-taps.js
const fs = require('fs');
const path = require('path');
const { ensureTapModel, buildSeedTaps, KEYS } = require('../src/taps/model');

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

const snapshot = (d) => JSON.stringify(Object.values(KEYS).map((k) => d.kv[k] ?? null));

const before = snapshot(data);

// Конфиг — дефолтами (идемпотентно).
ensureTapModel(data, null);
// Сид 21 крана — только если taps:v1 ещё нет (не затираем существующие краны).
if (data.kv[KEYS.taps] === undefined) {
  data.kv[KEYS.taps] = JSON.stringify(buildSeedTaps());
}

const after = snapshot(data);

if (before === after) {
  console.log('✅ Ключи кранов уже на месте — изменений не требуется.');
  process.exit(0);
}

// Резервная копия перед записью
try {
  if (fs.existsSync(DATA_FILE)) fs.copyFileSync(DATA_FILE, DATA_FILE + '.bak');
} catch (e) {
  console.warn('⚠️  Не удалось создать резервную копию:', e.message);
}

fs.writeFileSync(DATA_FILE, JSON.stringify(data, null, 2));
const taps = JSON.parse(data.kv[KEYS.taps]);
const config = JSON.parse(data.kv[KEYS.config]);
console.log('✅ Миграция выполнена. Ключи кранов в data.kv (синкаются в PostgreSQL):');
console.log(`   • ${KEYS.taps}: ${taps.length} кранов`);
console.log(`   • ${KEYS.config}: green=${config.greenThreshold}, yellow=${config.yellowThreshold}, discount=${config.discountRate}`);
console.log(`   • Резервная копия: ${DATA_FILE}.bak`);
