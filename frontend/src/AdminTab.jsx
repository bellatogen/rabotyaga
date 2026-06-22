import { useState, useEffect } from 'react';

const API = '/api';

const TEMPLATE_LABELS = {
  dayBeforeShift:     'За день до смены (20:00)',
  personalTasks:      'Личные задачи на день (09:00)',
  closeShiftReminder: 'Закрытие смены (22:00)',
};

// SECURITY: /api/admin/* не защищён backend-авторизацией — только frontend-gating через isManager
export function AdminTab({ auth, members, ds }) {
  const [sub, setSub]               = useState('templates');
  const [loading, setLoading]       = useState(true);
  const [error, setError]           = useState(null);

  // Данные, общие для нескольких вкладок
  const [bindings, setBindings]     = useState({});  // { name -> telegramId }

  // Шаблоны
  const [templates, setTemplates]   = useState({});
  const [edited, setEdited]         = useState({});
  const [saving, setSaving]         = useState(false);
  const [saved, setSaved]           = useState(false);

  // Сотрудники
  const [employees, setEmployees]   = useState([]);  // [{name, telegramId, push}]

  // Статистика
  const [stats, setStats]           = useState(null);
  const [statsLoading, setStatsLoading] = useState(false);

  // ── Загрузка при монтировании ──
  useEffect(() => { loadBase(); }, []);

  async function loadBase() {
    setLoading(true);
    setError(null);
    try {
      const [tplRes, empRes] = await Promise.all([
        fetch(`${API}/admin/default-templates`),
        fetch(`${API}/admin/employees`),
      ]);
      const tplData = await tplRes.json();
      const empData = await empRes.json();

      if (tplData.success) {
        setTemplates(tplData.templates);
        setEdited(tplData.templates);
      }
      if (empData.success) {
        const b  = empData.bindings    || {};
        const ps = empData.pushSettings || {};
        setBindings(b);
        setEmployees(
          Object.entries(b).map(([name, telegramId]) => ({
            name,
            telegramId: String(telegramId),
            push: ps[String(telegramId)] || null,
          }))
        );
      }
    } catch (e) {
      setError('Ошибка загрузки: ' + e.message);
    } finally {
      setLoading(false);
    }
  }

  // ── Статистика грузится отдельно при переключении на вкладку ──
  useEffect(() => {
    if (sub === 'stats' && !stats) loadStats();
  }, [sub]);

  async function loadStats() {
    setStatsLoading(true);
    try {
      const res  = await fetch(`${API}/push/stats`);
      const data = await res.json();
      setStats(data.success ? data : { error: 'Ошибка API' });
    } catch (e) {
      setStats({ error: e.message });
    } finally {
      setStatsLoading(false);
    }
  }

  // ── Сохранение шаблонов ──
  async function saveTemplates() {
    setSaving(true);
    try {
      const res = await fetch(`${API}/admin/default-templates`, {
        method:  'POST',
        headers: { 'Content-Type': 'application/json' },
        body:    JSON.stringify({ templates: edited }),
      });
      if (!res.ok) throw new Error(res.status);
      setTemplates(edited);
      setSaved(true);
      setTimeout(() => setSaved(false), 2000);
    } catch (e) {
      alert('Ошибка сохранения: ' + e.message);
    } finally {
      setSaving(false);
    }
  }

  // ── Render ──
  if (loading) return (
    <div className="sec">
      <div className="info-box">Загрузка...</div>
    </div>
  );

  return (
    <div className="sec">
      {error && <div className="alert" style={{ marginBottom: 12 }}>{error}</div>}

      {/* Chip-переключатель */}
      <div className="tabs" style={{ marginBottom: 16 }}>
        {[
          ['templates', '📝 Шаблоны'],
          ['employees', '👥 Сотрудники'],
          ['stats',     '📊 Статистика'],
        ].map(([id, label]) => (
          <button
            key={id}
            className={`tab${sub === id ? ' on' : ''}`}
            onClick={() => setSub(id)}
          >
            {label}
          </button>
        ))}
      </div>

      {/* ── Шаблоны ── */}
      {sub === 'templates' && (
        <div>
          <div className="sec-lbl" style={{ marginBottom: 8 }}>Шаблоны пушей по умолчанию</div>
          <div className="info-box" style={{ marginBottom: 14, fontSize: 12 }}>
            Переменные: <code>{'{tasks}'}</code> — задачи, <code>{'{name}'}</code> — имя сотрудника
          </div>

          {Object.entries(TEMPLATE_LABELS).map(([key, label]) => (
            <div key={key} style={{ marginBottom: 16 }}>
              <div style={{ fontSize: 12, fontWeight: 600, marginBottom: 6, color: 'var(--mt)' }}>
                {label}
              </div>
              <textarea
                value={edited[key] || ''}
                onChange={e => setEdited(prev => ({ ...prev, [key]: e.target.value }))}
                rows={4}
                style={{
                  width: '100%', padding: '8px 10px', borderRadius: 8,
                  border: '1px solid var(--bd)', background: 'var(--sf)',
                  fontFamily: 'inherit', fontSize: 13, resize: 'vertical',
                  boxSizing: 'border-box', color: 'var(--tx)',
                }}
              />
            </div>
          ))}

          <button
            className="btn btn-p"
            onClick={saveTemplates}
            disabled={saving}
          >
            {saved ? '✓ Сохранено' : saving ? 'Сохранение...' : 'Сохранить шаблоны'}
          </button>
        </div>
      )}

      {/* ── Сотрудники ── */}
      {sub === 'employees' && (
        <div>
          <div className="sec-lbl" style={{ marginBottom: 8 }}>
            Привязки к Telegram ({employees.length})
          </div>

          {employees.length === 0 ? (
            <div className="info-box">
              Привязок нет. Сотрудник открывает приложение через Telegram — привязка создаётся автоматически.
            </div>
          ) : employees.map(({ name, telegramId, push }) => (
            <div
              key={name}
              style={{
                background: 'var(--sf)', borderRadius: 10,
                padding: '10px 14px', marginBottom: 8,
                display: 'flex', justifyContent: 'space-between', alignItems: 'center',
              }}
            >
              <div>
                <div style={{ fontWeight: 600, fontSize: 14 }}>{name}</div>
                <div style={{ fontSize: 11, color: 'var(--mt)', fontFamily: 'monospace', marginTop: 2 }}>
                  TG ID: {telegramId}
                </div>
              </div>
              <div style={{
                fontSize: 12,
                color: push?.enabled !== false ? '#8bc47a' : 'var(--mt)',
              }}>
                {push?.enabled !== false ? '🔔 вкл' : '🔕 выкл'}
              </div>
            </div>
          ))}
        </div>
      )}

      {/* ── Статистика ── */}
      {sub === 'stats' && (
        <div>
          <div className="sec-lbl" style={{ marginBottom: 8 }}>Статистика пушей</div>

          {statsLoading && <div className="info-box">Загрузка...</div>}

          {!statsLoading && stats && (stats.error ? (
            <div className="alert">{stats.error}</div>
          ) : (
            <>
              <div className="grid2" style={{ marginBottom: 16 }}>
                {[
                  ['Всего',          stats.total   ?? 0],
                  ['Отправлено',     stats.sent    ?? 0],
                  ['Не доставлено',  stats.failed  ?? 0],
                  ['Пропущено',      stats.skipped ?? 0],
                ].map(([label, val]) => (
                  <div key={label} className="stat-c">
                    <div style={{ fontSize: 24, fontWeight: 700 }}>{val}</div>
                    <div style={{ fontSize: 11, color: 'var(--mt)' }}>{label}</div>
                  </div>
                ))}
              </div>

              {Object.keys(stats.byUser || {}).length > 0 && (
                <>
                  <div className="sec-lbl" style={{ marginBottom: 8 }}>По сотрудникам</div>
                  {Object.entries(stats.byUser).map(([uid, s]) => {
                    // маппинг telegramId → имя через bindings
                    const name = Object.entries(bindings)
                      .find(([, tid]) => String(tid) === uid)?.[0] || uid;
                    return (
                      <div key={uid} style={{
                        background: 'var(--sf)', borderRadius: 8,
                        padding: '8px 12px', marginBottom: 6,
                        display: 'flex', justifyContent: 'space-between', alignItems: 'center',
                      }}>
                        <div style={{ fontWeight: 600, fontSize: 13 }}>{name}</div>
                        <div style={{ fontSize: 12, color: 'var(--mt)' }}>
                          ✅ {s.sent || 0}   ❌ {s.failed || 0}   ⏭ {s.skipped || 0}
                        </div>
                      </div>
                    );
                  })}
                </>
              )}

              {(stats.total ?? 0) === 0 && (
                <div className="info-box">Пушей ещё не отправлялось.</div>
              )}
            </>
          ))}

          <button
            className="btn"
            onClick={() => { setStats(null); loadStats(); }}
            style={{ marginTop: 12 }}
          >
            ↺ Обновить
          </button>
        </div>
      )}
    </div>
  );
}
