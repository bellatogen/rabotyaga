// push.js — REST редактора пушей (push:v1).
// Factory: принимает sender (доставка), data/saveData (доступ к KV push:v1) и bot
// (для edge-trigger уведомления управляющим при mute). Все маршруты — manager-only,
// кроме /recipients/:name (requireAuth + self-check).
const express   = require('express');
const fs        = require('fs');
const path      = require('path');
const { requireAuth, requireManager } = require('../middleware/auth');
const { PUSH_KEY } = require('../push/model');

const LOG_FILE = path.join(__dirname, '../../push-log.json');

function loadLog() {
  if (!fs.existsSync(LOG_FILE)) return [];
  try { return JSON.parse(fs.readFileSync(LOG_FILE, 'utf8')); } catch { return []; }
}

// ── Работа с моделью push:v1 ──
function loadModel(data) {
  let m = {};
  try { m = JSON.parse(data.kv[PUSH_KEY] || '{}'); } catch { m = {}; }
  return {
    defs: Array.isArray(m.defs) ? m.defs : [],
    recipients: (m.recipients && typeof m.recipients === 'object') ? m.recipients : {},
  };
}
function saveModel(data, saveData, model) {
  data.kv[PUSH_KEY] = JSON.stringify(model);
  if (typeof saveData === 'function') saveData();
}

// ── Валидация определения пуша ──
const VALID_SOURCES = ['static', 'tasks_tomorrow', 'tasks_today_personal', 'sets', 'close_checklist'];
const HHMM_RE = /^([01]\d|2[0-3]):[0-5]\d$/;

function validAudience(a) {
  if (a === 'all' || a === 'assigned') return true;
  if (a && typeof a === 'object') {
    if (Array.isArray(a.roles))  return a.roles.every(r => typeof r === 'string');
    if (Array.isArray(a.names))  return a.names.every(n => typeof n === 'string');
  }
  return false;
}
function validSchedule(s) {
  if (!s || typeof s !== 'object') return false;
  if (!HHMM_RE.test(String(s.time || ''))) return false;
  if (s.days === 'daily') return true;
  return Array.isArray(s.days) && s.days.every(d => Number.isInteger(d) && d >= 0 && d <= 6);
}

// Собирает валидное определение из тела запроса.
// existing — текущая запись (для system-полей, которые править нельзя).
// Возвращает { def } или { error }.
function buildDef(body, existing) {
  const b = body || {};
  const id = String(existing ? existing.id : (b.id || '')).trim();
  if (!id) return { error: 'id обязателен' };
  if (!/^[a-zA-Z0-9_-]+$/.test(id)) return { error: 'id: только латиница, цифры, _ и -' };

  const title = String(b.title ?? (existing && existing.title) ?? '').trim();
  if (!title) return { error: 'title обязателен' };

  // contentSource у system-defs фиксирован (берётся из existing).
  const contentSource = existing && existing.system
    ? existing.contentSource
    : (b.contentSource ?? (existing && existing.contentSource));
  if (!VALID_SOURCES.includes(contentSource)) {
    return { error: `contentSource должен быть одним из: ${VALID_SOURCES.join(', ')}` };
  }

  const schedule = b.schedule ?? (existing && existing.schedule);
  if (!validSchedule(schedule)) return { error: 'schedule: { time:"HH:MM", days:"daily"|number[] }' };

  const audience = b.audience ?? (existing && existing.audience) ?? 'all';
  if (!validAudience(audience)) return { error: 'audience: "all"|"assigned"|{roles:[…]}|{names:[…]}' };

  const suppressIn = b.suppressStatuses ?? (existing && existing.suppressStatuses) ?? [];
  if (!Array.isArray(suppressIn) || !suppressIn.every(s => typeof s === 'string')) {
    return { error: 'suppressStatuses: массив строк' };
  }

  return {
    def: {
      id,
      title,
      enabled: b.enabled !== undefined ? !!b.enabled : (existing ? existing.enabled !== false : true),
      system: existing ? !!existing.system : false, // создать system через API нельзя
      template: b.template !== undefined ? String(b.template) : (existing ? existing.template : ''),
      contentSource,
      schedule: {
        time: String(schedule.time),
        days: schedule.days === 'daily' ? 'daily' : schedule.days.slice(),
      },
      audience,
      suppressStatuses: suppressIn.slice(),
    },
  };
}

