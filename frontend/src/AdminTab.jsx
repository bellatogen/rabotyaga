import { useState, useEffect } from 'react';
import { Users, BarChart2, RefreshCw, AlertTriangle, CheckCircle, Calendar, Download, Check, Bell, BellOff, TrendingUp, Star, X, Plus, Send, Clock, MessageSquare, Power, Pencil, Trash2 } from 'lucide-react';
import { kvGet, kvSet, iikoMarginData, sendTestPush,
  getPushDefs, savePushDef, deletePushDef,
  getBotChats, addBotChat, deleteBotChat,
  getBotMacros, addBotMacro, updateBotMacro, deleteBotMacro } from './services/api.js';

const API = '/api';

const TEMPLATE_LABELS = {
  dayBeforeShift:     'За день до смены (20:00)',
  personalTasks:      'Личные задачи на день (09:00)',
  closeShiftReminder: 'Закрытие смены (22:00)',
};

// ── Справочники редактора пушей (push:v1.defs) ──
const CONTENT_SOURCES = [
  ['static',                'Статичный текст'],
  ['tasks_tomorrow',        'Задачи на завтра'],
  ['tasks_today_personal',  'Личные задачи (сегодня)'],
  ['sets',                  'Сэты дня'],
  ['close_checklist',       'Чек-лист закрытия'],
];
const CONTENT_LABEL = Object.fromEntries(CONTENT_SOURCES);
const ROLE_OPTS = [['barman','Бармен'],['head_barman','Старший бармен'],['manager','Управляющий']];
const STATUS_OPTS = [
  ['day_off','Выходной'],['worked','Отработал'],['on_shift','На смене'],
  ['today_shift','Смена сегодня'],['tomorrow_shift','Смена завтра'],
  ['sick','Больничный'],['vacation','Отпуск'],['business_trip','Командировка'],
];
const PUSH_WEEKDAYS = ['Вс','Пн','Вт','Ср','Чт','Пт','Сб'];
const PLACEHOLDER_HINT = '{{имя}} · {{дата}} · {{день_недели}} · {tasks} · {sets}';
const MACRO_WEEKDAYS = ['Вс','Пн','Вт','Ср','Чт','Пт','Сб'];

