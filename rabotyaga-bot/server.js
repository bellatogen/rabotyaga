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

const makePushApi   = require('./src/api/push');
const makePushSender = require('./src/push/sender');
const pushScheduler = require('./src/push/scheduler');
const makeAdminApi  = require('./src/api/admin');
const makeAuthApi   = require('./src/api/auth');
const iiko          = require('./src/api/iiko');
const { syncSchedule } = require('./src/sync/scheduleSync');
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
  'members:v1', 'events:v1', 'acl:v1', 'seeds:v1',
  'month_plan:v1', // месячный план выручки — задаёт только менеджер
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
      imgSrc:          ["'self'", "data:", "https:"],
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
    console.log(`📂 Загружено ${Object.keys(data.kv).length} kv-ключей, ${Object.keys(data.bindings).length} привязок`);
  } catch (e) { console.error('Ошибка чтения data.json:', e); }
}

let saveTimer = null;
// Инстанс sender создаётся здесь: data уже объявлен, saveData объявляется ниже через hoisting
let pushSender; // будет инициализирован сразу после saveData

function saveData() {
  clearTimeout(saveTimer);
  saveTimer = setTimeout(() => {
    try { fs.writeFileSync(DATA_FILE, JSON.stringify(data, null, 2)); }
    catch (e) { console.error('Ошибка записи data.json:', e); }
  }, 300);
}

// ── Авто-миграция plaintext паролей → bcrypt при старте ──
(async () => {
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
})();

// Инициализируем sender и push API (data + saveData уже готовы)
pushSender = makePushSender(data, saveData);
app.use('/api/push', makePushApi(pushSender));

// ── Монтируем роутеры (требующие data) ──
app.use('/api/auth',  makeAuthApi(data, saveData));
app.use('/api/admin', requireManager, makeAdminApi(data, saveData));

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

// Авто-синхронизация раз в 12 часов
setTimeout(() => {
  syncSchedule(data, saveData).catch(e => console.error('[scheduleSync] startup error:', e.message));
  setInterval(() => {
    syncSchedule(data, saveData).catch(e => console.error('[scheduleSync] interval error:', e.message));
  }, 12 * 60 * 60 * 1000);
}, 10000);

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
  if (req.query.force === '1') delete data.kv['basket:pairs:v1'];
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
app.get('/api/health', (req, res) => res.json({ ok: true, ts: Date.now() }));

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

// ── Telegram bot: команды ──
function nameByTelegramId(id) {
  return Object.keys(data.bindings).find(name => data.bindings[name] === id) || null;
}
function sendToName(name, text) {
  const id = data.bindings[name];
  if (!id) return Promise.resolve(false);
  return bot.telegram.sendMessage(id, text).then(() => true).catch(err => { console.error('Ошибка отправки:', err); return false; });
}

function isToday(task, ds) {
  if (task.kind === 'irregular') return false;
  if (task.from && ds < task.from) return false;
  if (task.until && ds > task.until) return false;
  if (task.repeat === 'once') return task.date === ds;
  if (['daily', 'opening', 'closing'].includes(task.repeat)) return true;
  if (task.repeat === 'workday') { const d = new Date(ds).getDay(); return d !== 0 && d !== 6; }
  if (task.repeat === 'weekly') return task.dayOfWeek === new Date(ds).getDay();
  return false;
}
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
bot.command('today',    ctx => ctx.reply(todayTasksText(null)));
bot.command('mytasks',  ctx => { const name = nameByTelegramId(ctx.from.id); if (!name) return ctx.reply('❌ Ты не привязан к системе.'); ctx.reply(todayTasksText(name)); });
bot.command('startpush', async ctx => {
  const userId = String(ctx.from.id), chatId = String(ctx.chat.id);
  pushSender.updatePushSettings(userId, { enabled: true, chatId, notifications: { dayBeforeShift: true, personalTasks: true, closeShiftReminder: true, individualTasks: true } });
  await ctx.reply('✅ Пуши включены! /pushsettings — настройки');
});
bot.command('stoppush', async ctx => { pushSender.updatePushSettings(String(ctx.from.id), { enabled: false }); await ctx.reply('❌ Пуши отключены'); });
bot.command('pushsettings', async ctx => {
  const settings = pushSender.getPushSettings(String(ctx.from.id));
  if (!settings) return ctx.reply('🔔 Настройки не найдены. Используй /startpush');
  await ctx.reply(`📱 Пуши: ${settings.enabled ? '✅' : '❌'}\n• За сутки до смены: ${settings.notifications?.dayBeforeShift ? '✅' : '❌'}\n• Личные задачи: ${settings.notifications?.personalTasks ? '✅' : '❌'}\n• Закрытие смены: ${settings.notifications?.closeShiftReminder ? '✅' : '❌'}\n• Индивидуальные: ${settings.notifications?.individualTasks ? '✅' : '❌'}`);
});
['toggle_daybefore','toggle_personal','toggle_closeshift','toggle_individual'].forEach(cmd => {
  const key = { toggle_daybefore:'dayBeforeShift', toggle_personal:'personalTasks', toggle_closeshift:'closeShiftReminder', toggle_individual:'individualTasks' }[cmd];
  bot.command(cmd, async ctx => {
    const s = pushSender.getPushSettings(String(ctx.from.id));
    if (!s) return ctx.reply('Сначала /startpush');
    const val = !s.notifications?.[key];
    pushSender.updatePushSettings(String(ctx.from.id), { notifications: { ...s.notifications, [key]: val } });
    await ctx.reply(`${key}: ${val ? '✅' : '❌'}`);
  });
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

  const [schedResult, revResult] = await Promise.allSettled([
    syncSchedule(data, saveData, { backfill: true, fromDate: from }),
    iiko.syncRevenueRange(from, to, data, saveData),
  ]);

  const schedule = schedResult.status === 'fulfilled'
    ? schedResult.value
    : { error: schedResult.reason?.message || 'Ошибка расписания' };

  const revenue = revResult.status === 'fulfilled'
    ? revResult.value
    : { error: revResult.reason?.message || 'Ошибка выручки iiko' };

  console.log(`[backfill] расписание: ${schedule.error || `${schedule.daysUpdated} дней`}, выручка: ${revenue.error || `${revenue.updated} дней`}`);
  res.json({ ok: true, from, to, schedule, revenue });
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
bot.launch().catch(err => console.error('⚠️  Ошибка запуска бота (сервер продолжает работу):', err.message));
pushScheduler.startScheduler(bot, data, pushSender);

const httpServer = app.listen(PORT, () => {
  console.log(`🚀 Сервер запущен на порту ${PORT}`);
  console.log(`📁 Данные: ${DATA_FILE}`);
  console.log(`🖥  Фронтенд: ${FRONTEND_DIST}`);
  console.log(`🌐 Web App URL: ${WEBAPP_URL}`);
  console.log(`🔒 JWT_SECRET: ${process.env.JWT_SECRET ? 'из .env ✅' : 'dev-ключ ⚠️'}`);
});

function shutdown(signal) {
  bot.stop(signal);
  httpServer.close(() => process.exit(0));
  setTimeout(() => process.exit(0), 5000).unref();
}
process.once('SIGINT',  () => shutdown('SIGINT'));
process.once('SIGTERM', () => shutdown('SIGTERM'));
