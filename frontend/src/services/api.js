const API_BASE = '/api';

// ── Внутренний слой localStorage (ключи с префиксом «rab:») ──
const _lsk = k => 'rab:' + k;
function lsGet(k, fb) { try { const v = localStorage.getItem(_lsk(k)); return v != null ? JSON.parse(v) : fb; } catch { return fb; } }
function lsSet(k, v) { try { localStorage.setItem(_lsk(k), JSON.stringify(v)); } catch {} }

// Статус связи с сервером (module-level, не экспортируется напрямую)
let SERVER_OK = null; // null=ещё не знаем, true/false

// ── Высокоуровневые функции работы с хранилищем ──

/**
 * Загружает данные по ключу: сначала с сервера, при неудаче — из localStorage.
 * Побочный эффект: обновляет SERVER_OK.
 */
export async function ld(k, fb) {
  try {
    const r = await fetch(`${API_BASE}/kv/${encodeURIComponent(k)}`);
    if (r.ok) {
      SERVER_OK = true;
      const d = await r.json();
      if (d && d.value != null) { const val = JSON.parse(d.value); lsSet(k, val); return val; }
      return lsGet(k, fb);
    }
  } catch {}
  SERVER_OK = false; // бэкенд недоступен — берём из локального резерва
  return lsGet(k, fb);
}

/**
 * Сохраняет данные по ключу: мгновенно в localStorage, затем на сервер.
 * Побочный эффект: обновляет SERVER_OK.
 */
export async function sv(k, v) {
  lsSet(k, v); // мгновенно и всегда — это и есть «не забывает после перезагрузки»
  try {
    const r = await fetch(`${API_BASE}/kv/${encodeURIComponent(k)}`, {
      method: 'PUT',
      headers: {'Content-Type': 'application/json'},
      body: JSON.stringify({value: JSON.stringify(v)}),
    });
    SERVER_OK = r.ok;
  } catch { SERVER_OK = false; }
}

/** Проверяет доступность сервера. Возвращает boolean. */
export async function pingServer() {
  try {
    const r = await fetch(`${API_BASE}/health`, {cache: 'no-store'});
    SERVER_OK = r.ok;
    return r.ok;
  } catch { SERVER_OK = false; return false; }
}

/** Привязывает имя сотрудника к Telegram-аккаунту */
export async function tgBind(name, telegramId) {
  if (!telegramId) return;
  try {
    await fetch(`${API_BASE}/bind`, {
      method: 'POST',
      headers: {'Content-Type': 'application/json'},
      body: JSON.stringify({name, telegramId}),
    });
  } catch {}
}

export const kvGet = async (key) => {
  const res = await fetch(`${API_BASE}/kv/${key}`);
  if (!res.ok) throw new Error(`Failed to fetch ${key}`);
  const data = await res.json();
  return data.value;
};

export const kvSet = async (key, value) => {
  const res = await fetch(`${API_BASE}/kv/${key}`, {
    method: 'PUT',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ value })
  });
  if (!res.ok) throw new Error(`Failed to set ${key}`);
  return res.json();
};

export const bindEmployee = async (name, telegramId) => {
  const res = await fetch(`${API_BASE}/bind`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ name, telegramId })
  });
  if (!res.ok) throw new Error('Failed to bind employee');
  return res.json();
};

export const getBindings = async (token) => {
  const res = await fetch(`${API_BASE}/bindings?token=${token}`);
  if (!res.ok) throw new Error('Unauthorized');
  return res.json();
};

export const getPushLog = async (token) => {
  const res = await fetch(`${API_BASE}/admin/push-logs?token=${token}`);
  if (!res.ok) throw new Error('Unauthorized');
  return res.json();
};

export const getPushSchedule = async (_date, token) => {
  // Примечание: бэкенд возвращает полный объект расписания, не per-date
  const res = await fetch(`${API_BASE}/admin/schedule?token=${token}`);
  if (!res.ok) throw new Error('Unauthorized');
  return res.json();
};

export const setPushSchedule = async (_date, items, token) => {
  const res = await fetch(`${API_BASE}/admin/schedule?token=${token}`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify(items)
  });
  if (!res.ok) throw new Error('Failed to set schedule');
  return res.json();
};

export const sendTestPush = async (name, token) => {
  const res = await fetch(`${API_BASE}/push/test/${name}?token=${token}`);
  if (!res.ok) throw new Error('Failed to send push');
  return res.json();
};
