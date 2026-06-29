#!/usr/bin/env node
// taps.test.js — тесты кокпита кранов:
//   • computeTap: факт-цена со скидкой, маржа %/руб, маржа/мес, симулятор Δ/год;
//   • рекомендации/бейджи по порогам + модификаторы (якорь, own/external, стратхолд);
//   • модель: ensureTapModel сеет config идемпотентно, сид 21 крана корректен.
// Запуск: node tests/taps.test.js
'use strict';
const assert = require('assert');
const { computeTap } = require('../src/taps/compute');
const model = require('../src/taps/model');

const cfg = { greenThreshold: 70, yellowThreshold: 60, discountRate: 0.055 };
let passed = 0;
const ok = (name) => { passed++; console.log(`  ✓ ${name}`); };

// ── computeTap: базовый расчёт со скидкой ──
{
  const r = computeTap({ name: 'a', ownership: 'own', price: 430, cost: 110, discountApplies: true, salesPerMonth: 1393, isAnchor: true, isStrategicHold: false, newPrice: null }, cfg);
  assert.strictEqual(r.factPrice, 406, 'factPrice = round(430*0.945)');
  assert.strictEqual(r.marginFactRub, 296, 'marginFactRub = 406-110');
  assert.ok(Math.abs(r.marginFactPct - 72.906) < 0.01, 'marginFactPct ~72.9');
  assert.strictEqual(r.marginPerMonth, 296 * 1393, 'marginPerMonth = rub * sales');
  assert.strictEqual(r.badge, '🟢', 'badge зелёный >=70');
  assert.ok(r.recommendation.includes('якорь'), 'модификатор якоря');
  ok('computeTap: скидка + маржа + якорь');
}

// ── computeTap: без скидки, salesPerMonth=null ──
{
  const r = computeTap({ name: 'b', ownership: 'external', price: 990, cost: 385, discountApplies: false, salesPerMonth: null, newPrice: null }, cfg);
  assert.strictEqual(r.factPrice, 990, 'без скидки factPrice = price');
  assert.strictEqual(r.marginPerMonth, null, 'sales=null → marginPerMonth=null');
  assert.strictEqual(r.deltaYear, 0, 'нет newPrice → deltaYear=0');
  ok('computeTap: без скидки + sales=null');
}

// ── computeTap: симулятор Δ/год ──
{
  const r = computeTap({ name: 'c', ownership: 'own', price: 430, cost: 110, discountApplies: true, salesPerMonth: 1393, newPrice: 450 }, cfg);
  // newFact = round(450*0.945)=425; Δруб=(425-110)-(406-110)=19; *1393*12
  assert.strictEqual(r.newFactPrice, 425, 'newFactPrice');
  assert.strictEqual(r.deltaYear, 19 * 1393 * 12, 'deltaYear');
  ok('computeTap: симулятор новой цены');
}

// ── рекомендации по порогам ──
{
  const yellow = computeTap({ name: 'y', ownership: 'external', price: 650, cost: 240, discountApplies: false, salesPerMonth: 100, newPrice: null }, cfg);
  // (650-240)/650 = 63.1% → жёлтый
  assert.strictEqual(yellow.badge, '🟡');
  assert.ok(yellow.recommendation.includes('тихо поднять'), 'жёлтая рекомендация');

  const red = computeTap({ name: 'r', ownership: 'external', price: 990, cost: 600, discountApplies: false, salesPerMonth: 50, newPrice: null }, cfg);
  // (990-600)/990 = 39.4% → красный + external
  assert.strictEqual(red.badge, '🔴');
  assert.ok(red.recommendation.includes('ретробонус'), 'external-хвост');

  const hold = computeTap({ name: 'h', ownership: 'own', price: 990, cost: 600, discountApplies: false, salesPerMonth: 50, isStrategicHold: true, newPrice: null }, cfg);
  assert.strictEqual(hold.recommendation, 'Стратегический холд — маржа ниже нормы осознанно', 'стратхолд заменяет нудж');
  ok('computeTap: рекомендации жёлтый/красный/стратхолд');
}

// ── модель: ensureTapModel идемпотентна, сид 21 крана ──
{
  const data = { kv: {} };
  model.ensureTapModel(data, null);
  assert.deepStrictEqual(JSON.parse(data.kv['tap_config:v1']), model.DEFAULT_CONFIG, 'config засеян');
  const snap = data.kv['tap_config:v1'];
  model.ensureTapModel(data, null);
  assert.strictEqual(data.kv['tap_config:v1'], snap, 'повторный вызов не меняет config');

  const seed = model.buildSeedTaps();
  assert.strictEqual(seed.length, 21, '21 кран');
  assert.ok(seed.every((t) => t.id && t.iikoProductId === null && t.isStrategicHold === false && t.newPrice === null), 'дефолтные поля сида');
  assert.strictEqual(seed.filter((t) => t.isAnchor).length, 2, 'два якоря');
  assert.strictEqual(seed.filter((t) => !t.discountApplies).length, 1, 'один без скидки (Барб Руби)');
  ok('модель: ensureTapModel + сид 21 крана');
}

console.log(`\n✅ taps.test.js: ${passed} групп пройдено`);
