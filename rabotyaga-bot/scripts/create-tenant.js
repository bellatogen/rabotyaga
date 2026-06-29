#!/usr/bin/env node
// scripts/create-tenant.js — CLI для создания нового тенанта в БД.
// SEC-8 WI-8. НЕ деплоит и не мигрирует прод автоматически.
//
// Использование:
//   node scripts/create-tenant.js <tenant_id> <name>
//
// Примеры:
//   node scripts/create-tenant.js pivnaya_karta "Пивная карта"
//   node scripts/create-tenant.js second_bar "Второй бар"
//
// tenant_id: только [a-z0-9_], не начинается с цифры.
// Перед запуском: применить миграцию 004_multitenancy.sql.
// Переменная окружения DATABASE_URL или PG* — обязательна.

'use strict';

require('dotenv').config({ path: require('path').join(__dirname, '../.env') });

const adapter = require('../db/adapter');

const VALID_TID = /^[a-z][a-z0-9_]*$/;

async function main() {
  const [, , tenantId, ...nameParts] = process.argv;
  const name = nameParts.join(' ').trim();

  if (!tenantId || !name) {
    console.error('Использование: node scripts/create-tenant.js <tenant_id> "<name>"');
    console.error('  Пример: node scripts/create-tenant.js second_bar "Второй бар"');
    process.exit(1);
  }

  if (!VALID_TID.test(tenantId)) {
    console.error(`❌ Невалидный tenant_id: "${tenantId}"`);
    console.error('   Допустимо: [a-z][a-z0-9_]* (нижнее подчёркивание, без дефисов, с буквы)');
    process.exit(1);
  }

  try {
    // Проверяем, не существует ли уже
    const existing = await adapter.getTenant(tenantId);
    if (existing) {
      console.log(`⚠️  Тенант "${tenantId}" уже существует (name: "${existing.name}", status: ${existing.status})`);
      console.log('   Используйте существующий или выберите другой tenant_id.');
      process.exit(0);
    }

    await adapter.createTenant(tenantId, name);
    console.log(`✅ Тенант создан: tenant_id="${tenantId}", name="${name}"`);
    console.log('');
    console.log('Следующие шаги:');
    console.log(`  1. Добавить env-переменные для тенанта:`);
    console.log(`     ${tenantId.toUpperCase()}_TELEGRAM_TOKEN=<токен_бота>`);
    console.log(`     ${tenantId.toUpperCase()}_IIKO_URL=<url>`);
    console.log(`     ${tenantId.toUpperCase()}_IIKO_LOGIN=<login>`);
    console.log(`     ${tenantId.toUpperCase()}_IIKO_PASSWORD=<password>`);
    console.log(`     ${tenantId.toUpperCase()}_MOZG_LOGIN=<login>  (если используется)`);
    console.log(`     ${tenantId.toUpperCase()}_MOZG_PASSWORD=<password>`);
    console.log(`  2. Добавить нужные интеграции через API:`);
    console.log(`     PUT /api/integrations/iiko   { enabled: true }`);
    console.log(`     PUT /api/integrations/mozg   { enabled: true }`);
    console.log(`  3. Перезапустить сервер — buildTokenMap подхватит новый бот-токен.`);
  } catch (e) {
    console.error('❌ Ошибка создания тенанта:', e.message);
    if (e.message.includes('connect')) {
      console.error('   Проверьте DATABASE_URL или PG* переменные в .env');
    }
    process.exit(1);
  }
}

main();
