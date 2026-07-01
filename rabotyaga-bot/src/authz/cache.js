'use strict';
// cache.js — in-memory кэш ролей/прав/пользователей по тенантам (P0 «Привилегии/ACL», Ф1).
// По образцу _tokenMap в server.js: заполняется на старте, в памяти процесса, не в БД.
// В пути запроса — ТОЛЬКО синхронный лукап (никакого PG), чтобы requireAuth оставался
// синхронным и не требовал живой БД в юнит-тестах маршрутов.
//
// Зависит только от engine (чистый) — НЕ импортирует адаптер/pool: адаптер передаётся
// в loadFromAdapter аргументом (DI). Это держит дерево зависимостей auth.js PG-free.
const { buildEffectiveIndex } = require('./engine');

// { tenantId → Map<roleId, Set<permission>> }
const permsByTenant = new Map();
// { tenantId → Map<account, { roleId, telegramId, active }> }
const usersByTenant = new Map();

// Загрузить роли/права/пользователей всех тенантов из адаптера в кэш.
// adapter — объект с getRoles/getRolePermissions/getUsers(tenantId).
async function loadFromAdapter(adapter, tenantIds) {
  for (const tid of tenantIds) {
    const [roleRows, permRows, userRows] = await Promise.all([
      adapter.getRoles(tid),
      adapter.getRolePermissions(tid),
      adapter.getUsers(tid),
    ]);
    permsByTenant.set(tid, buildEffectiveIndex(roleRows, permRows));
    const users = new Map();
    for (const u of userRows) {
      users.set(u.account, {
        roleId: u.role_id,
        telegramId: u.telegram_id != null ? Number(u.telegram_id) : null,
        active: u.active !== false,
      });
    }
    usersByTenant.set(tid, users);
  }
}

// Синхронный резолв прав по roleId. → Set<permission> | null (если тенант/роль не в кэше).
function resolvePermissionsForRole(tenantId, roleId) {
  if (!roleId) return null;
  return permsByTenant.get(tenantId)?.get(roleId) || null;
}

// Синхронный резолв прав по account. → Set<permission> | null (нет юзера / неактивен / не в кэше).
function resolvePermissionsForAccount(tenantId, account) {
  const u = usersByTenant.get(tenantId)?.get(account);
  if (!u || !u.active) return null;
  return resolvePermissionsForRole(tenantId, u.roleId);
}

function getUserByAccount(tenantId, account) {
  return usersByTenant.get(tenantId)?.get(account) || null;
}

// Сброс/пересборка для тестов и будущей инвалидации при правках ролей (Ф4).
function _reset() {
  permsByTenant.clear();
  usersByTenant.clear();
}

// Прямое наполнение кэша (для юнит-тестов middleware, без адаптера).
function _seed(tenantId, { roleRows = [], permRows = [], userRows = [] }) {
  permsByTenant.set(tenantId, buildEffectiveIndex(roleRows, permRows));
  const users = new Map();
  for (const u of userRows) {
    users.set(u.account, {
      roleId: u.role_id,
      telegramId: u.telegram_id != null ? Number(u.telegram_id) : null,
      active: u.active !== false,
    });
  }
  usersByTenant.set(tenantId, users);
}

module.exports = {
  loadFromAdapter,
  resolvePermissionsForRole,
  resolvePermissionsForAccount,
  getUserByAccount,
  _reset,
  _seed,
};
