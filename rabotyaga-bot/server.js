require('dotenv').config();
const express    = require('express');
const { Telegraf } = require('telegraf');
const cors       = require('cors');
const helmet     = require('helmet');
const cookieParser = require('cookie-parser');
const rateLimit  = require('express-rate-limit');
const fs         = require('fs');
const path       = require('path');
const bcrypt     = require('bcrypt');
const crypto     = require('crypto');

const makePushApi   = require('./src/api/push');
const makePushSender = require('./src/push/sender');
const pushScheduler = require('./src/push/scheduler');
const makeAdminApi  = require('./src/api/admin');
const makeAuthApi   = require('./src/api/auth');
const makeQuestsApi  = require('./src/api/quests');
const makeRewardsApi = require('./src/api/rewards');
const makeXpApi      = require('./src/api/xp');
const { ensureQuestModel } = require('./src/quests/model');
const makeTapsApi    = require('./src/api/taps');
const { ensureTapModel } = require('./src/taps/model');
const iiko          = require('./src/api/iiko');
const adapter       = require('./db/adapter');
const { isToday }   = require('./src/shift/isToday');
const { ensurePushModel, PUSH_KEY } = require('./src/push/model');
const { syncSchedule }    = require('./src/sync/scheduleSync');
const { syncRevenuePlan } = require('./src/sync/revenueSync');
const { syncMozgDashboard } = require('./src/sync/mozgSync');
const { requireAuth, requireManager } = require('./src/middleware/auth');

// ── Конфиг ──
const PORT          = process.env.PORT     || 3001;
const DATA_FILE     = process.env.DATA_FILE     || path.join(__dirname, 'data.json');
const FRONTEND_DIST = process.env.FRONTEND_DIST || path.join(__dirname, 'frontend', 'dist');
const BCRYPT_ROUNDS = 10;

// ── KV-ключи, которые НИКОГДА не должны уходить на клиент ──
const KV_BLACKLIST = new Set(['auth:v1']);
// ── KV-ключи, опасные для prototype pollution (даже за auth) ──
const KV_FORBIDDEN = new Set(['__proto__', 'constructor', 'prototype']);
// ── SEC-4: KV-ключи, которые может записывать только менеджер/developer ──
// Барман не должен перезаписывать задачи, расписание, карточки нарушений и т.д.
const MANAGER_ONLY_KV = new Set([
  'tasks:v4', 'schedule:v1', 'cards:v1',
  'members:v1', 'events:v1', 'events:v2', 'acl:v1', 'seeds:v1',
  'month_plan:v1', // месячный план выручки — задаёт только менеджер
  'revenue:v1',   // выручка по дням — запись через KV только менеджер (икко-синк пишет напрямую)
  'hour_norms:v1', // нормы часов сотрудников — только менеджер
  'margin_items:v1',     // ручной список маржинальных позиций (fallback) — только менеджер
  'margin_data:v1',      // кэш авто-маржи из iiko — пишет только sync-роут и iiko.getMarginData
  'margin_threshold:v1', // порог маржинальности (%) — только менеджер
  'bot_chats:v1',        // зарегистрированные чаты для рассылки — только менеджер
  'bot_macros:v1',       // макросы рассылки в чаты — только менеджер
  'push_settings:v1',    // расписание + шаблоны пушей — только менеджер (legacy)
  'push:v1',             // единая модель пушей (defs + recipients) — только менеджер
  'mozg:dashboard:v1',   // сводные метрики из mozg.rest — пишет только mozgSync
  // Квест-система: XP/стрики/лог наград — ядро доверия. Через общий kv-эндпоинт
  // пишет только менеджер; сотрудники меняют XP только через /api/quests и /api/rewards (с валидацией).
  'quests:v1', 'rewards:v1', 'xp_ledger:v1', 'streaks:v1', 'reward_log:v1',
]);

const app = express();

  // ── За nginx-прокси: доверяем X-Forwarded-For (нужно для rate-limit) ──
  app.set('trust proxy', 1);

  // ── Security headers ──
  // SEC-3: CSP включён. unsafe-inline оставлен для совместимости с Vite-бандлом
  // и Telegram WebApp (они используют inline-стили). Ключевые защиты:
  // object-src 'none' — блокирует Flash/Java; base-uri 'self' — блокирует <base>-инъекцию;
  // frame-ancestors — только Telegram может встраивать приложение (защита от clickjacking).
  app.use(helmet({
  contentSecurityPolicy: {
    directives: {
      defaultSrc:      ["'self'"],
      scriptSrc:       ["'self'", "'unsafe-inline'", "https://telegram.org"],
      styleSrc:        ["'self'", "'unsafe-inline'"],
      imgSrc:          ["'self'", "data:"],
      // connectSrc: только своё происхождение — фронтенд обращается только к /api/*.
      // Широкий "https:" заменён на 'self', иначе XSS может слать данные на любой хост.
      connectSrc:      ["'self'"],
      objectSrc:       ["'none'"],
      baseUri:         ["'self'"],
      frameAncestors:  ["https://web.telegram.org", "https://t.me"],
    },
  },
  crossOriginEmbedderPolicy: false,
}));

