'use strict';
// ensureUsers.js — идемпотентная миграция существующих аккаунтов в таблицу users
// (P0 «Привилегии/ACL», Ф1). Запускается на старте ПОСЛЕ hydrate, по образцу
// ensurePushModel/ensureQuestModel. Не перезаписывает роль вручную назначенную ранее
// (adapter.upsertUser обновляет только telegram_id/active, role_id ставится лишь при вставке).
//
// Источники аккаунтов: auth:v1 (ключи-аккаунты с паролем), employee_bindings (имена),
// profiles:v1 (ростер с полем role). Маппинг роли:
//   developer          → роль 'developer'
//   manager            → роль 'Менеджер'
//   profiles[].role    → 'barman'→'Бармен', 'head_barman'→'Шеф-бармен', 'manager'→'Менеджер'
//   иначе (дефолт)     → 'Бармен'

// profiles:v1.role → имя роли в дереве
const PROFILE_ROLE_MAP = {
  barman: 'Бармен',
  head_barman: 'Шеф-бармен',
  manager: 'Менеджер',
};
const DEFAULT_ROLE_NAME = 'Бармен';

function parseJson(str, fallback) {
  try { return JSON.parse(str); } catch { return fallback; }
}

// tenantData — { kv: {...}, bindings: {...} } конкретного тенанта.
async function ensureUsersForTenant(tenantId, tenantData, adapter) {
  const roles = await adapter.getRoles(tenantId);
  if (!roles || !roles.length) return { migrated: 0, skipped: 'no-roles' }; // 005 не применена → пропускаем

  const roleIdByName = new Map(roles.map(r => [r.name, r.id]));
  const kv = tenantData.kv || {};
  const bindings = tenantData.bindings || {};
  const auth = parseJson(kv['auth:v1'], {});
  const profiles = parseJson(kv['profiles:v1'], []);
  const profileRoleByName = new Map(
    (Array.isArray(profiles) ? profiles : []).filter(p => p && p.name).map(p => [p.name, p.role])
  );

  function roleIdFor(account) {
    if (account === 'developer') return roleIdByName.get('developer') || roleIdByName.get(DEFAULT_ROLE_NAME);
    if (account === 'manager')   return roleIdByName.get('Менеджер')  || roleIdByName.get(DEFAULT_ROLE_NAME);
    const profileRole = profileRoleByName.get(account);
    const mapped = profileRole && PROFILE_ROLE_MAP[profileRole];
    return roleIdByName.get(mapped) || roleIdByName.get(DEFAULT_ROLE_NAME);
  }

  const accounts = new Set([
    ...Object.keys(auth),
    ...Object.keys(bindings),
    ...profileRoleByName.keys(),
  ]);

  let migrated = 0;
  for (const account of accounts) {
    if (!account) continue;
    const roleId = roleIdFor(account);
    if (!roleId) continue;
    const tgId = bindings[account] != null ? bindings[account] : null;
    await adapter.upsertUser(tenantId, account, tgId, roleId);
    migrated++;
  }
  return { migrated };
}

module.exports = { ensureUsersForTenant, PROFILE_ROLE_MAP, DEFAULT_ROLE_NAME };
