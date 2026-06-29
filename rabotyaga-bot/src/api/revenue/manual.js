// revenue/manual.js — POST /api/revenue/manual (SEC-8, WI-7).
// Ручной ввод/правка полей выручки за день (plan, fact, note).
// Приоритет: iiko-факт не перезаписывается вручную (см. manualRevenue провайдер).
// Только manager.

'use strict';

const express = require('express');
const { requireManager } = require('../../middleware/auth');
const { create: createManualProvider } = require('../../providers/manualRevenue');

module.exports = function makeManualRevenueRouter(data, saveData) {
  const router = express.Router();

  // POST /api/revenue/manual
  // Body: { date: 'YYYY-MM-DD', plan?: number, fact?: number, note?: string }
  router.post('/', requireManager, (req, res) => {
    try {
      const { date, plan, fact, note } = req.body || {};
      if (!date || !/^\d{4}-\d{2}-\d{2}$/.test(date)) {
        return res.status(400).json({ error: 'date (YYYY-MM-DD) обязателен' });
      }
      if (plan === undefined && fact === undefined && note === undefined) {
        return res.status(400).json({ error: 'хотя бы одно поле (plan, fact, note) обязательно' });
      }
      if (plan !== undefined && (typeof plan !== 'number' || plan < 0)) {
        return res.status(400).json({ error: 'plan должен быть неотрицательным числом' });
      }
      if (fact !== undefined && (typeof fact !== 'number' || fact < 0)) {
        return res.status(400).json({ error: 'fact должен быть неотрицательным числом' });
      }

      // SEC-8: data.kv — шим → pivnaya_karta (пока единственный тенант)
      const provider = createManualProvider();
      const entry    = {};
      if (plan !== undefined) entry.plan = plan;
      if (fact !== undefined) entry.fact = fact;
      if (note !== undefined) entry.note = note;

      const result = provider.mergeRevenue(date, entry, data, saveData);
      res.json({ ok: true, date, day: result });
    } catch (e) {
      console.error('[revenue/manual]', e.message);
      res.status(500).json({ error: e.message });
    }
  });

  return router;
};
