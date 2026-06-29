'use strict';
// Квест-система (геймификация): дефолтные пул квестов и список наград,
// идемпотентная инициализация + чистые помощники (XP-леджер, стрики, ISO-неделя).
//
// ХРАНЕНИЕ (принцип проекта — см. CLAUDE.md): ВСЕ данные живут в data.kv,
// который синкается в PostgreSQL (primary store). Никаких top-level полей data.* —
// иначе данные были бы только в файле и умирали бы при редеплое без volume.
// Версионные ключи: quests:v1 / rewards:v1 / xp_ledger:v1 / streaks:v1 / reward_log:v1.
//
// ВАЖНО: bartenderId во всей системе — это имя сотрудника (ключ profiles:v1).

const KEYS = {
  quests:     'quests:v1',
  rewards:    'rewards:v1',
  xp_ledger:  'xp_ledger:v1',
  streaks:    'streaks:v1',
  reward_log: 'reward_log:v1',
};

const DEFAULT_POOL = [
  { id: 'q1', name: 'Золотая смена',        condition_type: 'revenue_pct_plan',        threshold: 100, xp: 500, active: true },
  { id: 'q2', name: 'Серебряная смена',     condition_type: 'revenue_pct_plan',        threshold: 90,  xp: 250, active: true },
  { id: 'q3', name: 'Народная смена',       condition_type: 'guests_pct_slot_avg',     threshold: 110, xp: 350, active: true },
  { id: 'q4', name: 'Бутылочный охотник',   condition_type: 'bottle_beer_pct_revenue', threshold: 20,  xp: 200, active: true },
  { id: 'q5', name: 'Абонементщик',         condition_type: 'subscriptions_sold',      threshold: 3,   xp: 200, active: true },
];

const DEFAULT_REWARDS = [
  { id: 'r1', type: 'cash', name: '+500 ₽ к выплате',     xp_cost: 800,  active: true },
  { id: 'r2', type: 'cash', name: '+1500 ₽ к выплате',    xp_cost: 2200, active: true },
  { id: 'r3', type: 'cash', name: '+3000 ₽ к выплате',    xp_cost: 4500, active: true },
  { id: 'r4', type: 'gift', name: 'Steam игра до 500 ₽',  xp_cost: 700,  active: true },
  { id: 'r5', type: 'gift', name: 'Steam игра до 1500 ₽', xp_cost: 2000, active: true },
  { id: 'r6', type: 'gift', name: 'Сертификат 1000 ₽',    xp_cost: 1500, active: true },
];

const STREAK_BONUS_THRESHOLD = 5;   // стрик >= 5 дней → бонус
const STREAK_BONUS_XP        = 150; // размер бонуса

const clone = (x) => JSON.parse(JSON.stringify(x));

// ── Низкоуровневый доступ к kv (PG-backed) ──
function readKV(data, key, fallback) {
  try {
    const raw = data.kv ? data.kv[key] : undefined;
    if (raw == null) return fallback;
    return JSON.parse(raw);
  } catch { return fallback; }
}
// Пишет в kv БЕЗ saveData — роут вызывает saveData() один раз после всех мутаций
// (один debounce-флаш = атомарная запись файла + PG).
function writeKV(data, key, value) {
  if (!data.kv) data.kv = {};
  data.kv[key] = JSON.stringify(value);
}

// ── Доменные аксессоры ──
function loadQuests(data)  { return readKV(data, KEYS.quests, { pool: clone(DEFAULT_POOL), weekly_challenge: null, shift_quests: {} }); }
function setQuests(data, q) { writeKV(data, KEYS.quests, q); }

function loadRewards(data)  { return readKV(data, KEYS.rewards, clone(DEFAULT_REWARDS)); }
function setRewards(data, r) { writeKV(data, KEYS.rewards, r); }

function loadLedgers(data)  { return readKV(data, KEYS.xp_ledger, {}); }
function setLedgers(data, m) { writeKV(data, KEYS.xp_ledger, m); }

function loadStreaks(data)  { return readKV(data, KEYS.streaks, {}); }
function setStreaks(data, m) { writeKV(data, KEYS.streaks, m); }

function loadRewardLog(data)  { return readKV(data, KEYS.reward_log, []); }
function setRewardLog(data, a) { writeKV(data, KEYS.reward_log, a); }

// ── Идемпотентная инициализация + миграция legacy top-level → kv ──
function ensureQuestModel(data, saveData) {
  if (!data.kv) data.kv = {};
  let changed = false;

  // Миграция: ранняя версия складывала данные в top-level data.* (только файл).
  // Переносим в kv (PG-backed), затем удаляем top-level поле.
  for (const k of Object.keys(KEYS)) {
    if (data[k] !== undefined) {
      if (data.kv[KEYS[k]] === undefined) { writeKV(data, KEYS[k], data[k]); changed = true; }
      delete data[k];
      changed = true;
    }
  }

  // Сидирование дефолтов при первом старте.
  if (data.kv[KEYS.quests] === undefined) {
    writeKV(data, KEYS.quests, { pool: clone(DEFAULT_POOL), weekly_challenge: null, shift_quests: {} });
    changed = true;
  }
  if (data.kv[KEYS.rewards] === undefined)    { writeKV(data, KEYS.rewards, clone(DEFAULT_REWARDS)); changed = true; }
  if (data.kv[KEYS.xp_ledger] === undefined)  { writeKV(data, KEYS.xp_ledger, {}); changed = true; }
  if (data.kv[KEYS.streaks] === undefined)    { writeKV(data, KEYS.streaks, {}); changed = true; }
  if (data.kv[KEYS.reward_log] === undefined) { writeKV(data, KEYS.reward_log, []); changed = true; }

  if (changed && typeof saveData === 'function') saveData();
  return data;
}

