'use strict';
// migrate.js — идемпотентный runner SQL-миграций (P0 «Привилегии/ACL», Ф1).
// Зачем: в docker-compose миграции подключены через docker-entrypoint-initdb.d,
// который прогоняется ТОЛЬКО при первой инициализации пустого тома. На работающем
// проде новые файлы (005+) сами не применятся. Этот runner закрывает разрыв.
//
// Запуск:  node db/migrate.js
//
// Идемпотентность двойная: (1) сами .sql написаны через IF NOT EXISTS / ON CONFLICT;
// (2) runner ведёт таблицу schema_migrations и не применяет уже применённое.
//
// Backfill: если schema_migrations пуста, но таблица tenants уже существует (значит
// 001–004 накатаны через initdb на живом проде) — помечаем их применёнными, чтобы
// не пытаться перезапустить (в 001 есть CREATE INDEX без IF NOT EXISTS → падал бы).

const fs   = require('fs');
const path = require('path');

const MIGRATIONS_DIR = __dirname;
const MIGRATION_RE = /^(\d+)_.*\.sql$/;

// Версия миграции = числовой префикс имени файла ('001', '005', …).
function parseVersion(filename) {
  const m = filename.match(MIGRATION_RE);
  return m ? m[1] : null;
}

// Список файлов миграций по порядку версии.
function listMigrationFiles(dir = MIGRATIONS_DIR) {
  return fs.readdirSync(dir)
    .filter(f => MIGRATION_RE.test(f))
    .sort((a, b) => parseVersion(a).localeCompare(parseVersion(b)));
}

// Чистая функция: какие файлы ещё не применены (для юнит-теста).
function pendingMigrations(allFiles, appliedVersions) {
  const applied = new Set(appliedVersions);
  return allFiles.filter(f => !applied.has(parseVersion(f)));
}

async function ensureMigrationsTable(pool) {
  await pool.query(`
    CREATE TABLE IF NOT EXISTS schema_migrations (
      version    TEXT PRIMARY KEY,
      applied_at TIMESTAMP DEFAULT NOW()
    )`);
}

async function getAppliedVersions(pool) {
  const res = await pool.query('SELECT version FROM schema_migrations');
  return res.rows.map(r => r.version);
}

// Backfill 001–004 как применённых, если БД уже инициализирована через initdb.
async function backfillIfLegacyDb(pool, allFiles) {
  const applied = await getAppliedVersions(pool);
  if (applied.length > 0) return; // журнал уже ведётся — backfill не нужен
  const reg = await pool.query("SELECT to_regclass('public.tenants') AS t");
  if (!reg.rows[0] || reg.rows[0].t == null) return; // свежая БД — применим всё с 001
  // Прод, инициализированный через initdb: помечаем всё ≤ 004 применённым.
  for (const f of allFiles) {
    const v = parseVersion(f);
    if (v <= '004') {
      await pool.query(
        'INSERT INTO schema_migrations (version) VALUES ($1) ON CONFLICT DO NOTHING', [v]
      );
    }
  }
  console.log('[migrate] backfill: 001–004 помечены применёнными (initdb-инициализация)');
}

async function run(pool) {
  await ensureMigrationsTable(pool);
  const allFiles = listMigrationFiles();
  await backfillIfLegacyDb(pool, allFiles);
  const applied = await getAppliedVersions(pool);
  const pending = pendingMigrations(allFiles, applied);

  if (!pending.length) {
    console.log('[migrate] нечего применять — БД в актуальном состоянии');
    return { applied: [] };
  }

  const done = [];
  for (const file of pending) {
    const version = parseVersion(file);
    const sql = fs.readFileSync(path.join(MIGRATIONS_DIR, file), 'utf8');
    const client = await pool.connect();
    try {
      await client.query('BEGIN');
      await client.query(sql);
      await client.query('INSERT INTO schema_migrations (version) VALUES ($1)', [version]);
      await client.query('COMMIT');
      console.log(`[migrate] ✅ применена ${file}`);
      done.push(version);
    } catch (e) {
      await client.query('ROLLBACK');
      console.error(`[migrate] ❌ ошибка в ${file}: ${e.message}`);
      throw e;
    } finally {
      client.release();
    }
  }
  return { applied: done };
}

module.exports = { parseVersion, listMigrationFiles, pendingMigrations, run };

// CLI-режим: node db/migrate.js
if (require.main === module) {
  const pool = require('./pool');
  run(pool)
    .then(({ applied }) => {
      console.log(`[migrate] готово, применено миграций: ${applied.length}`);
      return pool.end();
    })
    .then(() => process.exit(0))
    .catch(err => {
      console.error('[migrate] провал:', err.message);
      pool.end().finally(() => process.exit(1));
    });
}
