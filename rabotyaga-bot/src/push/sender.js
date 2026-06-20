const fs = require('fs');
const path = require('path');

const DATA_FILE = path.join(__dirname, '../../data.json');

function loadData() {
  if (fs.existsSync(DATA_FILE)) {
    return JSON.parse(fs.readFileSync(DATA_FILE, 'utf8'));
  }
  return { pushSettings: {}, adminUsers: [], pushLogs: [] };
}

function saveData(data) {
  fs.writeFileSync(DATA_FILE, JSON.stringify(data, null, 2));
}

function logPush(userId, userName, type, success, error = null) {
  const data = loadData();
  if (!data.pushLogs) data.pushLogs = [];
  
  data.pushLogs.unshift({
    userId,
    userName,
    type,
    success,
    error,
    timestamp: new Date().toISOString()
  });
  
  // Храним только последние 500 записей
  if (data.pushLogs.length > 500) {
    data.pushLogs = data.pushLogs.slice(0, 500);
  }
  
  saveData(data);
}

async function sendPush(bot, userId, message, type = 'test') {
  const data = loadData();
  const settings = data.pushSettings?.[userId];
  const userName = Object.keys(data.bindings || {}).find(name => data.bindings[name] == userId) || null;
  
  if (!settings || !settings.enabled || !settings.chatId) {
    logPush(userId, userName, type, false, 'Пуши отключены');
    console.log(`❌ Пуши для ${userId} отключены`);
    return false;
  }
  
  try {
    await bot.telegram.sendMessage(settings.chatId, message, { parse_mode: 'HTML' });
    logPush(userId, userName, type, true);
    console.log(`✅ Пуш отправлен ${userId} (${type})`);
    return true;
  } catch (error) {
    logPush(userId, userName, type, false, error.message);
    console.error(`❌ Ошибка пуша ${userId}:`, error.message);
    return false;
  }
}

async function sendDayBeforeShiftPush(bot, userId, tasks) {
  const data = loadData();
  const settings = data.pushSettings?.[userId];
  if (!settings?.notifications?.dayBeforeShift) return false;
  
  const template = settings.templates?.dayBeforeShift || 
    data.defaultTemplates?.dayBeforeShift ||
    '🔔 Завтра твоя смена!\n\nЗадачи:\n{tasks}';
  const tasksText = tasks.map((t, i) => `${i + 1}. ${t}`).join('\n');
  return sendPush(bot, userId, template.replace('{tasks}', tasksText), 'dayBeforeShift');
}

async function sendPersonalTasksPush(bot, userId, tasks) {
  const data = loadData();
  const settings = data.pushSettings?.[userId];
  if (!settings?.notifications?.personalTasks) return false;
  
  const template = settings.templates?.personalTasks ||
    data.defaultTemplates?.personalTasks ||
    '📬 Твои задачи на сегодня:\n\n{tasks}';
  const tasksText = tasks.map(t => 
    `📌 ${t.title}\n👤 ${t.assignedBy || '—'}\n⏰ ${t.deadline || '—'}\n📝 ${t.context || ''}`
  ).join('\n\n');
  return sendPush(bot, userId, template.replace('{tasks}', tasksText), 'personalTasks');
}

async function sendCloseShiftPush(bot, userId) {
  const data = loadData();
  const settings = data.pushSettings?.[userId];
  if (!settings?.notifications?.closeShiftReminder) return false;
  
  const template = settings.templates?.closeShiftReminder ||
    data.defaultTemplates?.closeShiftReminder ||
    '⏰ Пора закрывать смену!\n\n✅ Чек-лист:\n• Пересчитать кассу\n• Убраться\n• Сдать отчёт\n• Закрыть бар';
  return sendPush(bot, userId, template, 'closeShiftReminder');
}

async function sendIndividualPush(bot, userId, message) {
  const data = loadData();
  const settings = data.pushSettings?.[userId];
  if (!settings?.notifications?.individualTasks) return false;
  return sendPush(bot, userId, message, 'individualTasks');
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

function getPushLogs(limit = 100) {
  const data = loadData();
  return (data.pushLogs || []).slice(0, limit);
}

module.exports = {
  sendPush, sendDayBeforeShiftPush, sendPersonalTasksPush,
  sendCloseShiftPush, sendIndividualPush,
  updatePushSettings, getPushSettings, getAllPushSettings, getPushLogs
};
