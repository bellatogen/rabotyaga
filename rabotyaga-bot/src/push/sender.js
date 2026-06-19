const fs = require('fs');
const path = require('path');

const DATA_FILE = path.join(__dirname, '../../data.json');
const LOG_FILE = path.join(__dirname, '../../push-log.json');

const MAX_ATTEMPTS = 3;
const RETRY_DELAY_MS = 1000;

function loadData() {
  if (fs.existsSync(DATA_FILE)) {
    return JSON.parse(fs.readFileSync(DATA_FILE, 'utf8'));
  }
  return { pushSettings: {}, adminUsers: [] };
}

function saveData(data) {
  fs.writeFileSync(DATA_FILE, JSON.stringify(data, null, 2));
}

function appendLog(entry) {
  let log = [];
  if (fs.existsSync(LOG_FILE)) {
    try {
      log = JSON.parse(fs.readFileSync(LOG_FILE, 'utf8'));
    } catch {
      log = [];
    }
  }
  log.push(entry);
  fs.writeFileSync(LOG_FILE, JSON.stringify(log, null, 2));
}

function sleep(ms) {
  return new Promise(resolve => setTimeout(resolve, ms));
}

// 403 — бот заблокирован пользователем, повторять бессмысленно
function isPermanentError(error) {
  return error.response?.error_code === 403;
}

async function sendPush(bot, userId, message) {
  const data = loadData();
  const settings = data.pushSettings?.[userId];
  if (!settings || !settings.enabled || !settings.chatId) {
    console.log(`❌ Пуши для ${userId} отключены`);
    appendLog({ ts: Date.now(), userId, status: 'skipped', reason: 'disabled' });
    return false;
  }

  let lastError = null;
  let attempt = 0;
  for (attempt = 1; attempt <= MAX_ATTEMPTS; attempt++) {
    try {
      await bot.telegram.sendMessage(settings.chatId, message, { parse_mode: 'HTML' });
      console.log(`✅ Пуш отправлен ${userId}`);
      appendLog({ ts: Date.now(), userId, status: 'sent', attempts: attempt });
      return true;
    } catch (error) {
      lastError = error;
      console.error(`❌ Ошибка пуша (попытка ${attempt}/${MAX_ATTEMPTS}):`, error.message);
      if (isPermanentError(error) || attempt === MAX_ATTEMPTS) break;
      await sleep(RETRY_DELAY_MS * attempt);
    }
  }

  appendLog({ ts: Date.now(), userId, status: 'failed', attempts: attempt, error: lastError?.message });
  return false;
}

async function sendDayBeforeShiftPush(bot, userId, tasks) {
  const data = loadData();
  const settings = data.pushSettings?.[userId];
  if (!settings?.notifications?.dayBeforeShift) return false;
  const template = settings.templates?.dayBeforeShift || 
    '🔔 Завтра твоя смена!\n\nЗадачи:\n{tasks}';
  const tasksText = tasks.map((t, i) => `${i + 1}. ${t}`).join('\n');
  return sendPush(bot, userId, template.replace('{tasks}', tasksText));
}

async function sendPersonalTasksPush(bot, userId, tasks) {
  const data = loadData();
  const settings = data.pushSettings?.[userId];
  if (!settings?.notifications?.personalTasks) return false;
  const tasksText = tasks.map(t => 
    `📌 ${t.title}\n👤 ${t.assignedBy || '—'}\n⏰ ${t.deadline || '—'}\n📝 ${t.context || ''}`
  ).join('\n\n');
  return sendPush(bot, userId, `📬 Личные задачи:\n\n${tasksText}`);
}

async function sendCloseShiftPush(bot, userId) {
  const data = loadData();
  const settings = data.pushSettings?.[userId];
  if (!settings?.notifications?.closeShiftReminder) return false;
  const template = settings.templates?.closeShiftReminder ||
    '⏰ Пора закрывать смену!\n\n✅ Чек-лист:\n• Пересчитать кассу\n• Убраться\n• Сдать отчёт\n• Закрыть бар';
  return sendPush(bot, userId, template);
}

async function sendIndividualPush(bot, userId, message) {
  const data = loadData();
  const settings = data.pushSettings?.[userId];
  if (!settings?.notifications?.individualTasks) return false;
  return sendPush(bot, userId, message);
}

function updatePushSettings(userId, settings) {
  const data = loadData();
  if (!data.pushSettings) data.pushSettings = {};
  data.pushSettings[userId] = { ...data.pushSettings[userId], ...settings };
  saveData(data);
}

function getPushSettings(userId) {
  const data = loadData();
  return data.pushSettings?.[userId] || null;
}

function getAllPushSettings() {
  const data = loadData();
  return data.pushSettings || {};
}

module.exports = {
  sendPush, sendDayBeforeShiftPush, sendPersonalTasksPush,
  sendCloseShiftPush, sendIndividualPush,
  updatePushSettings, getPushSettings, getAllPushSettings
};
