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

// За сутки до смены - отправляем задачи на завтра
async function sendDayBeforeShiftPushes(bot) {
  const data = loadData();
  const tasks = JSON.parse(data.kv['tasks:v4'] || '[]');
  const tomorrow = tomorrowStr();
  
  // Находим задачи на завтра
  const tomorrowTasks = tasks.filter(t => !t.archived && isToday(t, tomorrow));
  if (!tomorrowTasks.length) return;
  
  const taskTitles = tomorrowTasks.map(t => t.title);
  
  // Отправляем всем у кого включены пуши
  for (const [userId, settings] of Object.entries(data.pushSettings || {})) {
    if (!settings.enabled || !settings.notifications?.dayBeforeShift) continue;
    await sender.sendDayBeforeShiftPush(bot, userId, taskTitles);
  }
}

// Личные задачи - отправляем задачи назначенные пользователю
async function sendPersonalTasksPushes(bot) {
  const data = loadData();
  const tasks = JSON.parse(data.kv['tasks:v4'] || '[]');
  const today = todayStr();
  
  // Группируем задачи по назначенным
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
  
  // Отправляем каждому пользователю его задачи
  for (const [userId, settings] of Object.entries(data.pushSettings || {})) {
    if (!settings.enabled || !settings.notifications?.personalTasks) continue;
    if (userTasks[userId]?.length > 0) {
      await sender.sendPersonalTasksPush(bot, userId, userTasks[userId]);
    }
  }
}

// Напоминание о закрытии смены
async function sendCloseShiftPushes(bot) {
  const data = loadData();
  
  for (const [userId, settings] of Object.entries(data.pushSettings || {})) {
    if (!settings.enabled || !settings.notifications?.closeShiftReminder) continue;
    await sender.sendCloseShiftPush(bot, userId);
  }
}

// Запускаем планировщик
function startScheduler(bot) {
  console.log('⏰ Планировщик пушей запущен');
  
  // Проверяем каждую минуту
  setInterval(async () => {
    const now = new Date();
    const hour = now.getHours();
    const minute = now.getMinutes();
    
    // В 20:00 - пуш за сутки до смены
    if (hour === 20 && minute === 0) {
      console.log('📅 Отправка пушей "За сутки до смены"');
      await sendDayBeforeShiftPushes(bot);
    }
    
    // В 09:00 - личные задачи
    if (hour === 9 && minute === 0) {
      console.log('📬 Отправка личных задач');
      await sendPersonalTasksPushes(bot);
    }
    
    // В 22:00 - закрытие смены
    if (hour === 22 && minute === 0) {
      console.log('⏰ Отправка напоминания о закрытии смены');
      await sendCloseShiftPushes(bot);
    }
  }, 60000);
}

module.exports = { startScheduler, sendDayBeforeShiftPushes, sendPersonalTasksPushes, sendCloseShiftPushes };
