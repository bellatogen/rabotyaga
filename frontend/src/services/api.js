const API_BASE = import.meta.env.VITE_API_URL ?? '/api';

// ── Все fetch запросы идут с credentials (для httpOnly cookie) ──
const FETCH_OPTS = { credentials: 'include' };

// ── localStorage: fallback/cache (префикс «rab:») ──
const _lsk = k => 'rab:' + k;
function lsGet(k, fb) { try { const v = localStorage.getItem(_lsk(k)); return v != null ? JSON.parse(v) : fb; } catch { return fb; } }
function lsSet(k, v) { try { localStorage.setItem(_lsk(k), JSON.stringify(v)); } catch {} }

let SERVER_OK = null;

// ── KV: загрузка ──
export async function ld(k, fb) {
  try {
    const r = await fetch(`${API_BASE}/kv/${encodeURIComponent(k)}`, FETCH_OPTS);
    if (r.ok) {
      SERVER_OK = true;
      const d = await r.json();
      if (d && d.value != null) { const val = JSON.parse(d.value); lsSet(k, val); return val; }
      return lsGet(k, fb);
    }
    if (r.status === 401 || r.status === 403) {
      SERVER_OK = true; // сервер работает, просто нет доступа
      return lsGet(k, fb);
    }
  } catch {}
  SERVER_OK = false;
  return lsGet(k, fb);
}

// ── KV: сохранение ──
export async function sv(k, v) {
  lsSet(k, v);
  try {
    const r = await fetch(`${API_BASE}/kv/${encodeURIComponent(k)}`, {
      ...FETCH_OPTS,
      method: 'PUT',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ value: JSON.stringify(v) }),
    });
    SERVER_OK = r.ok;
  } catch { SERVER_OK = false; }
}

// ── Пинг ──
export async function pingServer() {
  try {
    const r = await fetch(`${API_BASE}/health`, { ...FETCH_OPTS, cache: 'no-store' });
    SERVER_OK = r.ok;
    return r.ok;
  } catch { SERVER_OK = false; return false; }
}

// ── Auth API ──

/** Войти. Возвращает { ok, account, firstLogin? } или бросает Error с message. */
export async function authLogin(account, password) {
  let r;
  try {
    r = await fetch(`${API_BASE}/auth/login`, {
      ...FETCH_OPTS,
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ account, password }),
    });
  } catch {
    throw new Error('Нет связи с сервером');
  }
  if (r.status === 405) throw new Error('Сервер не принимает запрос (405) — открой rabotyaga55.ru');
  let data = {};
  try { data = await r.json(); } catch { /* пустой ответ */ }
  if (!r.ok) throw new Error(data.error || `Ошибка сервера (${r.status})`);
  return data;
}

/** Выйти (сбросить cookie). */
export async function authLogout() {
  await fetch(`${API_BASE}/auth/logout`, { ...FETCH_OPTS, method: 'POST' });
}

/** Восстановить сессию по cookie. Возвращает account или null. */
export async function authMe() {
  try {
    const r = await fetch(`${API_BASE}/auth/me`, FETCH_OPTS);
    if (!r.ok) return null;
    const d = await r.json();
    return d.account || null;
  } catch { return null; }
}

/** Список состава для экрана входа (публичный, работает ДО авторизации). */
export async function fetchRoster() {
  try {
    const r = await fetch(`${API_BASE}/roster`, FETCH_OPTS);
    if (!r.ok) return null;
    const d = await r.json();
    return Array.isArray(d.members) ? d.members : null;
  } catch { return null; }
}

/** Проверить, задан ли пароль у аккаунта. */
export async function authHasPassword(account) {
  try {
    const r = await fetch(`${API_BASE}/auth/has-password/${encodeURIComponent(account)}`, FETCH_OPTS);
    if (!r.ok) return false;
    const d = await r.json();
    return !!d.hasPassword;
  } catch { return false; }
}

/** Изменить пароль. Бросает Error при ошибке. */
export async function authChangePassword(account, newPassword, currentPassword) {
  const r = await fetch(`${API_BASE}/auth/change-password`, {
    ...FETCH_OPTS,
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ account, newPassword, currentPassword }),
  });
  const d = await r.json();
  if (!r.ok) throw new Error(d.error || `HTTP ${r.status}`);
  return d;
}

/** Сбросить пароль (только manager/developer). */
export async function authResetPassword(account) {
  const r = await fetch(`${API_BASE}/auth/reset-password`, {
    ...FETCH_OPTS,
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ account }),
  });
  const d = await r.json();
  if (!r.ok) throw new Error(d.error || `HTTP ${r.status}`);
  return d;
}

// ── Telegram bind ──
export async function tgBind(name, telegramId) {
  if (!telegramId) return;
  try {
    await fetch(`${API_BASE}/bind`, {
      ...FETCH_OPTS,
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ name, telegramId }),
    });
  } catch {}
}

