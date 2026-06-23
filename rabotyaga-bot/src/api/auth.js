// Маршруты авторизации: login / logout / me / change-password / reset-password
'use strict';
const express = require('express');
const bcrypt  = require('bcrypt');
const rateLimit = require('express-rate-limit');
const { setAuthCookie, clearAuthCookie, requireAuth, requireManager } = require('../middleware/auth');

const BCRYPT_ROUNDS = 10;

// Не более 5 попыток входа в минуту с одного IP
const loginLimiter = rateLimit({
  windowMs: 60 * 1000,
  max: 5,
  skipSuccessfulRequests: true,
  message: { error: 'Слишком много попыток. Подождите минуту.' },
  standardHeaders: true,
  legacyHeaders: false,
});

module.exports = function makeAuthRouter(data, saveData) {
  const router = express.Router();

  // ── Хелпер: получить auth-словарь из KV ──
  function getAuth() {
    try { return JSON.parse(data.kv['auth:v1'] || '{}'); }
    catch { return {}; }
  }
  function saveAuth(auth) {
    data.kv['auth:v1'] = JSON.stringify(auth);
    saveData();
  }

  // ── Сравнение пароля (поддержка plaintext → авто-миграция на bcrypt) ──
  async function checkPassword(stored, input) {
    if (!stored) return null; // пароля нет
    if (stored.startsWith('$2b$') || stored.startsWith('$2a$')) {
      return (await bcrypt.compare(input, stored)) ? 'bcrypt' : null;
    }
    // Plaintext (legacy) — сравниваем и сразу мигрируем
    return stored === input ? 'plaintext' : null;
  }

  // POST /api/auth/login
  router.post('/login', loginLimiter, async (req, res) => {
    try {
      const { account, password } = req.body || {};
      if (!account || typeof account !== 'string') return res.status(400).json({ error: 'account обязателен' });
      if (!password || typeof password !== 'string') return res.status(400).json({ error: 'password обязателен' });

      const auth = getAuth();
      const stored = auth[account];

      if (!stored) {
        // Первый вход — устанавливаем пароль
        if (password.length < 3) return res.status(400).json({ error: 'Минимум 3 символа' });
        auth[account] = await bcrypt.hash(password, BCRYPT_ROUNDS);
        saveAuth(auth);
        setAuthCookie(res, account);
        console.log(`[auth] первый вход: ${account}`);
        return res.json({ ok: true, account, firstLogin: true });
      }

      const matchType = await checkPassword(stored, password);
      if (!matchType) return res.status(401).json({ error: 'Неверный пароль' });

      // Авто-миграция plaintext → bcrypt при первом успешном входе
      if (matchType === 'plaintext') {
        auth[account] = await bcrypt.hash(password, BCRYPT_ROUNDS);
        saveAuth(auth);
        console.log(`[auth] мигрирован пароль ${account}: plaintext → bcrypt`);
      }

      setAuthCookie(res, account);
      console.log(`[auth] вход: ${account}`);
      res.json({ ok: true, account });
    } catch (e) {
      console.error('[auth/login]', e.message);
      res.status(500).json({ error: 'Внутренняя ошибка' });
    }
  });

  // POST /api/auth/logout
  router.post('/logout', (req, res) => {
    clearAuthCookie(res);
    res.json({ ok: true });
  });

  // GET /api/auth/me — текущий аккаунт по cookie (для восстановления сессии)
  router.get('/me', requireAuth, (req, res) => {
    res.json({ ok: true, account: req.account });
  });

  // POST /api/auth/change-password
  // Владелец: должен передать currentPassword
  // manager/developer: может менять любой пароль без currentPassword
  router.post('/change-password', requireAuth, async (req, res) => {
    try {
      const { account, newPassword, currentPassword } = req.body || {};
      const requester = req.account;
      const isAdmin = requester === 'manager' || requester === 'developer';

      if (!account) return res.status(400).json({ error: 'account обязателен' });
      if (!isAdmin && requester !== account) return res.status(403).json({ error: 'Нет прав' });
      if (!newPassword || newPassword.length < 3) return res.status(400).json({ error: 'Минимум 3 символа' });

      const auth = getAuth();

      // Не-admin должен подтвердить старый пароль (если он есть)
      if (!isAdmin && auth[account]) {
        if (!currentPassword) return res.status(400).json({ error: 'Укажите текущий пароль' });
        const match = await checkPassword(auth[account], currentPassword);
        if (!match) return res.status(401).json({ error: 'Текущий пароль неверный' });
      }

      auth[account] = await bcrypt.hash(newPassword, BCRYPT_ROUNDS);
      saveAuth(auth);
      console.log(`[auth] пароль изменён: ${account} (by ${requester})`);
      res.json({ ok: true });
    } catch (e) {
      console.error('[auth/change-password]', e.message);
      res.status(500).json({ error: 'Внутренняя ошибка' });
    }
  });

  // POST /api/auth/reset-password — только manager/developer, сбрасывает пароль (следующий вход = первый)
  router.post('/reset-password', requireManager, async (req, res) => {
    try {
      const { account } = req.body || {};
      if (!account) return res.status(400).json({ error: 'account обязателен' });
      const auth = getAuth();
      delete auth[account];
      saveAuth(auth);
      console.log(`[auth] пароль сброшен: ${account} (by ${req.account})`);
      res.json({ ok: true });
    } catch (e) {
      res.status(500).json({ error: 'Внутренняя ошибка' });
    }
  });

  // GET /api/auth/has-password/:account — есть ли пароль (для UI «первый вход»)
  // Открытый, но rate-limited — чтобы нельзя было перебирать аккаунты
  const hasPwdLimiter = rateLimit({
    windowMs: 60 * 1000,
    max: 20,
    message: { error: 'Слишком много запросов' },
    standardHeaders: true,
    legacyHeaders: false,
  });
  router.get('/has-password/:account', hasPwdLimiter, (req, res) => {
    const auth = getAuth();
    res.json({ hasPassword: !!auth[req.params.account] });
  });

  return router;
};
