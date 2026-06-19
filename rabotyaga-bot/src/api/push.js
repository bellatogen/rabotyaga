const express = require('express');
const router = express.Router();
const pushSender = require('../push/sender');

router.get('/settings', (req, res) => {
  const { userId } = req.query;
  if (!userId) return res.status(400).json({ error: 'userId required' });
  res.json({ success: true, settings: pushSender.getPushSettings(userId) });
});

router.post('/settings', (req, res) => {
  const { userId, enabled, notifications, templates } = req.body;
  if (!userId) return res.status(400).json({ error: 'userId required' });
  pushSender.updatePushSettings(userId, { enabled, notifications, templates });
  res.json({ success: true });
});

router.get('/all', (req, res) => {
  res.json({ success: true, settings: pushSender.getAllPushSettings() });
});

module.exports = router;
