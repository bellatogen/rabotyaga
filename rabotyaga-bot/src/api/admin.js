const express = require('express');
const pushSender = require('../push/sender');

// Factory: принимает ссылку на in-memory data + saveData из server.js.
// Устраняет race condition: раньше admin.js читал/писал data.json напрямую,
// а server.js мог затереть изменения своим debounce-флашом.
module.exports = function makeAdminRouter(data, saveData) {
  const router = express.Router();

  // Привязки + настройки пушей по пользователям
  router.get('/employees', (req, res) => {
    res.json({ success: true, bindings: data.bindings || {}, pushSettings: data.pushSettings || {} });
  });

  router.delete('/employees/:name', (req, res) => {
    const name = req.params.name;
    if (data.bindings && data.bindings[name]) {
      const telegramId = data.bindings[name];
      delete data.bindings[name];
      if (data.pushSettings && data.pushSettings[telegramId]) {
        delete data.pushSettings[telegramId];
      }
      saveData();
      return res.json({ success: true });
    }
    res.status(404).json({ error: 'Сотрудник не найден' });
  });

  // Настройки пушей (вкл/выкл) per user
  router.get('/push-settings', (req, res) => {
    res.json({ success: true, settings: data.pushSettings || {} });
  });

  router.post('/push-settings', (req, res) => {
    const { userId, settings } = req.body;
    if (!data.pushSettings) data.pushSettings = {};
    data.pushSettings[userId] = { ...data.pushSettings[userId], ...settings };
    saveData();
    res.json({ success: true });
  });

  // Шаблоны пушей по умолчанию
  router.get('/default-templates', (req, res) => {
    const hardcoded = {
      dayBeforeShift:     '🔔 Завтра твоя смена!\n\nЗадачи:\n{tasks}',
      personalTasks:      '📬 Твои задачи на сегодня:\n\n{tasks}',
      closeShiftReminder: '⏰ Пора закрывать смену!\n\n✅ Чек-лист:\n• Пересчитать кассу\n• Убраться\n• Сдать отчёт\n• Закрыть бар',
    };
    // data.defaultTemplates переопределяет хардкод (POST-сохранения выживают после релоада)
    const templates = { ...hardcoded, ...(data.defaultTemplates || {}) };
    res.json({ success: true, templates });
  });

  router.post('/default-templates', (req, res) => {
    const templates = req.body.templates;
    data.defaultTemplates = { ...(data.defaultTemplates || {}), ...templates };
    saveData();
    res.json({ success: true });
  });

  // Расписание пушей (время и включённость)
  router.get('/schedule', (req, res) => {
    const defaults = {
      dayBeforeShift:     { time: '20:00', enabled: true },
      personalTasks:      { time: '09:00', enabled: true },
      closeShiftReminder: { time: '22:00', enabled: true },
    };
    res.json({ success: true, schedule: { ...defaults, ...(data.schedule || {}) } });
  });

  router.post('/schedule', (req, res) => {
    const schedule = req.body.schedule;
    data.schedule = { ...(data.schedule || {}), ...schedule };
    saveData();
    res.json({ success: true });
  });

  // Логи пушей (из push-log.json через sender)
  router.get('/push-logs', (req, res) => {
    const logs = pushSender.getPushLogs ? pushSender.getPushLogs(100) : [];
    res.json({ success: true, logs });
  });

  return router;
};
