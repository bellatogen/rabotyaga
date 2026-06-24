// scheduler.js — принимает in-memory data и sender из server.js.
// Убраны прямые чтения data.json — теперь работает только с объектом data из памяти.
const iiko = require('../api/iiko');

function todayStr() {
  return new Date().toISOString().slice(0, 10);
}

function tomorrowStr() {
  const d = new Date();
  d.setDate(d.getDate() + 1);
  return d.toISOString().slice(0, 10);
}

function isToday(task, ds) {
  if (task.kind === 'irregular') return false;
  if (task.from  && ds < task.from)  return false;
  if (task.until && ds > task.until) return false;
  if (task.repeat === 'once') return task.date === ds;
  if (['daily', 'opening', 'closing'].includes(task.repeat)) return true;
  if (task.repeat === 'workday') { const d = new Date(ds).getDay(); return d !== 0 && d !== 6; }
  if (task.repeat === 'weekly') return task.dayOfWeek === new Date(ds).getDay();
  return false;
}

function timeToMinutes(timeStr) {
  const [h, m] = (timeStr || '00:00').split(':').map(Number);
  return h * 60 + m;
}

// ── Макросы рассылки ──
const WEEKDAYS_RU = ['Воскресенье', 'Понедельник', 'Вторник', 'Среда', 'Четверг', 'Пятница', 'Суббота'];

// Номер недели по ISO 8601 (неделя начинается с понедельника).
function isoWeekNumber(d) {
  const date = new Date(Date.UTC(d.getFullYear(), d.getMonth(), d.getDate()));
  const dayNum = (date.getUTCDay() + 6) % 7;
  date.setUTCDate(date.getUTCDate() - dayNum + 3);
  const firstThursday = new Date(Date.UTC(date.getUTCFullYear(), 0, 4));
  const ftDayNum = (firstThursday.getUTCDay() + 6) % 7;
  firstThursday.setUTCDate(firstThursday.getUTCDate() - ftDayNum + 3);
  return 1 + Math.round((date - firstThursday) / (7 * 24 * 3600 * 1000));
}

// Подстановка переменных: {{дата}}, {{день_недели}}, {{неделя}}/{{неделя_номер}}.
function renderMacroTemplate(tpl, now) {
  const dd = String(now.getDate()).padStart(2, '0');
  const mm = String(now.getMonth() + 1).padStart(2, '0');
  const yyyy = now.getFullYear();
  const wk = String(isoWeekNumber(now));
  return String(tpl || '')
    .replace(/\{\{дата\}\}/g, `${dd}.${mm}.${yyyy}`)
    .replace(/\{\{день_недели\}\}/g, WEEKDAYS_RU[now.getDay()])
    .replace(/\{\{неделя_номер\}\}/g, wk)
    .replace(/\{\{неделя\}\}/g, wk);
}

function daysBetween(fromStr, toStr) {
  const a = new Date(fromStr + 'T00:00:00');
  const b = new Date(toStr + 'T00:00:00');
  return Math.round((b - a) / (24 * 3600 * 1000));
}

// Сработал ли макрос сейчас: совпала минута, не было запуска сегодня, и тип расписания подходит.
function macroDue(macro, now, today) {
  if (!macro.active) return false;
  const sc = macro.schedule || {};
  if (!sc.time) return false;
  const cur = now.getHours() * 60 + now.getMinutes();
  if (cur !== timeToMinutes(sc.time)) return false;
  if (macro.lastRunDate === today) return false; // уже сегодня отправлено
  switch (sc.type) {
    case 'once':   return sc.runDate === today;
    case 'daily':  return true;
    case 'weekly': return Number(sc.weekday) === now.getDay();
    case 'every_n': {
      const n = Number(sc.interval) || 1;
      if (!macro.lastRunDate) return true; // первый запуск
      return daysBetween(macro.lastRunDate, today) >= n;
    }
    default: return false;
  }
}

