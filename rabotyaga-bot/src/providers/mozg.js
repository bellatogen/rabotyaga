// providers/mozg.js — провайдер синхронизации метрик mozg.rest.
// SEC-8: каждый тенант получает свой makeMozgSyncClient-инстанс с замкнутым cookie jar.
//
// Интерфейс: create(ctx) → { kind, isConfigured(), syncDashboard(data,saveData) }
// ctx = { tenantId, config, getSecret }
//
// ВАЖНО: mozg НЕ является источником revenue:v1.
// Пишет только в mozg:dashboard:v1 (дрифт-индикатор для бэкенда).

'use strict';

const { makeMozgSyncClient } = require('../sync/mozgSync');

/**
 * Создаёт mozg-провайдер для конкретного тенанта.
 * @param {{ tenantId:string, config:object, getSecret:(name:string)=>string }} ctx
 */
function create(ctx) {
  const { getSecret } = ctx;

  const client = makeMozgSyncClient({
    login:    getSecret('MOZG_LOGIN'),
    password: getSecret('MOZG_PASSWORD'),
  });

  return {
    kind: 'mozg',

    isConfigured() { return client.isConfigured(); },

    // Sync дашборда mozg → mozg:dashboard:v1 (НЕ revenue:v1)
    syncDashboard(data, saveData) {
      return client.syncMozgDashboard(data, saveData);
    },
  };
}

module.exports = { create };
