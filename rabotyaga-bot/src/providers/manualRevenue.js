// providers/manualRevenue.js — провайдер ручного ввода выручки.
// SEC-8: не требует внешних секретов — всегда "настроен".
//
// Интерфейс: create(ctx) → { kind, isConfigured(), mergeRevenue(date,entry,data,saveData) }
// ctx = { tenantId, config, getSecret }
//
// Ключ хранения: revenue:v1 (то же, что iiko — поля дополняют, не заменяют).
// Приоритет полей: iiko > manual (если iiko-факт уже записан, manual его не перезаписывает).

'use strict';

/**
 * Создаёт провайдер ручной выручки для конкретного тенанта.
 * @param {{ tenantId:string, config:object, getSecret:(name:string)=>string }} ctx
 */
function create(/* ctx */) {
  return {
    kind: 'manual_revenue',

    isConfigured() { return true; },

    /**
     * Записывает/обновляет ручные поля выручки за дату.
     * @param {string} date — 'YYYY-MM-DD'
     * @param {{ fact?:number, plan?:number, note?:string }} entry
     * @param {object} data — тенантский kv-объект
     * @param {Function} saveData
     */
    mergeRevenue(date, entry, data, saveData) {
      const revenue = JSON.parse(data.kv['revenue:v1'] || '{}');
      if (!revenue[date]) revenue[date] = {};
      const day = revenue[date];

      // plan — всегда перезаписываем (план приходит из sheets/manual)
      if (entry.plan != null) day.plan = Number(entry.plan);

      // fact — только если iiko-факт ещё не проставлен (iiko приоритетнее)
      if (entry.fact != null && !day.fact) day.fact = Number(entry.fact);

      if (entry.note != null) day.note = String(entry.note);

      data.kv['revenue:v1'] = JSON.stringify(revenue);
      saveData();
      return revenue[date];
    },
  };
}

module.exports = { create };
