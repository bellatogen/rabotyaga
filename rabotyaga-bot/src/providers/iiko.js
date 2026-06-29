// providers/iiko.js — провайдер выручки iiko для реестра провайдеров.
// SEC-8: каждый тенант получает свой makeIikoClient-инстанс с замкнутым token-состоянием.
//
// Интерфейс: create(ctx) → { kind, isConfigured(), fetchRevenue(date,data,saveData),
//                             syncRevenueRange(from,to,data,saveData) }
// ctx = { tenantId, config, getSecret }

'use strict';

const { makeIikoClient } = require('../api/iiko');

/**
 * Создаёт iiko-провайдер для конкретного тенанта.
 * @param {{ tenantId:string, config:object, getSecret:(name:string)=>string }} ctx
 */
function create(ctx) {
  const { getSecret } = ctx;

  // Секреты резолвятся через getTenantSecret — env[TID_UPPER_NAME] → env[NAME] для default
  const client = makeIikoClient({
    url:      getSecret('IIKO_URL'),
    login:    getSecret('IIKO_LOGIN'),
    password: getSecret('IIKO_PASSWORD'),
  });

  return {
    kind: 'iiko',

    isConfigured() { return client.isConfigured(); },

    // Выручка за один день (запись в revenue:v1)
    fetchRevenue(date, data, saveData) {
      return client.getDayRevenue(date, data, saveData);
    },

    // Диапазонный sync выручки (запись в revenue:v1)
    syncRevenueRange(from, to, data, saveData) {
      return client.syncRevenueRange(from, to, data, saveData);
    },

    // Полный sync текущего месяца
    syncRevenue(data, saveData) {
      return client.syncRevenue(data, saveData);
    },
  };
}

module.exports = { create };
