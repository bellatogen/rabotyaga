require('dotenv').config();
const express = require('express');
const { Telegraf } = require('telegraf');
const cors = require('cors');
const fs = require('fs');
const path = require('path');

// Импорт модулей пушей (строго в начале!)
const pushApi = require('./src/api/push');
const DATA_FILE = path.join(__dirname, 'data.json');
let data = { kv: {}, bindings: {}, pushSettings: {}, adminUsers: [], defaultTemplates: {} };
module.exports = { data };
const adminApi = require("./src/api/admin");
const pushSender = require('./src/push/sender');
const pushScheduler = require("./src/push/scheduler");

const app = express();
app.use(cors());
app.use(express.json());
app.use('/api/push', pushApi);
app.use('/api/admin', adminApi);

const TOKEN = process.env.TELEGRAM_TOKEN;
const WEBAPP_URL = process.env.WEBAPP_URL || 'https://rabotyaga.ru';

if (!TOKEN) {
  console.error('❌ Ошибка: не задан TELEGRAM_TOKEN в файле .env');
  process.exit(1);
}

const bot = new Telegraf(TOKEN);
if (fs.existsSync(DATA_FILE)) {
  try {
    const loaded = JSON.parse(fs.readFileSync(DATA_FILE, 'utf8'));
    data.kv = loaded.kv || {};
    data.bindings = loaded.bindings || {};
    data.pushSettings = loaded.pushSettings || {};
    data.adminUsers = loaded.adminUsers || [];
    data.defaultTemplates = loaded.defaultTemplates || {};
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

// === КОМАНДЫ БОТА ===
bot.command('start', (ctx) => {
  ctx.reply(
    '🍺 «Работяга» на связи!\n\n' +
    'Открыть приложение — синей кнопкой меню слева внизу.\n' +
    'А здесь — быстрые действия:',
    {
      reply_markup: {
        inline_keyboard: [
          [{ text: '📋 Дела на сегодня', callback_data: 'today' }],
          [{ text: ' Мой статус', callback_data: 'status' }],
          [{ text: '🔔 Настройки пушей', callback_data: 'pushsettings' }]
        ]
      }
    }
  );
});

bot.command('today', (ctx) => {
  const name = nameByTelegramId(ctx.from.id);
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
  if (!settings) return ctx.reply(' Настройки не найдены. Используй /startpush');
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
    const name = nameByTelegramId(ctx.from.id);
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
  bot.telegram.sendMessage(telegramId, ` Привет, ${name}! Ты подключен к "Работяга".`).catch(err => console.error('Ошибка отправки:', err));
  res.json({ success: true });
});

app.get('/api/push/test/:name', async (req, res) => {
  const ok = await sendToName(req.params.name, '🔔 Тестовое уведомление! 🍻');
  res.json(ok ? { success: true, msg: 'Пуш отправлен' } : { success: false, msg: 'Пользователь не заходил' });
});

bot.launch().catch(err => {
  console.error('Ошибка запуска бота:', err);
  process.exit(1);
});
pushScheduler.startScheduler(bot);

const httpServer = app.listen(3001, () => {
  console.log('🚀 Сервер Работяги запущен на порту 3001');
  console.log(`🌐 Web App URL: ${WEBAPP_URL}`);
});

function shutdown(signal) {
  bot.stop(signal);
  httpServer.close(() => process.exit(0));
}
process.once('SIGINT', () => shutdown('SIGINT'));
process.once('SIGTERM', () => shutdown('SIGTERM'));