// ── Прочие API (для AdminTab и др.) ──
export const kvGet = async (key) => {
  const res = await fetch(`${API_BASE}/kv/${key}`, FETCH_OPTS);
  if (!res.ok) throw new Error(`Failed to fetch ${key}`);
  const data = await res.json();
  return data.value;
};

export const kvSet = async (key, value) => {
  const res = await fetch(`${API_BASE}/kv/${key}`, {
    ...FETCH_OPTS,
    method: 'PUT',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ value }),
  });
  if (!res.ok) throw new Error(`Failed to set ${key}`);
  return res.json();
};

export const bindEmployee = async (name, telegramId) => {
  const res = await fetch(`${API_BASE}/bind`, {
    ...FETCH_OPTS,
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ name, telegramId }),
  });
  if (!res.ok) throw new Error('Failed to bind employee');
  return res.json();
};

export const getBindings = async () => {
  const res = await fetch(`${API_BASE}/bindings`, FETCH_OPTS);
  if (!res.ok) throw new Error('Unauthorized');
  return res.json();
};

// ── Редактор пушей (push:v1) ──
// CRUD определений + переключение получателей + статистика лога.
export const getPushDefs = async () => {
  const res = await fetch(`${API_BASE}/push/defs`, FETCH_OPTS);
  if (!res.ok) throw new Error('Unauthorized');
  return res.json(); // { defs, recipients }
};
export const savePushDef = async (def) => {
  const res = await fetch(`${API_BASE}/push/defs`, {
    ...FETCH_OPTS, method: 'PUT',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify(def),
  });
  const d = await res.json();
  if (!res.ok) throw new Error(d.error || `HTTP ${res.status}`);
  return d;
};
export const deletePushDef = async (id) => {
  const res = await fetch(`${API_BASE}/push/defs/${encodeURIComponent(id)}`, { ...FETCH_OPTS, method: 'DELETE' });
  const d = await res.json();
  if (!res.ok) throw new Error(d.error || `HTTP ${res.status}`);
  return d;
};
// by: 'manager' | 'self' — при выключении управляющему уходит edge-trigger уведомление.
export const setRecipientEnabled = async (name, enabled, by = 'manager') => {
  const res = await fetch(`${API_BASE}/push/recipients/${encodeURIComponent(name)}`, {
    ...FETCH_OPTS, method: 'PUT',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ enabled, by }),
  });
  const d = await res.json();
  if (!res.ok) throw new Error(d.error || `HTTP ${res.status}`);
  return d;
};
export const getPushStats = async () => {
  const res = await fetch(`${API_BASE}/push/stats`, FETCH_OPTS);
  if (!res.ok) throw new Error('Unauthorized');
  return res.json(); // { total, sent, failed, skipped, byUser, byName }
};

export const sendTestPush = async (name) => {
  const res = await fetch(`${API_BASE}/push/test/${name}`, FETCH_OPTS);
  if (!res.ok) throw new Error('Failed to send push');
  return res.json();
};

// ── Бот-чаты и макросы рассылки (только менеджер) ──
export const getBotChats = async () => {
  const res = await fetch(`${API_BASE}/bot-chats`, FETCH_OPTS);
  if (!res.ok) throw new Error('Unauthorized');
  return res.json();
};
export const addBotChat = async (name, chatId) => {
  const res = await fetch(`${API_BASE}/bot-chats`, {
    ...FETCH_OPTS, method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ name, chatId }),
  });
  const d = await res.json();
  if (!res.ok) throw new Error(d.error || `HTTP ${res.status}`);
  return d;
};
export const deleteBotChat = async (id) => {
  const res = await fetch(`${API_BASE}/bot-chats/${encodeURIComponent(id)}`, { ...FETCH_OPTS, method: 'DELETE' });
  if (!res.ok) throw new Error('Failed to delete chat');
  return res.json();
};
export const getBotMacros = async () => {
  const res = await fetch(`${API_BASE}/bot-macros`, FETCH_OPTS);
  if (!res.ok) throw new Error('Unauthorized');
  return res.json();
};
export const addBotMacro = async (macro) => {
  const res = await fetch(`${API_BASE}/bot-macros`, {
    ...FETCH_OPTS, method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify(macro),
  });
  const d = await res.json();
  if (!res.ok) throw new Error(d.error || `HTTP ${res.status}`);
  return d;
};
export const updateBotMacro = async (id, patch) => {
  const res = await fetch(`${API_BASE}/bot-macros/${encodeURIComponent(id)}`, {
    ...FETCH_OPTS, method: 'PUT',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify(patch),
  });
  const d = await res.json();
  if (!res.ok) throw new Error(d.error || `HTTP ${res.status}`);
  return d;
};
export const deleteBotMacro = async (id) => {
  const res = await fetch(`${API_BASE}/bot-macros/${encodeURIComponent(id)}`, { ...FETCH_OPTS, method: 'DELETE' });
  if (!res.ok) throw new Error('Failed to delete macro');
  return res.json();
};