module.exports = function makePushApi(sender, data = null, saveData = null, bot = null) {
  const router = express.Router();

  // ── CRUD определений пушей (push:v1.defs) ──

  // Список defs + состояние получателей (колокольчик читает recipients по имени).
  router.get('/defs', requireManager, (req, res) => {
    if (!data) return res.status(500).json({ error: 'push:v1 недоступен' });
    const model = loadModel(data);
    res.json({ success: true, defs: model.defs, recipients: model.recipients });
  });

  // Upsert одного определения. system-поля (system/id/contentSource) защищены.
  router.put('/defs', requireManager, (req, res) => {
    if (!data) return res.status(500).json({ error: 'push:v1 недоступен' });
    const model = loadModel(data);
    const reqId = String((req.body && req.body.id) || '').trim();
    if (!reqId) return res.status(400).json({ error: 'id обязателен' });

    const idx = model.defs.findIndex(d => d.id === reqId);
    const existing = idx >= 0 ? model.defs[idx] : null;
    const { def, error } = buildDef(req.body, existing);
    if (error) return res.status(400).json({ error });

    if (idx >= 0) model.defs[idx] = def;
    else model.defs.push(def);
    saveModel(data, saveData, model);
    res.json({ success: true, def });
  });

  // Удаление. system-defs удалять нельзя (только править/выключать).
  router.delete('/defs/:id', requireManager, (req, res) => {
    if (!data) return res.status(500).json({ error: 'push:v1 недоступен' });
    const model = loadModel(data);
    const def = model.defs.find(d => d.id === req.params.id);
    if (!def) return res.status(404).json({ error: 'Пуш не найден' });
    if (def.system) return res.status(403).json({ error: 'Предустановленный пуш нельзя удалить — только выключить' });
    model.defs = model.defs.filter(d => d.id !== req.params.id);
    saveModel(data, saveData, model);
    res.json({ success: true });
  });

  // ── Переключение получателя (вкл/выкл пушей по имени) ──
  // requireAuth + self-check (Item 7): управляющий переключает любого (by:'manager'),
  // сотрудник — только себя (by:'self', req.account === name). Edge-trigger: при смене
  // enabled true→false — уведомление всем managers с bindings (мимо гейта
  // recipients/suppressStatuses, служебный пуш). Сравниваем со старым значением
  // recipients[name] ДО записи — без хранения «последнего состояния».
  router.put('/recipients/:name', requireAuth, async (req, res) => {
    if (!data) return res.status(500).json({ error: 'push:v1 недоступен' });
    const name = req.params.name;
    const { enabled, by } = req.body || {};
    if (typeof enabled !== 'boolean') return res.status(400).json({ error: 'Поле enabled (boolean) обязательно' });

    const isManager = req.account === 'manager' || req.account === 'developer';
    const actor = by === 'self' ? 'self' : 'manager';
    // Self может менять только свой профиль; manager — любого.
    if (actor === 'self') {
      if (req.account !== name) return res.status(403).json({ error: 'Можно менять только свои уведомления' });
    } else if (!isManager) {
      return res.status(403).json({ error: 'Нет прав — требуется менеджер' });
    }

    const model = loadModel(data);
    const prev = model.recipients[name];
    const wasEnabled = prev ? prev.enabled !== false : true; // дефолт для нового — включён

    model.recipients[name] = {
      enabled,
      mutedAt: enabled ? null : new Date().toISOString(),
      mutedBy: enabled ? null : actor,
    };
    saveModel(data, saveData, model);

    let managersNotified = 0;
    if (wasEnabled && !enabled) {
      managersNotified = await notifyManagersMuted(name, actor);
    }
    res.json({ success: true, recipient: model.recipients[name], managersNotified });
  });

  // Служебный пуш управляющим «X отключил пуши» — мимо гейта.
  async function notifyManagersMuted(name, actor) {
    if (!bot || !sender) return 0;
    let managers = [];
    try { managers = sender.resolveAudienceNames({ roles: ['manager'] }); } catch { managers = []; }
    const src = actor === 'self' ? 'сам' : 'управляющий';
    const text = `🔕 <b>${name}</b> отключил уведомления (${src}).`;
    let sent = 0;
    for (const m of managers) {
      if (m === name) continue; // не дублируем самому инициатору
      const chatId = data.bindings && data.bindings[m];
      if (!chatId) { sender.recordSkip(m, 'pushMuted', 'Telegram не привязан'); continue; }
      const ok = await sender.sendPush(bot, String(chatId), text, 'pushMuted', { name: m });
      if (ok) sent++;
    }
    return sent;
  }

  // ── Статистика пуш-лога: общие счётчики + срез по userId и по имени сотрудника ──
  // SEC-8: фильтрация по tenantId из JWT (старые записи без tenantId относятся к DEFAULT_TENANT).
  router.get('/stats', requireManager, (req, res) => {
    const tid = req.tenantId || 'pivnaya_karta';
    const allLog = loadLog();
    // Записи без tenantId считаются принадлежащими 'pivnaya_karta' (back-compat).
    const log = allLog.filter(e => (e.tenantId || 'pivnaya_karta') === tid);
    const byUser = {};
    const byName = {};
    let sent = 0, failed = 0, skipped = 0;

    for (const entry of log) {
      const uid = entry.userId ?? 'unknown';
      const nm  = entry.name ?? entry.userName ?? 'unknown';
      if (!byUser[uid]) byUser[uid] = { sent: 0, failed: 0, skipped: 0 };
      if (!byName[nm])  byName[nm]  = { sent: 0, failed: 0, skipped: 0 };
      byUser[uid][entry.status] = (byUser[uid][entry.status] || 0) + 1;
      byName[nm][entry.status]  = (byName[nm][entry.status]  || 0) + 1;
      if (entry.status === 'sent')    sent++;
      else if (entry.status === 'failed')  failed++;
      else if (entry.status === 'skipped') skipped++;
    }

    res.json({ success: true, total: log.length, sent, failed, skipped, byUser, byName });
  });

  return router;
};
