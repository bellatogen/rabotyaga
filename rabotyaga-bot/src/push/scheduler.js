// scheduler.js — универсальный исполнитель пушей поверх единой модели push:v1.
// Принимает in-memory data и sender из server.js (без прямых чтений data.json).
//
// Item 4: планировщик итерирует defs из push:v1, по schedule решает «пора ли»,
// строит аудиторию через sender.resolveAudienceNames(audience), для каждого
// получателя гейтит recipients[name].enabled + getShiftStatus ∉ suppressStatuses,
// рендерит template по contentSource (sender.renderPush) и шлёт sender.sendPush.
// Захардкоженные 4 джоба и push_settings:v1 больше не читаются.
const iiko = require('../api/iiko');
const { isToday } = require('../shift/isToday');            // единый бэкенд-модуль (дедуп копий)
const { getShiftStatusFromData } = require('../shift/status'); // статус-гейтинг
const { PUSH_KEY } = require('./model');                    // ключ единой модели push:v1

function todayStr() {
  return new Date().toISOString().slice(0, 10);
}

// ── Часовой пояс расписания пушей ──
// Хостинг часто в UTC — без явного TZ «23:00» в настройках уходило бы в 02:00 МСК.
// Время в редакторе пушей трактуется в этом поясе. Дефолт — Москва.
const PUSH_TZ = process.env.PUSH_TZ || 'Europe/Moscow';

// Текущие дата, минуты-от-полуночи и день недели (0=Вс..6=Сб) в PUSH_TZ.
function tzNow(date = new Date()) {
  const fmt = new Intl.DateTimeFormat('en-CA', {
    timeZone: PUSH_TZ,
    year: 'numeric', month: '2-digit', day: '2-digit',
    hour: '2-digit', minute: '2-digit', hour12: false,
  });
  const p = {};
  for (const part of fmt.formatToParts(date)) p[part.type] = part.value;
  const hour = parseInt(p.hour, 10) % 24; // '24:00' на полуночь в некоторых рантаймах → 0
  const dateStr = `${p.year}-${p.month}-${p.day}`;
  // День недели в той же конвенции, что isToday/weekly (JS getDay: 0=Вс..6=Сб).
  const weekday = new Date(`${dateStr}T12:00:00Z`).getUTCDay();
  return {
    dateStr,
    minutes: hour * 60 + parseInt(p.minute, 10),
    weekday,
  };
}

// Завтрашняя дата (YYYY-MM-DD) в PUSH_TZ. Полдень UTC — чтобы +сутки не задело DST-сдвиги.
function tomorrowTz() {
  const d = new Date(tzNow().dateStr + 'T12:00:00Z');
  d.setUTCDate(d.getUTCDate() + 1);
  return d.toISOString().slice(0, 10);
}

function timeToMinutes(timeStr) {
  const [h, m] = (timeStr || '00:00').split(':').map(Number);
  return h * 60 + m;
}

// ── Макросы рассылки ──
const WEEKDAYS_RU = ['Воскресенье', 'Понедельник', 'Вторник', 'Среда', 'Четверг', 'Пятница', 'Суббота'];

// Номер недели по ISO 8601 (неделя начинается с понедельника).
function isoWeekNumber(d) {
  const date = new Date(Date.UTC(d.getFullYear(), d.getMonth(), d.getDate()));
  const dayNum = (date.getUTCDay() + 6) % 7;
  date.setUTCDate(date.getUTCDate() - dayNum + 3);
  const firstThursday = new Date(Date.UTC(date.getUTCFullYear(), 0, 4));
  const ftDayNum = (firstThursday.getUTCDay() + 6) % 7;
  firstThursday.setUTCDate(firstThursday.getUTCDate() - ftDayNum + 3);
  return 1 + Math.round((date - firstThursday) / (7 * 24 * 3600 * 1000));
}

// Подстановка переменных: {{дата}}, {{день_недели}}, {{неделя}}/{{неделя_номер}}.
function renderMacroTemplate(tpl, now) {
  const dd = String(now.getDate()).padStart(2, '0');
  const mm = String(now.getMonth() + 1).padStart(2, '0');
  const yyyy = now.getFullYear();
  const wk = String(isoWeekNumber(now));
  return String(tpl || '')
    .replace(/\{\{дата\}\}/g, `${dd}.${mm}.${yyyy}`)
    .replace(/\{\{день_недели\}\}/g, WEEKDAYS_RU[now.getDay()])
    .replace(/\{\{неделя_номер\}\}/g, wk)
    .replace(/\{\{неделя\}\}/g, wk);
}

