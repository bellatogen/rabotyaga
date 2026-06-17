require('dotenv').config();
const express = require('express');
const { Telegraf } = require('telegraf');
const cors = require('cors');
const fs = require('fs');
const path = require('path');

const app = express();
app.use(cors());
app.use(express.json());

// Токен и URL берутся из .env файла
const TOKEN = process.env.TELEGRAM_TOKEN;
const WEBAPP_URL = process.env.WEBAPP_URL || 'https://rabotyaga.ru';

if (!TOKEN) {
  console.error('❌ Ошибка: не задан TELEGRAM_TOKEN в файле .env');
  process.exit(1);
}

const bot = new Telegraf(TOKEN);

// Общее хранилище: kv (тот же KV, что грузит/пишет фронтенд через ld()/sv())
// и bindings (имя сотрудника -> telegram chat id, для пушей и /today).
const DATA_FILE = path.join(__dirname, 'data.json');

let data = { kv: {}, bindings: {} };
if (fs.existsSync(DATA_FILE)) {
  try {
    const loaded = JSON.parse(fs.readFileSync(DATA_FILE, 'utf8'));
    data.kv = loaded.kv || {};
    data.bindings = loaded.bindings || {};
    console.log(`📂 Загружено ${Object.keys(data.kv).length} kv-ключей, ${Object.keys(data.bindings).length} привязок`);
  } catch (e) {
    console.error('Ошибка чтения data.json:', e);
  }
}

// Дебаунс записи, чтобы не дёргать диск на каждый чих
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
    console.error('Ошибка отправки сообщения:', err);
    return false;
  });
}

// ── Та же логика «применяется ли задача сегодня», что и isToday() во фронтенде (App.jsx) ──
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

// Обработчик команды /start
bot.command('start', (ctx) => {
  ctx.reply(
    '🍺 «Работяга» на связи!\n\n' +
    'Открыть приложение — синей кнопкой меню слева внизу.\n' +
    'А здесь — быстрые действия:',
    {
      reply_markup: {
        inline_keyboard: [
          [{ text: '📋 Дела на сегодня', callback_data: 'today' }],
          [{ text: '👤 Мой статус', callback_data: 'status' }]
        ]
      }
    }
  );
});

bot.command('today', (ctx) => {
  const name = nameByTelegramId(ctx.from.id);
  ctx.reply(todayTasksText(name));
});

// Обработчик callback-кнопок
bot.on('callback_query', (ctx) => {
  const cdata = ctx.callbackQuery.data;
  if (cdata === 'today') {
    const name = nameByTelegramId(ctx.from.id);
    ctx.reply(todayTasksText(name));
  } else if (cdata === 'status') {
    ctx.reply('👤 Чтобы узнать свой статус, открой приложение и выбери своё имя.');
  }
  ctx.answerCbQuery();
});

// KV-хранилище: то самое, что читает/пишет фронтенд через ld()/sv() (см. App.jsx)
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

// Фронтенд вызывает это, чтобы привязать Telegram ID к имени сотрудника
app.post('/api/bind', (req, res) => {
  const { name, telegramId } = req.body;
  if (!name || !telegramId) {
    return res.status(400).json({ error: 'name и telegramId обязательны' });
  }
  data.bindings[name] = telegramId;
  saveData();
  console.log(`✅ Привязан: ${name} -> ID ${telegramId}`);

  bot.telegram.sendMessage(
    telegramId,
    `👋 Привет, ${name}! Ты успешно подключен к системе "Работяга".\n\nТеперь я буду присылать тебе уведомления о сменах и задачах.`
  ).catch(err => console.error('Ошибка отправки сообщения:', err));

  res.json({ success: true });
});

// Эндпоинт для тестовых пушей
app.get('/api/push/:name', async (req, res) => {
  const ok = await sendToName(req.params.name, '🔔 Тестовое уведомление: не забудь протереть краны! 🍻');
  res.json(ok
    ? { success: true, msg: 'Пуш отправлен' }
    : { success: false, msg: 'Пользователь еще не заходил в бота' });
});

// Запускаем бота
bot.launch().catch(err => {
  console.error('Ошибка запуска бота:', err);
  process.exit(1);
});

// HTTP-сервер
const httpServer = app.listen(3001, () => {
  console.log('🚀 Сервер Работяги запущен на порту 3001');
  console.log(`🌐 Web App URL: ${WEBAPP_URL}`);
});

// Корректное завершение — закрываем и бота, и HTTP-сервер, иначе процесс
// не выходит по SIGTERM/SIGINT (открытый listen держит event loop вечно)
function shutdown(signal) {
  bot.stop(signal);
  httpServer.close(() => process.exit(0));
}
process.once('SIGINT', () => shutdown('SIGINT'));
process.once('SIGTERM', () => shutdown('SIGTERM'));
