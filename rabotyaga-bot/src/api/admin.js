const express = require('express');
const router = express.Router();
const fs = require('fs');
const path = require('path');

const DATA_FILE = path.join(__dirname, '../../data.json');

function loadData() {
  return JSON.parse(fs.readFileSync(DATA_FILE, 'utf8'));
}

function saveData(data) {
  fs.writeFileSync(DATA_FILE, JSON.stringify(data, null, 2));
}

// Получение всех настроек пушей (для админки)
router.get('/push-settings', (req, res) => {
  const data = loadData();
  res.json({ success: true, settings: data.pushSettings || {} });
});

// Обновление шаблонов для пользователя
router.post('/templates/:userId', (req, res) => {
  const { userId } = req.params;
  const { templates } = req.body;
  
  const data = loadData();
  if (!data.pushSettings[userId]) {
    return res.status(404).json({ error: 'Пользователь не найден' });
  }
  
  data.pushSettings[userId].templates = {
    ...data.pushSettings[userId].templates,
    ...templates
  };
  saveData(data);
  
  res.json({ success: true });
});

// Получение шаблонов пользователя
router.get('/templates/:userId', (req, res) => {
  const { userId } = req.params;
  const data = loadData();
  const settings = data.pushSettings[userId];
  
  if (!settings) {
    return res.status(404).json({ error: 'Пользователь не найден' });
  }
  
  res.json({ success: true, templates: settings.templates || {} });
});

// Глобальные шаблоны (по умолчанию)
router.get('/default-templates', (req, res) => {
  res.json({
    success: true,
    templates: {
      dayBeforeShift: '🔔 Завтра твоя смена!\n\nЗадачи:\n{tasks}',
      closeShiftReminder: '⏰ Пора закрывать смену!\n\n✅ Чек-лист:\n• Пересчитать кассу\n• Убраться\n• Сдать отчёт\n• Закрыть бар'
    }
  });
});

// Обновление глобальных шаблонов
router.post('/default-templates', (req, res) => {
  const { templates } = req.body;
  const data = loadData();
  
  if (!data.defaultTemplates) data.defaultTemplates = {};
  data.defaultTemplates = { ...data.defaultTemplates, ...templates };
  saveData(data);
  
  res.json({ success: true });
});

module.exports = router;
