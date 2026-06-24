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

// Подстановка переменных в шаблоне: {{имя}}, {{дата}}, {{день_недели}}.
// Дата/день считаются в PUSH_TZ (дефолт Москва), а не в локали сервера (UTC на хостинге).
const PUSH_TZ = process.env.PUSH_TZ || 'Europe/Moscow';
const WEEKDAYS_RU = ['Воскресенье', 'Понедельник', 'Вторник', 'Среда', 'Четверг', 'Пятница', 'Суббота'];
const WD_FROM_EN = { Sun: 0, Mon: 1, Tue: 2, Wed: 3, Thu: 4, Fri: 5, Sat: 6 };
function substVars(tpl, userName) {
  const fmt = new Intl.DateTimeFormat('en-CA', {
    timeZone: PUSH_TZ,
    year: 'numeric', month: '2-digit', day: '2-digit', weekday: 'short',
  });
  const p = {};
  for (const part of fmt.formatToParts(new Date())) p[part.type] = part.value;
  const wd = WEEKDAYS_RU[WD_FROM_EN[p.weekday] ?? 0];
  return String(tpl || '')
    .replace(/\{\{имя\}\}/g, userName || '')
    .replace(/\{\{дата\}\}/g, `${p.day}.${p.month}.${p.year}`)
    .replace(/\{\{день_недели\}\}/g, wd);
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

  async function sendDayBeforeShiftPush(bot, userId, tasks, globalTemplate) {
    if (!data.pushSettings?.[userId]?.notifications?.dayBeforeShift) return false;
    const s = data.pushSettings[userId];
    const userName = Object.keys(data.bindings || {}).find(n => data.bindings[n] == userId) || '';
    const template = (globalTemplate && globalTemplate.trim()) ||
      s.templates?.dayBeforeShift ||
      data.defaultTemplates?.dayBeforeShift ||
      '🔔 Завтра твоя смена!\n\nЗадачи:\n{tasks}';
    const tasksText = tasks.map((t, i) => `${i + 1}. ${t}`).join('\n');
    return sendPush(bot, userId, substVars(template, userName).replace('{tasks}', tasksText), 'dayBeforeShift');
  }

  async function sendPersonalTasksPush(bot, userId, tasks, globalTemplate) {
    if (!data.pushSettings?.[userId]?.notifications?.personalTasks) return false;
    const s = data.pushSettings[userId];
    const userName = Object.keys(data.bindings || {}).find(n => data.bindings[n] == userId) || '';
    const template = (globalTemplate && globalTemplate.trim()) ||
      s.templates?.personalTasks ||
      data.defaultTemplates?.personalTasks ||
      '📬 Твои задачи на сегодня:\n\n{tasks}';
    const tasksText = tasks.map(t =>
      `📌 ${t.title}\n👤 ${t.assignedBy || '—'}\n⏰ ${t.deadline || '—'}\n📝 ${t.context || ''}`
    ).join('\n\n');
    return sendPush(bot, userId, substVars(template, userName).replace('{tasks}', tasksText), 'personalTasks');
  }

  async function sendCloseShiftPush(bot, userId, globalTemplate) {
    if (!data.pushSettings?.[userId]?.notifications?.closeShiftReminder) return false;
    const s = data.pushSettings[userId];
    const userName = Object.keys(data.bindings || {}).find(n => data.bindings[n] == userId) || '';
    const template = (globalTemplate && globalTemplate.trim()) ||
      s.templates?.closeShiftReminder ||
      data.defaultTemplates?.closeShiftReminder ||
      '⏰ Пора закрывать смену!\n\n✅ Чек-лист:\n• Пересчитать кассу\n• Убраться\n• Сдать отчёт\n• Закрыть бар';
    return sendPush(bot, userId, substVars(template, userName), 'closeShiftReminder');
  }

  // «Сэты дня» — топ-3 пары напиток+закуска перед сменой.
  // Opt-out: шлём всем с включёнными пушами, кроме явно отписавшихся.
  async function sendSetsPush(bot, userId, sets, globalTemplate) {
    if (data.pushSettings?.[userId]?.notifications?.setRecommendations === false) return false;
    const s = data.pushSettings?.[userId];
    const userName = Object.keys(data.bindings || {}).find(n => data.bindings[n] == userId) || '';
    const template = (globalTemplate && globalTemplate.trim()) ||
      s?.templates?.setRecommendations ||
      data.defaultTemplates?.setRecommendations ||
      '🍻 Сэты дня — предлагай гостям:\n\n{sets}';
    const setsText = (sets || []).map((p, i) => {
      const conf = Math.max(p.confAB || 0, p.confBA || 0);
      const m = p.margin != null ? ` · маржа ~${p.margin}%` : '';
      return `${i + 1}. ${p.a} + ${p.b}\n   ${conf}% берут вместе${m}`;
    }).join('\n\n');
    return sendPush(bot, userId, substVars(template, userName).replace('{sets}', setsText), 'setRecommendations');
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

  // Уведомление управляющим о закрытии смены.
  // Шлём напрямую через bindings — без проверки pushSettings,
  // т.к. менеджер может не делать /startpush.
  async function sendShiftClosedToManagers(bot, { dateStr, done, total, revenueFact, revenuePlan, workers }) {
    let profiles = [];
    try { profiles = JSON.parse(data.kv?.['profiles:v1'] || '[]'); } catch {}

    const managers = Array.isArray(profiles) ? profiles.filter(p => p.role === 'manager') : [];
    if (!managers.length) {
      console.log('[shiftClosed] нет пользователей с ролью manager');
      return { sent: 0, failed: 0 };
    }

    // YYYY-MM-DD → DD.MM.YYYY
    const parts = String(dateStr || '').split('-');
    const dateFmt = parts.length === 3 ? `${parts[2]}.${parts[1]}.${parts[0]}` : (dateStr || '?');

    const revLine = (revenueFact != null && Number(revenueFact) > 0)
      ? `Выручка: ${Number(revenueFact).toLocaleString('ru-RU')} ₽ (план ${Number(revenuePlan || 0).toLocaleString('ru-RU')} ₽)`
      : 'Выручка: не указана';

    const workersLine = (Array.isArray(workers) && workers.length)
      ? `Смена: ${workers.join(', ')}`
      : 'Смена: не указана';

    const text = `✅ Смена закрыта — ${dateFmt}\nЗадачи: ${done}/${total}\n${revLine}\n${workersLine}`;

    let sent = 0, failed = 0;
    for (const profile of managers) {
      const chatId = data.bindings?.[profile.name];
      if (!chatId) {
        log(null, profile.name, 'shiftClosed', 'skipped', 'Telegram не привязан');
        console.log(`[shiftClosed] пропуск ${profile.name} — нет привязки Telegram`);
        continue;
      }
      try {
        await bot.telegram.sendMessage(String(chatId), text);
        log(String(chatId), profile.name, 'shiftClosed', 'sent');
        console.log(`✅ Пуш «Смена закрыта» → ${profile.name} (chatId: ${chatId})`);
        sent++;
      } catch (err) {
        log(String(chatId), profile.name, 'shiftClosed', 'failed', err.message);
        console.error(`❌ Ошибка пуша «Смена закрыта» → ${profile.name}:`, err.message);
        failed++;
      }
    }
    return { sent, failed };
  }

  return {
    sendPush, sendDayBeforeShiftPush, sendPersonalTasksPush,
    sendCloseShiftPush, sendSetsPush, sendIndividualPush,
    sendShiftClosedToManagers,
    updatePushSettings, getPushSettings, getAllPushSettings,
  };
};
