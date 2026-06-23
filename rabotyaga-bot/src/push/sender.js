// sender.js — factory: принимает in-memory data + saveData из server.js.
// Устраняет race condition: раньше sender читал/писал data.json напрямую,
// теперь работает с объектом data из памяти сервера.
// Лог пишется в push-log.json (отдельный append-файл, читается /api/push/stats).
const fs   = require('fs');
const path = require('path');

const LOG_FILE = path.join(__dirname, '../../push-log.json');

function readLog() {
  if (!fs.existsSync(LOG_FILE)) return [];
  try { return JSON.parse(fs.readFileSync(LOG_FILE, 'utf8')); } catch { return []; }
}

module.exports = function makeSender(data, saveData) {

  // Пишем запись в push-log.json с форматом, который ждёт /api/push/stats:
  // { userId, userName, type, status: 'sent'|'failed'|'skipped', error?, ts }
  function log(userId, userName, type, status, error = null) {
    const logs = readLog();
    const entry = { userId, userName, type, status, ts: new Date().toISOString() };
    if (error) entry.error = error;
    logs.unshift(entry);
    if (logs.length > 500) logs.length = 500;
    try { fs.writeFileSync(LOG_FILE, JSON.stringify(logs, null, 2)); } catch {}
  }

  // Отправить пуш с ретраем до 3 раз (линейный backoff 1s·attempt).
  // 403 = пользователь заблокировал бота — не ретраить.
  async function sendPush(bot, userId, message, type = 'test') {
    const settings = data.pushSettings?.[userId];
    const userName = Object.keys(data.bindings || {}).find(n => data.bindings[n] == userId) || null;

    if (!settings?.enabled || !settings?.chatId) {
      log(userId, userName, type, 'skipped', 'Пуши отключены');
      return false;
    }

    let lastErr;
    for (let attempt = 1; attempt <= 3; attempt++) {
      try {
        await bot.telegram.sendMessage(settings.chatId, message, { parse_mode: 'HTML' });
        log(userId, userName, type, 'sent');
        console.log(`✅ Пуш отправлен ${userId} (${type})`);
        return true;
      } catch (err) {
        lastErr = err;
        // 403 = навсегда заблокирован — не ретраить
        if (err.response?.error_code === 403) break;
        if (attempt < 3) await new Promise(r => setTimeout(r, 1000 * attempt));
      }
    }
    log(userId, userName, type, 'failed', lastErr.message);
    console.error(`❌ Ошибка пуша ${userId} (${type}):`, lastErr.message);
    return false;
  }

  async function sendDayBeforeShiftPush(bot, userId, tasks) {
    if (!data.pushSettings?.[userId]?.notifications?.dayBeforeShift) return false;
    const s = data.pushSettings[userId];
    const template = s.templates?.dayBeforeShift ||
      data.defaultTemplates?.dayBeforeShift ||
      '🔔 Завтра твоя смена!\n\nЗадачи:\n{tasks}';
    const tasksText = tasks.map((t, i) => `${i + 1}. ${t}`).join('\n');
    return sendPush(bot, userId, template.replace('{tasks}', tasksText), 'dayBeforeShift');
  }

  async function sendPersonalTasksPush(bot, userId, tasks) {
    if (!data.pushSettings?.[userId]?.notifications?.personalTasks) return false;
    const s = data.pushSettings[userId];
    const template = s.templates?.personalTasks ||
      data.defaultTemplates?.personalTasks ||
      '📬 Твои задачи на сегодня:\n\n{tasks}';
    const tasksText = tasks.map(t =>
      `📌 ${t.title}\n👤 ${t.assignedBy || '—'}\n⏰ ${t.deadline || '—'}\n📝 ${t.context || ''}`
    ).join('\n\n');
    return sendPush(bot, userId, template.replace('{tasks}', tasksText), 'personalTasks');
  }

  async function sendCloseShiftPush(bot, userId) {
    if (!data.pushSettings?.[userId]?.notifications?.closeShiftReminder) return false;
    const s = data.pushSettings[userId];
    const template = s.templates?.closeShiftReminder ||
      data.defaultTemplates?.closeShiftReminder ||
      '⏰ Пора закрывать смену!\n\n✅ Чек-лист:\n• Пересчитать кассу\n• Убраться\n• Сдать отчёт\n• Закрыть бар';
    return sendPush(bot, userId, template, 'closeShiftReminder');
  }

  async function sendIndividualPush(bot, userId, message) {
    if (!data.pushSettings?.[userId]?.notifications?.individualTasks) return false;
    return sendPush(bot, userId, message, 'individualTasks');
  }

  // Запись настроек через in-memory data (без прямого обращения к диску)
  function updatePushSettings(userId, settings) {
    if (!data.pushSettings) data.pushSettings = {};
    data.pushSettings[userId] = { ...data.pushSettings[userId], ...settings };
    saveData();
  }

  function getPushSettings(userId) {
    return data.pushSettings?.[userId] || null;
  }

  function getAllPushSettings() {
    return data.pushSettings || {};
  }

  return {
    sendPush, sendDayBeforeShiftPush, sendPersonalTasksPush,
    sendCloseShiftPush, sendIndividualPush,
    updatePushSettings, getPushSettings, getAllPushSettings,
  };
};
