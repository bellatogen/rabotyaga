// sender.js — factory: принимает in-memory data + saveData из server.js.
// Устраняет race condition: раньше sender читал/писал data.json напрямую,
// теперь работает с объектом data из памяти сервера.
// Лог пишется в push-log.json (отдельный append-файл, читается /api/push/stats).
//
// Item 4 (push:v1): доставка переведена на единую модель.
//   • sendPush(bot, chatId, msg, type, {name, pushId}) — единый чокпоинт отправки
//     одному chatId с ретраем/логом. Гейтинг (recipients.enabled / suppressStatuses)
//     делает планировщик ВЫШЕ по стеку — служебные пуши идут мимо него.
//   • renderPush(def, name, shared) — рендер шаблона по contentSource (switch).
//   • resolveAudienceNames(audience, assignedNames) — общий резолвер аудитории
//     (all / {roles} / {names} / assigned) по ростеру profiles:v1.
// Старый per-user ключ data.pushSettings код доставки не читает — источник
// истины push:v1. Бот-команды /startpush /stoppush переведены на push:v1.recipients (server.js).
const fs   = require('fs');
const path = require('path');

const LOG_FILE = path.join(__dirname, '../../push-log.json');

function readLog() {
  if (!fs.existsSync(LOG_FILE)) return [];
  try { return JSON.parse(fs.readFileSync(LOG_FILE, 'utf8')); } catch { return []; }
}

// Подстановка переменных в шаблоне: {{имя}}, {{дата}}, {{день_недели}}.
// Дата/день считаются в PUSH_TZ (дефолт Москва), а не в локали сервера (UTC на хостинге).
const PUSH_TZ = process.env.PUSH_TZ || 'Europe/Moscow';
// Тест-режим: если задан PUSH_ALLOWLIST (chatId через запятую) — пуши идут
// только этим chatId, остальным skip. Пусто = рассылка всем как обычно.
const PUSH_ALLOWLIST = (process.env.PUSH_ALLOWLIST || '')
  .split(',').map(s => s.trim()).filter(Boolean);
const WEEKDAYS_RU = ['Воскресенье', 'Понедельник', 'Вторник', 'Среда', 'Четверг', 'Пятница', 'Суббота'];
const WD_FROM_EN = { Sun: 0, Mon: 1, Tue: 2, Wed: 3, Thu: 4, Fri: 5, Sat: 6 };
function substVars(tpl, userName) {
  const fmt = new Intl.DateTimeFormat('en-CA', {
    timeZone: PUSH_TZ,
    year: 'numeric', month: '2-digit', day: '2-digit', weekday: 'short',
  });
  const p = {};
  for (const part of fmt.formatToParts(new Date())) p[part.type] = part.value;
  const wd = WEEKDAYS_RU[WD_FROM_EN[p.weekday] ?? 0];
  return String(tpl || '')
    .replace(/\{\{имя\}\}/g, userName || '')
    .replace(/\{\{дата\}\}/g, `${p.day}.${p.month}.${p.year}`)
    .replace(/\{\{день_недели\}\}/g, wd);
}

// Дефолтные тексты по contentSource — используются когда у def пустой template.
// (Соответствуют 4 старым захардкоженным джобам.)
const DEFAULT_CONTENT = {
  tasks_tomorrow:       '🔔 Завтра твоя смена!\n\nЗадачи:\n{tasks}',
  tasks_today_personal: '📬 Твои задачи на сегодня:\n\n{tasks}',
  close_checklist:      '⏰ Пора закрывать смену!\n\n✅ Чек-лист:\n• Пересчитать кассу\n• Убраться\n• Сдать отчёт\n• Закрыть бар',
  sets:                 '🍻 Сэты дня — предлагай гостям:\n\n{sets}',
  static:               '',
};

