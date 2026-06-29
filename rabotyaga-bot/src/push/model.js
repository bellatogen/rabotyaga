// model.js — единая модель push:v1 и одноразовая миграция старых хранилищ.
//
// push:v1 = { defs, recipients } (см. docs/plans/push-editor-rebuild-2026-06-28.md):
//   defs       — массив декларативных определений пушей (CRUD из UI).
//   recipients — per-сотрудник состояние вкл/выкл, ключ = name (НЕ telegramUserId),
//                чтобы управляющий рулил по имени и колокольчик читался по имени.
//
// Заменяет два пересекающихся источника:
//   • push_settings:v1 (KV)      — глобальное расписание+шаблоны 4 джобов;
//   • data.pushSettings          — per-user тумблеры, ключ = telegramUserId.
// Доставка резолвится через data.bindings (name → telegramId).
'use strict';

const PUSH_KEY = 'push:v1';

// ── Предустановленные (system) defs: 4 старых джоба в единой модели ──
// system:true — нельзя удалить, можно только править/выключить.
// template:'' → исполнитель (Item 4) использует дефолтный текст источника.
function defaultDefs() {
  return [
    {
      id: 'day_before',
      title: 'За сутки до смены',
      enabled: true,
      system: true,
      template: '',
      contentSource: 'tasks_tomorrow',
      schedule: { time: '20:00', days: 'daily' },
      audience: 'all',
      // Пусто: доходит и на выходном (контрольный кейс из плана).
      suppressStatuses: [],
    },
    {
      id: 'personal_tasks',
      title: 'Личные задачи на сегодня',
      enabled: true,
      system: true,
      template: '',
      contentSource: 'tasks_today_personal',
      schedule: { time: '09:00', days: 'daily' },
      audience: 'assigned',
      // Пусто: личные @-задачи доходят и на выходном.
      suppressStatuses: [],
    },
    {
      id: 'close_shift',
      title: 'Закрытие смены',
      enabled: true,
      system: true,
      template: '',
      contentSource: 'close_checklist',
      schedule: { time: '23:00', days: 'daily' },
      audience: 'all',
      // Только работающим: не дёргаем отсутствующих.
      suppressStatuses: ['day_off', 'sick', 'vacation', 'business_trip'],
    },
    {
      id: 'sets',
      title: 'Сэты дня',
      enabled: true,
      system: true,
      template: '',
      contentSource: 'sets',
      schedule: { time: '16:00', days: 'daily' },
      audience: 'all',
      suppressStatuses: [],
    },
  ];
}

// Маппинг старых ключей push_settings:v1.jobs → id предустановленного def.
const JOB_TO_DEF = {
  dayBefore: 'day_before',
  personalTasks: 'personal_tasks',
  shiftClose: 'close_shift',
  setsRecommend: 'sets',
};

// Дефолтная запись recipient.
function defaultRecipient() {
  return { enabled: true, mutedAt: null, mutedBy: null };
}

/**
 * Сидирует recipients по ростеру profiles:v1 (источник истины состава).
 * @param {Array<{name:string}>} profiles
 * @returns {Object<string, {enabled:boolean, mutedAt:null, mutedBy:null}>}
 */
function seedRecipients(profiles) {
  const out = {};
  (Array.isArray(profiles) ? profiles : []).forEach(p => {
    if (p && p.name) out[p.name] = defaultRecipient();
  });
  return out;
}

/**
 * Собирает модель push:v1 из старых хранилищ (одноразовая миграция).
 *
 * Правила (раздел «Сидирование recipients и миграция»):
 *  • defs = предустановленные, с наложением старого расписания/шаблонов из globalSettings;
 *  • recipients сидируются из profiles (enabled:true), затем накладывается схлопнутый
 *    per-user флаг enabled = (старый pushSettings[userId].enabled !== false);
 *  • обратный матч telegramId→name через bindings: нет резолва → лог-дроп;
 *    один telegramId на два имени → первое имя, факт логируется.
 *
 * @param {object} p
 * @param {Array}  p.profiles        — profiles:v1
 * @param {object} p.perUserSettings — data.pushSettings (ключ = telegramUserId)
 * @param {object} p.globalSettings  — push_settings:v1 ({ jobs, templates })
 * @param {object} p.bindings        — data.bindings (name → telegramId)
 * @returns {{ model: {defs:Array, recipients:object}, log: string[] }}
 */
