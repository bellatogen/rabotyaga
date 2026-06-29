// providers/sheets.js — провайдер синхронизации плановых данных из Google Sheets.
// SEC-8: только для тенанта pivnaya_karta (жёсткое ограничение в архитектуре).
//
// Интерфейс: create(ctx) → { kind, isConfigured(), syncSchedule(data,saveData) }
// ctx = { tenantId, config, getSecret }
//
// ВНИМАНИЕ: вызывается ОТДЕЛЬНО от provider registry (не через loop провайдеров),
// т.к. scheduleSync жёстко завязан на структуру расписания «Пивной Карты».
// При добавлении второго тенанта — рефакторить scheduleSync под ctx.

'use strict';

const { syncSchedule } = require('../sync/scheduleSync');

const DEFAULT_TENANT = 'pivnaya_karta';

/**
 * Создаёт sheets-провайдер для конкретного тенанта.
 * Если tenantId !== pivnaya_karta — isConfigured() = false.
 * @param {{ tenantId:string, config:object, getSecret:(name:string)=>string }} ctx
 */
function create(ctx) {
  const { tenantId } = ctx;

  return {
    kind: 'sheets',

    isConfigured() {
      // scheduleSync поддерживает только дефолтный тенант
      return tenantId === DEFAULT_TENANT;
    },

    syncSchedule(data, saveData) {
      if (tenantId !== DEFAULT_TENANT) {
        throw new Error(`[sheets] syncSchedule поддерживается только для ${DEFAULT_TENANT}`);
      }
      return syncSchedule(data, saveData);
    },
  };
}

module.exports = { create };