function daysBetween(fromStr, toStr) {
  const a = new Date(fromStr + 'T00:00:00');
  const b = new Date(toStr + 'T00:00:00');
  return Math.round((b - a) / (24 * 3600 * 1000));
}

// Сработал ли макрос сейчас: совпала минута, не было запуска сегодня, и тип расписания подходит.
function macroDue(macro, now, today) {
  if (!macro.active) return false;
  const sc = macro.schedule || {};
  if (!sc.time) return false;
  const cur = now.getHours() * 60 + now.getMinutes();
  if (cur !== timeToMinutes(sc.time)) return false;
  if (macro.lastRunDate === today) return false; // уже сегодня отправлено
  switch (sc.type) {
    case 'once':   return sc.runDate === today;
    case 'daily':  return true;
    case 'weekly': return Number(sc.weekday) === now.getDay();
    case 'every_n': {
      const n = Number(sc.interval) || 1;
      if (!macro.lastRunDate) return true; // первый запуск
      return daysBetween(macro.lastRunDate, today) >= n;
    }
    default: return false;
  }
}

// Тик макросов — вызывается каждую минуту из основного тика.
// Для каждого активного макроса, чьё время совпало, рендерит шаблон и шлёт в чат.
async function tickMacros(bot, data, saveData) {
  let macros;
  try { macros = JSON.parse(data.kv?.['bot_macros:v1'] || '[]'); } catch { return; }
  if (!Array.isArray(macros) || !macros.length) return;
  const now = new Date();
  const today = todayStr();
  let changed = false;
  for (const macro of macros) {
    if (!macroDue(macro, now, today)) continue;
    if (!macro.chatId) continue;
    const text = renderMacroTemplate(macro.template, now);
    try {
      await bot.telegram.sendMessage(String(macro.chatId), text);
      console.log(`📨 Макрос «${macro.name}» отправлен в чат ${macro.chatId}`);
    } catch (e) {
      console.error(`❌ Ошибка макроса «${macro.name}» (чат ${macro.chatId}):`, e.message);
    }
    // Дедуп даже при ошибке — чтобы не ретраить каждые 30 секунд в течение минуты.
    macro.lastRunDate = today;
    changed = true;
  }
  if (changed) {
    data.kv['bot_macros:v1'] = JSON.stringify(macros);
    if (typeof saveData === 'function') saveData();
  }
}

// ── Исполнитель единой модели push:v1 ──

// Пора ли слать def сейчас: совпала минута, подходит день недели, не слан сегодня.
// schedule.days: 'daily' (или пусто) = ежедневно; number[] = индексы дней недели (0=Вс..6=Сб).
function defDue(def, minutes, weekday, today, sentToday) {
  const sc = def.schedule || {};
  if (!sc.time) return false;
  if (timeToMinutes(sc.time) !== minutes) return false;
  if (sentToday[def.id] === today) return false;
  const days = sc.days;
  if (days && days !== 'daily' && Array.isArray(days) && !days.includes(weekday)) return false;
  return true;
}

