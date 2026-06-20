// Утилиты авторизации и проверки разрешений

/** Отображаемое имя аккаунта */
export const accountLabel = acc =>
  acc === "manager" ? "Управляющий" : acc === "developer" ? "Разработчик" : acc;

// SERVER: пароли в проде хранятся хешированными (bcrypt) на сервере, проверка серверная, сессия по токену.
export function canManageAccounts(acc) {
  return acc === "manager" || acc === "developer";
}
export function canViewPasswords(acc, acl) {
  return acc === "developer" || (acc === "manager" && !!acl.managerCanViewPasswords);
}

/** Проверяет разрешение perm для пользователя who */
export function hasPerm(who, profiles, perm) {
  if (who === "manager" || who === "developer") return true;
  const p = profiles.find(x => x.name === who);
  return p ? (p.perms.includes("*") || p.perms.includes(perm)) : false;
}