// adapter (db/adapter.js) — опционален: если PG недоступен/не передан,
// пуш-лог пишется только в push-log.json (файл = fallback-резерв).
module.exports = function makeSender(data, saveData, adapter = null) {

  // Пишем запись в push-log.json с форматом, который ждёт /api/push/stats:
  // { pushId, userId, userName, name, type, status, error?, ts }
  // pushId = id определения пуша (для модельных) или type (для служебных/test).
  // name = userName (трекинг «кому что прилетало» по имени сотрудника).
  // Дублируем в таблицу push_log через adapter.logPush (fire-and-forget).
  function log(userId, userName, type, status, error = null, pushId = null) {
    const logs = readLog();
    const entry = { pushId: pushId || type, userId, userName, name: userName, type, status, ts: new Date().toISOString() };
    if (error) entry.error = error;
    logs.unshift(entry);
    if (logs.length > 500) logs.length = 500;
    try { fs.writeFileSync(LOG_FILE, JSON.stringify(logs, null, 2)); } catch {}
    // PG-дубль: ошибка БД не должна ломать отправку пуша.
    if (adapter) {
      adapter.logPush(userName, userId, type, status, error)
        .catch(e => console.error('[pg] logPush:', e.message));
    }
  }

  // Зафиксировать пропуск получателя (гейтинг в планировщике) в push-log.
  // Вызывается ДО отправки, когда пуш не уходит (отключён/подавлён статусом/нет привязки).
  function recordSkip(name, pushId, reason, chatId = null) {
    log(chatId, name, pushId, 'skipped', reason, pushId);
  }

  // profiles:v1 — ростер истины состава (для резолвера аудитории).
  function profilesList() {
    try { return JSON.parse(data.kv?.['profiles:v1'] || '[]'); } catch { return []; }
  }

  // Резолвер аудитории: спецификация audience → список имён.
  //   "all"        — все имена из profiles:v1
  //   {roles:[…]}  — по роли (используется и служебными пушами менеджерам)
  //   {names:[…]}  — явный список
  //   "assigned"   — те, у кого сегодня есть личные задачи (assignedNames извне)
  function resolveAudienceNames(audience, assignedNames = null) {
    const profiles = profilesList();
    if (audience === 'all') return profiles.filter(p => p && p.name).map(p => p.name);
    if (audience === 'assigned') return Array.isArray(assignedNames) ? assignedNames : [];
    if (audience && Array.isArray(audience.roles)) {
      return profiles.filter(p => p && p.name && audience.roles.includes(p.role)).map(p => p.name);
    }
    if (audience && Array.isArray(audience.names)) return audience.names;
    return [];
  }

  // Рендер сообщения для одного получателя по contentSource.
  // shared — предсобранный планировщиком контент (списки задач/сэтов).
  // Возвращает строку либо null, если слать нечего (нет личных задач / нет сэтов / пустой static).
  function renderPush(def, name, shared = {}) {
    const tpl = (def.template && def.template.trim()) ? def.template : (DEFAULT_CONTENT[def.contentSource] ?? '');
    let msg = substVars(tpl, name);
    switch (def.contentSource) {
      case 'tasks_tomorrow':
        msg = msg.replace('{tasks}', shared.tasksText || '');
        break;
      case 'tasks_today_personal': {
        const tasks = (shared.personalByName && shared.personalByName[name]) || [];
        if (!tasks.length) return null; // личных задач нет — не шлём
        const text = tasks.map(t =>
          `📌 ${t.title}\n👤 ${t.assignedBy || '—'}\n⏰ ${t.deadline || '—'}\n📝 ${t.context || ''}`
        ).join('\n\n');
        msg = msg.replace('{tasks}', text);
        break;
      }
      case 'sets':
        if (!shared.setsText) return null; // корзина пуста / iiko недоступна
        msg = msg.replace('{sets}', shared.setsText);
        break;
      case 'close_checklist':
      case 'static':
      default:
        break;
    }
    return msg && msg.trim() ? msg : null;
  }

  // Отправить пуш одному chatId с ретраем до 3 раз (линейный backoff 1s·attempt).
  // 403 = пользователь заблокировал бота — не ретраить.
  // Гейтинг (recipients.enabled / suppressStatuses) выполнен ВЫШЕ — здесь только отправка.
  async function sendPush(bot, chatId, message, type = 'test', opts = {}) {
    const name = opts.name ||
      Object.keys(data.bindings || {}).find(n => String(data.bindings[n]) === String(chatId)) || null;
    const pushId = opts.pushId || type;

    if (!chatId) {
      log(null, name, type, 'skipped', 'Нет chatId (Telegram не привязан)', pushId);
      return false;
    }
    if (PUSH_ALLOWLIST.length && !PUSH_ALLOWLIST.includes(String(chatId))) {
      log(chatId, name, type, 'skipped', 'Не в PUSH_ALLOWLIST (тест-режим)', pushId);
      return false;
    }

    let lastErr;
    for (let attempt = 1; attempt <= 3; attempt++) {
      try {
        await bot.telegram.sendMessage(String(chatId), message, { parse_mode: 'HTML' });
        log(chatId, name, type, 'sent', null, pushId);
        console.log(`✅ Пуш отправлен ${chatId} (${type})`);
        return true;
      } catch (err) {
        lastErr = err;
        if (err.response?.error_code === 403) break; // навсегда заблокирован — не ретраить
        if (attempt < 3) await new Promise(r => setTimeout(r, 1000 * attempt));
      }
    }
    log(chatId, name, type, 'failed', lastErr.message, pushId);
    console.error(`❌ Ошибка пуша ${chatId} (${type}):`, lastErr.message);
    return false;
  }

  // ── Служебный пуш: уведомление управляющим о закрытии смены ──
  // Триггерный (не по расписанию), в defs не входит. Идёт МИМО гейта
  // recipients.enabled / suppressStatuses — управляющий не должен его mute'ить.
  // Аудитория — общий резолвер {roles:['manager']}, доставка — общий sendPush.
  async function sendShiftClosedToManagers(bot, { dateStr, done, total, revenueFact, revenuePlan, workers }) {
    const managers = resolveAudienceNames({ roles: ['manager'] });
    if (!managers.length) {
      console.log('[shiftClosed] нет пользователей с ролью manager');
      return { sent: 0, failed: 0 };
    }

    // YYYY-MM-DD → DD.MM.YYYY
    const parts = String(dateStr || '').split('-');
    const dateFmt = parts.length === 3 ? `${parts[2]}.${parts[1]}.${parts[0]}` : (dateStr || '?');

    const revLine = (revenueFact != null && Number(revenueFact) > 0)
      ? `Выручка: ${Number(revenueFact).toLocaleString('ru-RU')} ₽ (план ${Number(revenuePlan || 0).toLocaleString('ru-RU')} ₽)`
      : 'Выручка: не указана';

    const workersLine = (Array.isArray(workers) && workers.length)
      ? `Смена: ${workers.join(', ')}`
      : 'Смена: не указана';

    const text = `✅ Смена закрыта — ${dateFmt}\nЗадачи: ${done}/${total}\n${revLine}\n${workersLine}`;

    let sent = 0, failed = 0;
    for (const name of managers) {
      const chatId = data.bindings?.[name];
      if (!chatId) {
        recordSkip(name, 'shiftClosed', 'Telegram не привязан');
        console.log(`[shiftClosed] пропуск ${name} — нет привязки Telegram`);
        continue;
      }
      const ok = await sendPush(bot, String(chatId), text, 'shiftClosed', { name });
      if (ok) sent++; else failed++;
    }
    return { sent, failed };
  }

  return {
    sendPush, renderPush, resolveAudienceNames, recordSkip,
    sendShiftClosedToManagers,
  };
};

// Экспорт чистых хелперов для тестов (не зависят от data/factory).
module.exports.substVars = substVars;
module.exports.DEFAULT_CONTENT = DEFAULT_CONTENT;
