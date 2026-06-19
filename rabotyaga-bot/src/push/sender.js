const fs = require('fs');
const path = require('path');

const DATA_FILE = path.join(__dirname, '../../data.json');

function loadData() {
  if (fs.existsSync(DATA_FILE)) {
    return JSON.parse(fs.readFileSync(DATA_FILE, 'utf8'));
  }
  return { pushSettings: {}, adminUsers: [] };
}

function saveData(data) {
  fs.writeFileSync(DATA_FILE, JSON.stringify(data, null, 2));
}

async function sendPush(bot, userId, message) {
  const data = loadData();
  const settings = data.pushSettings?.[userId];
  if (!settings || !settings.enabled || !settings.chatId) {
    console.log(`❌ Пуши для ${userId} отключены`);
    return false;
  }
  try {
    await bot.telegram.sendMessage(settings.chatId, message, { parse_mode: 'HTML' });
    console.log(`✅ Пуш отправлен ${userId}`);
    return true;
  } catch (error) {
    console.error(`❌ Ошибка пуша:`, error.message);
    return false;
  }
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
