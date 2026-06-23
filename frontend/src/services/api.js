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
  const r = await fetch(`${API_BASE}/auth/login`, {
    ...FETCH_OPTS,
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ account, password }),
  });
  const data = await r.json();
  if (!r.ok) throw new Error(data.error || `HTTP ${r.status}`);
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

export const getPushLog = async () => {
  const res = await fetch(`${API_BASE}/admin/push-logs`, FETCH_OPTS);
  if (!res.ok) throw new Error('Unauthorized');
  return res.json();
};

export const getPushSchedule = async () => {
  const res = await fetch(`${API_BASE}/admin/schedule`, FETCH_OPTS);
  if (!res.ok) throw new Error('Unauthorized');
  return res.json();
};

export const setPushSchedule = async (items) => {
  const res = await fetch(`${API_BASE}/admin/schedule`, {
    ...FETCH_OPTS,
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify(items),
  });
  if (!res.ok) throw new Error('Failed to set schedule');
  return res.json();
};

export const sendTestPush = async (name) => {
  const res = await fetch(`${API_BASE}/push/test/${name}`, FETCH_OPTS);
  if (!res.ok) throw new Error('Failed to send push');
  return res.json();
};