// ── CORS: только доверенные origins ──
const ALLOWED_ORIGINS = [
  'https://rabotyaga55.ru',
  'https://bellatogen-rabotyaga-5c83.twc1.net', // Timeweb Apps preview
  'http://localhost:5173',
  'http://localhost:3001',
];
app.use(cors({
  origin(origin, cb) {
    // Разрешаем запросы без origin (curl, мобильный Telegram WebView)
    if (!origin || ALLOWED_ORIGINS.includes(origin)) return cb(null, true);
    console.warn(`[cors] blocked: ${origin}`);
    cb(null, false); // тихий отказ — не бросаем Error в лог каждый раз
  },
  credentials: true,
}));

app.use(cookieParser());
app.use(express.json({ limit: '2mb' }));

// ── Статика фронтенда ──
app.use(express.static(FRONTEND_DIST, {
  setHeaders(res, filePath) {
    if (filePath.endsWith('.html')) {
      res.setHeader('Cache-Control', 'no-cache, no-store, must-revalidate');
      res.setHeader('Pragma', 'no-cache');
      res.setHeader('Expires', '0');
    } else if (/\/assets\//.test(filePath)) {
      res.setHeader('Cache-Control', 'public, max-age=31536000, immutable');
    }
  },
}));

app.get('/admin', (req, res) => res.sendFile(path.join(__dirname, 'public', 'admin.html')));
// pushApi монтируется ниже — после создания pushSender с доступом к data

// ── Telegram Bot ──
const TOKEN    = process.env.TELEGRAM_TOKEN;
const WEBAPP_URL = process.env.WEBAPP_URL || 'https://rabotyaga55.ru';
if (!TOKEN) { console.error('❌ Не задан TELEGRAM_TOKEN в .env'); process.exit(1); }
const bot = new Telegraf(TOKEN);

// ── In-memory хранилище ──
let data = { kv: {}, bindings: {}, pushSettings: {}, adminUsers: [] };
if (fs.existsSync(DATA_FILE)) {
  try {
    const loaded = JSON.parse(fs.readFileSync(DATA_FILE, 'utf8'));
    data.kv           = loaded.kv           || {};
    data.bindings      = loaded.bindings      || {};
    data.pushSettings  = loaded.pushSettings  || {};
    data.adminUsers    = loaded.adminUsers    || [];
    // Квест-данные хранятся в data.kv (PG-backed) — грузятся вместе с kv выше.
    // legacy top-level поля (если были в старом файле) подхватит ensureQuestModel().
    if (loaded.quests     !== undefined) data.quests     = loaded.quests;
    if (loaded.rewards    !== undefined) data.rewards    = loaded.rewards;
    if (loaded.xp_ledger  !== undefined) data.xp_ledger  = loaded.xp_ledger;
    if (loaded.streaks    !== undefined) data.streaks    = loaded.streaks;
    if (loaded.reward_log !== undefined) data.reward_log = loaded.reward_log;
    console.log(`📂 Загружено ${Object.keys(data.kv).length} kv-ключей, ${Object.keys(data.bindings).length} привязок`);
  } catch (e) { console.error('Ошибка чтения data.json:', e); }
}

let saveTimer = null;
// Инстанс sender создаётся здесь: data уже объявлен, saveData объявляется ниже через hoisting
let pushSender; // будет инициализирован сразу после saveData

// ── Состояние PostgreSQL (primary store; data.json — fallback-резерв) ──
let PG_OK = false;            // доступна ли БД для записи
let pgRetryTimer = null;      // таймер ретрая при недоступном PG
let flushChain = Promise.resolve(); // сериализация PG-флашей (одна транзакция за раз)
let flushPending = false;     // coalescing: не ставить новый flush, пока один в очереди
// Снимок того, что уже записано в PG — чтобы писать только изменённое.
// pushSettings хранится в PG отдельным ключом 'pushSettings:v1' (не внутри kv).
let lastFlushed = { kv: {}, bindings: {}, bindingsJSON: '', pushSettingsJSON: '' };

function saveData() {
  clearTimeout(saveTimer);
  saveTimer = setTimeout(() => {
    // 1. Файловый flush — всегда (disaster-recovery резерв)
    try { fs.writeFileSync(DATA_FILE, JSON.stringify(data, null, 2)); }
    catch (e) { console.error('Ошибка записи data.json:', e); }
    // 2. PG-flush — сериализованно + coalescing, только если БД доступна.
    // flushPending сбрасывается в начале задачи (до flushToPG), поэтому записи,
    // пришедшие во время самого flush, поставят следующий — ничего не теряется.
    if (PG_OK && !flushPending) {
      flushPending = true;
      flushChain = flushChain
        .then(() => { flushPending = false; return flushToPG(); })
        .catch(e => { flushPending = false; console.error('[pg] flush error:', e.message); });
    }
  }, 300);
}

