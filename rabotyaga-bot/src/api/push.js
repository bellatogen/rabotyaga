// push.js — factory: принимает инстанс sender (уже подключённый к data).
const express   = require('express');
const rateLimit = require('express-rate-limit');
const fs        = require('fs');
const path      = require('path');
const { requireAuth, requireManager } = require('../middleware/auth');

const LOG_FILE = path.join(__dirname, '../../push-log.json');

function loadLog() {
  if (!fs.existsSync(LOG_FILE)) return [];
  try { return JSON.parse(fs.readFileSync(LOG_FILE, 'utf8')); } catch { return []; }
}

module.exports = function makePushApi(sender) {
  const router = express.Router();

  router.get('/settings', requireAuth, (req, res) => {
    const { userId } = req.query;
    if (!userId) return res.status(400).json({ error: 'userId required' });
    res.json({ success: true, settings: sender.getPushSettings(userId) });
  });

  router.post('/settings', requireAuth, (req, res) => {
    const { userId, enabled, notifications, templates } = req.body;
    if (!userId) return res.status(400).json({ error: 'userId required' });
    sender.updatePushSettings(userId, { enabled, notifications, templates });
    res.json({ success: true });
  });

  router.get('/all', requireManager, (req, res) => {
    res.json({ success: true, settings: sender.getAllPushSettings() });
  });

  // Статистика: общие счётчики + разбивка по пользователям
  router.get('/stats', requireManager, (req, res) => {
    const log = loadLog();
    const byUser = {};
    let sent = 0, failed = 0, skipped = 0;

    for (const entry of log) {
      if (!byUser[entry.userId]) byUser[entry.userId] = { sent: 0, failed: 0, skipped: 0 };
      byUser[entry.userId][entry.status] = (byUser[entry.userId][entry.status] || 0) + 1;
      if (entry.status === 'sent')    sent++;
      else if (entry.status === 'failed')  failed++;
      else if (entry.status === 'skipped') skipped++;
    }

    res.json({ success: true, total: log.length, sent, failed, skipped, byUser });
  });

  return router;
};