// Предсборка контента, общего для всех получателей текущей пачки due-defs.
// Считаем только то, что реально нужно (по набору contentSource/audience).
async function buildSharedContent(data, dueDefs, today) {
  const sources = new Set(dueDefs.map(d => d.contentSource));
  const needsPersonal = sources.has('tasks_today_personal') || dueDefs.some(d => d.audience === 'assigned');
  const shared = { tasksText: '', personalByName: {}, setsText: '' };

  let tasks = [];
  if (sources.has('tasks_tomorrow') || needsPersonal) {
    try { tasks = JSON.parse(data.kv?.['tasks:v4'] || '[]'); } catch { tasks = []; }
  }

  if (sources.has('tasks_tomorrow')) {
    const tomorrow = tomorrowTz();
    shared.tasksText = tasks
      .filter(t => !t.archived && isToday(t, tomorrow))
      .map((t, i) => `${i + 1}. ${t.title}`)
      .join('\n');
  }

  if (needsPersonal) {
    tasks.forEach(t => {
      if (!t.archived && t.assignedTo && isToday(t, today)) {
        (shared.personalByName[t.assignedTo] ||= []).push({
          title:      t.title,
          assignedBy: t.createdBy || '—',
          deadline:   t.dueDate   || t.deadline || '—',
          context:    t.notes     || '',
        });
      }
    });
  }

  if (sources.has('sets')) {
    try {
      // saveData no-op: кэш пишется в data.kv (в памяти), на диск сохранит server при следующей записи.
      const result = await iiko.getBasketPairs(data, () => {});
      const sets = iiko.pickDailySets(result, 3);
      shared.setsText = (sets || []).map((p, i) => {
        const conf = Math.max(p.confAB || 0, p.confBA || 0);
        const m = p.margin != null ? ` · маржа ~${p.margin}%` : '';
        return `${i + 1}. ${p.a} + ${p.b}\n   ${conf}% берут вместе${m}`;
      }).join('\n\n');
    } catch (e) {
      console.warn('[sets] не удалось получить корзину:', e.message);
    }
  }

  return shared;
}

// Рассылка одного def: аудитория → per-recipient гейтинг → рендер → отправка.
async function runDef(bot, data, sender, def, shared, ctx) {
  const names = sender.resolveAudienceNames(def.audience, ctx.assignedNames);
  for (const name of names) {
    const rec = ctx.recipients[name];
    // Сотрудник отключил пуши (колокольчик) — единый флаг enabled.
    if (rec && rec.enabled === false) {
      sender.recordSkip(name, def.id, 'Пуши отключены сотрудником');
      continue;
    }
    // Статус-гейтинг: напр. «закрытие смены» не шлём на выходном/больничном.
    const status = getShiftStatusFromData(data, name, ctx.today, ctx.now);
    if (Array.isArray(def.suppressStatuses) && def.suppressStatuses.includes(status)) {
      sender.recordSkip(name, def.id, `Подавлено статусом: ${status}`);
      continue;
    }
    // Рендер контента; null = слать нечего (нет личных задач / нет сэтов / пустой static).
    const msg = sender.renderPush(def, name, shared);
    if (msg == null) continue;
    const chatId = data.bindings?.[name];
    if (!chatId) {
      sender.recordSkip(name, def.id, 'Telegram не привязан');
      continue;
    }
    await sender.sendPush(bot, String(chatId), msg, def.id, { name });
  }
}

function startScheduler(bot, data, sender, saveData) {
  console.log('⏰ Планировщик пушей запущен');

  // Дедуп «отправлено сегодня» по id определения; сброс в полночь МСК.
  const sentToday = {};

  setInterval(async () => {
    const now = new Date();
    const { minutes, dateStr: today, weekday } = tzNow(now);

    // Сброс дедупа в полночь.
    if (minutes === 0) for (const k of Object.keys(sentToday)) delete sentToday[k];

    // Источник истины — push:v1 (defs + recipients).
    let model = {};
    try { model = JSON.parse(data.kv?.[PUSH_KEY] || '{}'); } catch { model = {}; }
    const defs = Array.isArray(model.defs) ? model.defs : [];
    const recipients = (model && model.recipients) || {};

    const dueDefs = defs.filter(d => d && d.enabled && defDue(d, minutes, weekday, today, sentToday));
    if (dueDefs.length) {
      const shared = await buildSharedContent(data, dueDefs, today);
      const assignedNames = Object.keys(shared.personalByName);
      const ctx = { today, now, recipients, assignedNames };
      for (const def of dueDefs) {
        console.log(`🔔 Пуш «${def.title}» (${def.id}) — рассылка`);
        try {
          await runDef(bot, data, sender, def, shared, ctx);
        } catch (e) {
          console.error(`[push] ошибка def ${def.id}:`, e.message);
        }
        sentToday[def.id] = today; // дедуп даже при ошибке — не ретраить каждые 30с
      }
    }

    // Макросы рассылки — собственный дедуп по lastRunDate внутри tickMacros.
    try { await tickMacros(bot, data, saveData); } catch (e) { console.error('[macros] tick error:', e.message); }
  }, 30000); // каждые 30 секунд
}

module.exports = {
  startScheduler,
  defDue,
  buildSharedContent,
  runDef,
  tickMacros,
  renderMacroTemplate,
  isoWeekNumber,
};
