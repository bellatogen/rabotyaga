// Роутер привязки Telegram (SEC): POST /api/bind, DELETE /api/bind/:name.
// SEC: telegramId берётся ТОЛЬКО из подписанного Telegram initData (SEC-7),
// никогда из тела запроса — иначе любой авторизованный подделывает чужую привязку
// (перехват пушей / выдача за менеджера). Привязать можно только свой аккаунт.
'use strict';
const express = require('express');
const { requireAuth, requireManager } = require('../middleware/auth');
const { resolveTenantByInitData } = require('../middleware/telegram');

// getTokenMap — функция () => { [botToken]: tenantId } (SEC-8, см. server.js).
// fallbackToken — TELEGRAM_TOKEN дефолтного бота (back-compat).
module.exports = function makeBindApi(data, saveData, bot, getTokenMap, fallbackToken) {
  const router = express.Router();

  // POST /api/bind — привязать Telegram текущего пользователя к его аккаунту.
  router.post('/', requireAuth, (req, res) => {
    const { name, initData } = req.body || {};
    if (!name || !initData) return res.status(400).json({ error: 'name и initData обязательны' });
    if (name !== req.account) return res.status(403).json({ error: 'Можно привязать только свой аккаунт' });

    const v = resolveTenantByInitData(initData, getTokenMap(), fallbackToken);
    if (!v.ok) return res.status(403).json({ error: v.reason || 'Подпись Telegram недействительна' });

    const telegramId = v.user && v.user.id;
    if (!telegramId) return res.status(403).json({ error: 'Не удалось извлечь Telegram id' });

    data.bindings[name] = telegramId;
    saveData();
    console.log(`✅ Привязан: ${name} -> ID ${telegramId}`);
    bot.telegram.sendMessage(telegramId, `👋 Привет, ${name}! Ты подключён к «Работяге».`).catch(err => console.error('Ошибка отправки:', err));
    res.json({ success: true });
  });

  // DELETE /api/bind/:name — только manager/developer (уже ролево гейтится requireManager).
  router.delete('/:name', requireManager, (req, res) => {
    const { name } = req.params;
    if (data.bindings[name]) {
      delete data.bindings[name];
      saveData();
      return res.json({ success: true });
    }
    res.status(404).json({ error: 'Сотрудник не найден' });
  });

  return router;
};
