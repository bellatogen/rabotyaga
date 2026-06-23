// Middleware авторизации: JWT в httpOnly cookie
'use strict';
const jwt = require('jsonwebtoken');

// Секрет берём из окружения. Если не задан — предупреждение, дефолт только для dev.
// SEC-1: В продакшене без JWT_SECRET запуск невозможен — иначе все токены подписаны
// публичным дефолтным ключом и любой желающий может войти под любым аккаунтом.
if (process.env.NODE_ENV === 'production' && !process.env.JWT_SECRET) {
  console.error('[auth] КРИТИЧНО: JWT_SECRET не задан в .env! Задайте случайную строку 32+ символа.');
  console.error('[auth] Генерация: node -e "console.log(require(\'crypto\').randomBytes(48).toString(\'hex\'))"');
  process.exit(1);
}
const JWT_SECRET = process.env.JWT_SECRET || (() => {
  console.warn('[auth] JWT_SECRET не задан — используется dev-ключ. В проде обязательно задайте!');
  return 'dev-secret-CHANGE-IN-PROD-rabotyaga-2026-x7k2m9p';
})();

const COOKIE_NAME = 'rab_token';
const COOKIE_MAX_AGE = 7 * 24 * 60 * 60 * 1000; // 7 дней

function signToken(account) {
  return jwt.sign({ account }, JWT_SECRET, { expiresIn: '7d' });
}

function verifyToken(token) {
  try { return jwt.verify(token, JWT_SECRET); }
  catch { return null; }
}

function setAuthCookie(res, account) {
  const token = signToken(account);
  res.cookie(COOKIE_NAME, token, {
    httpOnly: true,
    sameSite: 'strict',
    secure: process.env.NODE_ENV === 'production',
    maxAge: COOKIE_MAX_AGE,
    path: '/',
  });
  return token;
}

function clearAuthCookie(res) {
  res.clearCookie(COOKIE_NAME, {
    httpOnly: true,
    sameSite: 'strict',
    path: '/',
  });
}

/** Middleware: требует валидный JWT cookie. Кладёт account в req.account. */
function requireAuth(req, res, next) {
  const token = req.cookies?.[COOKIE_NAME];
  if (!token) return res.status(401).json({ error: 'Не авторизован' });
  const payload = verifyToken(token);
  if (!payload) return res.status(401).json({ error: 'Токен недействителен или истёк' });
  req.account = payload.account;
  next();
}

/** Middleware: требует manager или developer */
function requireManager(req, res, next) {
  requireAuth(req, res, () => {
    if (req.account !== 'manager' && req.account !== 'developer') {
      return res.status(403).json({ error: 'Нет прав — требуется менеджер' });
    }
    next();
  });
}

module.exports = {
  signToken, verifyToken, setAuthCookie, clearAuthCookie,
  requireAuth, requireManager,
  COOKIE_NAME, JWT_SECRET,
};