// ── XP-леджер (операции над map, который грузится/пишется через kv) ──
function ensureLedger(ledgers, id) {
  if (!ledgers[id]) ledgers[id] = { total: 0, spent: 0, per_shift_history: [], per_shift_avg: 0 };
  return ledgers[id];
}

// Доступно к трате = total - spent, но не ниже нуля.
function availableXp(ledger) {
  return Math.max(0, (ledger.total || 0) - (ledger.spent || 0));
}

// Среднее XP на смену = всего заработано / число уникальных смен (shiftId).
function recomputeAvg(ledger) {
  const shifts = new Set();
  for (const e of ledger.per_shift_history) if (e && e.shiftId != null) shifts.add(String(e.shiftId));
  const n = shifts.size;
  ledger.per_shift_avg = n ? Math.round((ledger.total || 0) / n) : 0;
  return ledger.per_shift_avg;
}

// ── Стрики (учитываются КАЛЕНДАРНЫЕ дни с >=1 выполненным квестом) ──
function parseDay(s) {
  if (!s || typeof s !== 'string') return null;
  const m = /^(\d{4})-(\d{2})-(\d{2})/.exec(s);
  if (!m) return null;
  return Date.UTC(+m[1], +m[2] - 1, +m[3]);
}
function dayDiff(a, b) { // b - a в днях; null если неразборчиво
  const da = parseDay(a), db = parseDay(b);
  if (da == null || db == null) return null;
  return Math.round((db - da) / 86400000);
}

function ensureStreak(streaks, id) {
  if (!streaks[id]) streaks[id] = { current: 0, best: 0, last_shift_date: null };
  return streaks[id];
}

// Обновляет стрик по дате смены.
// Возвращает { streak, advanced }: advanced=true, если это НОВЫЙ календарный день
// стрика (только тогда начисляется стрик-бонус — повторный квест в тот же день не растит стрик).
function updateStreak(streaks, id, shiftDate) {
  const s = ensureStreak(streaks, id);
  const last = s.last_shift_date;
  let advanced = false;
  if (last === shiftDate) {
    // второй выполненный квест в тот же день — стрик не растёт, бонус не дублируется
  } else {
    const gap = dayDiff(last, shiftDate);
    if (last === null || gap === null) s.current = 1;        // первый день / некорректный last
    else if (gap === 1) s.current += 1;                      // следующий календарный день
    else if (gap > 1)  s.current = 1;                        // разрыв >1 дня → стрик начинается заново
    else { /* gap <= 0: дата не позже предыдущей — игнорируем */ }
    if (last === null || gap === null || gap >= 1) { s.last_shift_date = shiftDate; advanced = true; }
  }
  if (s.current > s.best) s.best = s.current;
  return { streak: s, advanced };
}

// ── ISO-неделя (пн–вс, UTC) ──
function isoWeekBounds(now) {
  const d = new Date(Date.UTC(now.getUTCFullYear(), now.getUTCMonth(), now.getUTCDate()));
  const dow = d.getUTCDay() || 7; // вс=0 → 7
  const mondayStart = d.getTime() - (dow - 1) * 86400000;
  return [mondayStart, mondayStart + 7 * 86400000];
}
function isWithinCurrentIsoWeek(ts, now) {
  const [a, b] = isoWeekBounds(now || new Date());
  const t = typeof ts === 'number' ? ts : Date.parse(ts);
  return Number.isFinite(t) && t >= a && t < b;
}

// ── Резолв имени сотрудника из profiles:v1 (для лидерборда) ──
function getProfiles(data) {
  try {
    const p = JSON.parse((data.kv && data.kv['profiles:v1']) || '[]');
    return Array.isArray(p) ? p : [];
  } catch { return []; }
}
function resolveName(data, id) {
  const p = getProfiles(data).find(x => x && (x.name === id || x.id === id));
  return p ? p.name : id;
}

// ── Авто-назначение квестов смене: случайный выбор из активных ──
function pickActiveQuests(pool, n) {
  const bag = (pool || []).filter(q => q && q.active).slice();
  const out = [];
  while (out.length < n && bag.length) {
    const i = Math.floor(Math.random() * bag.length);
    out.push(bag.splice(i, 1)[0]);
  }
  return out;
}

module.exports = {
  KEYS,
  DEFAULT_POOL, DEFAULT_REWARDS,
  STREAK_BONUS_THRESHOLD, STREAK_BONUS_XP,
  ensureQuestModel,
  loadQuests, setQuests,
  loadRewards, setRewards,
  loadLedgers, setLedgers,
  loadStreaks, setStreaks,
  loadRewardLog, setRewardLog,
  ensureLedger, availableXp, recomputeAvg,
  updateStreak, ensureStreak, dayDiff,
  isWithinCurrentIsoWeek, isoWeekBounds,
  resolveName, getProfiles, pickActiveQuests,
};