// Записать в PG только изменённые/удалённые ключи (dirty-tracking по снимку lastFlushed).
async function flushToPG() {
  // kv: изменённые
  for (const [key, value] of Object.entries(data.kv)) {
    if (lastFlushed.kv[key] !== value) {
      await adapter.kvSet(key, value);
      lastFlushed.kv[key] = value;
    }
  }
  // kv: удалённые (есть в снимке, нет в data)
  for (const key of Object.keys(lastFlushed.kv)) {
    if (!(key in data.kv)) {
      await adapter.kvDelete(key);
      delete lastFlushed.kv[key];
    }
  }
  // pushSettings → отдельный ключ pushSettings:v1
  const psJSON = JSON.stringify(data.pushSettings || {});
  if (psJSON !== lastFlushed.pushSettingsJSON) {
    await adapter.kvSet('pushSettings:v1', psJSON);
    lastFlushed.pushSettingsJSON = psJSON;
  }
  // bindings: дельта (upsert изменённых + деактивация удалённых)
  const curBind = data.bindings || {};
  const bJSON = JSON.stringify(curBind);
  if (bJSON !== lastFlushed.bindingsJSON) {
    for (const [name, tgId] of Object.entries(curBind)) {
      if (lastFlushed.bindings[name] !== tgId) await adapter.bindEmployee(name, tgId);
    }
    for (const name of Object.keys(lastFlushed.bindings)) {
      if (!(name in curBind)) await adapter.unbindEmployee(name);
    }
    lastFlushed.bindings = { ...curBind };
    lastFlushed.bindingsJSON = bJSON;
  }
}

// Перечитать снимок из текущего data (после hydrate, когда PG = источник истины).
function captureSnapshot() {
  lastFlushed.kv = { ...data.kv };
  lastFlushed.bindings = { ...(data.bindings || {}) };
  lastFlushed.bindingsJSON = JSON.stringify(data.bindings || {});
  lastFlushed.pushSettingsJSON = JSON.stringify(data.pushSettings || {});
}

// PG-first загрузка при старте. Возвращает управление синхронно для остального кода;
// до завершения PG_OK=false → saveData пишет только файл (без затирания пустого PG).
async function hydrateFromPG() {
  try {
    const kvAll = await adapter.kvGetAll();        // бросит, если PG недоступен
    const bindings = await adapter.getBindings();
    PG_OK = true;

    const keys = Object.keys(kvAll);
    if (keys.length > 0) {
      // PG непуст → primary, перезаписываем горячий кеш данными из БД
      const { 'pushSettings:v1': psRaw, ...kvRest } = kvAll;
      data.kv = kvRest;
      data.bindings = bindings;
      if (psRaw) { try { data.pushSettings = JSON.parse(psRaw); } catch { /* keep */ } }
      captureSnapshot();
      console.log(`📂 Загружено ${Object.keys(data.kv).length} kv-ключей из PostgreSQL, ${Object.keys(bindings).length} привязок`);
    } else {
      // PG доступен, но пуст → авто-миграция: оставляем файловые данные,
      // снимок пустой → ближайший flush «прогреет» БД целиком.
      lastFlushed = { kv: {}, bindings: {}, bindingsJSON: '', pushSettingsJSON: '' };
      console.log('📂 PostgreSQL пуст — выполняю авто-миграцию из data.json при первом сохранении');
      saveData();
    }
  } catch (e) {
    PG_OK = false;
    console.warn(`⚠️  PostgreSQL недоступен (${e.message}) — работаю на data.json, повторю подключение`);
    schedulePGRetry();
  }
}

// Периодическая проба восстановления соединения с PG.
function schedulePGRetry() {
  if (pgRetryTimer) return;
  pgRetryTimer = setInterval(async () => {
    // (таймер не держит event loop — см. .unref() ниже)
    try {
      const kvAll = await adapter.kvGetAll();
      clearInterval(pgRetryTimer); pgRetryTimer = null;
      // Память (работала на файле во время простоя) — источник истины.
      // Кладём СНИМОК текущего PG в lastFlushed.kv, чтобы ближайший flush привёл
      // БД к состоянию памяти: изменённые перезапишутся, а осиротевшие ключи
      // (удалённые в памяти за время простоя) корректно удалятся через kvDelete.
      // Пустой снимок не дал бы цикл удалений — ключи воскресали бы (фикс C1).
      const { 'pushSettings:v1': _ps, ...kvRest } = kvAll;
      lastFlushed.kv = kvRest;
      // bindings/pushSettings прогреваем целиком (upsert идемпотентен).
      lastFlushed.bindings = {}; lastFlushed.bindingsJSON = ''; lastFlushed.pushSettingsJSON = '';
      PG_OK = true;
      console.log(`[pg] соединение восстановлено (${Object.keys(kvAll).length} ключей в БД) — синхронизирую БД с памятью`);
      saveData();
    } catch { /* ещё недоступна — ждём следующего тика */ }
  }, 15000);
  pgRetryTimer.unref(); // не блокировать выход процесса
}

// ── Авто-миграция plaintext паролей → bcrypt ──
// Вызывается ПОСЛЕ hydrateFromPG (в bootstrap), чтобы хешировать актуальный
// auth:v1 из БД, а не файловый снимок — иначе гонка за ключ при PG-загрузке.
async function migrateAuthPasswords() {
  try {
    const auth = JSON.parse(data.kv['auth:v1'] || '{}');
    let migrated = 0;
    for (const [account, pwd] of Object.entries(auth)) {
      if (typeof pwd === 'string' && !pwd.startsWith('$2b$') && !pwd.startsWith('$2a$')) {
        auth[account] = await bcrypt.hash(pwd, BCRYPT_ROUNDS);
        migrated++;
      }
    }
    if (migrated > 0) {
      data.kv['auth:v1'] = JSON.stringify(auth);
      saveData();
      console.log(`[auth] мигрировано паролей plaintext→bcrypt: ${migrated}`);
    }
  } catch (e) { console.error('[auth] ошибка миграции паролей:', e.message); }
}

