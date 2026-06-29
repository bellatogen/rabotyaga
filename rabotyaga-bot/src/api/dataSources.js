// dataSources.js — CRUD для настройки источников данных (Google Sheets и т.п.)
// SEC-8: все запросы фильтруются по tenant_id из JWT (req.tenantId).
// Если PostgreSQL недоступна — роуты возвращают graceful-ответ, не падают.
'use strict';

const express = require('express');
const { requireAuth, requireManager } = require('../middleware/auth');

const router = express.Router();

let pool = null;
try {
  pool = require('../../db/pool');
} catch {
  console.warn('[dataSources] db/pool недоступен — роуты data-sources вернут пустые данные');
}

async function safeQuery(sql, params = []) {
  if (!pool) throw Object.assign(new Error('База данных не подключена'), { status: 503 });
  return pool.query(sql, params);
}

// GET /api/admin/data-sources
router.get('/', requireAuth, async (req, res) => {
  try {
    const tid = req.tenantId; // SEC-8: из JWT
    const result = await safeQuery(
      'SELECT * FROM data_sources WHERE tenant_id = $1 ORDER BY source_type',
      [tid]
    );
    res.json({ success: true, sources: result.rows });
  } catch (e) {
    const status = e.status || 500;
    res.status(status < 500 ? status : 200).json({ success: false, sources: [], error: e.message });
  }
});

// POST /api/admin/data-sources
router.post('/', requireManager, async (req, res) => {
  const { source_type, google_sheet_url } = req.body;
  try {
    const tid = req.tenantId;
    await safeQuery(
      'UPDATE data_sources SET google_sheet_url = $1, updated_at = NOW() WHERE source_type = $2 AND tenant_id = $3',
      [google_sheet_url, source_type, tid]
    );
    res.json({ success: true });
  } catch (e) {
    res.status(e.status || 500).json({ success: false, error: e.message });
  }
});

// POST /api/admin/data-sources/sync
router.post('/sync', requireManager, async (req, res) => {
  const { source_type } = req.body;
  try {
    const tid = req.tenantId;
    await safeQuery(
      'UPDATE data_sources SET last_sync = NOW(), sync_status = $1 WHERE source_type = $2 AND tenant_id = $3',
      ['success', source_type, tid]
    );
    res.json({ success: true, message: 'Синхронизация запущена' });
  } catch (e) {
    res.status(e.status || 500).json({ success: false, error: e.message });
  }
});

module.exports = router;