// SECURITY: /api/admin/* не защищён backend-авторизацией — только frontend-gating через isManager
export function AdminTab({ auth, members, ds, onReloadData }) {
  const [sub, setSub]               = useState('push');
  const [loading, setLoading]       = useState(true);
  const [error, setError]           = useState(null);

  // Данные, общие для нескольких вкладок
  const [bindings, setBindings]     = useState({});  // { name -> telegramId }


  // Сотрудники
  const [employees, setEmployees]   = useState([]);  // [{name, telegramId, push}]
  const [sendingPush, setSendingPush] = useState({}); // { [name]: 'idle'|'loading'|'ok'|'err' }

  // Статистика
  const [stats, setStats]           = useState(null);
  const [statsLoading, setStatsLoading] = useState(false);

  // Маржинальные позиции меню (Умные соты)
  const [marginData,         setMarginData]         = useState(null);   // авто-данные iiko
  const [marginDataLoading,  setMarginDataLoading]  = useState(false);
  const [marginDataErr,      setMarginDataErr]      = useState(null);
  const [threshold,          setThreshold]          = useState(60);     // % порог
  const [thresholdSaved,     setThresholdSaved]     = useState(false);
  const [marginItems,        setMarginItems]        = useState(null);   // string[] fallback
  const [marginItemsLoading, setMarginItemsLoading] = useState(false);
  const [marginItemsSaved,   setMarginItemsSaved]   = useState(false);
  const [marginItemInput,    setMarginItemInput]    = useState('');

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
      const empRes  = await fetch(`${API}/admin/employees`);
      const empData = await empRes.json();

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
    if (sub === 'menu' && !marginData && !marginDataLoading) loadMenuTab();
  }, [sub]);

  async function loadMenuTab() {
    setMarginDataLoading(true); setMarginDataErr(null);
    try {
      const [md, thRaw, manualRaw] = await Promise.all([
        iikoMarginData(),
        kvGet('margin_threshold:v1'),
        kvGet('margin_items:v1'),
      ]);
      setMarginData(md);
      if (thRaw != null) setThreshold(Number(thRaw));
      setMarginItems(manualRaw ? JSON.parse(manualRaw) : []);
    } catch (e) { setMarginDataErr(e.message); }
    finally { setMarginDataLoading(false); }
  }

  async function syncMarginFromIiko() {
    setMarginDataLoading(true); setMarginDataErr(null);
    try {
      setMarginData(await iikoMarginData(true));
    } catch (e) { setMarginDataErr(e.message); }
    finally { setMarginDataLoading(false); }
  }

  async function saveThreshold(val) {
    try {
      await kvSet('margin_threshold:v1', String(val));
      setThreshold(val);
      setThresholdSaved(true);
      setTimeout(() => setThresholdSaved(false), 2000);
    } catch (e) { alert('Ошибка: ' + e.message); }
  }

  async function loadMarginItems() {
    setMarginItemsLoading(true);
    try {
      const raw = await kvGet('margin_items:v1');
      setMarginItems(raw ? JSON.parse(raw) : []);
    } catch { setMarginItems([]); }
    finally { setMarginItemsLoading(false); }
  }

  async function saveMarginItems(items) {
    try {
      await kvSet('margin_items:v1', JSON.stringify(items));
      setMarginItems(items);
      setMarginItemsSaved(true);
      setTimeout(() => setMarginItemsSaved(false), 2000);
    } catch (e) { alert('Ошибка сохранения: ' + e.message); }
  }

  function addMarginItem() {
    const name = marginItemInput.trim();
    if (!name || (marginItems || []).includes(name)) return;
    const next = [...(marginItems || []), name];
    setMarginItemInput('');
    saveMarginItems(next);
  }

  function removeMarginItem(name) {
    saveMarginItems((marginItems || []).filter(n => n !== name));
  }

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
      // Бэкенд обновил KV — перечитываем schedule/revenue в React-стейт приложения,
      // иначе UI (календарь) остаётся со старыми данными до перезагрузки страницы.
      if (onReloadData) await onReloadData();
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

  async function sendPushTo(name) {
    setSendingPush(prev => ({ ...prev, [name]: 'loading' }));
    try {
      await sendTestPush(name);
      setSendingPush(prev => ({ ...prev, [name]: 'ok' }));
      setTimeout(() => setSendingPush(prev => ({ ...prev, [name]: 'idle' })), 3000);
    } catch {
      setSendingPush(prev => ({ ...prev, [name]: 'err' }));
      setTimeout(() => setSendingPush(prev => ({ ...prev, [name]: 'idle' })), 3000);
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
          ['push',      <Bell size={11}/>, 'Пуши'],
          ['employees', <Users size={11}/>, 'Сотрудники'],
          ['stats',     <BarChart2 size={11}/>, 'Логи'],
          ['chats',     <MessageSquare size={11}/>, 'Чаты'],
          ['macros',    <Send size={11}/>, 'Макросы'],
          ['sync',      <RefreshCw size={11}/>, 'Синхр'],
          ['menu',      <Star size={11}/>, 'Меню'],
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

      {/* ── Пуши (редактор push:v1.defs) ── */}
      {sub === 'push'   && <PushDefsTab/>}
      {/* ── Чаты бота ── */}
      {sub === 'chats'  && <BotChatsTab/>}
      {/* ── Макросы рассылки ── */}
      {sub === 'macros' && <BotMacrosTab/>}

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
          ) : employees.map(({ name, telegramId, push }) => {
            const pushOn = push?.enabled !== false;
            const notifs = push?.notifications || {};
            const ps = sendingPush[name] || 'idle';
            return (
              <div
                key={name}
                style={{
                  background: 'var(--sf)', borderRadius: 10,
                  padding: '10px 14px', marginBottom: 8,
                }}
              >
                <div style={{ display:'flex', justifyContent:'space-between', alignItems:'flex-start' }}>
                  <div>
                    <div style={{ fontWeight:600, fontSize:14 }}>{name}</div>
                    <div style={{ fontSize:11, color:'var(--mt)', fontFamily:'monospace', marginTop:2 }}>
                      TG ID: {telegramId}
                    </div>
                  </div>
                  <div style={{ display:'flex', alignItems:'center', gap:8, flexShrink:0, marginLeft:8 }}>
                    <div style={{ fontSize:12, color: pushOn ? '#8bc47a' : 'var(--mt)' }}>
                      <span style={{display:'flex',alignItems:'center',gap:3}}>
                        {pushOn ? <><Bell size={12}/>вкл</> : <><BellOff size={12}/>выкл</>}
                      </span>
                    </div>
                    <button
                      className="btn"
                      style={{ margin:0, padding:'4px 10px', fontSize:11, opacity:ps==='loading'?0.6:1, flexShrink:0 }}
                      disabled={ps==='loading'}
                      onClick={() => sendPushTo(name)}
                    >
                      {ps==='loading' ? '...' : ps==='ok' ? '✓ Отправлено' : ps==='err' ? '✗ Ошибка' : <><Send size={11}/>&nbsp;Пуш</>}
                    </button>
                  </div>
                </div>
                {push ? (
                  <div style={{ display:'flex', gap:6, marginTop:8, flexWrap:'wrap' }}>
                    {Object.entries(TEMPLATE_LABELS).map(([key, label]) => {
                      const on = notifs[key] !== false;
                      return (
                        <span key={key} style={{
                          fontSize:10, padding:'2px 8px', borderRadius:10,
                          background: on ? 'rgba(139,196,122,0.15)' : 'rgba(128,128,128,0.1)',
                          color: on ? '#8bc47a' : 'var(--mt)',
                          border: `1px solid ${on ? 'rgba(139,196,122,0.3)' : 'transparent'}`,
                        }}>
                          {on ? '✓' : '✗'} {label.split(' (')[0]}
                        </span>
                      );
                    })}
                  </div>
                ) : (
                  <div style={{ fontSize:11, color:'var(--mt)', marginTop:6 }}>
                    Пуши не настроены — сотрудник должен открыть уведомления в приложении
                  </div>
                )}
              </div>
            );
          })}
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

              {Object.keys(stats.byName || {}).length > 0 && (
                <>
                  <div className="sec-lbl" style={{ marginBottom: 8 }}>По именам</div>
                  {Object.entries(stats.byName).map(([nm, s]) => (
                    <div key={nm} style={{
                      background: 'var(--sf)', borderRadius: 8,
                      padding: '8px 12px', marginBottom: 6,
                      display: 'flex', justifyContent: 'space-between', alignItems: 'center',
                    }}>
                      <div style={{ fontWeight: 600, fontSize: 13 }}>{nm}</div>
                      <div style={{ fontSize: 12, color: 'var(--mt)' }}>
                        <span style={{display:'flex',alignItems:'center',gap:6}}><CheckCircle size={12} color="#8bc47a"/>{s.sent||0} · <AlertTriangle size={12} color="#e07a60"/>{s.failed||0} · <span style={{opacity:.6}}>{s.skipped||0} проп.</span></span>
                      </div>
                    </div>
                  ))}
                </>
              )}

              {Object.keys(stats.byUser || {}).length > 0 && (
                <>
                  <div className="sec-lbl" style={{ marginBottom: 8, marginTop: 12 }}>По Telegram ID</div>
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

      {/* ── Маржинальность меню (Умные соты) ── */}
      {sub === 'menu' && (
        <div>
          <div className="sec-lbl" style={{ marginBottom: 6 }}>Маржинальность меню</div>
          <div className="info-box" style={{ marginBottom: 14, fontSize: 12, lineHeight: 1.5 }}>
            iiko автоматически вычисляет маржу по каждому блюду за 30 дней
            (выручка − себестоимость). Позиции с маржей выше порога
            помечаются 🟡 в «Умных сотах». Себестоимость берётся из закупочных
            цен / техкарт iiko — если их нет, маржа не посчитается; тогда
            заполните закупочные цены в iiko либо ведите список вручную ниже.
          </div>

          {/* Кнопка синхронизации */}
          <button
            className="btn"
            onClick={syncMarginFromIiko}
            disabled={marginDataLoading}
            style={{ marginBottom: 14, opacity: marginDataLoading ? 0.6 : 1 }}
          >
            {marginDataLoading
              ? <><RefreshCw size={14} style={{animation:'spin 1s linear infinite'}}/>Анализирую iiko…</>
              : <><RefreshCw size={14}/>Синхронизировать из iiko</>
            }
          </button>

          {marginDataErr && (
            <div className="alert" style={{ marginBottom: 12, fontSize: 12, display:'flex', gap:4 }}>
              <AlertTriangle size={13}/>{marginDataErr}
            </div>
          )}

          {/* Авто данные iiko */}
          {marginData && (
            <div>
              {marginData.reason === 'partial' && (
                <div className="alert" style={{ fontSize: 12, marginBottom: 12, display:'flex', gap:4 }}>
                  <AlertTriangle size={13}/>
                  Себестоимость заведена у {marginData.coveredCount} из {marginData.totalCount} блюд. Остальным задайте закупочные цены в iiko.
                </div>
              )}
              {marginData.hasMarginData ? (
                <>
                  {/* Порог маржинальности */}
                  <div style={{ marginBottom: 14 }}>
                    <div style={{ fontSize: 12, fontWeight: 600, color: 'var(--mt)', marginBottom: 6 }}>
                      Порог: позиции с маржей ≥ <span style={{color:'var(--am)'}}>{threshold}%</span> будут 🟡
                    </div>
                    <div style={{ display: 'flex', alignItems: 'center', gap: 10 }}>
                      <input
                        type="range" min={30} max={90} step={5}
                        value={threshold}
                        onChange={e => setThreshold(Number(e.target.value))}
                        style={{ flex: 1 }}
                      />
                      <button
                        className="btn btn-p"
                        style={{ width: 'auto', padding: '0 12px', margin: 0, flexShrink: 0, fontSize: 12 }}
                        onClick={() => saveThreshold(threshold)}
                      >
                        {thresholdSaved ? <><Check size={12}/>Сохр</> : 'Сохранить'}
                      </button>
                    </div>
                  </div>

                  {/* Таблица блюд */}
                  <div style={{ fontSize: 10, color: 'var(--mt)', marginBottom: 8, opacity: 0.6 }}>
                    Данные за {marginData.from}–{marginData.to} · маржа у {marginData.coveredCount} из {marginData.totalCount} позиций
                  </div>
                  <div style={{ maxHeight: 320, overflowY: 'auto' }}>
                    {marginData.items.filter(i => i.margin != null).map((item, i) => {
                      const isHigh = item.margin >= threshold;
                      return (
                        <div key={i} style={{
                          display: 'flex', alignItems: 'center', gap: 8,
                          padding: '7px 0',
                          borderBottom: '1px solid var(--bd)',
                          opacity: isHigh ? 1 : 0.55,
                        }}>
                          <span style={{ fontSize: 11, fontWeight: 700,
                            color: isHigh ? '#f0b429' : 'var(--mt)', flexShrink: 0, width: 34 }}>
                            {item.margin}%
                          </span>
                          {isHigh && <Star size={10} color="#f0b429" style={{flexShrink:0}}/>}
                          <span style={{ flex: 1, fontSize: 12, color: 'var(--pp)',
                            overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>
                            {item.name}
                          </span>
                          <span style={{ fontSize: 10, color: 'var(--mt)', flexShrink: 0 }}>
                            {(item.revenue / 1000).toFixed(0)}k₽
                          </span>
                        </div>
                      );
                    })}
                  </div>
                </>
              ) : (
                <div className={marginData.reason === 'no_sales' ? 'alert' : 'alert warn'}
                  style={{ fontSize: 12, marginBottom: 12, display:'flex', gap:4 }}>
                  <AlertTriangle size={13}/>
                  {marginData.reason === 'field_unsupported'
                    ? 'iiko на этой лицензии не отдаёт себестоимость (ProductCostBase). Включите поле в настройках iiko OLAP или ведите ручной список ниже.'
                    : marginData.reason === 'no_sales'
                    ? `Нет продаж за период ${marginData.from}–${marginData.to} — маржу считать не из чего.`
                    : 'iiko отдаёт продажи, но себестоимость = 0 у всех блюд. Заведите закупочные цены / техкарты в номенклатуре iiko и синхронизируйте снова. Либо ведите ручной список ниже.'}
                </div>
              )}
            </div>
          )}

          {/* Ручной fallback-список */}
          <div style={{ marginTop: 20, borderTop: '1px solid var(--bd)', paddingTop: 14 }}>
            <div style={{ fontSize: 12, fontWeight: 600, color: 'var(--mt)', marginBottom: 8 }}>
              Ручной список{marginData?.hasMarginData ? ' (fallback если нет данных iiko)' : ''}
            </div>
            <div style={{ display: 'flex', gap: 8, marginBottom: 10 }}>
              <input
                value={marginItemInput}
                onChange={e => setMarginItemInput(e.target.value)}
                onKeyDown={e => e.key === 'Enter' && addMarginItem()}
                placeholder="Название блюда точно как в iiko…"
                style={{
                  flex: 1, background: 'var(--bg)', border: '1px solid var(--bd)',
                  borderRadius: 8, padding: '9px 12px', color: 'var(--pp)',
                  fontSize: 13, fontFamily: 'inherit',
                }}
              />
              <button className="btn btn-p"
                style={{ width: 'auto', padding: '0 14px', margin: 0, flexShrink: 0 }}
                onClick={addMarginItem} disabled={!marginItemInput.trim()}>
                <Plus size={14}/>
              </button>
            </div>
            {(marginItems || []).length === 0 && (
              <div style={{ fontSize: 12, color: 'var(--mt)' }}>Список пуст</div>
            )}
            {(marginItems || []).map((name, i) => (
              <div key={i} style={{
                display: 'flex', alignItems: 'center', gap: 8,
                padding: '7px 0', borderBottom: '1px solid var(--bd)',
              }}>
                <Star size={11} color="var(--am)" style={{ flexShrink: 0 }}/>
                <span style={{ flex: 1, fontSize: 13, color: 'var(--pp)' }}>{name}</span>
                <button onClick={() => removeMarginItem(name)}
                  style={{ background:'transparent', border:'none', color:'var(--mt)',
                    cursor:'pointer', display:'flex', padding:'2px 4px' }}>
                  <X size={13}/>
                </button>
              </div>
            ))}
            {marginItemsSaved && (
              <div className="alert ok" style={{ marginTop: 10, fontSize: 12 }}>
                <CheckCircle size={12}/> Сохранено
              </div>
            )}
          </div>
        </div>
      )}
    </div>
  );
}

// ══ Item 6: редактор пушей (push:v1.defs) ═════════════════════════
function chip(on) {
  return {
    padding: '6px 12px', borderRadius: 8, fontFamily: 'inherit', fontSize: 12, fontWeight: 600, cursor: 'pointer',
    border: `1px solid ${on ? 'var(--cu)' : 'var(--bd)'}`,
    background: on ? 'rgba(201,125,60,.15)' : 'transparent',
    color: on ? 'var(--cu)' : 'var(--mt)',
  };
}
const FLD = { width: '100%', padding: 8, borderRadius: 6, border: '1px solid var(--bd)', background: 'var(--bg)', color: 'var(--pp)', fontFamily: 'inherit', fontSize: 13, boxSizing: 'border-box' };

function emptyDefForm() {
  return {
    _isNew: true, id: '', title: '', system: false, enabled: true,
    template: '', contentSource: 'static',
    time: '12:00', daysMode: 'daily', days: [],
    audienceKind: 'all', roles: [], names: [], suppress: [],
  };
}
function defToForm(d) {
  const aud = d.audience;
  const audienceKind = aud === 'all' ? 'all' : aud === 'assigned' ? 'assigned'
    : (aud && Array.isArray(aud.roles)) ? 'roles' : 'names';
  return {
    _isNew: false, id: d.id, title: d.title, system: !!d.system,
    enabled: d.enabled !== false, template: d.template || '', contentSource: d.contentSource,
    time: d.schedule?.time || '12:00',
    daysMode: d.schedule?.days === 'daily' ? 'daily' : 'custom',
    days: Array.isArray(d.schedule?.days) ? d.schedule.days.slice() : [],
    audienceKind,
    roles: (aud && Array.isArray(aud.roles)) ? aud.roles.slice() : [],
    names: (aud && Array.isArray(aud.names)) ? aud.names.slice() : [],
    suppress: Array.isArray(d.suppressStatuses) ? d.suppressStatuses.slice() : [],
  };
}
function formToPayload(f) {
  const audience = f.audienceKind === 'all' ? 'all'
    : f.audienceKind === 'assigned' ? 'assigned'
    : f.audienceKind === 'roles' ? { roles: f.roles }
    : { names: f.names };
  return {
    id: f.id.trim(), title: f.title.trim(), enabled: f.enabled, template: f.template,
    contentSource: f.contentSource,
    schedule: { time: f.time, days: f.daysMode === 'daily' ? 'daily' : f.days.slice().sort((a, b) => a - b) },
    audience, suppressStatuses: f.suppress,
  };
}
function audienceLabel(aud) {
  if (aud === 'all') return 'Все';
  if (aud === 'assigned') return 'По задачам (@)';
  if (aud && Array.isArray(aud.roles)) return 'Роли: ' + aud.roles.map(r => (ROLE_OPTS.find(x => x[0] === r) || [r, r])[1]).join(', ');
  if (aud && Array.isArray(aud.names)) return 'Имена: ' + aud.names.join(', ');
  return '—';
}
function schedulePushLabel(sc) {
  if (!sc) return '';
  if (sc.days === 'daily') return `Ежедневно в ${sc.time}`;
  if (Array.isArray(sc.days)) return `${sc.days.map(d => PUSH_WEEKDAYS[d]).join(',')} в ${sc.time}`;
  return sc.time;
}

function PushDefsTab() {
  const [defs, setDefs] = useState(null);
  const [recipients, setRecipients] = useState({});
  const [form, setForm] = useState(null);
  const [msg, setMsg] = useState('');
  const [err, setErr] = useState('');

  async function load() {
    try { const r = await getPushDefs(); setDefs(r.defs || []); setRecipients(r.recipients || {}); }
    catch (e) { setErr(e.message); setDefs([]); }
  }
  useEffect(() => { load(); }, []);
  const flash = (m) => { setMsg(m); setTimeout(() => setMsg(''), 2500); };

  async function toggleEnabled(d) {
    try { await savePushDef({ id: d.id, enabled: !(d.enabled !== false) }); await load(); }
    catch (e) { alert('Ошибка: ' + e.message); }
  }
  async function remove(d) {
    if (d.system || !confirm(`Удалить пуш «${d.title}»?`)) return;
    try { await deletePushDef(d.id); await load(); flash('Удалено ✓'); }
    catch (e) { alert('Ошибка: ' + e.message); }
  }
  async function save() {
    setErr('');
    const f = form;
    if (!f.id.trim()) { setErr('id обязателен'); return; }
    if (!/^[a-zA-Z0-9_-]+$/.test(f.id.trim())) { setErr('id: только латиница, цифры, _ и -'); return; }
    if (!f.title.trim()) { setErr('Название обязательно'); return; }
    if (f.audienceKind === 'names' && f.names.length === 0) { setErr('Выберите хотя бы одно имя'); return; }
    if (f.audienceKind === 'roles' && f.roles.length === 0) { setErr('Выберите хотя бы одну роль'); return; }
    try { await savePushDef(formToPayload(f)); setForm(null); await load(); flash('Сохранено ✓'); }
    catch (e) { setErr(e.message); }
  }

  const names = Object.keys(recipients);
  if (defs === null) return <div className="info-box">Загрузка…</div>;
  return (
    <div>
      <div className="info-box" style={{ marginBottom: 12, fontSize: 12, lineHeight: 1.5 }}>
        Каждый пуш = текст + расписание + получатели + правила по статусам.
        Плейсхолдеры: <code>{PLACEHOLDER_HINT}</code>. Предустановленные нельзя удалить — только править/выключать.
      </div>
      {err && !form && <div className="alert" style={{ marginBottom: 10 }}><AlertTriangle size={13}/>{err}</div>}
      {!form && <button className="btn btn-p" style={{ marginBottom: 12 }} onClick={() => { setErr(''); setForm(emptyDefForm()); }}><Plus size={14}/>Новый пуш</button>}
      {form && <DefForm form={form} setForm={setForm} onSave={save} onCancel={() => { setForm(null); setErr(''); }} err={err} names={names}/>}
      {!form && defs.map(d => (
        <div key={d.id} style={{ background: 'var(--sf)', borderRadius: 10, padding: '10px 14px', marginBottom: 8, borderLeft: `3px solid ${d.enabled !== false ? '#8bc47a' : 'var(--bd)'}` }}>
          <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'flex-start', gap: 8 }}>
            <div style={{ minWidth: 0 }}>
              <div style={{ fontWeight: 600, fontSize: 14, display: 'flex', alignItems: 'center', gap: 6 }}>
                {d.title}
                {d.system && <span style={{ fontSize: 10, padding: '1px 6px', borderRadius: 6, background: 'var(--bg)', color: 'var(--mt)' }}>системный</span>}
              </div>
              <div style={{ fontSize: 12, color: 'var(--mt)', marginTop: 3 }}><Clock size={11} style={{ verticalAlign: '-1px' }}/> {schedulePushLabel(d.schedule)} · {CONTENT_LABEL[d.contentSource] || d.contentSource}</div>
              <div style={{ fontSize: 12, color: 'var(--mt)', marginTop: 2 }}>{audienceLabel(d.audience)}</div>
              {d.suppressStatuses?.length > 0 && <div style={{ fontSize: 11, color: 'var(--mt)', marginTop: 2, opacity: .8 }}>Не слать при: {d.suppressStatuses.map(s => (STATUS_OPTS.find(x => x[0] === s) || [s, s])[1]).join(', ')}</div>}
            </div>
            <div style={{ display: 'flex', gap: 6, flexShrink: 0 }}>
              <button onClick={() => toggleEnabled(d)} title={d.enabled !== false ? 'Выключить' : 'Включить'} style={{ background: 'none', border: 'none', cursor: 'pointer', color: d.enabled !== false ? '#8bc47a' : 'var(--mt)', display: 'flex', alignItems: 'center' }}><Power size={16}/></button>
              <button onClick={() => { setErr(''); setForm(defToForm(d)); }} title="Редактировать" style={{ background: 'none', border: 'none', cursor: 'pointer', color: 'var(--mt)', display: 'flex', alignItems: 'center' }}><Pencil size={16}/></button>
              {!d.system && <button onClick={() => remove(d)} title="Удалить" style={{ background: 'none', border: 'none', cursor: 'pointer', color: '#e07a60', display: 'flex', alignItems: 'center' }}><Trash2 size={16}/></button>}
            </div>
          </div>
        </div>
      ))}
      {msg && <div style={{ fontSize: 13, color: 'var(--mt)', marginTop: 8 }}>{msg}</div>}
    </div>
  );
}