function migratePushModel({ profiles = [], perUserSettings = {}, globalSettings = {}, bindings = {} } = {}) {
  const log = [];

  // 1. defs из предустановленных + наложение старых jobs/templates.
  const jobsIn = (globalSettings && globalSettings.jobs) || {};
  const tplIn = (globalSettings && globalSettings.templates) || {};
  const defs = defaultDefs().map(def => {
    const jobKey = Object.keys(JOB_TO_DEF).find(k => JOB_TO_DEF[k] === def.id);
    if (!jobKey) return def;
    const job = jobsIn[jobKey] || {};
    const next = { ...def, schedule: { ...def.schedule } };
    if (typeof job.enabled === 'boolean') next.enabled = job.enabled;
    if (job.time) next.schedule.time = job.time;
    if (tplIn[jobKey]) next.template = tplIn[jobKey];
    return next;
  });

  // 2. recipients: сид из ростера.
  const recipients = seedRecipients(profiles);

  // 3. Обратный индекс telegramId(String) → name (первое имя выигрывает).
  const idToName = {};
  Object.entries(bindings || {}).forEach(([name, id]) => {
    const key = String(id);
    if (idToName[key] === undefined) {
      idToName[key] = name;
    } else {
      log.push(`telegramId ${key} привязан к нескольким именам: «${idToName[key]}» (взято) и «${name}» (пропущено)`);
    }
  });

  // 4. Схлопывание per-user тумблеров в один флаг enabled.
  Object.entries(perUserSettings || {}).forEach(([userId, settings]) => {
    const name = idToName[String(userId)];
    if (!name) {
      log.push(`pushSettings[${userId}] без резолва в имя через bindings — дропнут`);
      return;
    }
    const enabled = settings && settings.enabled !== false; // схлопывание notifications.* + setRecommendations
    if (!recipients[name]) recipients[name] = defaultRecipient();
    recipients[name].enabled = enabled;
    if (!enabled) recipients[name].mutedBy = 'manager';
  });

  return { model: { defs, recipients }, log };
}

/**
 * Серверная обёртка: если push:v1 отсутствует — собирает миграцией и пишет в data.kv.
 * Старые ключи не удаляем (disaster-recovery), но код доставки их больше не читает.
 * @param {object} data — in-memory store { kv, pushSettings, bindings }
 * @param {function} saveData — дебаунс-флаш в файл/PG
 * @returns {boolean} true если модель была создана сейчас
 */
function ensurePushModel(data, saveData) {
  if (!data || !data.kv) return false;
  if (data.kv[PUSH_KEY]) return false;

  let profiles = [];
  let globalSettings = {};
  try { profiles = JSON.parse(data.kv['profiles:v1'] || '[]'); } catch { profiles = []; }
  try { globalSettings = JSON.parse(data.kv['push_settings:v1'] || '{}'); } catch { globalSettings = {}; }

  const { model, log } = migratePushModel({
    profiles,
    perUserSettings: data.pushSettings || {},
    globalSettings,
    bindings: data.bindings || {},
  });

  data.kv[PUSH_KEY] = JSON.stringify(model);
  log.forEach(l => console.log('[push:migrate]', l));
  console.log(`[push:migrate] создан ${PUSH_KEY}: ${model.defs.length} defs, ${Object.keys(model.recipients).length} recipients`);
  if (typeof saveData === 'function') saveData();
  return true;
}

module.exports = {
  PUSH_KEY,
  defaultDefs,
  defaultRecipient,
  seedRecipients,
  migratePushModel,
  ensurePushModel,
  JOB_TO_DEF,
};
