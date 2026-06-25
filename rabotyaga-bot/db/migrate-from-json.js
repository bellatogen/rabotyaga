#!/usr/bin/env node
// Одноразовый идемпотентный перенос data.json → PostgreSQL.
// Запуск: node db/migrate-from-json.js
//
// Идемпотентность: все вставки ON CONFLICT DO NOTHING — повторный прогон
// не дублирует и не перезатирает уже существующие в БД данные.
// Источник правды при первичной заливке — data.json; дальнейшие изменения
// идут через server.js (adapter.kvSet с DO UPDATE).

require('dotenv').config();
const fs   = require('fs');
const path = require('path');
const pool = require('./pool');

const DATA_FILE = process.env.DATA_FILE || path.join(__dirname, '..', 'data.json');

async function migrate() {
  if (!fs.existsSync(DATA_FILE)) {
    console.error(`❌ Файл не найден: ${DATA_FILE}`);
    process.exit(1);
  }

  let data;
  try {
    data = JSON.parse(fs.readFileSync(DATA_FILE, 'utf8'));
  } catch (e) {
    console.error(`❌ Не удалось распарсить ${DATA_FILE}:`, e.message);
    process.exit(1);
  }

  const kv          = data.kv          || {};
  const bindings    = data.bindings    || {};
  const pushSettings = data.pushSettings || {};

  const stats = { kv_store: 0, employee_bindings: 0, pushSettings: 0 };

  const client = await pool.connect();
  try {
    await client.query('BEGIN');

    // ── kv_store: значения уже JSON-строки, пишем как TEXT без изменений ──
    for (const [key, value] of Object.entries(kv)) {
      const text = typeof value === 'string' ? value : JSON.stringify(value);
      const res = await client.query(
        `INSERT INTO kv_store (key, value) VALUES ($1, $2)
         ON CONFLICT (key) DO NOTHING`,
        [key, text]
      );
      stats.kv_store += res.rowCount;
    }

    // ── employee_bindings: { name: telegramId } ──
    for (const [name, telegramId] of Object.entries(bindings)) {
      const res = await client.query(
        `INSERT INTO employee_bindings (name, telegram_id) VALUES ($1, $2)
         ON CONFLICT (name) DO NOTHING`,
        [name, telegramId]
      );
      stats.employee_bindings += res.rowCount;
    }

    // ── pushSettings → отдельный kv-ключ pushSettings:v1 ──
    if (Object.keys(pushSettings).length > 0) {
      const res = await client.query(
        `INSERT INTO kv_store (key, value) VALUES ($1, $2)
         ON CONFLICT (key) DO NOTHING`,
        ['pushSettings:v1', JSON.stringify(pushSettings)]
      );
      stats.pushSettings += res.rowCount;
    }

    await client.query('COMMIT');
  } catch (e) {
    await client.query('ROLLBACK');
    console.error('❌ Миграция откачена из-за ошибки:', e.message);
    process.exit(1);
  } finally {
    client.release();
  }

  // ── Статистика ──
  const totalKv   = Object.keys(kv).length;
  const totalBind = Object.keys(bindings).length;
  console.log('✅ Миграция завершена:');
  console.log(`   kv_store:          вставлено ${stats.kv_store} из ${totalKv} ключей (остальные уже были)`);
  console.log(`   employee_bindings: вставлено ${stats.employee_bindings} из ${totalBind} привязок (остальные уже были)`);
  console.log(`   pushSettings:v1:   ${stats.pushSettings ? 'вставлен' : 'уже был или пуст'}`);

  await pool.end();
}

migrate().catch(e => {
  console.error('❌ Непредвиденная ошибка миграции:', e);
  process.exit(1);
});