function DefForm({ form: f, setForm, onSave, onCancel, err, names }) {
  const up = (patch) => setForm({ ...f, ...patch });
  const tog = (arr, v) => arr.includes(v) ? arr.filter(x => x !== v) : [...arr, v];
  const lbl = (t) => <div style={{ fontSize: 11, color: 'var(--mt)', textTransform: 'uppercase', margin: '10px 0 4px' }}>{t}</div>;
  return (
    <div style={{ background: 'var(--sf)', border: '1px solid var(--bd)', borderRadius: 12, padding: 14, marginBottom: 14 }}>
      <div className="sec-lbl" style={{ marginBottom: 6 }}>{f._isNew ? 'Новый пуш' : `Правка: ${f.title || f.id}`}</div>
      {lbl('Идентификатор (латиницей)')}
      <input style={FLD} value={f.id} disabled={!f._isNew} placeholder="promo_happy_hour" onChange={e => up({ id: e.target.value })}/>
      {lbl('Название')}
      <input style={FLD} value={f.title} placeholder="Промо: счастливые часы" onChange={e => up({ title: e.target.value })}/>
      {lbl('Источник контента')}
      <select style={FLD} value={f.contentSource} disabled={!f._isNew && f.system} onChange={e => up({ contentSource: e.target.value })}>
        {CONTENT_SOURCES.map(([v, l]) => <option key={v} value={v}>{l}</option>)}
      </select>
      {(!f._isNew && f.system) && <div style={{ fontSize: 11, color: 'var(--mt)', marginTop: 3 }}>У системных пушей источник зафиксирован.</div>}
      {lbl('Текст (шаблон)')}
      <textarea style={{ ...FLD, minHeight: 80, resize: 'vertical' }} value={f.template} placeholder="Пусто — встроенный текст источника" onChange={e => up({ template: e.target.value })}/>
      <div style={{ fontSize: 11, color: 'var(--mt)', marginTop: 4 }}>Плейсхолдеры: <code>{PLACEHOLDER_HINT}</code></div>
      {lbl('Время')}
      <input type="time" style={{ ...FLD, width: 'auto' }} value={f.time} onChange={e => up({ time: e.target.value })}/>
      {lbl('Дни')}
      <div style={{ display: 'flex', gap: 6, flexWrap: 'wrap' }}>
        <button onClick={() => up({ daysMode: 'daily' })} style={chip(f.daysMode === 'daily')}>Ежедневно</button>
        <button onClick={() => up({ daysMode: 'custom' })} style={chip(f.daysMode === 'custom')}>По дням</button>
      </div>
      {f.daysMode === 'custom' && (
        <div style={{ display: 'flex', gap: 6, flexWrap: 'wrap', marginTop: 8 }}>
          {PUSH_WEEKDAYS.map((d, i) => <button key={i} onClick={() => up({ days: tog(f.days, i) })} style={chip(f.days.includes(i))}>{d}</button>)}
        </div>
      )}
      {lbl('Получатели')}
      <div style={{ display: 'flex', gap: 6, flexWrap: 'wrap' }}>
        {[['all', 'Все'], ['assigned', 'По задачам (@)'], ['roles', 'По ролям'], ['names', 'Список имён']].map(([v, l]) => <button key={v} onClick={() => up({ audienceKind: v })} style={chip(f.audienceKind === v)}>{l}</button>)}
      </div>
      {f.audienceKind === 'roles' && (
        <div style={{ display: 'flex', gap: 6, flexWrap: 'wrap', marginTop: 8 }}>
          {ROLE_OPTS.map(([v, l]) => <button key={v} onClick={() => up({ roles: tog(f.roles, v) })} style={chip(f.roles.includes(v))}>{l}</button>)}
        </div>
      )}
      {f.audienceKind === 'names' && (
        <div style={{ display: 'flex', gap: 6, flexWrap: 'wrap', marginTop: 8 }}>
          {names.length === 0 && <span style={{ fontSize: 12, color: 'var(--mt)' }}>Нет сотрудников</span>}
          {names.map(n => <button key={n} onClick={() => up({ names: tog(f.names, n) })} style={chip(f.names.includes(n))}>{n}</button>)}
        </div>
      )}
      {lbl('Не отправлять при статусах')}
      <div style={{ display: 'flex', gap: 6, flexWrap: 'wrap' }}>
        {STATUS_OPTS.map(([v, l]) => <button key={v} onClick={() => up({ suppress: tog(f.suppress, v) })} style={chip(f.suppress.includes(v))}>{l}</button>)}
      </div>
      <label style={{ display: 'flex', alignItems: 'center', gap: 8, marginTop: 12, fontSize: 13, cursor: 'pointer' }}>
        <input type="checkbox" checked={f.enabled} onChange={e => up({ enabled: e.target.checked })}/>Пуш включён
      </label>
      {err && <div className="alert" style={{ marginTop: 10 }}><AlertTriangle size={13}/>{err}</div>}
      <div style={{ display: 'flex', gap: 8, marginTop: 12 }}>
        <button className="btn btn-p" onClick={onSave} style={{ flex: 2 }}>Сохранить</button>
        <button className="btn" onClick={onCancel} style={{ flex: 1 }}>Отмена</button>
      </div>
    </div>
  );
}

