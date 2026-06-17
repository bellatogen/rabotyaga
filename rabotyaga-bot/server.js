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

// Файл для хранения данных (привязки Telegram ID к сотрудникам)
const DATA_FILE = path.join(__dirname, 'data.json');

// Загрузка данных при старте
let users = [];
if (fs.existsSync(DATA_FILE)) {
  try {
    users = JSON.parse(fs.readFileSync(DATA_FILE, 'utf8'));
    console.log(`📂 Загружено ${users.length} записей из data.json`);
  } catch (e) {
    console.error('Ошибка чтения data.json:', e);
  }
}

// Сохранение данных в файл
function saveUsers() {
  try {
    fs.writeFileSync(DATA_FILE, JSON.stringify(users, null, 2));
  } catch (e) {
    console.error('Ошибка записи data.json:', e);
  }
}

// Инициализация списка сотрудников (если файл пустой)
if (users.length === 0) {
  users = [
    { name: 'Александр', telegramId: null },
    { name: 'Павел', telegramId: null },
    { name: 'Евгений', telegramId: null },
    { name: 'Тимофей', telegramId: null },
    { name: 'Ярослав', telegramId: null },
    { name: 'Антон', telegramId: null },
    { name: 'Тестовый', telegramId: null }
  ];
  saveUsers();
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
          [{ text: ' Мой статус', callback_data: 'status' }]
        ]
      }
    }
  );
});

// Обработчик callback-кнопок
bot.on('callback_query', (ctx) => {
  const data = ctx.callbackQuery.data;
  if (data === 'today') {
    ctx.reply(' Чтобы посмотреть дела, открой приложение через кнопку меню слева внизу.');
  } else if (data === 'status') {
    ctx.reply(' Чтобы узнать свой статус, открой приложение и выбери своё имя.');
  }
  ctx.answerCbQuery();
});

// 1. Эндпоинт: Фронтенд вызывает его, чтобы привязать Telegram ID к имени
app.post('/api/bind', (req, res) => {
  const { name, telegramId } = req.body;
  const user = users.find(u => u.name === name);

  if (user) {
    user.telegramId = telegramId;
    saveUsers();
    console.log(`✅ Привязан: ${name} -> ID ${telegramId}`);

    bot.telegram.sendMessage(
      telegramId,
      ` Привет, ${name}! Ты успешно подключен к системе "Работяга".\n\nТеперь я буду присылать тебе уведомления о сменах и задачах.`
    ).catch(err => console.error('Ошибка отправки сообщения:', err));

    res.json({ success: true });
  } else {
    res.status(404).json({ error: 'Сотрудник не найден в базе' });
  }
});

// 2. Эндпоинт для тестовых пушей
app.get('/api/push/:name', (req, res) => {
  const user = users.find(u => u.name === req.params.name);
  if (user && user.telegramId) {
    bot.telegram.sendMessage(
      user.telegramId,
      '🔔 Тестовое уведомление: не забудь протереть краны! 🍻'
    ).catch(err => console.error('Ошибка отправки:', err));
    res.json({ success: true, msg: 'Пуш отправлен' });
  } else {
    res.json({ success: false, msg: 'Пользователь еще не заходил в бота' });
  }
});

// Запускаем бота
bot.launch().catch(err => {
  console.error('Ошибка запуска бота:', err);
  process.exit(1);
});

// HTTP-сервер
app.listen(3001, () => {
  console.log('🚀 Сервер Работяги запущен на порту 3001');
  console.log(` Web App URL: ${WEBAPP_URL}`);
});

// Корректное завершение
process.once('SIGINT', () => bot.stop('SIGINT'));
process.once('SIGTERM', () => bot.stop('SIGTERM'));