'use strict';
// Модель кокпита кранов (Срез 1). По образцу src/quests/model.js.
//
// ХРАНЕНИЕ (принцип проекта — см. CLAUDE.md): ВСЕ данные живут в data.kv,
// который синкается в PostgreSQL (primary store). Никаких top-level data.* —
// иначе данные жили бы только в файле и умирали при редеплое без volume.
// Версионные ключи: taps:v1 (массив кранов), tap_config:v1 (пороги/скидка).
//
// taps:v1 и tap_config:v1 сидируются дефолтами идемпотентно при старте (ensureTapModel),
// чтобы прод (PG-backed) засеялся сам при первом деплое без ручного прогона миграции
// в контейнере. scripts/migrate-taps.js оставлен для ручного/локального прогона.
// Авто-сид срабатывает ТОЛЬКО если ключа ещё нет — существующие данные не трогаются.

const KEYS = {
  taps:   'taps:v1',
  config: 'tap_config:v1',
};

const DEFAULT_CONFIG = { greenThreshold: 70, yellowThreshold: 60, discountRate: 0.055 };

// Сид 21 крана. Поля: position, name, ownership, price, cost, discountApplies,
// salesPerMonth, isAnchor. Остальное добивается при сидировании:
// iikoProductId=null, isStrategicHold=false, newPrice=null. id = `t${position}`.
const SEED_TAPS_RAW = [
  { position: 1,  name: 'Дримтим Локал Лагер',      ownership: 'own',      price: 430, cost: 110, discountApplies: true,  salesPerMonth: 1393, isAnchor: true  },
  { position: 2,  name: 'Дримтим Порт Пилснер',     ownership: 'own',      price: 430, cost: 140, discountApplies: true,  salesPerMonth: 2649, isAnchor: true  },
  { position: 3,  name: 'Дримтим Штакеншнейдер',    ownership: 'own',      price: 490, cost: 173, discountApplies: true,  salesPerMonth: 452,  isAnchor: false },
  { position: 4,  name: 'Дримтим Локдаун',          ownership: 'own',      price: 590, cost: 208, discountApplies: true,  salesPerMonth: 276,  isAnchor: false },
  { position: 5,  name: 'Дримтим Найтс Стаут',      ownership: 'own',      price: 490, cost: 150, discountApplies: true,  salesPerMonth: 178,  isAnchor: false },
  { position: 6,  name: 'Дримтим Спорт Пилснер',    ownership: 'own',      price: 450, cost: 156, discountApplies: true,  salesPerMonth: 218,  isAnchor: false },
  { position: 7,  name: 'Амбер Эль (Биттер 55)',    ownership: 'own',      price: 590, cost: 143, discountApplies: true,  salesPerMonth: 122,  isAnchor: false },
  { position: 8,  name: 'Кухельбауэр хеллес',       ownership: 'external', price: 650, cost: 172, discountApplies: true,  salesPerMonth: 249,  isAnchor: false },
  { position: 9,  name: 'Радебергер',               ownership: 'external', price: 720, cost: 218, discountApplies: true,  salesPerMonth: 195,  isAnchor: false },
  { position: 10, name: 'Бакалар Летнее',           ownership: 'external', price: 790, cost: 258, discountApplies: true,  salesPerMonth: 145,  isAnchor: false },
  { position: 11, name: 'Сидр Святой Домкрат',      ownership: 'external', price: 490, cost: 193, discountApplies: true,  salesPerMonth: 189,  isAnchor: false },
  { position: 12, name: 'Гиннесс',                  ownership: 'external', price: 990, cost: 435, discountApplies: true,  salesPerMonth: 118,  isAnchor: false },
  { position: 13, name: 'Олд Спекл Хен',            ownership: 'external', price: 890, cost: 269, discountApplies: true,  salesPerMonth: 43,   isAnchor: false },
  { position: 14, name: 'Джуси ИПА (Островица)',    ownership: 'external', price: 590, cost: 184, discountApplies: true,  salesPerMonth: 30,   isAnchor: false },
  { position: 15, name: 'Генри Вестонс (сидр)',     ownership: 'external', price: 790, cost: 275, discountApplies: true,  salesPerMonth: 34,   isAnchor: false },
  { position: 16, name: 'Барб Руби',                ownership: 'external', price: 990, cost: 385, discountApplies: false, salesPerMonth: 30,   isAnchor: false },
  { position: 17, name: 'Крик Макс',                ownership: 'external', price: 790, cost: 289, discountApplies: true,  salesPerMonth: 53,   isAnchor: false },
  { position: 18, name: 'Стинбрюгге Вит',           ownership: 'external', price: 750, cost: 227, discountApplies: true,  salesPerMonth: 60,   isAnchor: false },
  { position: 19, name: 'Палм Амбер',               ownership: 'external', price: 790, cost: 237, discountApplies: true,  salesPerMonth: 55,   isAnchor: false },
  { position: 20, name: 'Монкс Кафе',               ownership: 'external', price: 890, cost: 333, discountApplies: true,  salesPerMonth: 60,   isAnchor: false },
  { position: 21, name: 'Строуберри Липс',          ownership: 'external', price: 450, cost: 136, discountApplies: true,  salesPerMonth: 40,   isAnchor: false },
];

const clone = (x) => JSON.parse(JSON.stringify(x));

// Полный сид: добивает каждый кран недостающими полями.
function buildSeedTaps() {
  return SEED_TAPS_RAW.map((t) => ({
    id: `t${t.position}`,
    position: t.position,
    name: t.name,
    ownership: t.ownership,
    price: t.price,
    cost: t.cost,
    discountApplies: t.discountApplies,
    salesPerMonth: t.salesPerMonth,
    iikoProductId: null,
    isAnchor: t.isAnchor,
    isStrategicHold: false,
    newPrice: null,
  }));
}

// ── Низкоуровневый доступ к kv (PG-backed) ──
function readKV(data, key, fallback) {
  try {
    const raw = data.kv ? data.kv[key] : undefined;
    if (raw == null) return fallback;
    return JSON.parse(raw);
  } catch { return fallback; }
}
// Пишет в kv БЕЗ saveData — роут вызывает saveData() один раз после всех мутаций.
function writeKV(data, key, value) {
  if (!data.kv) data.kv = {};
  data.kv[key] = JSON.stringify(value);
}

// ── Доменные аксессоры ──
function loadTaps(data)   { return readKV(data, KEYS.taps, []); }
function setTaps(data, t) { writeKV(data, KEYS.taps, t); }

function loadConfig(data)   { return { ...DEFAULT_CONFIG, ...readKV(data, KEYS.config, {}) }; }
function setConfig(data, c) { writeKV(data, KEYS.config, c); }

// ── Идемпотентная инициализация ──
// Сидирует taps:v1 (21 кран) и tap_config:v1 дефолтами, но ТОЛЬКО если ключа ещё нет.
function ensureTapModel(data, saveData) {
  if (!data.kv) data.kv = {};
  let changed = false;
  if (data.kv[KEYS.config] === undefined) {
    writeKV(data, KEYS.config, clone(DEFAULT_CONFIG));
    changed = true;
  }
  if (data.kv[KEYS.taps] === undefined) {
    writeKV(data, KEYS.taps, buildSeedTaps());
    changed = true;
  }
  if (changed && typeof saveData === 'function') saveData();
  return data;
}

module.exports = {
  KEYS,
  DEFAULT_CONFIG,
  SEED_TAPS_RAW,
  buildSeedTaps,
  ensureTapModel,
  loadTaps, setTaps,
  loadConfig, setConfig,
};