// ══ Чаты бота (bot_chats:v1) ══════════════════════════════════
function BotChatsTab() {
  const [chats, setChats] = useState([]);
  const [nv, setNv] = useState({ name: '', chatId: '' });
  async function load() { try { const c = await getBotChats(); setChats(c.chats || []); } catch { /* нет прав / связи */ } }
  useEffect(() => { load(); }, []);
  async function add() {
    if (!nv.name.trim() || !nv.chatId.trim()) { alert('Заполните название и chatId'); return; }
    try { const { chat } = await addBotChat(nv.name.trim(), nv.chatId.trim()); setChats([...chats, chat]); setNv({ name: '', chatId: '' }); }
    catch (e) { alert('Ошибка: ' + e.message); }
  }
  async function del(id) {
    if (!confirm('Удалить чат?')) return;
    try { await deleteBotChat(id); setChats(chats.filter(c => c.id !== id)); } catch (e) { alert(e.message); }
  }
  return (
    <div>
      <div className="info-box" style={{ fontSize: 12, marginBottom: 14, lineHeight: 1.6 }}>
        Добавь бота «Работяга» в групповой чат, напиши там <b>/id</b> — бот ответит <code>chatId</code>, скопируй сюда.
      </div>
      <div style={{ display: 'flex', gap: 8, flexWrap: 'wrap', marginBottom: 14 }}>
        <input placeholder="Название чата" value={nv.name} onChange={e => setNv({ ...nv, name: e.target.value })} style={{ ...FLD, flex: '1 1 140px', width: 'auto' }}/>
        <input placeholder="chatId (-100…)" value={nv.chatId} onChange={e => setNv({ ...nv, chatId: e.target.value })} style={{ ...FLD, flex: '1 1 160px', width: 'auto', fontFamily: 'monospace' }}/>
        <button className="btn btn-p" style={{ width: 'auto', padding: '0 16px', margin: 0 }} onClick={add}><Plus size={14}/></button>
      </div>
      {chats.length === 0 ? <div className="info-box">Чатов пока нет</div> : chats.map(c => (
        <div key={c.id} style={{ background: 'var(--sf)', borderRadius: 10, padding: '10px 12px', marginBottom: 8, display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
          <div><div style={{ fontWeight: 600 }}>{c.name}</div><div style={{ fontSize: 11, color: 'var(--mt)', fontFamily: 'monospace', marginTop: 2 }}>{c.chatId}</div></div>
          <button onClick={() => del(c.id)} title="Удалить" style={{ background: 'none', border: 'none', color: '#e07a60', cursor: 'pointer', display: 'flex' }}><Trash2 size={16}/></button>
        </div>
      ))}
    </div>
  );
}

// ══ Item 8: редактор макросов (bot_macros:v1) ══════════════════════
function emptyMacro(chats) {
  return { name: '', chatId: chats[0]?.chatId || '', template: '', schedule: { type: 'daily', time: '10:00', weekday: 1, interval: 2, runDate: '' } };
}
function macroScheduleLabel(sc) {
  if (!sc) return '';
  if (sc.type === 'once') return `Один раз ${sc.runDate || ''} в ${sc.time}`;
  if (sc.type === 'daily') return `Ежедневно в ${sc.time}`;
  if (sc.type === 'weekly') return `Еженедельно (${MACRO_WEEKDAYS[sc.weekday] ?? '?'}) в ${sc.time}`;
  if (sc.type === 'every_n') return `Каждые ${sc.interval || '?'} дн. в ${sc.time}`;
  return sc.time;
}
function BotMacrosTab() {
  const [chats, setChats] = useState([]);
  const [macros, setMacros] = useState([]);
  const [form, setForm] = useState(null);
  async function load() {
    try { const c = await getBotChats(); setChats(c.chats || []); } catch { /* нет прав / связи */ }
    try { const m = await getBotMacros(); setMacros(m.macros || []); } catch { /* нет прав / связи */ }
  }
  useEffect(() => { load(); }, []);
  const chatName = (id) => chats.find(c => c.chatId === id)?.name || id;
  const upSc = (patch) => setForm({ ...form, schedule: { ...form.schedule, ...patch } });
  async function save() {
    const f = form;
    if (!f.name.trim() || !f.chatId || !f.template.trim()) { alert('Заполните название, чат и текст'); return; }
    const payload = {
      name: f.name.trim(), chatId: f.chatId, template: f.template,
      schedule: {
        type: f.schedule.type, time: f.schedule.time,
        weekday: f.schedule.type === 'weekly' ? Number(f.schedule.weekday) : null,
        interval: f.schedule.type === 'every_n' ? Number(f.schedule.interval) : null,
        runDate: f.schedule.type === 'once' ? f.schedule.runDate : null,
      },
    };
    try {
      if (f.id) { const { macro } = await updateBotMacro(f.id, payload); setMacros(macros.map(m => m.id === f.id ? macro : m)); }
      else { const { macro } = await addBotMacro(payload); setMacros([...macros, macro]); }
      setForm(null);
    } catch (e) { alert('Ошибка: ' + e.message); }
  }
  async function toggle(m) {
    try { const { macro } = await updateBotMacro(m.id, { active: !m.active }); setMacros(macros.map(x => x.id === m.id ? macro : x)); }
    catch (e) { alert(e.message); }
  }
  async function del(id) {
    if (!confirm('Удалить макрос?')) return;
    try { await deleteBotMacro(id); setMacros(macros.filter(m => m.id !== id)); } catch (e) { alert(e.message); }
  }
  const openEdit = (m) => setForm({
    id: m.id, name: m.name, chatId: m.chatId, template: m.template,
    schedule: {
      type: m.schedule?.type || 'daily', time: m.schedule?.time || '10:00',
      weekday: m.schedule?.weekday ?? 1, interval: m.schedule?.interval ?? 2, runDate: m.schedule?.runDate || '',
    },
  });
  return (
    <div>
      <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: 10 }}>
        <div className="sec-lbl">Макросы рассылки в чаты</div>
        {!form && <button className="btn btn-p" style={{ width: 'auto', padding: '6px 12px', margin: 0 }} disabled={chats.length === 0} onClick={() => setForm(emptyMacro(chats))}><Plus size={14}/>Макрос</button>}
      </div>
      {chats.length === 0 && <div className="alert" style={{ marginBottom: 12 }}><AlertTriangle size={13}/>Сначала добавь чат во вкладке «Чаты».</div>}
      {form && (
        <div style={{ background: 'var(--sf)', border: '1px solid var(--bd)', borderRadius: 12, padding: 14, marginBottom: 14 }}>
          <div className="sec-lbl" style={{ marginBottom: 8 }}>{form.id ? 'Правка макроса' : 'Новый макрос'}</div>
          <input style={{ ...FLD, marginBottom: 8 }} placeholder="Название" value={form.name} onChange={e => setForm({ ...form, name: e.target.value })}/>
          <select style={{ ...FLD, marginBottom: 8 }} value={form.chatId} onChange={e => setForm({ ...form, chatId: e.target.value })}>
            {chats.map(c => <option key={c.id} value={c.chatId}>{c.name}</option>)}
          </select>
          <textarea style={{ ...FLD, minHeight: 80, resize: 'vertical', marginBottom: 4 }} placeholder="Текст сообщения" value={form.template} onChange={e => setForm({ ...form, template: e.target.value })}/>
          <div style={{ fontSize: 11, color: 'var(--mt)', marginBottom: 8 }}>Переменные: <code>{'{{дата}}'}</code> · <code>{'{{день_недели}}'}</code> · <code>{'{{неделя}}'}</code></div>
          <div style={{ display: 'flex', gap: 8, flexWrap: 'wrap', marginBottom: 8 }}>
            <select style={{ ...FLD, flex: '1 1 140px', width: 'auto' }} value={form.schedule.type} onChange={e => upSc({ type: e.target.value })}>
              <option value="once">Один раз</option>
              <option value="daily">Ежедневно</option>
              <option value="weekly">Еженедельно</option>
              <option value="every_n">Каждые N дней</option>
            </select>
            <input type="time" style={{ ...FLD, flex: '0 0 110px', width: 'auto' }} value={form.schedule.time} onChange={e => upSc({ time: e.target.value })}/>
          </div>
          {form.schedule.type === 'weekly' && (
            <select style={{ ...FLD, marginBottom: 8 }} value={form.schedule.weekday} onChange={e => upSc({ weekday: Number(e.target.value) })}>
              {['Воскресенье', 'Понедельник', 'Вторник', 'Среда', 'Четверг', 'Пятница', 'Суббота'].map((d, i) => <option key={i} value={i}>{d}</option>)}
            </select>
          )}
          {form.schedule.type === 'every_n' && (
            <input type="number" min="1" style={{ ...FLD, marginBottom: 8 }} value={form.schedule.interval} onChange={e => upSc({ interval: e.target.value })}/>
          )}
          {form.schedule.type === 'once' && (
            <input type="date" style={{ ...FLD, marginBottom: 8 }} value={form.schedule.runDate} onChange={e => upSc({ runDate: e.target.value })}/>
          )}
          <div style={{ display: 'flex', gap: 8, marginTop: 4 }}>
            <button className="btn btn-p" onClick={save} style={{ flex: 2 }}>Сохранить</button>
            <button className="btn" onClick={() => setForm(null)} style={{ flex: 1 }}>Отмена</button>
          </div>
        </div>
      )}
      {!form && (macros.length === 0 ? <div className="info-box">Макросов пока нет</div> : macros.map(m => (
        <div key={m.id} style={{ background: 'var(--sf)', borderRadius: 10, padding: '10px 12px', marginBottom: 8, borderLeft: `3px solid ${m.active ? '#8bc47a' : 'var(--bd)'}` }}>
          <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'flex-start', gap: 8 }}>
            <div style={{ minWidth: 0 }}>
              <div style={{ fontWeight: 600 }}>{m.name}</div>
              <div style={{ fontSize: 12, color: 'var(--mt)', marginTop: 3 }}>→ {chatName(m.chatId)} · {macroScheduleLabel(m.schedule)}</div>
              <div style={{ fontSize: 12, color: 'var(--mt)', marginTop: 4, whiteSpace: 'pre-wrap', opacity: .85 }}>{m.template}</div>
            </div>
            <div style={{ display: 'flex', gap: 6, flexShrink: 0 }}>
              <button onClick={() => toggle(m)} title={m.active ? 'Выключить' : 'Включить'} style={{ background: 'none', border: 'none', cursor: 'pointer', color: m.active ? '#8bc47a' : 'var(--mt)', display: 'flex' }}><Power size={16}/></button>
              <button onClick={() => openEdit(m)} title="Редактировать" style={{ background: 'none', border: 'none', cursor: 'pointer', color: 'var(--mt)', display: 'flex' }}><Pencil size={16}/></button>
              <button onClick={() => del(m.id)} title="Удалить" style={{ background: 'none', border: 'none', cursor: 'pointer', color: '#e07a60', display: 'flex' }}><Trash2 size={16}/></button>
            </div>
          </div>
        </div>
      )))}
    </div>
  );
}
