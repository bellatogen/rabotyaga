'use strict';
// Роуты XP-профилей и лидерборда: /api/xp/*
// Данные хранятся в data.kv (PG-backed) — см. src/quests/model.js.
const express = require('express');
const { requireAuth } = require('../middleware/auth');
const model = require('../quests/model');

module.exports = function makeXpRouter(data, _saveData) {
  const router = express.Router();

  // GET /leaderboard — сортировка по per_shift_avg DESC (не по total — не штрафует за малое число смен).
  // ВАЖНО: объявлен ДО /:bartenderId, иначе 'leaderboard' попадёт в параметр.
  router.get('/leaderboard', requireAuth, (req, res) => {
    const ledgers = model.loadLedgers(data);
    const leaderboard = Object.entries(ledgers).map(([id, l]) => ({
      bartenderId: id,
      name: model.resolveName(data, id),
      per_shift_avg: l.per_shift_avg || 0,
      total: l.total || 0,
      available: model.availableXp(l),
    }));
    leaderboard.sort((a, b) => b.per_shift_avg - a.per_shift_avg);
    res.json({ success: true, leaderboard });
  });

  // GET /:bartenderId — полный XP-профиль
  router.get('/:bartenderId', requireAuth, (req, res) => {
    const id = req.params.bartenderId;
    const l = model.loadLedgers(data)[id];
    const streak = model.loadStreaks(data)[id] || { current: 0, best: 0, last_shift_date: null };
    if (!l) {
      return res.json({
        success: true, bartenderId: id,
        total: 0, spent: 0, available: 0, per_shift_avg: 0,
        streak, per_shift_history: [],
      });
    }
    res.json({
      success: true,
      bartenderId: id,
      total: l.total || 0,
      spent: l.spent || 0,
      available: model.availableXp(l),
      per_shift_avg: l.per_shift_avg || 0,
      streak,
      per_shift_history: l.per_shift_history.slice(-30),
    });
  });

  return router;
};
