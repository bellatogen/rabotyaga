'use strict';
// Роуты кокпита кранов: /api/taps/*
// Данные в data.kv (PG-backed) — см. src/taps/model.js. Формулы — src/taps/compute.js.
//
// ГЕЙТ: GET — requireAuth (любой авторизованный). Мутации — requireAuth, а НЕ
// requireManager: шеф-бармен ДОЛЖЕН иметь запись по кранам, а requireManager
// пускает только аккаунты manager/developer (роль шефа живёт в profiles:v1,
// отдельно от auth-аккаунта) — он бы его исключил.
const express = require('express');
const { requireAuth } = require('../middleware/auth');
const model = require('../taps/model');
const { computeTap } = require('../taps/compute');
const iiko = require('./iiko');

const OWNERSHIPS = new Set(['own', 'external']);

// Нормализует iikoProductId (строка | массив | null) для хранения.
// Массив: тримит, фильтрует пустые. Строка: тримит или null. null → null.
function normalizeIikoId(v) {
  if (v == null) return null;
  if (Array.isArray(v)) {
    const arr = v.map((s) => (typeof s === 'string' ? s.trim() : '')).filter(Boolean);
    return arr.length > 0 ? arr : null;
  }
  if (typeof v === 'string') {
    const s = v.trim();
    return s || null;
  }
  return null;
}