// Инициализируем sender и push API (data + saveData уже готовы)
// adapter — для дублирования пуш-логов в таблицу push_log
pushSender = makePushSender(data, saveData, adapter);
app.use('/api/push', makePushApi(pushSender, data, saveData, bot));

// ── Монтируем роутеры (требующие data) ──
app.use('/api/auth',  makeAuthApi(data, saveData));
app.use('/api/admin', requireManager, makeAdminApi(data, saveData));

// ── Квест-система (геймификация): инициализация модели + роутеры ──
// ensureQuestModel идемпотентен: засевает пул/награды при первом старте,
// не затирая существующие данные. Авторизация — внутри роутеров (requireAuth/requireManager).
ensureQuestModel(data, saveData);
app.use('/api/quests',  makeQuestsApi(data, saveData));
app.use('/api/rewards', makeRewardsApi(data, saveData));
app.use('/api/xp',      makeXpApi(data, saveData));

// —— Кокпит кранов: инициализация конфига (идемпотентно) + роутер ——
// taps:v1 сидируется миграцией (scripts/migrate-taps.js), здесь только tap_config:v1.
// Авторизация — внутри роутера (requireAuth; шеф-бармен имеет запись).
ensureTapModel(data, saveData);
app.use('/api/taps',    makeTapsApi(data, saveData));

// ── Синхронизация расписания — только авторизованные ──
app.get('/api/sync/schedule/status', requireAuth, (req, res) => {
  try {
    const status = JSON.parse(data.kv['sync:schedule:status'] || 'null');
    res.json(status || { lastRun: null, daysUpdated: 0, error: null });
  } catch { res.json({ lastRun: null, daysUpdated: 0, error: null }); }
});

app.post('/api/sync/schedule', requireManager, async (req, res) => {
  try {
    const result = await syncSchedule(data, saveData);
    res.json(result);
  } catch (err) {
    console.error('[sync/schedule]', err.message);
    const errStatus = { lastRun: new Date().toISOString(), daysUpdated: 0, error: err.message };
    data.kv['sync:schedule:status'] = JSON.stringify(errStatus);
    saveData();
    res.status(500).json(errStatus);
  }
});

// Авто-синхронизация раз в 12 часов: расписание + план выручки из Google Sheets
// Стартовый sync: задержка 10с после старта
setTimeout(() => {
  syncSchedule(data, saveData).catch(e => console.error('[scheduleSync] startup error:', e.message));
  syncRevenuePlan(data, saveData).catch(e => console.error('[revenueSync] startup error:', e.message));
  setInterval(() => {
    syncSchedule(data, saveData).catch(e => console.error('[scheduleSync] interval error:', e.message));
    syncRevenuePlan(data, saveData).catch(e => console.error('[revenueSync] interval error:', e.message));
  }, 12 * 60 * 60 * 1000);
}, 10000);

// Авто-синхронизация из mozg.rest каждые 2 часа (если заданы MOZG_LOGIN/PASSWORD)
// После каждого mozgSync сравниваем факт Мозга с суммой iiko (revenue:v1).
// Расхождение ≥5% → принудительный re-sync iiko (Мозг как эталон).
function mozgSyncWithDriftCheck() {
  return syncMozgDashboard(data, saveData).then(r => {
    const fmtN = n => n?.toLocaleString('ru-RU');
    console.log(`[mozg/auto] факт ${fmtN(r.fact)}₽, план ${fmtN(r.plan)}₽`);

    if (!r.fact || !process.env.IIKO_URL) return r;

    // Суммируем iiko-факт за текущий месяц из revenue:v1
    const ym = r.ym; // 'YYYY-MM'
    let rev = {};
    try { rev = JSON.parse(data.kv['revenue:v1'] || '{}'); } catch { return r; }
    const iikoFact = Object.entries(rev)
      .filter(([d]) => d.startsWith(ym))
      .reduce((s, [, v]) => s + (Number(v?.fact) || 0), 0);

    if (iikoFact === 0) return r;

    const drift = Math.abs(r.fact - iikoFact) / r.fact;
    if (drift >= 0.05) {
      console.log(`[mozg/auto] расхождение ${Math.round(drift * 100)}% (мозг ${fmtN(r.fact)}₽ vs iiko ${fmtN(iikoFact)}₽) → re-sync iiko`);
      iiko.syncRevenue(data, saveData)
        .then(res => console.log(`[mozg/auto] iiko re-sync: обновлено ${res.updated} дней`))
        .catch(e => console.error('[mozg/auto] iiko re-sync error:', e.message));
    } else {
      console.log(`[mozg/auto] расхождение ${Math.round(drift * 100)}% — норма`);
    }
    return r;
  });
}

setTimeout(() => {
  if (process.env.MOZG_LOGIN && process.env.MOZG_PASSWORD) {
    mozgSyncWithDriftCheck().catch(e => console.error('[mozg/auto] startup error:', e.message));
    setInterval(() => {
      mozgSyncWithDriftCheck().catch(e => console.error('[mozg/auto] interval error:', e.message));
    }, 2 * 60 * 60 * 1000);
  }
}, 20000);

// Авто-синхронизация ФАКТА выручки из iiko каждые 2 часа
// Стартовый sync: задержка 30с (после auth и планового sync)
setTimeout(() => {
  if (process.env.IIKO_URL && process.env.IIKO_LOGIN) {
    iiko.syncRevenue(data, saveData)
      .then(r => console.log(`[iiko/auto] старт: обновлено ${r.updated} дней`))
      .catch(e => console.error('[iiko/auto] startup error:', e.message));
    setInterval(() => {
      iiko.syncRevenue(data, saveData)
        .then(r => console.log(`[iiko/auto] интервал: обновлено ${r.updated} дней`))
        .catch(e => console.error('[iiko/auto] interval error:', e.message));
    }, 2 * 60 * 60 * 1000);
  }
}, 30000);