// Тик макросов — вызывается каждую минуту из основного тика.
// Для каждого активного макроса, чьё время совпало, рендерит шаблон и шлёт в чат.
async function tickMacros(bot, data, saveData) {
  let macros;
  try { macros = JSON.parse(data.kv?.['bot_macros:v1'] || '[]'); } catch { return; }
  if (!Array.isArray(macros) || !macros.length) return;
  const now = new Date();
  const today = todayStr();
  let changed = false;
  for (const macro of macros) {
    if (!macroDue(macro, now, today)) continue;
    if (!macro.chatId) continue;
    const text = renderMacroTemplate(macro.template, now);
    try {
      await bot.telegram.sendMessage(String(macro.chatId), text);
      console.log(`📨 Макрос «${macro.name}» отправлен в чат ${macro.chatId}`);
    } catch (e) {
      console.error(`❌ Ошибка макроса «${macro.name}» (чат ${macro.chatId}):`, e.message);
    }
    // Дедуп даже при ошибке — чтобы не ретраить каждые 30 секунд в течение минуты.
    macro.lastRunDate = today;
    changed = true;
  }
  if (changed) {
    data.kv['bot_macros:v1'] = JSON.stringify(macros);
    if (typeof saveData === 'function') saveData();
  }
}

// ── Настройки пушей (push_settings:v1) ──
// Дефолты времени/включённости. shiftClose = 23:00 (раньше пуш уходил в час ночи
// из-за дефолта 22:00 + UTC-сервера — теперь время задаётся явно через KV).
const DEFAULT_PUSH_SETTINGS = {
  jobs: {
    dayBefore:     { enabled: true, time: '20:00' },
    personalTasks: { enabled: true, time: '09:00' },
    shiftClose:    { enabled: true, time: '23:00' },
    setsRecommend: { enabled: true, time: '16:00' },
  },
  templates: { dayBefore: '', personalTasks: '', shiftClose: '', setsRecommend: '' },
};
const PUSH_JOB_KEYS = ['dayBefore', 'personalTasks', 'shiftClose', 'setsRecommend'];

// Кэш настроек с TTL 60с — чтобы не парсить KV на каждом тике (раз в 30с).
let _psCache = null;
let _psCacheAt = 0;

function getPushSettings(data) {
  const now = Date.now();
  if (_psCache && now - _psCacheAt < 60000) return _psCache;
  let parsed = {};
  try { parsed = JSON.parse(data.kv?.['push_settings:v1'] || '{}'); } catch { parsed = {}; }
  const jobsIn = parsed.jobs || {};
  const tplIn  = parsed.templates || {};
  const jobs = {};
  for (const k of PUSH_JOB_KEYS) jobs[k] = { ...DEFAULT_PUSH_SETTINGS.jobs[k], ...(jobsIn[k] || {}) };
  _psCache = { jobs, templates: { ...DEFAULT_PUSH_SETTINGS.templates, ...tplIn } };
  _psCacheAt = now;
  return _psCache;
}

async function sendDayBeforeShiftPushes(bot, data, sender, template) {
  const tasks = JSON.parse(data.kv?.['tasks:v4'] || '[]');
  const tomorrow = tomorrowStr();
  const tomorrowTasks = tasks.filter(t => !t.archived && isToday(t, tomorrow));
  if (!tomorrowTasks.length) return;
  const taskTitles = tomorrowTasks.map(t => t.title);
  for (const [userId, settings] of Object.entries(data.pushSettings || {})) {
    if (!settings.enabled || !settings.notifications?.dayBeforeShift) continue;
    await sender.sendDayBeforeShiftPush(bot, userId, taskTitles, template);
  }
}

async function sendPersonalTasksPushes(bot, data, sender, template) {
  const tasks = JSON.parse(data.kv?.['tasks:v4'] || '[]');
  const today = todayStr();
  // Ключ — имя пользователя (assignedTo), значение — массив задач
  const userTasks = {};
  tasks.forEach(t => {
    if (!t.archived && t.assignedTo && isToday(t, today)) {
      if (!userTasks[t.assignedTo]) userTasks[t.assignedTo] = [];
      userTasks[t.assignedTo].push({
        title:      t.title,
        assignedBy: t.createdBy || '—',
        deadline:   t.dueDate   || t.deadline || '—',
        context:    t.notes     || '',
      });
    }
  });
  // Матчим имя → userId через bindings
  const nameToId = {};
  for (const [name, uid] of Object.entries(data.bindings || {})) nameToId[name] = String(uid);

  for (const [userId, settings] of Object.entries(data.pushSettings || {})) {
    if (!settings.enabled || !settings.notifications?.personalTasks) continue;
    // Ищем имя по userId в bindings
    const name = Object.keys(data.bindings || {}).find(n => String(data.bindings[n]) === userId);
    if (name && userTasks[name]?.length > 0) {
      await sender.sendPersonalTasksPush(bot, userId, userTasks[name], template);
    }
  }
}

