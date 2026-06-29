'use strict';
// Роуты магазина наград: /api/rewards/*
// Данные хранятся в data.kv (PG-backed) — см. src/quests/model.js.
const express = require('express');
const crypto = require('crypto');
const { requireAuth, requireManager } = require('../middleware/auth');
const model = require('../quests/model');

module.exports = function makeRewardsRouter(data, saveData) {
  const router = express.Router();
  const bad = (res, msg) => res.status(400).json({ error: msg });

  // GET / — все награды (?active=true — только активные)
  router.get('/', requireAuth, (req, res) => {
    let list = model.loadRewards(data);
    if (req.query.active === 'true') list = list.filter(r => r.active);
    res.json({ success: true, rewards: list });
  });

  // GET /pending — невыданные награды (только менеджер) — что нужно выплатить
  router.get('/pending', requireManager, (req, res) => {
    res.json({ success: true, pending: model.loadRewardLog(data).filter(e => e.status === 'pending') });
  });

  // POST /redeem — потратить XP на награду
  router.post('/redeem', requireAuth, (req, res) => {
    const { bartenderId, rewardId } = req.body || {};
    if (typeof bartenderId !== 'string' || !bartenderId.trim()) return bad(res, 'bartenderId обязателен');
    if (typeof rewardId !== 'string' || !rewardId.trim()) return bad(res, 'rewardId обязателен');

    const reward = model.loadRewards(data).find(r => r.id === rewardId);
    if (!reward) return res.status(404).json({ error: 'Награда не найдена' });
    if (!reward.active) return bad(res, 'Награда недоступна (active=false)');

    const ledgers = model.loadLedgers(data);
    const ledger = model.ensureLedger(ledgers, bartenderId.trim());
    const available = model.availableXp(ledger);
    if (available < reward.xp_cost) {
      return bad(res, `Недостаточно XP: доступно ${available}, нужно ${reward.xp_cost}`);
    }

    // Списываем со spent, total не трогаем (полная история заработка сохраняется).
    ledger.spent += reward.xp_cost;
    const logEntry = {
      id: 'rl_' + crypto.randomUUID(),
      bartenderId: bartenderId.trim(),
      rewardId,
      rewardName: reward.name,
      xp_cost: reward.xp_cost,
      redeemedAt: new Date().toISOString(),
      status: 'pending',
    };
    const log = model.loadRewardLog(data);
    log.push(logEntry);

    model.setLedgers(data, ledgers);
    model.setRewardLog(data, log);
    saveData();

    res.json({ success: true, remaining_xp: model.availableXp(ledger), reward: logEntry });
  });

  // POST /fulfill/:logId — отметить выдачу (менеджер)
  router.post('/fulfill/:logId', requireManager, (req, res) => {
    const log = model.loadRewardLog(data);
    const entry = log.find(e => e.id === req.params.logId);
    if (!entry) return res.status(404).json({ error: 'Запись лога не найдена' });
    if (entry.status === 'fulfilled') return bad(res, 'Награда уже выдана');
    entry.status = 'fulfilled';
    entry.fulfilledAt = new Date().toISOString();
    model.setRewardLog(data, log);
    saveData();
    res.json({ success: true, reward: entry });
  });

  // PUT /:id — обновить награду (админ). Объявлен после конкретных путей.
  router.put('/:id', requireManager, (req, res) => {
    const rewards = model.loadRewards(data);
    const r = rewards.find(x => x.id === req.params.id);
    if (!r) return res.status(404).json({ error: 'Награда не найдена' });
    const { name, xp_cost, active, type } = req.body || {};
    if (name !== undefined) {
      if (typeof name !== 'string' || !name.trim()) return bad(res, 'name должен быть непустой строкой');
      r.name = name.trim();
    }
    if (xp_cost !== undefined) {
      if (!Number.isFinite(xp_cost) || xp_cost <= 0) return bad(res, 'xp_cost должен быть числом > 0');
      r.xp_cost = xp_cost;
    }
    if (active !== undefined) {
      if (typeof active !== 'boolean') return bad(res, 'active должен быть boolean');
      r.active = active;
    }
    if (type !== undefined) {
      if (typeof type !== 'string' || !type.trim()) return bad(res, 'type должен быть непустой строкой');
      r.type = type.trim();
    }
    model.setRewards(data, rewards);
    saveData();
    res.json({ success: true, reward: r });
  });

  return router;
};
