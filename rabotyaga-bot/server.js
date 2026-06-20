require('dotenv').config();
const express = require('express');
const { Telegraf } = require('telegraf');
const cors = require('cors');
const fs = require('fs');
const path = require('path');
const pool = require('./db/pool');
const data = require('./db/adapter');

const app = express();
app.use(cors());
app.use(express.json());

const TOKEN = process.env.TELEGRAM_TOKEN;
const WEBAPP_URL = process.env.WEBAPP_URL || 'https://rabotyaga55.ru';
const ADMIN_TOKEN = process.env.ADMIN_TOKEN || 'changeme';

if (!TOKEN) {
  console.error('❌ TELEGRAM_TOKEN не задан в .env');
  process.exit(1);
}

const bot = new Telegraf(TOKEN);

// Инициализация БД
let dbReady = false;
pool.query('SELECT 1')
  .then(() => {
    dbReady = true;
    console.log('✅ Подключение к БД установлено');
  })
  .catch(err => {
    console.error('❌ Ошибка подключения к БД:', err);
    process.exit(1);
  });

function requireAdminToken(req, res, next) {
  const token = req.query.token || req.headers['x-admin-token'];
  if (token !== ADMIN_TOKEN) {
    return res.status(401).json({ error: 'Unauthorized' });
  }
  next();
}

// === БОТ КОМАНДЫ ===
bot.command('start', (ctx) => {
  ctx.reply('🍺 Работяга на связи!');
});

bot.on('callback_query', (ctx) => {
  ctx.answerCbQuery();
});

// === API ===

// KV Store (совместимость со старым кодом)
app.get('/api/kv/:key', async (req, res) => {
  try {
    const value = await data.kvGet(req.params.key);
    res.json({ value: value ? JSON.parse(value) : null });
  } catch (err) {
    console.error('KV GET error:', err);
    res.status(500).json({ error: 'Internal error' });
  }
});

app.put('/api/kv/:key', async (req, res) => {
  try {
    await data.kvSet(req.params.key, req.body.value);
    res.json({ ok: true });
  } catch (err) {
    console.error('KV SET error:', err);
    res.status(500).json({ error: 'Internal error' });
  }
});

app.get('/api/health', (req, res) => {
  res.json({ ok: dbReady, ts: Date.now() });
});

// Привязка сотрудника
app.post('/api/bind', async (req, res) => {
  const { name, telegramId } = req.body;
  if (!name || !telegramId) {
    return res.status(400).json({ error: 'name и telegramId обязательны' });
  }
  try {
    await data.bindEmployee(name, telegramId);
    console.log(`✅ Привязан: ${name} -> ID ${telegramId}`);
    bot.telegram.sendMessage(
      telegramId,
      `👋 Привет, ${name}! Ты подключен к "Работяга".`
    ).catch(err => console.error('Ошибка отправки:', err));
    res.json({ success: true });
  } catch (err) {
    console.error('Bind error:', err);
    res.status(500).json({ error: 'Failed to bind' });
  }
});

// Привязка по телефону (новая фича)
app.post('/api/bind-phone', async (req, res) => {
  const { name, phone } = req.body;
  if (!name || !phone) {
    return res.status(400).json({ error: 'name и phone обязательны' });
  }
  try {
    const bindCode = Math.random().toString(36).substr(2, 6).toUpperCase();
    await data.kvSet(`bind_phone:${bindCode}`, JSON.stringify({ name, phone, created: Date.now() }));
    res.json({
      success: true,
      bindCode,
      instructions: `Отправьте боту код: ${bindCode}`
    });
  } catch (err) {
    console.error('Bind phone error:', err);
    res.status(500).json({ error: 'Failed' });
  }
});

// Список привязок (админ)
app.get('/api/bindings', requireAdminToken, async (req, res) => {
  try {
    const bindings = await data.getBindings();
    res.json({ bindings });
  } catch (err) {
    console.error('Bindings error:', err);
    res.status(500).json({ error: 'Failed' });
  }
});

// Логи пушей (админ)
app.get('/api/push-log', requireAdminToken, async (req, res) => {
  try {
    const logs = await data.getPushLog();
    res.json({ logs });
  } catch (err) {
    console.error('Push log error:', err);
    res.status(500).json({ error: 'Failed' });
  }
});

// График пушей (админ)
app.post('/api/push-schedule', requireAdminToken, async (req, res) => {
  const { date, items } = req.body;
  if (!date || !Array.isArray(items)) {
    return res.status(400).json({ error: 'date и items обязательны' });
  }
  try {
    await data.setPushSchedule(date, items);
    res.json({ success: true });
  } catch (err) {
    console.error('Push schedule set error:', err);
    res.status(500).json({ error: 'Failed' });
  }
});

app.get('/api/push-schedule/:date', requireAdminToken, async (req, res) => {
  try {
    const items = await data.getPushSchedule(req.params.date);
    res.json({ items });
  } catch (err) {
    console.error('Push schedule get error:', err);
    res.status(500).json({ error: 'Failed' });
  }
});

// Тестовый пуш
app.get('/api/push/test/:name', requireAdminToken, async (req, res) => {
  try {
    const bindings = await data.getBindings();
    const telegramId = bindings[req.params.name];
    if (!telegramId) {
      return res.json({ success: false, msg: 'Пользователь не найден' });
    }
    await bot.telegram.sendMessage(telegramId, '🔔 Тестовое уведомление! 🍻');
    await data.logPush(req.params.name, telegramId, 'Тестовое уведомление', 'sent');
    res.json({ success: true, msg: 'Пуш отправлен' });
  } catch (err) {
    console.error('Test push error:', err);
    res.status(500).json({ error: 'Failed' });
  }
});

// === СТАТИКА ФРОНТЕНДА ===
const distPath = path.join(__dirname, '..', 'frontend', 'dist');
if (fs.existsSync(distPath)) {
  app.use(express.static(distPath));
  app.use((req, res) => {
    res.sendFile(path.join(distPath, 'index.html'));
  });
  console.log('📦 Фронтенд сервится');
} else {
  console.warn('⚠️ Фронтенд не найден');
}

// === ЗАПУСК ===
bot.launch().catch(err => {
  console.error('Ошибка запуска бота:', err);
  process.exit(1);
});

const PORT = process.env.PORT || 3001;
const httpServer = app.listen(PORT, () => {
  console.log(`🚀 Сервер запущен на порту ${PORT}`);
  console.log(`🌐 URL: ${WEBAPP_URL}`);
});

function shutdown(signal) {
  console.log(`Завершение по сигналу ${signal}...`);
  bot.stop(signal);
  pool.end();
  httpServer.close(() => {
    console.log('✅ Сервер остановлен');
    process.exit(0);
  });
}
process.once('SIGINT', () => shutdown('SIGINT'));
process.once('SIGTERM', () => shutdown('SIGTERM'));