async function sendCloseShiftPushes(bot, data, sender, template) {
  for (const [userId, settings] of Object.entries(data.pushSettings || {})) {
    if (!settings.enabled || !settings.notifications?.closeShiftReminder) continue;
    await sender.sendCloseShiftPush(bot, userId, template);
  }
}

// «Сэты дня» — топ-3 пары напиток+закуска (из кэша basket, обновляется раз в 20ч).
async function sendSetsPushes(bot, data, sender, template) {
  let result;
  try {
    // saveData no-op: кэш пишется в data.kv (в памяти), на диск сохранит server при следующей записи
    result = await iiko.getBasketPairs(data, () => {});
  } catch (e) {
    console.warn('[sets] не удалось получить корзину:', e.message);
    return;
  }
  const sets = iiko.pickDailySets(result, 3);
  if (!sets.length) return;
  for (const [userId, settings] of Object.entries(data.pushSettings || {})) {
    if (!settings.enabled) continue;
    await sender.sendSetsPush(bot, userId, sets, template);
  }
}

function startScheduler(bot, data, sender, saveData) {
  console.log('⏰ Планировщик пушей запущен');

  // Отслеживаем что уже отправлено сегодня (чтобы не дублировать)
  const sentToday = { dayBefore: null, personalTasks: null, shiftClose: null, setsRecommend: null };

  setInterval(async () => {
    const now = new Date();
    const currentMinutes = now.getHours() * 60 + now.getMinutes();
    const today = todayStr();
    const { jobs, templates } = getPushSettings(data);

    // Сбрасываем счётчик в полночь
    if (currentMinutes === 0) {
      sentToday.dayBefore = null;
      sentToday.personalTasks = null;
      sentToday.shiftClose = null;
      sentToday.setsRecommend = null;
    }

    if (jobs.dayBefore.enabled !== false) {
      const t = timeToMinutes(jobs.dayBefore.time || '20:00');
      if (currentMinutes === t && sentToday.dayBefore !== today) {
        console.log('📅 Отправка пушей "За сутки до смены"');
        await sendDayBeforeShiftPushes(bot, data, sender, templates.dayBefore);
        sentToday.dayBefore = today;
      }
    }

    if (jobs.personalTasks.enabled !== false) {
      const t = timeToMinutes(jobs.personalTasks.time || '09:00');
      if (currentMinutes === t && sentToday.personalTasks !== today) {
        console.log('📬 Отправка личных задач');
        await sendPersonalTasksPushes(bot, data, sender, templates.personalTasks);
        sentToday.personalTasks = today;
      }
    }

    if (jobs.shiftClose.enabled !== false) {
      const t = timeToMinutes(jobs.shiftClose.time || '23:00');
      if (currentMinutes === t && sentToday.shiftClose !== today) {
        console.log('⏰ Отправка напоминания о закрытии смены');
        await sendCloseShiftPushes(bot, data, sender, templates.shiftClose);
        sentToday.shiftClose = today;
      }
    }

    if (jobs.setsRecommend.enabled !== false) {
      const t = timeToMinutes(jobs.setsRecommend.time || '16:00');
      if (currentMinutes === t && sentToday.setsRecommend !== today) {
        console.log('🍻 Отправка «Сэты дня»');
        await sendSetsPushes(bot, data, sender, templates.setsRecommend);
        sentToday.setsRecommend = today;
      }
    }

    // Макросы рассылки — собственный дедуп по lastRunDate внутри tickMacros.
    try { await tickMacros(bot, data, saveData); } catch (e) { console.error('[macros] tick error:', e.message); }
  }, 30000); // каждые 30 секунд
}

module.exports = {
  startScheduler,
  sendDayBeforeShiftPushes,
  sendPersonalTasksPushes,
  sendCloseShiftPushes,
  sendSetsPushes,
  tickMacros,
  renderMacroTemplate,
  isoWeekNumber,
};
