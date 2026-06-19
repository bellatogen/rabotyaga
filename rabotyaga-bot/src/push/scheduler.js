const sender = require('./sender');
const fs = require('fs');
const path = require('path');




const DATA_FILE = path.join(__dirname, '../../data.json');




function loadData() {
  if (fs.existsSync(DATA_FILE)) {
    return JSON.parse(fs.readFileSync(DATA_FILE, 'utf8'));
  }
  return {};
}




function todayStr() {
  return new Date().toISOString().slice(0, 10);
}




// За сутки до смены (проверяем есть ли смена завтра)
async function sendDayBeforeShiftPushes(bot) {
  const data = loadData();
  const settings = data.pushSettings || {};
  
  for (const [userId, userSettings] of Object.entries(settings)) {
    if (!userSettings.enabled || !userSettings.notifications?.dayBeforeShift) continue;
    
    // TODO: здесь должна быть логика проверки графика смен
    // Пока просто отправляем всем включившим
    const tasks = ['Открыть бар', 'Принять товар', 'Подготовить зал'];
    await sender.sendDayBeforeShiftPush(bot, userId, tasks);
  }
}




// Личные задачи
async function sendPersonalTasksPushes(bot) {
  const data = loadData();
  const settings = data.pushSettings || {};
  const tasksData = JSON.parse(data.kv?.['tasks:v4'] || '[]');
  
  for (const [userId, userSettings] of Object.entries(settings)) {
    if (!userSettings.enabled || !userSettings.notifications?.personalTasks) continue;
    
    const userTasks = tasksData.filter(t => t.assignedTo === userId && !t.done);
    if (userTasks.length > 0) {
      await sender.sendPersonalTasksPush(bot, userId, userTasks);
    }
  }
}




// Напоминание о закрытии смены (в 22:00)
async function sendCloseShiftPushes(bot) {
  const data = loadData();
  const settings = data.pushSettings || {};
  
  for (const [userId, userSettings] of Object.entries(settings)) {
    if (!userSettings.enabled || !userSettings.notifications?.closeShiftReminder) continue;
    await sender.sendCloseShiftPush(bot, userId);
  }
}




// Запускаем планировщик
function startScheduler(bot) {
  console.log('⏰ Планировщик пушей запущен');
  
  // Каждый день в 20:00 - пуш за сутки до смены
  setInterval(() => {
    const now = new Date();
    if (now.getHours() === 20 && now.getMinutes() === 0) {
      sendDayBeforeShiftPushes(bot);
    }
  }, 60000); // Проверяем каждую минуту
  
  // Каждый день в 09:00 - личные задачи
  setInterval(() => {
    const now = new Date();
    if (now.getHours() === 9 && now.getMinutes() === 0) {
      sendPersonalTasksPushes(bot);
    }
  }, 60000);
  
  // Каждый день в 22:00 - закрытие смены
  setInterval(() => {
    const now = new Date();
    if (now.getHours() === 22 && now.getMinutes() === 0) {
      sendCloseShiftPushes(bot);
    }
  }, 60000);
}




module.exports = { startScheduler };
