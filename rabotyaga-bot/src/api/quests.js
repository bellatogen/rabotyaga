'use strict';
// Роуты квест-системы: /api/quests/*
// Данные хранятся в data.kv (PG-backed) — см. src/quests/model.js.
const express = require('express');
const { requireAuth, requireManager, requireTgVerified } = require('../middleware/auth');
const model = require('../quests/model');

module.exports = function makeQuestsRouter(data, saveData) {
  const router = express.Router();
  const bad = (res, msg) => res.status(400).json({ error: msg });

  // GET /pool — весь пул квестов (только админ: manager/developer)
  router.get('/pool', requireManager, (req, res) => {
    res.json({ success: true, pool: model.loadQuests(data).pool });
  });

  // POST /weekly — создать/заменить недельный челлендж (админ)
  router.post('/weekly', requireManager, (req, res) => {
    const { description, xp, deadline } = req.body || {};
    if (typeof description !== 'string' || !description.trim()) return bad(res, 'description обязателен (непустая строка)');
    if (!Number.isFinite(xp) || xp <= 0) return bad(res, 'xp должен быть числом > 0');
    if (!deadline || Number.isNaN(Date.parse(deadline))) return bad(res, 'deadline должен быть валидной датой');
    const quests = model.loadQuests(data);
    quests.weekly_challenge = { description: description.trim(), xp, deadline, createdAt: new Date().toISOString() };
    model.setQuests(data, quests);
    saveData();
    res.json({ success: true, weekly_challenge: quests.weekly_challenge });
  });

  // GET /weekly/progress — челлендж + сумма недельного XP за текущую ISO-неделю.
  // По контракту: суммируем reward_log с rewardId === 'weekly' за текущую неделю.
  router.get('/weekly/progress', requireAuth, (req, res) => {
    const quests = model.loadQuests(data);
    const log = model.loadRewardLog(data);
    const now = new Date();
    let progress_xp = 0;
    for (const e of log) {
      if (e && e.rewardId === 'weekly' && model.isWithinCurrentIsoWeek(e.redeemedAt, now)) {
        progress_xp += Number(e.xp || e.xp_cost || 0);
      }
    }
    res.json({ success: true, weekly_challenge: quests.weekly_challenge, progress_xp });
  });

  // GET /shift/:shiftId — квесты смены. Если не назначены — авто-назначаем 3 активных.
  router.get('/shift/:shiftId', requireAuth, (req, res) => {
    const shiftId = req.params.shiftId;
    const quests = model.loadQuests(data);
    let entry = quests.shift_quests[shiftId];
    if (!entry) {
      const picked = model.pickActiveQuests(quests.pool, 3).map(q => ({
        id: q.id,
        name: q.name,
        condition_type: q.condition_type,
        threshold: q.threshold,
        xp: q.xp,
        completed: false,
        completedBy: null,
        completedAt: null,
        shiftDate: null,
      }));
      entry = { quests: picked, assignedAt: new Date().toISOString() };
      quests.shift_quests[shiftId] = entry;
      model.setQuests(data, quests);
      saveData();
    }
    res.json({ success: true, shiftId, quests: entry.quests, assignedAt: entry.assignedAt });
  });

  // POST /complete — отметить квест выполненным, начислить XP, обновить стрики
  // SEC-7: начисление XP — только для личности, подтверждённой через Telegram.
  router.post('/complete', requireTgVerified, (req, res) => {
    const { shiftId, questId, bartenderIds, shiftDate } = req.body || {};
    if (!shiftId || typeof shiftId !== 'string') return bad(res, 'shiftId обязателен');
    if (!questId || typeof questId !== 'string') return bad(res, 'questId обязателен');
    if (!Array.isArray(bartenderIds) || bartenderIds.length === 0) return bad(res, 'bartenderIds должен быть непустым массивом');
    if (bartenderIds.some(b => typeof b !== 'string' || !b.trim())) return bad(res, 'bartenderIds должен содержать непустые строки');
    if (!shiftDate || Number.isNaN(Date.parse(shiftDate))) return bad(res, 'shiftDate должен быть валидной датой');

    const quests = model.loadQuests(data);
    const entry = quests.shift_quests[shiftId];
    if (!entry) return res.status(404).json({ error: 'Квесты для этой смены не назначены' });
    const sq = entry.quests.find(q => q.id === questId);
    if (!sq) return res.status(404).json({ error: 'Квест не назначен этой смене' });
    if (sq.completed) return bad(res, 'Квест уже выполнен для этой смены');

    const totalXp = Number(sq.xp || 0);
    const ids = [...new Set(bartenderIds.map(b => b.trim()))];
    const xpEach = Math.floor(totalXp / ids.length); // остаток теряется (чистая математика)
    const ts = new Date().toISOString();

    const ledgers = model.loadLedgers(data);
    const streaks = model.loadStreaks(data);
    const new_totals = {};
    let streakBonusApplied = 0;
    for (const id of ids) {
      const ledger = model.ensureLedger(ledgers, id);
      const { streak, advanced } = model.updateStreak(streaks, id, shiftDate);
      let bonus = 0;
      if (advanced && streak.current >= model.STREAK_BONUS_THRESHOLD) {
        bonus = model.STREAK_BONUS_XP;
        streakBonusApplied = model.STREAK_BONUS_XP;
      }
      ledger.total += xpEach + bonus;
      ledger.per_shift_history.push({ shiftId, questId, date: shiftDate, xp: xpEach, bonus, ts });
      model.recomputeAvg(ledger);
      new_totals[id] = {
        total: ledger.total,
        available: model.availableXp(ledger),
        per_shift_avg: ledger.per_shift_avg,
        streak: streak.current,
        streak_bonus: bonus,
      };
    }

    sq.completed = true;
    sq.completedBy = ids;
    sq.completedAt = ts;
    sq.shiftDate = shiftDate;

    // Все мутации в kv, затем один saveData() → атомарный флаш (файл + PG).
    model.setQuests(data, quests);
    model.setLedgers(data, ledgers);
    model.setStreaks(data, streaks);
    saveData();

    res.json({ success: true, xp_awarded_each: xpEach, streak_bonus: streakBonusApplied, new_totals });
  });

  // PUT /:id — обновить квест пула (админ). Объявлен последним (метод PUT, конфликтов нет).
  router.put('/:id', requireManager, (req, res) => {
    const quests = model.loadQuests(data);
    const q = quests.pool.find(x => x.id === req.params.id);
    if (!q) return res.status(404).json({ error: 'Квест не найден' });
    const { name, threshold, xp, active } = req.body || {};
    if (name !== undefined) {
      if (typeof name !== 'string' || !name.trim()) return bad(res, 'name должен быть непустой строкой');
      q.name = name.trim();
    }
    if (threshold !== undefined) {
      if (!Number.isFinite(threshold) || threshold <= 0) return bad(res, 'threshold должен быть числом > 0');
      q.threshold = threshold;
    }
    if (xp !== undefined) {
      if (!Number.isFinite(xp) || xp <= 0) return bad(res, 'xp должен быть числом > 0');
      q.xp = xp;
    }
    if (active !== undefined) {
      if (typeof active !== 'boolean') return bad(res, 'active должен быть boolean');
      q.active = active;
    }
    model.setQuests(data, quests);
    saveData();
    res.json({ success: true, quest: q });
  });

  return router;
};
