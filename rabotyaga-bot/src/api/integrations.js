// integrations.js — API управления интеграциями тенанта (SEC-8, WI-7).
// GET  /api/integrations        → список интеграций тенанта (без секретов)
// PUT  /api/integrations/:kind  → обновить config интеграции (только не-секретные поля)
//
// Секреты (IIKO_PASSWORD, MOZG_PASSWORD, TELEGRAM_TOKEN) НЕ возвращаются и НЕ принимаются
// через этот API — они задаются только в env (PREFIX_NAME или глобально).
// Этот роут управляет только enabled-флагом и публичным config (URL, логин).

'use strict';

const express = require('express');
const { requireAuth, requireManager } = require('../middleware/auth');

// Поля, которые НИКОГДА не должны попасть в ответ (секреты).
const SECRET_FIELDS = new Set(['password', 'token', 'secret', 'api_key', 'apiKey']);

function stripSecrets(config) {
  if (!config || typeof config !== 'object') return {};
  const out = {};
  for (const [k, v] of Object.entries(config)) {
    if (!SECRET_FIELDS.has(k.toLowerCase())) out[k] = v;
  }
  return out;
}

/**
 * @param {object} adapter — db/adapter.js (getTenantIntegrations, setTenantIntegration)
 */
module.exports = function makeIntegrationsRouter(adapter) {
  const router = express.Router();

  // GET /api/integrations — интеграции тенанта из JWT
  router.get('/', requireAuth, async (req, res) => {
    try {
      const tid  = req.tenantId; // SEC-8: из JWT, fallback 'pivnaya_karta'
      const rows = await adapter.getTenantIntegrations(tid);
      // Не возвращаем секреты — только enabled + публичный config
      const result = rows.map(r => ({
        kind:    r.kind,
        enabled: r.enabled,
        config:  stripSecrets(r.config || {}),
      }));
      res.json({ ok: true, integrations: result });
    } catch (e) {
      console.error('[integrations/GET]', e.message);
      res.status(e.status || 500).json({ error: e.message });
    }
  });

  // PUT /api/integrations/:kind — обновить интеграцию (только manager)
  router.put('/:kind', requireManager, async (req, res) => {
    try {
      const tid  = req.tenantId;
      const kind = req.params.kind;
      const { enabled, config } = req.body || {};

      if (typeof enabled !== 'boolean') {
        return res.status(400).json({ error: 'enabled (boolean) обязателен' });
      }
      // Очищаем секреты из входящего config — они не должны попасть в БД
      const safeConfig = stripSecrets(config || {});

      await adapter.setTenantIntegration(tid, kind, enabled, safeConfig);
      console.log(`[integrations] ${tid}/${kind}: enabled=${enabled}`);
      res.json({ ok: true, kind, enabled, config: safeConfig });
    } catch (e) {
      console.error('[integrations/PUT]', e.message);
      res.status(e.status || 500).json({ error: e.message });
    }
  });

  return router;
};
