// Middleware авторизации: JWT в httpOnly cookie
'use strict';
const jwt = require('jsonwebtoken');
// P0 «Привилегии/ACL» Ф1: ролевой кэш (in-memory, синхронный резолв — без PG в пути запроса).
const authzCache = require('../authz/cache');
const { permsSatisfy, WILDCARD, LEGACY_ADMIN_ACCOUNTS } = require('../authz/permissions');

// Секрет берём из окружения. Если не задан — предупреждение, дефолт только для dev.
// SEC-1: В продакшене без JWT_SECRET запуск невозможен — иначе все токены подписаны
// публичным дефолтным ключом и любой желающий может войти под любым аккаунтом.
// Двойной guard: NODE_ENV=production ИЛИ PORT≠3001 (признак хостинга, если NODE_ENV не выставлен).
const IS_PROD = process.env.NODE_ENV === 'production' || (!!process.env.PORT && process.env.PORT !== '3001');
if (IS_PROD && !process.env.JWT_SECRET) {
  console.error('[auth] КРИТИЧНО: JWT_SECRET не задан в .env! Задайте случайную строку 32+ символа.');
  console.error('[auth] Генерация: node -e "console.log(require(\'crypto\').randomBytes(48).toString(\'hex\'))"\'');
  process.exit(1);
}
const JWT_SECRET = process.env.JWT_SECRET || (() => {
  console.warn('[auth] JWT_SECRET не задан — используется dev-ключ. В проде обязательно задайте!');
  return 'dev-secret-CHANGE-IN-PROD-rabotyaga-2026-x7k2m9p';
})();

const COOKIE_NAME = 'rab_token';
const COOKIE_MAX_AGE = 7 * 24 * 60 * 60 * 1000; // 7 дней

// opts.tgVerified — личность подтверждена входом через Telegram (SEC-7).
// opts.tenantId  — тенант пользователя (SEC-8); fallback 'pivnaya_karta' при чтении.
function signToken(account, opts = {}) {
  const payload = { account };
  if (opts.tgVerified) payload.tgVerified = true;
  // SEC-8: tenantId в токене — для per-tenant авторизации маршрутов
  if (opts.tenantId) payload.tenantId = opts.tenantId;
  return jwt.sign(payload, JWT_SECRET, { expiresIn: '7d' });
}

function verifyToken(token) {
  try { return jwt.verify(token, JWT_SECRET); }
  catch { return null; }
}

function setAuthCookie(res, account, opts = {}) {
  const token = signToken(account, opts);
  res.cookie(COOKIE_NAME, token, {
    httpOnly: true,
    sameSite: 'strict',
    secure: IS_PROD, // согласован с IS_PROD, а не только с NODE_ENV
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

/** P0 «Привилегии/ACL» Ф1: разрешить эффективные права запроса.
 *  Порядок резолва: по roleId из токена → по account из ролевого кэша → legacy-фолбэк.
 *  Legacy-фолбэк (кэш пуст: миграция 005 не применена / PG down) сохраняет старое
 *  поведение — manager/developer как admin ('*'), остальные — без прав. Прод не залочивается. */
function resolvePermissions(req) {
  let perms = null;
  if (req.roleId) perms = authzCache.resolvePermissionsForRole(req.tenantId, req.roleId);
  if (!perms)     perms = authzCache.resolvePermissionsForAccount(req.tenantId, req.account);
  if (!perms)     perms = LEGACY_ADMIN_ACCOUNTS.has(req.account) ? new Set([WILDCARD]) : new Set();
  return perms;
}

/** Middleware: требует валидный JWT cookie. Кладёт account в req.account.
 *  SEC-8: извлекает req.tenantId из токена (fallback 'pivnaya_karta' для старых токенов).
 *  P0 Ф1: кладёт req.permissions (Set эффективных прав) — источник для requirePermission. */
function requireAuth(req, res, next) {
  const token = req.cookies?.[COOKIE_NAME];
  if (!token) return res.status(401).json({ error: 'Не авторизован' });
  const payload = verifyToken(token);
  if (!payload) return res.status(401).json({ error: 'Токен недействителен или истёк' });
  req.account    = payload.account;
  req.tgVerified = !!payload.tgVerified;            // SEC-7: подтверждена ли личность через Telegram
  req.tenantId   = payload.tenantId || 'pivnaya_karta'; // SEC-8: тенант (fallback для старых токенов)
  req.roleId     = payload.roleId || null;          // P0 Ф1: роль (если в токене; иначе резолв по account)
  req.permissions = resolvePermissions(req);
  next();
}

/** Есть ли у запроса требуемое право (учитывая WILDCARD '*'). */
function hasPermission(req, key) {
  return permsSatisfy(req.permissions, key);
}

/** Middleware-фабрика: требует конкретное право. Всегда ПОСЛЕ requireAuth-цепочки.
 *  Единая точка проверки прав — заменяет разбросанные req.account === 'manager'. */
function requirePermission(key) {
  return (req, res, next) => {
    requireAuth(req, res, () => {
      if (!hasPermission(req, key)) {
        return res.status(403).json({ error: 'Недостаточно прав' });
      }
      next();
    });
  };
}

/** SEC-8: требует, чтобы req.tenantId совпадал с переданным (или был manager/developer).
 *  Используется для маршрутов, изолированных на тенант.
 *  Всегда вызывается ПОСЛЕ requireAuth. */
function requireTenant(tenantId) {
  return (req, res, next) => {
    if (!req.tenantId) return res.status(401).json({ error: 'Не авторизован' });
    if (req.tenantId !== tenantId && req.account !== 'developer') {
      return res.status(403).json({ error: `Нет доступа к тенанту ${tenantId}` });
    }
    next();
  };
}

/** SEC-7: требует, чтобы личность была подтверждена входом через Telegram (tgVerified в JWT).
 *  Гейтит операции начисления/списания XP — парольный вход (браузер) их не получает. */
function requireTgVerified(req, res, next) {
  requireAuth(req, res, () => {
    if (!req.tgVerified) {
      return res.status(403).json({ error: 'Нужен вход через Telegram — операция недоступна из браузера' });
    }
    next();
  });
}

/** Middleware: требует manager или developer.
 *  P0 «Привилегии/ACL» Ф1: COMPAT-ШИМ поверх ролевой модели — проверяет суперправо '*'
 *  (в Ф1 роли Менеджер/developer держат '*', как и было). Call-sites не меняются;
 *  точечная замена на requirePermission(...) по маршрутам — в Ф2+. Legacy-фолбэк в
 *  resolvePermissions гарантирует идентичное старому поведение, если кэш недоступен. */
function requireManager(req, res, next) {
  requireAuth(req, res, () => {
    if (!hasPermission(req, WILDCARD)) {
      return res.status(403).json({ error: 'Нет прав — требуется менеджер' });
    }
    next();
  });
}

module.exports = {
  signToken, verifyToken, setAuthCookie, clearAuthCookie,
  requireAuth, requireManager, requireTgVerified, requireTenant,
  requirePermission, hasPermission,   // P0 «Привилегии/ACL» Ф1
  COOKIE_NAME, JWT_SECRET,
};