// ── mozg.rest — статус и ручной запуск ──
app.get('/api/sync/mozg/status', requireAuth, (req, res) => {
  try {
    const status = JSON.parse(data.kv['sync:mozg:status'] || 'null');
    res.json(status || { lastRun: null, error: null });
  } catch { res.json({ lastRun: null, error: null }); }
});

app.post('/api/sync/mozg', requireManager, async (req, res) => {
  try {
    const result = await syncMozgDashboard(data, saveData);
    res.json(result);
  } catch (err) {
    console.error('[sync/mozg]', err.message);
    const errStatus = { lastRun: new Date().toISOString(), error: err.message };
    data.kv['sync:mozg:status'] = JSON.stringify(errStatus);
    saveData();
    res.status(500).json(errStatus);
  }
});

// ── iiko — только авторизованные ──
app.post('/api/iiko/revenue/sync', requireAuth, async (req, res) => {
  try {
    const result = await iiko.syncRevenue(data, saveData);
    res.json(result);
  } catch (err) {
    console.error('[iiko/revenue/sync]', err.message);
    res.status(err.status || 500).json({ error: err.message });
  }
});

// Анализ корзины: пары блюд (кэш 20 ч)
app.get('/api/iiko/basket', requireAuth, async (req, res) => {
  // force=1 — сбросить кэш и пересчитать
  if (req.query.force === '1') delete data.kv['basket:pairs:v4'];
  try {
    const result = await iiko.getBasketPairs(data, saveData);
    res.json(result);
  } catch (err) {
    console.error('[iiko/basket]', err.message);
    res.status(err.status || 500).json({ error: err.message });
  }
});

app.get('/api/iiko/revenue/:date', requireAuth, async (req, res) => {
  const { date } = req.params;
  if (!/^\d{4}-\d{2}-\d{2}$/.test(date)) return res.status(400).json({ error: 'Неверный формат даты (YYYY-MM-DD)' });
  try {
    const result = await iiko.getDayRevenue(date, data, saveData);
    res.json(result);
  } catch (err) {
    res.status(err.status || 500).json({ error: err.message });
  }
});

// ── iiko: анализ маржинальности за 30 дней (requireManager — запись в KV чувствительна) ──
app.get('/api/iiko/margin-data', requireAuth, async (req, res) => {
  if (req.query.force === '1') delete data.kv['margin_data:v1'];
  try {
    const result = await iiko.getMarginData(data, saveData);
    res.json(result);
  } catch (err) {
    console.error('[iiko/margin-data]', err.message);
    res.status(err.status || 500).json({ error: err.message });
  }
});

// ── iiko: ABC-анализ продаж за сегодня ──
app.get('/api/iiko/sales-abc', requireAuth, async (req, res) => {
  if (req.query.force === '1') delete data.kv['sales_abc:v2'];
  try {
    const result = await iiko.getSalesABC(data, saveData);
    res.json(result);
  } catch (err) {
    console.error('[iiko/sales-abc]', err.message);
    res.status(err.status || 500).json({ error: err.message });
  }
});

// ── iiko: диагностика категорий блюд (менеджер-онли) ──
// Показывает реальные DishCategory из iiko за 14 дней — для отладки классификации сэтов.
app.get('/api/iiko/dish-categories', requireManager, async (req, res) => {
  if (req.query.force === '1') delete data.kv['dish_cats:v1'];
  try {
    const result = await iiko.getDishCategories(data, saveData);
    res.json(result);
  } catch (err) {
    console.error('[iiko/dish-categories]', err.message);
    res.status(err.status || 500).json({ error: err.message });
  }
});

// ── KV: GET — защита чёрного списка ──
app.get('/api/kv/:key', requireAuth, (req, res) => {
  const key = req.params.key;
  if (KV_BLACKLIST.has(key) || KV_FORBIDDEN.has(key)) {
    return res.status(403).json({ error: 'Этот ключ защищён' });
  }
  res.json({ value: data.kv[key] ?? null });
});

// ── KV: PUT — защита чёрного списка + только авторизованные ──
app.put('/api/kv/:key', requireAuth, (req, res) => {
  const key = req.params.key;
  if (KV_BLACKLIST.has(key) || KV_FORBIDDEN.has(key)) {
    return res.status(403).json({ error: 'Запись в этот ключ запрещена' });
  }
  // SEC-4: Чувствительные ключи — только менеджер/developer
  if (MANAGER_ONLY_KV.has(key) && req.account !== 'manager' && req.account !== 'developer') {
    return res.status(403).json({ error: 'Нет прав — только менеджер может изменять этот ключ' });
  }
  data.kv[key] = req.body.value;
  saveData();
  res.json({ ok: true });
});

// ── Health (открытый — нужен для пинга с фронта) ──
app.get('/api/health', (req, res) => res.json({ ok: true, ts: Date.now(), pg: PG_OK }));

