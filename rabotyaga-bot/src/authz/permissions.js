'use strict';
// permissions.js — каталог атомарных прав (P0 «Привилегии/ACL», Ф1).
// Единственный источник правды по правам живёт В КОДЕ (не в таблице permissions):
// каталог меняется с каждой фичей, git — версионируемый реестр. role_permissions
// в БД хранит только permission-КЛЮЧИ (текст); неизвестные ключи молча игнорируются.
//
// WILDCARD '*' — суперправо (матчит любой ключ). Держат его роли developer/manager
// (в Ф1 — для полной обратной совместимости, чтобы ни один маршрут не менял поведение).

const WILDCARD = '*';

// Аккаунты, которые до появления ролевой модели были админами по строке.
// Используются как legacy-фолбэк в requireAuth, когда ролевой кэш недоступен
// (миграция 005 не применена / PG down) — прод не залочивается в переходный период.
const LEGACY_ADMIN_ACCOUNTS = new Set(['manager', 'developer']);

// Каталог, сгруппированный по модулям. { key, module, label }.
const PERMISSIONS = [
  // ── Задачи ──
  { key: 'tasks.view.own',   module: 'tasks',        label: 'Видеть свои задачи' },
  { key: 'tasks.mark.own',   module: 'tasks',        label: 'Отмечать свои задачи' },
  { key: 'tasks.view.all',   module: 'tasks',        label: 'Видеть все задачи' },
  { key: 'tasks.create',     module: 'tasks',        label: 'Создавать задачи' },
  { key: 'tasks.edit.all',   module: 'tasks',        label: 'Редактировать любые задачи' },
  // ── Расписание ──
  { key: 'schedule.view',    module: 'schedule',     label: 'Смотреть расписание' },
  { key: 'schedule.edit',    module: 'schedule',     label: 'Редактировать расписание' },
  // ── Состав / персонал ──
  { key: 'staff.view',       module: 'staff',        label: 'Видеть состав' },
  { key: 'staff.manage',     module: 'staff',        label: 'Управлять составом (привязки, пароли)' },
  // ── Пуши ──
  { key: 'push.defs.edit',        module: 'push',    label: 'Редактировать шаблоны пушей' },
  { key: 'push.send',             module: 'push',    label: 'Отправлять пуши' },
  { key: 'push.recipients.self',  module: 'push',    label: 'Управлять своими пушами' },
  { key: 'push.stats.view',       module: 'push',    label: 'Смотреть статистику пушей' },
  // ── Интеграции ──
  { key: 'integrations.view',  module: 'integrations', label: 'Видеть интеграции' },
  { key: 'integrations.edit',  module: 'integrations', label: 'Настраивать интеграции' },
  { key: 'integrations.sync',  module: 'integrations', label: 'Запускать синхронизацию' },
  // ── Отчёты / аналитика ──
  { key: 'reports.revenue.view', module: 'reports',  label: 'Отчёт по выручке' },
  { key: 'reports.margin.view',  module: 'reports',  label: 'Отчёт по марже' },
  { key: 'reports.abc.view',     module: 'reports',  label: 'ABC-анализ продаж' },
  // ── Краны (кокпит) ──
  { key: 'taps.view',        module: 'taps',         label: 'Смотреть краны' },
  { key: 'taps.edit',        module: 'taps',         label: 'Редактировать краны' },
  // ── Квесты / награды / XP ──
  { key: 'quests.manage',    module: 'quests',       label: 'Управлять квестами' },
  { key: 'quests.complete',  module: 'quests',       label: 'Выполнять квесты' },
  { key: 'rewards.manage',   module: 'quests',       label: 'Управлять наградами' },
  { key: 'rewards.redeem',   module: 'quests',       label: 'Обменивать XP на награды' },
  { key: 'xp.view.own',      module: 'quests',       label: 'Своя статистика XP' },
  { key: 'xp.view.team',     module: 'quests',       label: 'Статистика XP команды' },
  // ── Бот-рассылки ──
  { key: 'bot.chats.manage',  module: 'bot',         label: 'Управлять чатами рассылки' },
  { key: 'bot.macros.manage', module: 'bot',         label: 'Управлять макросами рассылки' },
  // ── Администрирование ──
  { key: 'roles.view',           module: 'admin',    label: 'Видеть роли' },
  { key: 'roles.edit',           module: 'admin',    label: 'Редактировать роли' },
  { key: 'users.manage',         module: 'admin',    label: 'Назначать роли пользователям' },
  { key: 'kv.write.privileged',  module: 'admin',    label: 'Запись привилегированных ключей' },
  { key: 'audit.view',           module: 'admin',    label: 'Смотреть аудит-лог' },
];

const PERMISSION_KEYS = new Set(PERMISSIONS.map(p => p.key));

function isValidPermission(key) {
  return key === WILDCARD || PERMISSION_KEYS.has(key);
}

// Проверка: набор прав (Set) удовлетворяет требуемому ключу (учитывая WILDCARD).
function permsSatisfy(permSet, requiredKey) {
  if (!permSet || typeof permSet.has !== 'function') return false;
  return permSet.has(WILDCARD) || permSet.has(requiredKey);
}

module.exports = {
  WILDCARD,
  LEGACY_ADMIN_ACCOUNTS,
  PERMISSIONS,
  PERMISSION_KEYS,
  isValidPermission,
  permsSatisfy,
};
