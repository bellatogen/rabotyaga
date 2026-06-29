const express = require('express');

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

  // Расписание и логи пушей перенесены в push:v1 (Item 5):
  //   • расписание → push:v1.defs[*].schedule (GET/PUT /api/push/defs);
  //   • логи       → push-log.json (GET /api/push/stats).
  // Старые роуты /schedule и /push-logs (мёртвый getPushLogs, устаревший data.schedule) удалены.

  return router;
};