// ── Bind: привязка Telegram — только авторизованные ──
app.post('/api/bind', requireAuth, (req, res) => {
  const { name, telegramId } = req.body;
  if (!name || !telegramId) return res.status(400).json({ error: 'name и telegramId обязательны' });
  data.bindings[name] = telegramId;
  saveData();
  console.log(`✅ Привязан: ${name} -> ID ${telegramId}`);
  bot.telegram.sendMessage(telegramId, `👋 Привет, ${name}! Ты подключён к «Работяге».`).catch(err => console.error('Ошибка отправки:', err));
  res.json({ success: true });
});

app.delete('/api/bind/:name', requireManager, (req, res) => {
  const { name } = req.params;
  if (data.bindings[name]) {
    delete data.bindings[name];
    saveData();
    return res.json({ success: true });
  }
  res.status(404).json({ error: 'Сотрудник не найден' });
});

app.get('/api/bindings', requireManager, (req, res) => {
  res.json({ success: true, bindings: data.bindings });
});

// ── Test push — только manager ──
app.get('/api/push/test/:name', requireManager, async (req, res) => {
  const name = req.params.name;
  const userId = data.bindings[name];
  if (!userId) return res.json({ success: false, msg: 'Пользователь не найден' });
  const ok = await pushSender.sendPush(bot, String(userId), '🔔 Тестовое уведомление! 🍻', 'test');
  res.json(ok ? { success: true, msg: 'Пуш отправлен' } : { success: false, msg: 'Пуши отключены' });
});

// ── Пуш «Смена закрыта» — триггер с фронта когда все задачи выполнены + после 23:30 ──
// Шлёт подтверждение ТОЛЬКО менеджерам у которых есть привязка Telegram.
// Дедуп обеспечивается на фронте через closeNotified[ds] (вызывается один раз за день).
app.post('/api/push/shift-closed', requireAuth, async (req, res) => {
  const { date, done, total, revenueFact, revenuePlan, workers } = req.body || {};
  if (!date || !/^\d{4}-\d{2}-\d{2}$/.test(date)) {
    return res.status(400).json({ error: 'Поле date обязательно (YYYY-MM-DD)' });
  }
  try {
    const result = await pushSender.sendShiftClosedToManagers(bot, {
      dateStr: date,
      done:        Number(done)  || 0,
      total:       Number(total) || 0,
      revenueFact: revenueFact  ?? null,
      revenuePlan: revenuePlan  ?? null,
      workers:     Array.isArray(workers) ? workers : [],
    });
    res.json({ ok: true, ...result });
  } catch (err) {
    console.error('[push/shift-closed]', err.message);
    res.status(500).json({ error: err.message });
  }
});

// ── Бот-чаты и макросы рассылки (только менеджер) ──
// Хранятся в KV (bot_chats:v1 / bot_macros:v1), но доступны через выделенные
// роуты с генерацией id и валидацией. Планировщик читает bot_macros:v1 напрямую.
const genId = () => (crypto.randomUUID ? crypto.randomUUID() : Date.now().toString(36) + Math.random().toString(36).slice(2));
function loadKvArr(key) { try { const v = JSON.parse(data.kv[key] || '[]'); return Array.isArray(v) ? v : []; } catch { return []; } }
function saveKvArr(key, arr) { data.kv[key] = JSON.stringify(arr); saveData(); }

// Чаты
app.get('/api/bot-chats', requireManager, (req, res) => {
  res.json({ chats: loadKvArr('bot_chats:v1') });
});
app.post('/api/bot-chats', requireManager, (req, res) => {
  const { name, chatId } = req.body || {};
  if (!name || !chatId) return res.status(400).json({ error: 'name и chatId обязательны' });
  const chats = loadKvArr('bot_chats:v1');
  const chat = { id: genId(), name: String(name).trim(), chatId: String(chatId).trim(), addedAt: new Date().toISOString() };
  chats.push(chat);
  saveKvArr('bot_chats:v1', chats);
  res.json({ ok: true, chat });
});
app.delete('/api/bot-chats/:id', requireManager, (req, res) => {
  const chats = loadKvArr('bot_chats:v1');
  const next = chats.filter(c => c.id !== req.params.id);
  if (next.length === chats.length) return res.status(404).json({ error: 'Чат не найден' });
  saveKvArr('bot_chats:v1', next);
  res.json({ ok: true });
});