module.exports = function makeTapsRouter(data, saveData) {
  const router = express.Router();
  const bad = (res, msg) => res.status(400).json({ error: msg });

  // Валидация полей крана. mode='create' требует обязательные поля, 'update' — частичный патч.
  // Возвращает строку-ошибку или null.
  function validateTap(body, mode) {
    const b = body || {};
    const req = mode === 'create';

    if (req || b.name !== undefined) {
      if (typeof b.name !== 'string' || !b.name.trim()) return 'name должен быть непустой строкой';
    }
    if (req || b.ownership !== undefined) {
      if (!OWNERSHIPS.has(b.ownership)) return 'ownership должен быть "own" или "external"';
    }
    if (req || b.price !== undefined) {
      if (!Number.isFinite(b.price) || b.price < 0) return 'price должен быть числом >= 0';
    }
    if (req || b.cost !== undefined) {
      if (!Number.isFinite(b.cost) || b.cost < 0) return 'cost должен быть числом >= 0';
    }
    if (b.discountApplies !== undefined && typeof b.discountApplies !== 'boolean') return 'discountApplies должен быть boolean';
    if (b.isAnchor !== undefined && typeof b.isAnchor !== 'boolean') return 'isAnchor должен быть boolean';
    if (b.isStrategicHold !== undefined && typeof b.isStrategicHold !== 'boolean') return 'isStrategicHold должен быть boolean';
    if (b.position !== undefined && (!Number.isFinite(b.position) || b.position <= 0)) return 'position должен быть числом > 0';
    if (b.salesPerMonth !== undefined && b.salesPerMonth !== null && (!Number.isFinite(b.salesPerMonth) || b.salesPerMonth < 0)) return 'salesPerMonth должен быть числом >= 0 или null';
    if (b.newPrice !== undefined && b.newPrice !== null && (!Number.isFinite(b.newPrice) || b.newPrice < 0)) return 'newPrice должен быть числом >= 0 или null';
    if (b.iikoProductId !== undefined && b.iikoProductId !== null) {
      if (typeof b.iikoProductId !== 'string' && !Array.isArray(b.iikoProductId)) return 'iikoProductId должен быть строкой, массивом строк или null';
      if (Array.isArray(b.iikoProductId) && !b.iikoProductId.every((s) => typeof s === 'string')) return 'iikoProductId: массив должен содержать только строки';
    }
    return null;
  }

  // ── GET / — список кранов с вычисленными полями + конфиг ──
  router.get('/', requireAuth, (req, res) => {
    const config = model.loadConfig(data);
    const taps = model.loadTaps(data).map((t) => computeTap(t, config));
    res.json({ success: true, taps, config });
  });

  // ── GET /config — пороги/скидка ──
  router.get('/config', requireAuth, (req, res) => {
    res.json({ success: true, config: model.loadConfig(data) });
  });

  // ── PUT /config — обновить пороги/скидку ──
  router.put('/config', requireAuth, (req, res) => {
    const { greenThreshold, yellowThreshold, discountRate } = req.body || {};
    const config = model.loadConfig(data);
    if (greenThreshold !== undefined) {
      if (!Number.isFinite(greenThreshold) || greenThreshold <= 0 || greenThreshold > 100) return bad(res, 'greenThreshold должен быть числом 0..100');
      config.greenThreshold = greenThreshold;
    }
    if (yellowThreshold !== undefined) {
      if (!Number.isFinite(yellowThreshold) || yellowThreshold <= 0 || yellowThreshold > 100) return bad(res, 'yellowThreshold должен быть числом 0..100');
      config.yellowThreshold = yellowThreshold;
    }
    if (discountRate !== undefined) {
      if (!Number.isFinite(discountRate) || discountRate < 0 || discountRate >= 1) return bad(res, 'discountRate должен быть числом [0..1)');
      config.discountRate = discountRate;
    }
    if (config.yellowThreshold > config.greenThreshold) return bad(res, 'yellowThreshold не может быть больше greenThreshold');
    model.setConfig(data, config);
    saveData();
    res.json({ success: true, config });
  });

  // ── POST /refresh-sales — подтянуть продажи за 30 дней из IIKO ──
  // Суммирует counts по ВСЕМ DishName крана (мульти-маппинг). Краны без маппинга не трогаем.
  // Возвращает { updated, unmatched: [{tap,tapName,dishName}], details }.
  router.post('/refresh-sales', requireAuth, async (req, res) => {
    const taps = model.loadTaps(data);
    const hasMapped = taps.some((t) => model.tapIikoNames(t).length > 0);
    if (!hasMapped) {
      return res.json({ success: true, updated: 0, message: 'Нет кранов с маппингом iikoProductId' });
    }
    try {
      // Окно 30 дней (UTC+3) — как в getMarginData.
      const nowMs = Date.now() + 3 * 3_600_000;
      const to = new Date(nowMs).toISOString().slice(0, 10);
      const from = new Date(nowMs - 30 * 86_400_000).toISOString().slice(0, 10);
      const { counts } = await iiko.getDishSalesCounts(from, to);

      let updated = 0;
      const unmatched = [];  // [{tap, tapName, dishName}] — имена, не найденные в counts
      const details = [];
      for (const t of taps) {
        const names = model.tapIikoNames(t);
        if (names.length === 0) continue;
        // Суммируем продажи по всем именам крана.
        let total = 0;
        const tapUnmatched = [];
        for (const dishName of names) {
          if (counts[dishName] != null) {
            total += counts[dishName];
          } else {
            tapUnmatched.push(dishName);
          }
        }
        // iiko DishAmountInt = объём в базовых единицах 0,25 л (не порции 0,5).
        // Порции 0,5 = total × 0,5 — универсально для любого объёма (0,25/0,33/0,5/1/1,5),
        // абонемент 1,5 л автоматически = 3 порции по 0,5.
        const portions05 = Math.round(total * 0.5);
        t.salesPerMonth = portions05;
        updated++;
        details.push({ id: t.id, name: t.name, salesPerMonth: portions05, rawUnits025: total, unmatched: tapUnmatched });
        for (const dishName of tapUnmatched) {
          unmatched.push({ tap: t.id, tapName: t.name, dishName });
        }
      }
      if (updated > 0) { model.setTaps(data, taps); saveData(); }
      res.json({ success: true, updated, from, to, details, unmatched });
    } catch (err) {
      console.error('[taps/refresh-sales]', err.message);
      res.status(err.status || 500).json({ error: err.message });
    }
  });

  // ── POST / — создать кран ──
  router.post('/', requireAuth, (req, res) => {
    const err = validateTap(req.body, 'create');
    if (err) return bad(res, err);
    const b = req.body;
    const taps = model.loadTaps(data);
    const maxPos = taps.reduce((m, t) => Math.max(m, Number(t.position) || 0), 0);
    const id = `t${maxPos + 1}_${Math.random().toString(36).slice(2, 8)}`;
    const tap = {
      id,
      position: b.position != null ? b.position : maxPos + 1,
      name: b.name.trim(),
      ownership: b.ownership,
      price: b.price,
      cost: b.cost,
      discountApplies: b.discountApplies != null ? b.discountApplies : true,
      salesPerMonth: b.salesPerMonth != null ? b.salesPerMonth : null,
      iikoProductId: normalizeIikoId(b.iikoProductId),
      isAnchor: b.isAnchor != null ? b.isAnchor : false,
      isStrategicHold: b.isStrategicHold != null ? b.isStrategicHold : false,
      newPrice: b.newPrice != null ? b.newPrice : null,
    };
    taps.push(tap);
    model.setTaps(data, taps);
    saveData();
    res.json({ success: true, tap: computeTap(tap, model.loadConfig(data)) });
  });

  // ── PUT /:id — обновить кран ──
  router.put('/:id', requireAuth, (req, res) => {
    const err = validateTap(req.body, 'update');
    if (err) return bad(res, err);
    const taps = model.loadTaps(data);
    const tap = taps.find((t) => t.id === req.params.id);
    if (!tap) return res.status(404).json({ error: 'Кран не найден' });
    const b = req.body || {};
    const fields = ['position', 'ownership', 'price', 'cost', 'discountApplies', 'salesPerMonth', 'isAnchor', 'isStrategicHold', 'newPrice'];
    for (const f of fields) if (b[f] !== undefined) tap[f] = b[f];
    if (b.iikoProductId !== undefined) tap.iikoProductId = normalizeIikoId(b.iikoProductId);
    if (b.name !== undefined) tap.name = b.name.trim();
    model.setTaps(data, taps);
    saveData();
    res.json({ success: true, tap: computeTap(tap, model.loadConfig(data)) });
  });

  // ── DELETE /:id — удалить кран ──
  router.delete('/:id', requireAuth, (req, res) => {
    const taps = model.loadTaps(data);
    const idx = taps.findIndex((t) => t.id === req.params.id);
    if (idx === -1) return res.status(404).json({ error: 'Кран не найден' });
    const [removed] = taps.splice(idx, 1);
    model.setTaps(data, taps);
    saveData();
    res.json({ success: true, removed: removed.id });
  });

  return router;
};
