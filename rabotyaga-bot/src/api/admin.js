const express = require('express');
const router = express.Router();
const fs = require('fs');
const path = require('path');
const pushSender = require('../push/sender');

const DATA_FILE = path.join(__dirname, '../../data.json');

function loadData() {
  if (fs.existsSync(DATA_FILE)) {
    return JSON.parse(fs.readFileSync(DATA_FILE, 'utf8'));
  }
  return {};
}

function saveData(data) {
  fs.writeFileSync(DATA_FILE, JSON.stringify(data, null, 2));
}

router.get('/employees', (req, res) => {
  const data = loadData();
  res.json({ success: true, bindings: data.bindings || {}, pushSettings: data.pushSettings || {} });
});

router.delete('/employees/:name', (req, res) => {
  const name = req.params.name;
  const data = loadData();
  if (data.bindings && data.bindings[name]) {
    const telegramId = data.bindings[name];
    delete data.bindings[name];
    if (data.pushSettings && data.pushSettings[telegramId]) {
      delete data.pushSettings[telegramId];
    }
    saveData(data);
    return res.json({ success: true });
  }
  res.status(404).json({ error: 'Сотрудник не найден' });
});

router.get('/push-settings', (req, res) => {
  const data = loadData();
  res.json({ success: true, settings: data.pushSettings || {} });
});

router.post('/push-settings', (req, res) => {
  const { userId, settings } = req.body;
  const data = loadData();
  if (!data.pushSettings) data.pushSettings = {};
  data.pushSettings[userId] = { ...data.pushSettings[userId], ...settings };
  saveData(data);
  res.json({ success: true });
});

router.get('/default-templates', (req, res) => {
  const data = loadData();
  const defaults = data.defaultTemplates || {
    dayBeforeShift: '🔔 Завтра твоя смена!\n\nЗадачи:\n{tasks}',
    closeShiftReminder: '⏰ Пора закрывать смену!\n\n✅ Чек-лист:\n• Пересчитать кассу\n• Убраться\n• Сдать отчёт\n• Закрыть бар',
    personalTasks: '📬 Твои задачи на сегодня:\n\n{tasks}'
  };
  res.json({ success: true, templates: defaults });
});

router.post('/default-templates', (req, res) => {
  const templates = req.body.templates;
  const data = loadData();
  data.defaultTemplates = { ...(data.defaultTemplates || {}), ...templates };
  saveData(data);
  res.json({ success: true });
});

router.get('/schedule', (req, res) => {
  const data = loadData();
  const defaults = data.schedule || {
    dayBeforeShift: { time: '20:00', enabled: true },
    personalTasks: { time: '09:00', enabled: true },
    closeShiftReminder: { time: '22:00', enabled: true }
  };
  res.json({ success: true, schedule: defaults });
});

router.post('/schedule', (req, res) => {
  const schedule = req.body.schedule;
  const data = loadData();
  data.schedule = { ...(data.schedule || {}), ...schedule };
  saveData(data);
  res.json({ success: true });
});

router.get('/push-logs', (req, res) => {
  const logs = pushSender.getPushLogs(100);
  res.json({ success: true, logs });
});

module.exports = router;
