const express = require('express');
const router = express.Router();
const pool = require('../db/pool');

// GET /api/admin/data-sources
router.get('/', async (req, res) => {
  try {
    const result = await pool.query('SELECT * FROM data_sources ORDER BY source_type');
    res.json({ success: true, sources: result.rows });
  } catch (e) {
    res.json({ success: false, error: e.message });
  }
});

// POST /api/admin/data-sources
router.post('/', async (req, res) => {
  const { source_type, google_sheet_url } = req.body;
  try {
    await pool.query(
      'UPDATE data_sources SET google_sheet_url = $1, updated_at = NOW() WHERE source_type = $2',
      [google_sheet_url, source_type]
    );
    res.json({ success: true });
  } catch (e) {
    res.json({ success: false, error: e.message });
  }
});

// POST /api/admin/data-sources/sync
router.post('/sync', async (req, res) => {
  const { source_type } = req.body;
  try {
    // TODO: Здесь будет логика парсинга Google Sheets
    await pool.query(
      'UPDATE data_sources SET last_sync = NOW(), sync_status = $1 WHERE source_type = $2',
      ['success', source_type]
    );
    res.json({ success: true, message: 'Синхронизация запущена' });
  } catch (e) {
    res.json({ success: false, error: e.message });
  }
});

module.exports = router;