// Макросы
app.get('/api/bot-macros', requireManager, (req, res) => {
  res.json({ macros: loadKvArr('bot_macros:v1') });
});
app.post('/api/bot-macros', requireManager, (req, res) => {
  const { name, chatId, template, schedule } = req.body || {};
  if (!name || !chatId || !template) return res.status(400).json({ error: 'name, chatId и template обязательны' });
  if (!schedule || typeof schedule !== 'object' || !schedule.type || !schedule.time)
    return res.status(400).json({ error: 'schedule.type и schedule.time обязательны' });
  const macros = loadKvArr('bot_macros:v1');
  const macro = {
    id: genId(),
    name: String(name).trim(),
    chatId: String(chatId).trim(),
    template: String(template),
    schedule: {
      type:     schedule.type,
      time:     schedule.time,
      weekday:  schedule.weekday  ?? null,
      interval: schedule.interval ?? null,
      runDate:  schedule.runDate  ?? null,
    },
    active: true,
    lastRunDate: null,
  };
  macros.push(macro);
  saveKvArr('bot_macros:v1', macros);
  res.json({ ok: true, macro });
});
app.put('/api/bot-macros/:id', requireManager, (req, res) => {
  const macros = loadKvArr('bot_macros:v1');
  const idx = macros.findIndex(m => m.id === req.params.id);
  if (idx === -1) return res.status(404).json({ error: 'Макрос не найден' });
  const b = req.body || {};
  const m = macros[idx];
  if (b.name     !== undefined) m.name = String(b.name).trim();
  if (b.chatId   !== undefined) m.chatId = String(b.chatId).trim();
  if (b.template !== undefined) m.template = String(b.template);
  if (b.active   !== undefined) m.active = !!b.active;
  if (b.schedule !== undefined && b.schedule && typeof b.schedule === 'object') {
    m.schedule = {
      type:     b.schedule.type     ?? m.schedule.type,
      time:     b.schedule.time     ?? m.schedule.time,
      weekday:  b.schedule.weekday  ?? null,
      interval: b.schedule.interval ?? null,
      runDate:  b.schedule.runDate  ?? null,
    };
    m.lastRunDate = null; // новое расписание — сбрасываем дедуп
  }
  saveKvArr('bot_macros:v1', macros);
  res.json({ ok: true, macro: m });
});
app.delete('/api/bot-macros/:id', requireManager, (req, res) => {
  const macros = loadKvArr('bot_macros:v1');
  const next = macros.filter(m => m.id !== req.params.id);
  if (next.length === macros.length) return res.status(404).json({ error: 'Макрос не найден' });
  saveKvArr('bot_macros:v1', next);
  res.json({ ok: true });
});

// ── Telegram bot: команды ──
function nameByTelegramId(id) {
  return Object.keys(data.bindings).find(name => data.bindings[name] === id) || null;
}
function sendToName(name, text) {
  const id = data.bindings[name];
  if (!id) return Promise.resolve(false);
  return bot.telegram.sendMessage(id, text).then(() => true).catch(err => { console.error('Ошибка отправки:', err); return false; });
}

// isToday — из единого бэкенд-модуля src/shift/isToday.js (дедуп копий).
const isDone = v => v === true || (v && typeof v === 'object' && !!v.done);
const todayStr = () => new Date().toISOString().slice(0, 10);

function todayTasksText(name) {
  const tasks   = JSON.parse(data.kv['tasks:v4']     || '[]');
  const history = JSON.parse(data.kv['done:hist:v2'] || '{}');
  const ds = todayStr();
  const reg = tasks.filter(t => !t.archived && isToday(t, ds));
  if (!reg.length) return '📋 На сегодня задач нет.';
  const lines = reg.map(t => {
    const done = isDone(history[`${t.id}::${ds}`]);
    return `${done ? '✅' : '⬜️'} ${t.title}`;
  });
  return `📋 Дела на сегодня${name ? ` (${name})` : ''}:\n\n${lines.join('\n')}`;
}

bot.command('start', ctx => {
  ctx.reply('🍺 «Работяга» на связи!\n\nОткрыть приложение — синей кнопкой меню слева внизу.\nА здесь — быстрые действия:', {
    reply_markup: { inline_keyboard: [
      [{ text: '📋 Общие дела на сегодня', callback_data: 'today' }],
      [{ text: '📋 Мои задачи на сегодня', callback_data: 'mytasks' }],
      [{ text: '👤 Мой статус', callback_data: 'status' }],
      [{ text: '🔔 Настройки пушей', callback_data: 'pushsettings' }],
    ]},
  });
});
// /id и /getchatid — вернуть chat_id текущего чата (для регистрации чата рассылки).
// Работает в группах/каналах; используй /id@имя_бота если у бота включён privacy mode.
bot.command(['id', 'getchatid'], ctx => ctx.reply(`chatId: ${ctx.chat.id}`));
bot.command('today',    ctx => ctx.reply(todayTasksText(null)));
bot.command('mytasks',  ctx => { const name = nameByTelegramId(ctx.from.id); if (!name) return ctx.reply('❌ Ты не привязан к системе.'); ctx.reply(todayTasksText(name)); });
// /startpush · /stoppush — тонкий fallback к UI-колокольчику (push:v1.recipients).
// Источник истины настроек получателей — push:v1.recipients[name].enabled.
// Имя резолвится по telegram id из bindings; per-type гранулярности нет (один флаг).
function setSelfPushEnabled(telegramId, enabled) {
  const name = nameByTelegramId(telegramId);
  if (!name) return null;
  let model;
  try { model = JSON.parse(data.kv[PUSH_KEY] || '{}'); } catch { model = {}; }
  if (!model.recipients || typeof model.recipients !== 'object') model.recipients = {};
  model.recipients[name] = enabled
    ? { enabled: true, mutedAt: null, mutedBy: null }
    : { enabled: false, mutedAt: new Date().toISOString(), mutedBy: 'self' };
  data.kv[PUSH_KEY] = JSON.stringify(model);
  saveData();
  return name;
}
bot.command('startpush', async ctx => {
  const name = setSelfPushEnabled(ctx.from.id, true);
  if (!name) return ctx.reply('❌ Ты не привязан к системе. Открой приложение и выбери своё имя.');
  await ctx.reply('✅ Пуши включены!');
});
bot.command('stoppush', async ctx => {
  const name = setSelfPushEnabled(ctx.from.id, false);
  if (!name) return ctx.reply('❌ Ты не привязан к системе.');
  await ctx.reply('❌ Пуши отключены. /startpush — включить обратно.');
});
bot.command('pushsettings', async ctx => {
  const name = nameByTelegramId(ctx.from.id);
  if (!name) return ctx.reply('❌ Ты не привязан к системе.');
  let model;
  try { model = JSON.parse(data.kv[PUSH_KEY] || '{}'); } catch { model = {}; }
  const rec = model.recipients && model.recipients[name];
  const on = rec ? rec.enabled !== false : true;
  await ctx.reply(`🔔 Пуши: ${on ? '✅ включены' : '❌ выключены'}\n\n/startpush — включить · /stoppush — выключить`);
});
bot.on('callback_query', ctx => {
  const d = ctx.callbackQuery.data;
  if (d === 'today')         ctx.reply(todayTasksText(null));
  else if (d === 'mytasks')  { const name = nameByTelegramId(ctx.from.id); ctx.reply(name ? todayTasksText(name) : '❌ Ты не привязан.'); }
  else if (d === 'status')   ctx.reply('👤 Статус — открой приложение.');
  else if (d === 'pushsettings') ctx.reply('/startpush /stoppush /pushsettings');
  ctx.answerCbQuery();
});

