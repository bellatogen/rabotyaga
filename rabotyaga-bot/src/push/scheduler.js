// scheduler.js — принимает in-memory data и sender из server.js.
// Убраны прямые чтения data.json — теперь работает только с объектом data из памяти.

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

function getScheduleConfig(data) {
  return data.schedule || {
    dayBeforeShift:    { time: '20:00', enabled: true },
    personalTasks:     { time: '09:00', enabled: true },
    closeShiftReminder: { time: '22:00', enabled: true },
  };
}

async function sendDayBeforeShiftPushes(bot, data, sender) {
  const tasks = JSON.parse(data.kv?.['tasks:v4'] || '[]');
  const tomorrow = tomorrowStr();
  const tomorrowTasks = tasks.filter(t => !t.archived && isToday(t, tomorrow));
  if (!tomorrowTasks.length) return;
  const taskTitles = tomorrowTasks.map(t => t.title);
  for (const [userId, settings] of Object.entries(data.pushSettings || {})) {
    if (!settings.enabled || !settings.notifications?.dayBeforeShift) continue;
    await sender.sendDayBeforeShiftPush(bot, userId, taskTitles);
  }
}

async function sendPersonalTasksPushes(bot, data, sender) {
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
      await sender.sendPersonalTasksPush(bot, userId, userTasks[name]);
    }
  }
}

async function sendCloseShiftPushes(bot, data, sender) {
  for (const [userId, settings] of Object.entries(data.pushSettings || {})) {
    if (!settings.enabled || !settings.notifications?.closeShiftReminder) continue;
    await sender.sendCloseShiftPush(bot, userId);
  }
}

function startScheduler(bot, data, sender) {
  console.log('⏰ Планировщик пушей запущен');

  // Отслеживаем что уже отправлено сегодня (чтобы не дублировать)
  const sentToday = { dayBeforeShift: null, personalTasks: null, closeShiftReminder: null };

  setInterval(async () => {
    const now = new Date();
    const currentMinutes = now.getHours() * 60 + now.getMinutes();
    const today = todayStr();
    const schedule = getScheduleConfig(data);

    // Сбрасываем счётчик в полночь
    if (currentMinutes === 0) {
      sentToday.dayBeforeShift = null;
      sentToday.personalTasks = null;
      sentToday.closeShiftReminder = null;
    }

    if (schedule.dayBeforeShift?.enabled !== false) {
      const t = timeToMinutes(schedule.dayBeforeShift?.time || '20:00');
      if (currentMinutes === t && sentToday.dayBeforeShift !== today) {
        console.log('📅 Отправка пушей "За сутки до смены"');
        await sendDayBeforeShiftPushes(bot, data, sender);
        sentToday.dayBeforeShift = today;
      }
    }

    if (schedule.personalTasks?.enabled !== false) {
      const t = timeToMinutes(schedule.personalTasks?.time || '09:00');
      if (currentMinutes === t && sentToday.personalTasks !== today) {
        console.log('📬 Отправка личных задач');
        await sendPersonalTasksPushes(bot, data, sender);
        sentToday.personalTasks = today;
      }
    }

    if (schedule.closeShiftReminder?.enabled !== false) {
      const t = timeToMinutes(schedule.closeShiftReminder?.time || '22:00');
      if (currentMinutes === t && sentToday.closeShiftReminder !== today) {
        console.log('⏰ Отправка напоминания о закрытии смены');
        await sendCloseShiftPushes(bot, data, sender);
        sentToday.closeShiftReminder = today;
      }
    }
  }, 30000); // каждые 30 секунд
}

module.exports = {
  startScheduler,
  sendDayBeforeShiftPushes,
  sendPersonalTasksPushes,
  sendCloseShiftPushes,
};
