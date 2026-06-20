const fs = require('fs');
const path = require('path');
const sender = require('./sender');

const DATA_FILE = path.join(__dirname, '../../data.json');

function loadData() {
  if (fs.existsSync(DATA_FILE)) {
    return JSON.parse(fs.readFileSync(DATA_FILE, 'utf8'));
  }
  return { kv: {}, bindings: {}, pushSettings: {} };
}

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
  if (task.from && ds < task.from) return false;
  if (task.until && ds > task.until) return false;
  if (task.repeat === 'once') return task.date === ds;
  if (['daily', 'opening', 'closing'].includes(task.repeat)) return true;
  if (task.repeat === 'workday') { const d = new Date(ds).getDay(); return d !== 0 && d !== 6; }
  if (task.repeat === 'weekly') return task.dayOfWeek === new Date(ds).getDay();
  return false;
}

function getSchedule() {
  const data = loadData();
  return data.schedule || {
    dayBeforeShift: { time: '20:00', enabled: true },
    personalTasks: { time: '09:00', enabled: true },
    closeShiftReminder: { time: '22:00', enabled: true }
  };
}

function timeToMinutes(timeStr) {
  const [h, m] = timeStr.split(':').map(Number);
  return h * 60 + m;
}

async function sendDayBeforeShiftPushes(bot) {
  const data = loadData();
  const tasks = JSON.parse(data.kv['tasks:v4'] || '[]');
  const tomorrow = tomorrowStr();
  const tomorrowTasks = tasks.filter(t => !t.archived && isToday(t, tomorrow));
  if (!tomorrowTasks.length) return;
  const taskTitles = tomorrowTasks.map(t => t.title);
  for (const [userId, settings] of Object.entries(data.pushSettings || {})) {
    if (!settings.enabled || !settings.notifications?.dayBeforeShift) continue;
    await sender.sendDayBeforeShiftPush(bot, userId, taskTitles);
  }
}

async function sendPersonalTasksPushes(bot) {
  const data = loadData();
  const tasks = JSON.parse(data.kv['tasks:v4'] || '[]');
  const today = todayStr();
  const userTasks = {};
  tasks.forEach(t => {
    if (!t.archived && t.assignedTo && isToday(t, today)) {
      if (!userTasks[t.assignedTo]) userTasks[t.assignedTo] = [];
      userTasks[t.assignedTo].push({
        title: t.title,
        assignedBy: t.createdBy || '—',
        deadline: t.deadline || '—',
        context: t.context || ''
      });
    }
  });
  for (const [userId, settings] of Object.entries(data.pushSettings || {})) {
    if (!settings.enabled || !settings.notifications?.personalTasks) continue;
    if (userTasks[userId]?.length > 0) {
      await sender.sendPersonalTasksPush(bot, userId, userTasks[userId]);
    }
  }
}

async function sendCloseShiftPushes(bot) {
  const data = loadData();
  for (const [userId, settings] of Object.entries(data.pushSettings || {})) {
    if (!settings.enabled || !settings.notifications?.closeShiftReminder) continue;
    await sender.sendCloseShiftPush(bot, userId);
  }
}

function startScheduler(bot) {
  console.log('⏰ Планировщик пушей запущен');
  
  // Отслеживаем что уже отправлено сегодня (чтобы не дублировать)
  const sentToday = { dayBeforeShift: null, personalTasks: null, closeShiftReminder: null };
  
  setInterval(async () => {
    const now = new Date();
    const currentMinutes = now.getHours() * 60 + now.getMinutes();
    const today = todayStr();
    const schedule = getSchedule();
    
    // Сбрасываем счётчик в полночь
    if (currentMinutes === 0) {
      sentToday.dayBeforeShift = null;
      sentToday.personalTasks = null;
      sentToday.closeShiftReminder = null;
    }
    
    // За сутки до смены
    if (schedule.dayBeforeShift?.enabled !== false) {
      const targetTime = timeToMinutes(schedule.dayBeforeShift?.time || '20:00');
      if (currentMinutes === targetTime && sentToday.dayBeforeShift !== today) {
        console.log('📅 Отправка пушей "За сутки до смены"');
        await sendDayBeforeShiftPushes(bot);
        sentToday.dayBeforeShift = today;
      }
    }
    
    // Личные задачи
    if (schedule.personalTasks?.enabled !== false) {
      const targetTime = timeToMinutes(schedule.personalTasks?.time || '09:00');
      if (currentMinutes === targetTime && sentToday.personalTasks !== today) {
        console.log('📬 Отправка личных задач');
        await sendPersonalTasksPushes(bot);
        sentToday.personalTasks = today;
      }
    }
    
    // Закрытие смены
    if (schedule.closeShiftReminder?.enabled !== false) {
      const targetTime = timeToMinutes(schedule.closeShiftReminder?.time || '22:00');
      if (currentMinutes === targetTime && sentToday.closeShiftReminder !== today) {
        console.log('⏰ Отправка напоминания о закрытии смены');
        await sendCloseShiftPushes(bot);
        sentToday.closeShiftReminder = today;
      }
    }
  }, 30000); // Проверяем каждые 30 секунд
}

module.exports = { startScheduler, sendDayBeforeShiftPushes, sendPersonalTasksPushes, sendCloseShiftPushes };
