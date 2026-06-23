require('dotenv').config();
const express = require('express');
const { Telegraf } = require('telegraf');
const cors = require('cors');
const fs = require('fs');
const path = require('path');

const pushApi = require('./src/api/push');
const pushSender = require('./src/push/sender');
const pushScheduler = require('./src/push/scheduler');
const makeAdminApi = require('./src/api/admin');
const iiko = require('./src/api/iiko');
const { syncSchedule } = require('./src/sync/scheduleSync');

// ── Конфиг из окружения (без хардкодов) ──
const PORT = process.env.PORT || 3001;
const DATA_FILE = process.env.DATA_FILE || path.join(__dirname, 'data.json');
const FRONTEND_DIST = process.env.FRONTEND_DIST || path.join(__dirname, 'frontend', 'dist');

const app = express();
app.use(cors({ origin: ['https://rabotyaga55.ru', 'http://localhost:5173', /\.timeweb\.cloud$/], credentials: true }));
app.use(express.json());
// index.html — без кеша (браузер всегда запрашивает свежий),
// ассеты — долгий кеш (Vite добавляет контент-хеш в имя файла)
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
app.use('/api/push', pushApi);
// adminApi монтируется после инициализации data — передаём ссылку и saveData
// чтобы роутер работал с тем же in-memory объектом (устраняет race condition)

const TOKEN = process.env.TELEGRAM_TOKEN;
const WEBAPP_URL = process.env.WEBAPP_URL || 'https://rabotyaga.ru';

if (!TOKEN) {
  console.error('❌ Ошибка: не задан TELEGRAM_TOKEN в файле .env');
  process.exit(1);
}

const bot = new Telegraf(TOKEN);

let data = { kv: {}, bindings: {}, pushSettings: {}, adminUsers: [] };
if (fs.existsSync(DATA_FILE)) {
  try {
    const loaded = JSON.parse(fs.readFileSync(DATA_FILE, 'utf8'));
    data.kv = loaded.kv || {};
    data.bindings = loaded.bindings || {};
    data.pushSettings = loaded.pushSettings || {};
    data.adminUsers = loaded.adminUsers || [];
    console.log(`📂 Загружено ${Object.keys(data.kv).length} kv-ключей, ${Object.keys(data.bindings).length} привязок, ${Object.keys(data.pushSettings).length} настроек пушей`);
  } catch (e) {
    console.error('Ошибка чтения data.json:', e);
  }
}

let saveTimer = null;
function saveData() {
  clearTimeout(saveTimer);
  saveTimer = setTimeout(() => {
    try {
      fs.writeFileSync(DATA_FILE, JSON.stringify(data, null, 2));
    } catch (e) {
      console.error('Ошибка записи data.json:', e);
    }
  }, 300);
}

// Монтируем admin-роутер здесь, после инициализации data и saveData
app.use('/api/admin', makeAdminApi(data, saveData));

// ── Синхронизация расписания из Google Sheets ──
// POST /api/sync/schedule — ручной запуск (админка)
// GET  /api/sync/schedule/status — статус последней синхронизации
app.get('/api/sync/schedule/status', (req, res) => {
  try {
    const status = JSON.parse(data.kv['sync:schedule:status'] || 'null');
    res.json(status || { lastRun: null, daysUpdated: 0, error: null });
  } catch { res.json({ lastRun: null, daysUpdated: 0, error: null }); }
});

app.post('/api/sync/schedule', async (req, res) => {
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
}, 10000); // 10 сек после старта

// ── iiko: синхронизация выручки за текущий месяц ──
app.post('/api/iiko/revenue/sync', async (req, res) => {
  try {
    const result = await iiko.syncRevenue(data, saveData);
    res.json(result);
  } catch (err) {
    console.error('[iiko/revenue/sync]', err.message);
    res.status(err.status || 500).json({ error: err.message });
  }
});

// ── iiko: факт выручки за день ──
// GET /api/iiko/revenue/:date  →  { fact: number }
// Требует IIKO_URL, IIKO_LOGIN, IIKO_PASSWORD в .env
app.get('/api/iiko/revenue/:date', async (req, res) => {
  const { date } = req.params;
  if (!/^\d{4}-\d{2}-\d{2}$/.test(date)) return res.status(400).json({ error: 'Неверный формат даты (ожидается YYYY-MM-DD)' });
  try {
    const result = await iiko.getDayRevenue(date);
    res.json(result);
  } catch (err) {
    const status = err.status || 500;
    console.error('[iiko] ошибка:', err.message);
    res.status(status).json({ error: err.message });
  }
});

