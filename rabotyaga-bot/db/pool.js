const { Pool } = require('pg');

// DATABASE_URL — единственный источник конфигурации подключения.
// В docker-compose он собирается из POSTGRES_PASSWORD; локально можно задать вручную.
const connectionString = process.env.DATABASE_URL
  || 'postgresql://rabotyaga:changeme123@localhost:5432/rabotyaga';

if (!process.env.DATABASE_URL) {
  console.warn('[pg] DATABASE_URL не задан — использую локальный fallback (postgres@localhost:5432). В проде задайте переменную.');
}

const pool = new Pool({
  connectionString,
  // SSL нужен только при вынесении PG на отдельный managed-хост (PGSSL=1).
  // Внутри docker-compose сети шифрование не требуется.
  ssl: process.env.PGSSL === '1' ? { rejectUnauthorized: false } : false,
});

pool.on('error', (err) => {
  // Ошибка на простаивающем клиенте не должна валить процесс — только лог.
  console.error('[pg] неожиданная ошибка простаивающего клиента:', err.message);
});

module.exports = pool;
