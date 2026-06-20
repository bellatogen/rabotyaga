const API_BASE = '/api';

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
  const res = await fetch(`${API_BASE}/push-log?token=${token}`);
  if (!res.ok) throw new Error('Unauthorized');
  return res.json();
};

export const getPushSchedule = async (date, token) => {
  const res = await fetch(`${API_BASE}/push-schedule/${date}?token=${token}`);
  if (!res.ok) throw new Error('Unauthorized');
  return res.json();
};

export const setPushSchedule = async (date, items, token) => {
  const res = await fetch(`${API_BASE}/push-schedule?token=${token}`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ date, items })
  });
  if (!res.ok) throw new Error('Failed to set schedule');
  return res.json();
};

export const sendTestPush = async (name, token) => {
  const res = await fetch(`${API_BASE}/push/test/${name}?token=${token}`);
  if (!res.ok) throw new Error('Failed to send push');
  return res.json();
};
