import { useState, useEffect } from 'react';
import { FileText, Users, BarChart2, RefreshCw, AlertTriangle, CheckCircle, Calendar, Download, Check, Bell, BellOff, TrendingUp } from 'lucide-react';

const API = '/api';

const TEMPLATE_LABELS = {
  dayBeforeShift:     'За день до смены (20:00)',
  personalTasks:      'Личные задачи на день (09:00)',
  closeShiftReminder: 'Закрытие смены (22:00)',
};

// SECURITY: /api/admin/* не защищён backend-авторизацией — только frontend-gating через isManager
export function AdminTab({ auth, members, ds, onReloadData }) {
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

  // Синхронизация
  const [syncStatus,    setSyncStatus]    = useState(null);
  const [syncLoading,   setSyncLoading]   = useState(false);
  // Бэкфилл (историческое восстановление)
  const [backfillFrom,  setBackfillFrom]  = useState(`${new Date().getFullYear()}-01-01`);
  const [backfillStatus, setBackfillStatus] = useState(null);
  const [backfillLoading, setBackfillLoading] = useState(false);

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
    if (sub === 'sync' && !syncStatus) loadSyncStatus();
  }, [sub]);

  async function loadSyncStatus() {
    try {
      const res = await fetch('/api/sync/schedule/status');
      const j = await res.json();
      setSyncStatus(j);
    } catch {}
  }

  async function runSync() {
    setSyncLoading(true);
    try {
      const [schedRes, revenueRes] = await Promise.all([
        fetch('/api/sync/schedule', { method: 'POST', credentials: 'include' }),
        fetch('/api/iiko/revenue/sync', { method: 'POST', credentials: 'include' }),
      ]);
      const sched   = await schedRes.json();
      const revenue = await revenueRes.json().catch(() => ({}));
      setSyncStatus({
        ...sched,
        revenueUpdated: revenue.updated ?? null,
        revenueError:   revenue.error   ?? null,
      });
    } catch (e) {
      setSyncStatus({ lastRun: new Date().toISOString(), daysUpdated: 0, error: e.message });
    } finally {
      setSyncLoading(false);
    }
  }

  async function runBackfill() {
    setBackfillLoading(true);
    setBackfillStatus(null);
    try {
      const res  = await fetch('/api/admin/backfill', {
        method: 'POST',
        credentials: 'include',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ from: backfillFrom }),
      });
      const json = await res.json();
      if (!res.ok) throw new Error(json.error || `HTTP ${res.status}`);
      setBackfillStatus(json);
      // Перезагружаем revenue + schedule в React-стейте приложения —
      // иначе UI показывает старые данные до следующей перезагрузки страницы
      if (onReloadData) await onReloadData();
    } catch (e) {
      setBackfillStatus({ error: e.message });
    } finally {
      setBackfillLoading(false);
    }
  }

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
          ['templates', <FileText size={11}/>, 'Шаблоны'],
          ['employees', <Users size={11}/>, 'Сотрудники'],
          ['stats',     <BarChart2 size={11}/>, 'Статистика'],
          ['sync',      <RefreshCw size={11}/>, 'Синхронизация'],
        ].map(([id, icon, label]) => (
          <button
            key={id}
            className={`tab${sub === id ? ' on' : ''}`}
            onClick={() => setSub(id)}
            style={{display:'flex',alignItems:'center',gap:4}}
          >
            {icon}{label}
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
            {saved ? <><Check size={13}/>Сохранено</> : saving ? 'Сохранение...' : 'Сохранить шаблоны'}
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
                <span style={{display:'flex',alignItems:'center',gap:3}}>{push?.enabled !== false ? <><Bell size={12}/>вкл</> : <><BellOff size={12}/>выкл</>}</span>
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
                          <span style={{display:'flex',alignItems:'center',gap:6}}><CheckCircle size={12} color="#8bc47a"/>{s.sent||0} · <AlertTriangle size={12} color="#e07a60"/>{s.failed||0} · <span style={{opacity:.6}}>{s.skipped||0} проп.</span></span>
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

      {/* ── Синхронизация ── */}
      {sub === 'sync' && (
        <div>
          <div className="sec-lbl" style={{ marginBottom: 6 }}>Синхронизация данных</div>
          <div className="info-box" style={{ marginBottom: 16, fontSize: 12 }}>
            Подгружает расписание барменов из Google Sheets и актуальную выручку из iiko за текущий месяц.
            Запускается автоматически каждые 12 часов. Прошлые даты не перезаписываются.
          </div>

          {syncStatus && (
            <div style={{ background:'var(--sf)', borderRadius:10, padding:'12px 14px', marginBottom:16 }}>
              {syncStatus.error ? (
                <div style={{ color:'#e07a60', fontSize:13, fontWeight:600, marginBottom:4, display:'flex',alignItems:'center',gap:5 }}><AlertTriangle size={13}/>Ошибка расписания: {syncStatus.error}</div>
              ) : (
                <div style={{ color:'#8bc47a', fontSize:13, fontWeight:600, marginBottom:4, display:'flex',alignItems:'center',gap:5 }}>
                  <CheckCircle size={13}/>Расписание: обновлено {syncStatus.daysUpdated} дней
                </div>
              )}
              {syncStatus.revenueUpdated != null && (
                syncStatus.revenueError
                  ? <div style={{ color:'#e07a60', fontSize:12, display:'flex',alignItems:'center',gap:4 }}><AlertTriangle size={12}/>iiko выручка: {syncStatus.revenueError}</div>
                  : <div style={{ color:'#8bc47a', fontSize:12, display:'flex',alignItems:'center',gap:4 }}><CheckCircle size={12}/>Выручка iiko: обновлено {syncStatus.revenueUpdated} дней</div>
              )}
              {syncStatus.lastRun && (
                <div style={{ fontSize:11, color:'var(--mt)', marginTop:6 }}>
                  {new Date(syncStatus.lastRun).toLocaleString('ru-RU')}
                </div>
              )}
            </div>
          )}

          <button
            className="btn btn-p"
            onClick={runSync}
            disabled={syncLoading}
          >
            {syncLoading ? <><RefreshCw size={15} style={{animation:'spin 1s linear infinite'}}/>Синхронизация...</> : <><RefreshCw size={15}/>Синхронизировать сейчас</>}
          </button>

          {/* ── Восстановление истории ── */}
          <div style={{ marginTop: 24, borderTop: '1px solid var(--bd)', paddingTop: 16 }}>
            <div className="sec-lbl" style={{ marginBottom: 6 }}>Восстановить историю</div>
            <div className="info-box" style={{ marginBottom: 12, fontSize: 12 }}>
              Загружает расписание и факт выручки из iiko за выбранный период.
              Существующие данные не удаляются — только дополняются.
              Занимает до 60 секунд.
            </div>

            <div style={{ display: 'flex', gap: 8, alignItems: 'center', marginBottom: 12, flexWrap: 'wrap' }}>
              <label style={{ fontSize: 12, color: 'var(--mt)', flexShrink: 0 }}>С даты:</label>
              <input
                type="date"
                value={backfillFrom}
                max={new Date().toISOString().slice(0, 10)}
                onChange={e => setBackfillFrom(e.target.value)}
                style={{ background: 'var(--bg)', border: '1px solid var(--bd)', borderRadius: 7,
                  padding: '6px 10px', color: 'var(--pp)', fontSize: 13, fontFamily: 'inherit' }}
              />
              <span style={{ fontSize: 12, color: 'var(--mt)' }}>
                → {new Date().toLocaleDateString('ru-RU')}
              </span>
            </div>

            {backfillStatus && !backfillStatus.error && (
              <div style={{ background: 'var(--sf)', borderRadius: 10, padding: '10px 14px', marginBottom: 12, fontSize: 12 }}>
                <div style={{ color: '#8bc47a', fontWeight: 600, marginBottom: 6, display:'flex',alignItems:'center',gap:5 }}>
                  <CheckCircle size={13}/>Данные обновлены в интерфейсе ({backfillStatus.from} → {backfillStatus.to})
                </div>
                {/* Расписание */}
                {backfillStatus.schedule?.error
                  ? <div style={{ color: '#e07a60', marginBottom: 4, display:'flex',alignItems:'center',gap:4 }}><AlertTriangle size={12}/>Расписание: {backfillStatus.schedule.error}</div>
                  : <div style={{ color: backfillStatus.schedule?.daysUpdated > 0 ? '#8bc47a' : '#e0a41e', marginBottom: 4, display:'flex',alignItems:'center',gap:4 }}>
                      <Calendar size={12}/>Расписание: {backfillStatus.schedule?.daysUpdated ?? 0} дней
                      {(backfillStatus.schedule?.daysUpdated ?? 0) === 0 &&
                        <span style={{ color: 'var(--mt)', marginLeft: 6 }}>— Google Sheets не вернул данных</span>}
                    </div>
                }
                {/* Выручка iiko */}
              {backfillStatus.revenue?.error
                  ? <div style={{ color: '#e07a60', display:'flex',alignItems:'center',gap:4 }}>
                    <AlertTriangle size={12}/>iiko выручка: {backfillStatus.revenue.error}
                    </div>
                  : <div style={{ color: backfillStatus.revenue?.updated > 0 ? '#8bc47a' : '#e0a41e', display:'flex',alignItems:'center',gap:4 }}>
                      <TrendingUp size={12}/>Выручка iiko: {backfillStatus.revenue?.updated ?? 0} дней
                      {(backfillStatus.revenue?.updated ?? 0) === 0 &&
                          <span style={{ color: 'var(--mt)', marginLeft: 6 }}>
                            — iiko не вернул данных. Проверьте IIKO_URL, IIKO_LOGIN, IIKO_PASSWORD в .env
                          </span>}
                      </div>
              }
              {/* План выручки из Google Sheets */}
              {backfillStatus.plan?.error
                  ? <div style={{ color: '#e07a60', marginTop: 4, display:'flex',alignItems:'center',gap:4 }}>
                      <AlertTriangle size={12}/>план выручки: {backfillStatus.plan.error}
                    </div>
                  : backfillStatus.plan != null && (
                      <div style={{ color: backfillStatus.plan?.daysUpdated > 0 ? '#8bc47a' : '#e0a41e', marginTop: 4, display:'flex',alignItems:'center',gap:4 }}>
                        <BarChart2 size={12}/>План выручки: {backfillStatus.plan?.daysUpdated ?? 0} дней
                        {backfillStatus.plan?.sheets?.length > 0 &&
                          <span style={{ color: 'var(--mt)', marginLeft: 6 }}>
                            ({backfillStatus.plan.sheets.join(', ')})
                          </span>}
                      </div>
                    )
              }
              </div>
            )}
            {backfillStatus?.error && (
              <div style={{ color: '#e07a60', fontSize: 12, marginBottom: 12, display:'flex',alignItems:'center',gap:4 }}><AlertTriangle size={12}/>{backfillStatus.error}</div>
            )}

            <button
              className="btn"
              onClick={runBackfill}
              disabled={backfillLoading || !backfillFrom}
              style={{ opacity: backfillLoading ? 0.6 : 1 }}
            >
              {backfillLoading ? <><RefreshCw size={15} style={{animation:'spin 1s linear infinite'}}/>Загружаю историю...</> : <><Download size={15}/>Восстановить данные</>}
            </button>
          </div>
        </div>
      )}
    </div>
  );
}