function nameByTelegramId(id) {
  return Object.keys(data.bindings).find(name => data.bindings[name] === id) || null;
}

function sendToName(name, text) {
  const id = data.bindings[name];
  if (!id) return Promise.resolve(false);
  return bot.telegram.sendMessage(id, text).then(() => true).catch(err => {
    console.error('Ошибка отправки:', err);
    return false;
  });
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
  const tasks = JSON.parse(data.kv['tasks:v4'] || '[]');
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

// === КОМАНДЫ ===
bot.command('start', (ctx) => {
  ctx.reply(
    '🍺 «Работяга» на связи!\n\n' +
    'Открыть приложение — синей кнопкой меню слева внизу.\n' +
    'А здесь — быстрые действия:',
    {
      reply_markup: {
        inline_keyboard: [
          [{ text: '📋 Общие дела на сегодня', callback_data: 'today' }],
          [{ text: '📋 Мои задачи на сегодня', callback_data: 'mytasks' }],
          [{ text: '👤 Мой статус', callback_data: 'status' }],
          [{ text: '🔔 Настройки пушей', callback_data: 'pushsettings' }]
        ]
      }
    }
  );
});

bot.command('today', (ctx) => {
  ctx.reply(todayTasksText(null));
});

bot.command('mytasks', (ctx) => {
  const name = nameByTelegramId(ctx.from.id);
  if (!name) return ctx.reply('❌ Ты не привязан к системе. Обратись к администратору.');
  ctx.reply(todayTasksText(name));
});

bot.command('startpush', async (ctx) => {
  const userId = String(ctx.from.id);
  const chatId = String(ctx.chat.id);
  pushSender.updatePushSettings(userId, {
    enabled: true, chatId,
    notifications: { dayBeforeShift: true, personalTasks: true, closeShiftReminder: true, individualTasks: true }
  });
  await ctx.reply('✅ Пуши включены! /pushsettings — настройки');
});

bot.command('stoppush', async (ctx) => {
  const userId = String(ctx.from.id);
  pushSender.updatePushSettings(userId, { enabled: false });
  await ctx.reply('❌ Пуши отключены');
});

bot.command('pushsettings', async (ctx) => {
  const userId = String(ctx.from.id);
  const settings = pushSender.getPushSettings(userId);
  if (!settings) return ctx.reply('🔔 Настройки не найдены. Используй /startpush');
  const text = `📱 Настройки пушей:\n\nВключены: ${settings.enabled ? '✅' : '❌'}\n\n🔔 Уведомления:\n• За сутки до смены: ${settings.notifications?.dayBeforeShift ? '✅' : '❌'}\n• Личные задачи: ${settings.notifications?.personalTasks ? '✅' : '❌'}\n• Закрытие смены: ${settings.notifications?.closeShiftReminder ? '✅' : '❌'}\n• Индивидуальные: ${settings.notifications?.individualTasks ? '✅' : '❌'}`;
  await ctx.reply(text);
});

bot.command('toggle_daybefore', async (ctx) => {
  const userId = String(ctx.from.id);
  const settings = pushSender.getPushSettings(userId);
  if (!settings) return ctx.reply('Сначала /startpush');
  const newVal = !settings.notifications?.dayBeforeShift;
  pushSender.updatePushSettings(userId, { notifications: { ...settings.notifications, dayBeforeShift: newVal } });
  await ctx.reply(`За сутки до смены: ${newVal ? '✅' : '❌'}`);
});

bot.command('toggle_personal', async (ctx) => {
  const userId = String(ctx.from.id);
  const settings = pushSender.getPushSettings(userId);
  if (!settings) return ctx.reply('Сначала /startpush');
  const newVal = !settings.notifications?.personalTasks;
  pushSender.updatePushSettings(userId, { notifications: { ...settings.notifications, personalTasks: newVal } });
  await ctx.reply(`Личные задачи: ${newVal ? '✅' : '❌'}`);
});

bot.command('toggle_closeshift', async (ctx) => {
  const userId = String(ctx.from.id);
  const settings = pushSender.getPushSettings(userId);
  if (!settings) return ctx.reply('Сначала /startpush');
  const newVal = !settings.notifications?.closeShiftReminder;
  pushSender.updatePushSettings(userId, { notifications: { ...settings.notifications, closeShiftReminder: newVal } });
  await ctx.reply(`Закрытие смены: ${newVal ? '✅' : '❌'}`);
});

bot.command('toggle_individual', async (ctx) => {
  const userId = String(ctx.from.id);
  const settings = pushSender.getPushSettings(userId);
  if (!settings) return ctx.reply('Сначала /startpush');
  const newVal = !settings.notifications?.individualTasks;
  pushSender.updatePushSettings(userId, { notifications: { ...settings.notifications, individualTasks: newVal } });
  await ctx.reply(`Индивидуальные: ${newVal ? '✅' : '❌'}`);
});

bot.on('callback_query', (ctx) => {
  const cdata = ctx.callbackQuery.data;
  if (cdata === 'today') {
    ctx.reply(todayTasksText(null));
  } else if (cdata === 'mytasks') {
    const name = nameByTelegramId(ctx.from.id);
    if (!name) return ctx.reply('❌ Ты не привязан к системе.');
    ctx.reply(todayTasksText(name));
  } else if (cdata === 'status') {
    ctx.reply('👤 Чтобы узнать свой статус, открой приложение и выбери своё имя.');
  } else if (cdata === 'pushsettings') {
    ctx.answerCbQuery();
    return ctx.reply('Команды пушей:\n/startpush — включить\n/stoppush — выключить\n/pushsettings — настройки\n/toggle_daybefore\n/toggle_personal\n/toggle_closeshift\n/toggle_individual');
  }
  ctx.answerCbQuery();
});

// === API ===
app.get('/api/kv/:key', (req, res) => {
  res.json({ value: data.kv[req.params.key] ?? null });
});

app.put('/api/kv/:key', (req, res) => {
  data.kv[req.params.key] = req.body.value;
  saveData();
  res.json({ ok: true });
});

app.get('/api/health', (req, res) => {
  res.json({ ok: true, ts: Date.now() });
});

app.post('/api/bind', (req, res) => {
  const { name, telegramId } = req.body;
  if (!name || !telegramId) return res.status(400).json({ error: 'name и telegramId обязательны' });
  data.bindings[name] = telegramId;
  saveData();
  console.log(`✅ Привязан: ${name} -> ID ${telegramId}`);
  bot.telegram.sendMessage(telegramId, `👋 Привет, ${name}! Ты подключен к "Работяга".`).catch(err => console.error('Ошибка отправки:', err));
  res.json({ success: true });
});

app.delete('/api/bind/:name', (req, res) => {
  const { name } = req.params;
  if (data.bindings[name]) {
    delete data.bindings[name];
    saveData();
    console.log(`❌ Удалена привязка: ${name}`);
    return res.json({ success: true });
  }
  res.status(404).json({ error: 'Сотрудник не найден' });
});

app.get('/api/bindings', (req, res) => {
  res.json({ success: true, bindings: data.bindings });
});

app.get("/api/push/test/:name", async (req, res) => {
  const name = req.params.name;
  const userId = data.bindings[name];
  if (!userId) return res.json({ success: false, msg: "Пользователь не найден" });
  const ok = await pushSender.sendPush(bot, String(userId), "🔔 Тестовое уведомление! 🍻", "test");
  res.json(ok ? { success: true, msg: "Пуш отправлен" } : { success: false, msg: "Пуши отключены" });
});

// SPA-fallback: любой не-API GET отдаёт index.html (Mini App без роутера —
// но это страхует прямые ссылки). Express 5: финальный middleware, не '*'.
app.use((req, res, next) => {
  if (req.method !== 'GET' || req.path.startsWith('/api') || req.path === '/admin') return next();
  const indexFile = path.join(FRONTEND_DIST, 'index.html');
  if (fs.existsSync(indexFile)) {
    res.setHeader('Cache-Control', 'no-cache, no-store, must-revalidate');
    return res.sendFile(indexFile);
  }
  next();
});

// === ЗАПУСК ===
bot.launch().catch(err => {
  // Бот упал (напр. 409 Conflict от Telegram) — логируем, но НЕ убиваем сервер.
  // HTTP-сервер, API и фронтенд продолжают работать независимо от бота.
  console.error('⚠️  Ошибка запуска бота (сервер продолжает работу):', err.message);
});
pushScheduler.startScheduler(bot);

// Запускаем HTTP-сервер и сохраняем ссылку для graceful shutdown
const httpServer = app.listen(PORT, () => {
  console.log(`🚀 Сервер Работяги запущен на порту ${PORT}`);
  console.log(`📁 Данные: ${DATA_FILE}`);
  console.log(`🖥  Фронтенд: ${FRONTEND_DIST}`);
  console.log(`🌐 Web App URL: ${WEBAPP_URL}`);
});

function shutdown(signal) {
  bot.stop(signal);
  httpServer.close(() => process.exit(0));
  setTimeout(() => process.exit(0), 5000).unref(); // fallback если close завис
}
process.once('SIGINT', () => shutdown('SIGINT'));
process.once('SIGTERM', () => shutdown('SIGTERM'));
