// providers/index.js — реестр провайдеров интеграций.
// SEC-8: createProviderRegistry(ctx) создаёт изолированные инстансы для тенанта.
//
// Контекст ctx = { tenantId, config, getSecret }
//   tenantId  — идентификатор тенанта ([a-z0-9_])
//   config    — объект { iiko:{enabled,config}, mozg:{enabled,config}, ... } из tenant_integrations
//   getSecret — (name:string) => string, обёртка getTenantSecret для данного tenantId
//
// Каждый провайдер имеет интерфейс:
//   { kind, isConfigured(), ... }
// Дополнительные методы зависят от вида провайдера (см. каждый модуль).

'use strict';

const iikoProvider        = require('./iiko');
const mozgProvider        = require('./mozg');
const sheetsProvider      = require('./sheets');
const manualRevProvider   = require('./manualRevenue');

// Реестр: kind → factory
const PROVIDER_FACTORIES = {
  iiko:           iikoProvider,
  mozg:           mozgProvider,
  sheets:         sheetsProvider,
  manual_revenue: manualRevProvider,
};

/**
 * Создаёт реестр активных провайдеров для тенанта.
 *
 * @param {{ tenantId:string, config:object, getSecret:(name:string)=>string }} ctx
 * @returns {{ iiko, mozg, sheets, manual_revenue, all: Array }}
 */
function createProviderRegistry(ctx) {
  const { config = {} } = ctx;

  const instances = {};
  for (const [kind, factory] of Object.entries(PROVIDER_FACTORIES)) {
    // Конфиг интеграции: { enabled: bool, config: {} } из tenant_integrations.
    // Если вид вообще отсутствует в конфиге тенанта — не создаём.
    const intg = config[kind];
    if (!intg) continue;              // не заявлен для тенанта
    if (intg.enabled === false) continue; // явно отключён

    // Передаём config интеграции внутрь провайдера через ctx
    instances[kind] = factory.create({ ...ctx, config: intg.config || {} });
  }

  // Коллекция всех активных провайдеров (для итерации в server.js)
  instances.all = Object.values(instances).filter(p => p && typeof p.isConfigured === 'function');

  return instances;
}

module.exports = { createProviderRegistry, PROVIDER_FACTORIES };