// ── Backfill: исторические данные расписания + выручки с заданной даты ──
// Только менеджер. Синхронизирует все листы Google Sheets и iiko за период.
// Body: { from: 'YYYY-MM-DD' } — по умолчанию с 1 января текущего года.
app.post('/api/admin/backfill', requireManager, async (req, res) => {
  const year = new Date().getFullYear();
  const from = req.body?.from || `${year}-01-01`;
  const to   = new Date().toISOString().slice(0, 10);

  // Валидация
  if (!/^\d{4}-\d{2}-\d{2}$/.test(from)) {
    return res.status(400).json({ error: 'from должно быть в формате YYYY-MM-DD' });
  }
  if (from > to) {
    return res.status(400).json({ error: 'from не может быть позже сегодняшней даты' });
  }

  console.log(`[backfill] запуск: ${from} → ${to}`);

  const [schedResult, revResult, planResult] = await Promise.allSettled([
    syncSchedule(data, saveData, { backfill: true, fromDate: from }),
    iiko.syncRevenueRange(from, to, data, saveData),
    syncRevenuePlan(data, saveData, { fromDate: from }),
  ]);

  const schedule = schedResult.status === 'fulfilled'
    ? schedResult.value
    : { error: schedResult.reason?.message || 'Ошибка расписания' };

  const revenue = revResult.status === 'fulfilled'
    ? revResult.value
    : { error: revResult.reason?.message || 'Ошибка выручки iiko' };

  const plan = planResult.status === 'fulfilled'
    ? planResult.value
    : { error: planResult.reason?.message || 'Ошибка плана выручки' };

  console.log(`[backfill] расписание: ${schedule.error || `${schedule.daysUpdated} дней`}, выручка iiko: ${revenue.error || `${revenue.updated} дней`}, план: ${plan.error || `${plan.daysUpdated} дней`}`);
  res.json({ ok: true, from, to, schedule, revenue, plan });
});

// ── SPA fallback ──
app.use((req, res, next) => {
  if (req.method !== 'GET' || req.path.startsWith('/api') || req.path === '/admin') return next();
  const indexFile = path.join(FRONTEND_DIST, 'index.html');
  if (fs.existsSync(indexFile)) {
    res.setHeader('Cache-Control', 'no-cache, no-store, must-revalidate');
    return res.sendFile(indexFile);
  }
  next();
});

// ── Запуск ──
let httpServer;
(async () => {
  // PG-first загрузка ДО приёма запросов — иначе клиент увидит файловые данные,
  // пока БД не подхватилась. При недоступном PG hydrate тихо откатывается на файл.
  await hydrateFromPG();
  // bcrypt-миграция — на актуальных (после hydrate) данных, без гонки за auth:v1.
  await migrateAuthPasswords();
  // Единая модель пушей: при отсутствии push:v1 — одноразовая миграция из
  // push_settings:v1 + data.pushSettings + profiles:v1 (после hydrate, чтобы
  // мигрировать актуальные данные, а не файловый снимок).
  ensurePushModel(data, saveData);

  bot.launch().catch(err => console.error('⚠️  Ошибка запуска бота (сервер продолжает работу):', err.message));
  pushScheduler.startScheduler(bot, data, pushSender, saveData);

  httpServer = app.listen(PORT, () => {
    console.log(`🚀 Сервер запущен на порту ${PORT}`);
    console.log(`📁 Данные: ${DATA_FILE} (+ PostgreSQL: ${PG_OK ? 'primary ✅' : 'недоступна, fallback ⚠️'})`);
    console.log(`🖥  Фронтенд: ${FRONTEND_DIST}`);
    console.log(`🌐 Web App URL: ${WEBAPP_URL}`);
    console.log(`🔒 JWT_SECRET: ${process.env.JWT_SECRET ? 'из .env ✅' : 'dev-ключ ⚠️'}`);
  });
})();

function shutdown(signal) {
  bot.stop(signal);
  // httpServer может быть ещё не создан, если сигнал пришёл до завершения bootstrap.
  if (httpServer) httpServer.close(() => process.exit(0));
  setTimeout(() => process.exit(0), 5000).unref();
}
process.once('SIGINT',  () => shutdown('SIGINT'));
process.once('SIGTERM', () => shutdown('SIGTERM'));