// ── Пуш «Смена закрыта» — вызывается фронтом при закрытии смены (все задачи + после 23:30) ──
export async function notifyShiftClosed({ date, done, total, revenueFact, revenuePlan, workers }) {
  try {
    const res = await fetch(`${API_BASE}/push/shift-closed`, {
      ...FETCH_OPTS,
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ date, done, total, revenueFact, revenuePlan, workers }),
    });
    return res.ok ? await res.json() : null;
  } catch { return null; }
}

// ── iiko basket analysis (market basket / ассоциативные правила) ──
// force=true — игнорировать кэш на сервере (20ч), пересчитать
export async function iikoBasket(force = false) {
  const url = `${API_BASE}/iiko/basket${force ? '?force=1' : ''}`;
  const res  = await fetch(url, FETCH_OPTS);
  const json = await res.json();
  if (!res.ok) throw new Error(json.error || `HTTP ${res.status}`);
  return json;
}

// ── iiko анализ маржинальности за 30 дней (Умные соты — авто-порог) ──
// force=true — сбросить кэш (24ч TTL), пересчитать
export async function iikoMarginData(force = false) {
  const url = `${API_BASE}/iiko/margin-data${force ? '?force=1' : ''}`;
  const res  = await fetch(url, FETCH_OPTS);
  const json = await res.json();
  if (!res.ok) throw new Error(json.error || `HTTP ${res.status}`);
  return json;
}

// ── iiko ABC-анализ продаж за сегодня (Умные соты) ──
// force=true — сбросить кэш на сервере (30 мин TTL), пересчитать
export async function iikoSalesABC(force = false) {
  const url = `${API_BASE}/iiko/sales-abc${force ? '?force=1' : ''}`;
  const res  = await fetch(url, FETCH_OPTS);
  const json = await res.json();
  if (!res.ok) throw new Error(json.error || `HTTP ${res.status}`);
  return json;
}

// ── Кокпит кранов (taps:v1 + tap_config:v1) ──
// Все вычисленные поля (computeTap) считает бэк; фронт-зеркало utils/tapCompute.js
// нужно только для live-симулятора без round-trip. Все роуты requireAuth.

// Список кранов с вычислениями + конфиг: { taps:[...], config }
export async function getTaps() {
  const res = await fetch(`${API_BASE}/taps`, FETCH_OPTS);
  const json = await res.json();
  if (!res.ok) throw new Error(json.error || `HTTP ${res.status}`);
  return json;
}

// Создать кран. Возвращает созданный кран (с вычислениями).
export async function createTap(tap) {
  const res = await fetch(`${API_BASE}/taps`, {
    ...FETCH_OPTS, method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify(tap),
  });
  const json = await res.json();
  if (!res.ok) throw new Error(json.error || `HTTP ${res.status}`);
  return json;
}

// Обновить кран по id частичным патчем.
export async function updateTap(id, patch) {
  const res = await fetch(`${API_BASE}/taps/${encodeURIComponent(id)}`, {
    ...FETCH_OPTS, method: 'PUT',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify(patch),
  });
  const json = await res.json();
  if (!res.ok) throw new Error(json.error || `HTTP ${res.status}`);
  return json;
}

// Удалить кран по id.
export async function deleteTap(id) {
  const res = await fetch(`${API_BASE}/taps/${encodeURIComponent(id)}`, { ...FETCH_OPTS, method: 'DELETE' });
  const json = await res.json();
  if (!res.ok) throw new Error(json.error || `HTTP ${res.status}`);
  return json;
}

// Конфиг порогов/скидки: { greenThreshold, yellowThreshold, discountRate }
export async function getTapConfig() {
  const res = await fetch(`${API_BASE}/taps/config`, FETCH_OPTS);
  const json = await res.json();
  if (!res.ok) throw new Error(json.error || `HTTP ${res.status}`);
  return json;
}

export async function updateTapConfig(patch) {
  const res = await fetch(`${API_BASE}/taps/config`, {
    ...FETCH_OPTS, method: 'PUT',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify(patch),
  });
  const json = await res.json();
  if (!res.ok) throw new Error(json.error || `HTTP ${res.status}`);
  return json;
}

// Подтянуть продажи 30д из IIKO в salesPerMonth (только краны с iikoProductId).
// IIKO не настроен → бэк отдаёт 503.
export async function refreshTapSales() {
  const res = await fetch(`${API_BASE}/taps/refresh-sales`, { ...FETCH_OPTS, method: 'POST' });
  const json = await res.json();
  if (!res.ok) throw new Error(json.error || `HTTP ${res.status}`);
  return json;
}
