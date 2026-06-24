import { useState, useEffect } from 'react';
import { Modal, Alert, Button } from '../components/Common.jsx';
import { getPushLog, getPushSchedule, setPushSchedule, getBindings,
  getBotChats, addBotChat, deleteBotChat,
  getBotMacros, addBotMacro, updateBotMacro, deleteBotMacro,
  getPushSettings, savePushSettings } from '../services/api.js';
import { RefreshCw, CheckCircle, AlertTriangle, Settings, Bell, Calendar, Users, MessageSquare, Send, Trash2, Power, Pencil, Clock, ChevronDown, ChevronRight } from 'lucide-react';

export function AdminPanel({ token }) {
  const [tab, setTab] = useState('push-log');
  const [pushLog, setPushLog] = useState([]);
  const [pushSchedule, setPushScheduleData] = useState([]);
  const [bindings, setBindings] = useState({});
  const [loading, setLoading] = useState(true);
  const [selectedDate, setSelectedDate] = useState(new Date().toISOString().slice(0, 10));
  const [editModal, setEditModal] = useState(false);
  const [newScheduleItem, setNewScheduleItem] = useState({ time: '', recipient: '', text: '' });
  const [syncStatus, setSyncStatus] = useState(null);
  const [syncLoading, setSyncLoading] = useState(false);
  // Бот-чаты и макросы рассылки
  const [botChats, setBotChats] = useState([]);
  const [botMacros, setBotMacros] = useState([]);
  const [newChat, setNewChat] = useState({ name: '', chatId: '' });
  const [macroForm, setMacroForm] = useState(null); // null | { id?, name, chatId, template, schedule }
  // Настройки пушей (push_settings:v1)
  const [pushSettings, setPushSettingsState] = useState(null);
  const [expandedTpl, setExpandedTpl] = useState(null);
  const [pushSaveMsg, setPushSaveMsg] = useState('');

  const loadBotData = async () => {
    try { const c = await getBotChats();  setBotChats(c.chats || []); } catch { /* нет прав / нет связи */ }
    try { const m = await getBotMacros(); setBotMacros(m.macros || []); } catch { /* нет прав / нет связи */ }
    try { const p = await getPushSettings(); setPushSettingsState(p.settings); } catch { /* нет прав / нет связи */ }
  };

  const runSync = async () => {
    setSyncLoading(true);
    try {
      const res = await fetch('/api/sync/schedule', { method: 'POST' });
      const j = await res.json();
      setSyncStatus(j);
    } catch(e) {
      setSyncStatus({ lastRun: new Date().toISOString(), daysUpdated: 0, error: e.message });
    } finally {
      setSyncLoading(false);
    }
  };

  const loadAdminData = async () => {
    try {
      setLoading(true);
      const logData = await getPushLog(token);
      const scheduleData = await getPushSchedule(selectedDate, token);
      const bindingsData = await getBindings(token);
      
      setPushLog(logData.logs || []);
      setPushScheduleData(scheduleData.items || []);
      setBindings(bindingsData.bindings || {});
    } catch (err) {
      console.error('Failed to load admin data:', err);
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    loadAdminData();
    loadBotData();
    fetch('/api/sync/schedule/status').then(r=>r.json()).then(setSyncStatus).catch(()=>{});
  }, [token, selectedDate]);

  const handleSaveSchedule = async () => {
    if (!newScheduleItem.time || !newScheduleItem.recipient || !newScheduleItem.text) {
      alert('Заполните все поля');
      return;
    }
    try {
      const allItems = [...pushSchedule, newScheduleItem];
      await setPushSchedule(selectedDate, allItems, token);
      setPushScheduleData(allItems);
      setNewScheduleItem({ time: '', recipient: '', text: '' });
      setEditModal(false);
    } catch (err) {
      console.error('Failed to save schedule:', err);
      alert('Ошибка при сохранении');
    }
  };

  const handleDeleteScheduleItem = async (index) => {
    const updated = pushSchedule.filter((_, i) => i !== index);
    try {
      await setPushSchedule(selectedDate, updated, token);
      setPushScheduleData(updated);
    } catch (err) {
      console.error('Failed to delete:', err);
    }
  };

  // ── Бот-чаты ──
  const handleAddChat = async () => {
    if (!newChat.name.trim() || !newChat.chatId.trim()) { alert('Заполните название и chatId'); return; }
    try {
      const { chat } = await addBotChat(newChat.name.trim(), newChat.chatId.trim());
      setBotChats([...botChats, chat]);
      setNewChat({ name: '', chatId: '' });
    } catch (e) { alert('Ошибка: ' + e.message); }
  };
  const handleDeleteChat = async (id) => {
    if (!confirm('Удалить чат из списка?')) return;
    try { await deleteBotChat(id); setBotChats(botChats.filter(c => c.id !== id)); } catch (e) { alert(e.message); }
  };

  // ── Макросы ──
  const todayISO = () => new Date().toISOString().slice(0, 10);
  const emptyMacro = () => ({
    name: '', chatId: botChats[0]?.chatId || '', template: '',
    schedule: { type: 'daily', time: '10:00', weekday: 1, interval: 2, runDate: todayISO() },
  });
  const openCreateMacro = () => setMacroForm(emptyMacro());
  const openEditMacro = (m) => setMacroForm({
    id: m.id, name: m.name, chatId: m.chatId, template: m.template,
    schedule: {
      type: m.schedule?.type || 'daily',
      time: m.schedule?.time || '10:00',
      weekday: m.schedule?.weekday ?? 1,
      interval: m.schedule?.interval ?? 2,
      runDate: m.schedule?.runDate || todayISO(),
    },
  });
  const handleSaveMacro = async () => {
    const f = macroForm;
    if (!f.name.trim() || !f.chatId || !f.template.trim()) { alert('Заполните название, чат и шаблон'); return; }
    const payload = {
      name: f.name.trim(), chatId: f.chatId, template: f.template,
      schedule: {
        type: f.schedule.type, time: f.schedule.time,
        weekday:  f.schedule.type === 'weekly'  ? Number(f.schedule.weekday)  : null,
        interval: f.schedule.type === 'every_n' ? Number(f.schedule.interval) : null,
        runDate:  f.schedule.type === 'once'    ? f.schedule.runDate          : null,
      },
    };
    try {
      if (f.id) {
        const { macro } = await updateBotMacro(f.id, payload);
        setBotMacros(botMacros.map(m => m.id === f.id ? macro : m));
      } else {
        const { macro } = await addBotMacro(payload);
        setBotMacros([...botMacros, macro]);
      }
      setMacroForm(null);
    } catch (e) { alert('Ошибка: ' + e.message); }
  };
  const handleToggleMacro = async (m) => {
    try {
      const { macro } = await updateBotMacro(m.id, { active: !m.active });
      setBotMacros(botMacros.map(x => x.id === m.id ? macro : x));
    } catch (e) { alert(e.message); }
  };
  const handleDeleteMacro = async (id) => {
    if (!confirm('Удалить макрос?')) return;
    try { await deleteBotMacro(id); setBotMacros(botMacros.filter(m => m.id !== id)); } catch (e) { alert(e.message); }
  };

  // ── Пуши (push_settings:v1) ──
  const PUSH_JOBS_META = [
    { key: 'dayBefore',     label: 'День до смены',  defTime: '20:00', vars: '{{имя}} · {{дата}} · {{день_недели}} · {tasks}', desc: 'Вечером накануне смены — список задач на завтра.' },
    { key: 'personalTasks', label: 'Личные задачи',  defTime: '09:00', vars: '{{имя}} · {{дата}} · {{день_недели}} · {tasks}', desc: 'Утром — персональные задачи на сегодня.' },
    { key: 'shiftClose',    label: 'Закрытие смены', defTime: '23:00', vars: '{{имя}} · {{дата}} · {{день_недели}}', desc: 'Напоминание закрыть смену (чек-лист).' },
    { key: 'setsRecommend', label: 'Сэты дня',       defTime: '16:00', vars: '{{имя}} · {{дата}} · {{день_недели}} · {sets}', desc: 'Перед сменой — топ пар напиток+закуска.' },
  ];
  const patchPushJob = (key, patch) => setPushSettingsState(s => ({ ...s, jobs: { ...s.jobs, [key]: { ...s.jobs[key], ...patch } } }));
  const patchPushTpl = (key, val) => setPushSettingsState(s => ({ ...s, templates: { ...s.templates, [key]: val } }));
  const handleSavePushSettings = async () => {
    try {
      setPushSaveMsg('');
      const { settings } = await savePushSettings(pushSettings);
      if (settings) setPushSettingsState(settings);
      setPushSaveMsg('Сохранено ✓');
      setTimeout(() => setPushSaveMsg(''), 2500);
    } catch (e) { setPushSaveMsg('Ошибка: ' + e.message); }
  };

  const WEEKDAYS = ['Вс', 'Пн', 'Вт', 'Ср', 'Чт', 'Пт', 'Сб'];
  const chatNameOf = (chatId) => botChats.find(c => c.chatId === chatId)?.name || chatId;
  const scheduleLabel = (sc) => {
    if (!sc) return '';
    if (sc.type === 'once')    return `Один раз ${sc.runDate || ''} в ${sc.time}`;
    if (sc.type === 'daily')   return `Ежедневно в ${sc.time}`;
    if (sc.type === 'weekly')  return `Еженедельно (${WEEKDAYS[sc.weekday] ?? '?'}) в ${sc.time}`;
    if (sc.type === 'every_n') return `Каждые ${sc.interval || '?'} дн. в ${sc.time}`;
    return sc.time;
  };

  if (loading) return <div style={{ padding: '20px' }}>Загрузка админки...</div>;

  return (
    <div style={{ padding: '12px' }}>
      <h1 style={{ fontSize: '20px', fontWeight: 700, marginBottom: '16px', display:'flex', alignItems:'center', gap:8 }}><Settings size={18}/>Админ-панель</h1>

      {/* Табы */}
      <div style={{ display: 'flex', gap: '8px', marginBottom: '16px', borderBottom: '1px solid var(--bd)', paddingBottom: '12px' }}>
        {[
          { id: 'push-log', icon: <Bell size={11}/>, label: 'Логи пушей' },
          { id: 'push-schedule', icon: <Calendar size={11}/>, label: 'График пушей' },
          { id: 'bindings', icon: <Users size={11}/>, label: 'Привязки' },
          { id: 'bot-chats', icon: <MessageSquare size={11}/>, label: 'Чаты бота' },
          { id: 'bot-macros', icon: <Send size={11}/>, label: 'Макросы' },
          { id: 'push-editor', icon: <Clock size={11}/>, label: 'Пуши' },
          { id: 'sync', icon: <RefreshCw size={11}/>, label: 'Синхронизация' }
        ].map(t => (
          <button
            key={t.id}
            onClick={() => setTab(t.id)}
            style={{
              background: tab === t.id ? 'var(--pp)' : 'transparent',
              color: tab === t.id ? '#fff' : 'var(--mt)',
              border: 'none', padding: '8px 12px', borderRadius: '6px', cursor: 'pointer',
              fontSize: '13px', fontWeight: 500,
              display: 'flex', alignItems: 'center', gap: 5
            }}
          >
            {t.icon}{t.label}
          </button>
        ))}
      </div>

      {/* Логи пушей */}
      {tab === 'push-log' && (
        <div>
          <h2 style={{ fontSize: '16px', fontWeight: 600, marginBottom: '12px', display:'flex', alignItems:'center', gap:7 }}><Bell size={14}/>История рассылок</h2>
          {pushLog.length === 0 ? (
            <Alert type="info">Логи отправок еще пусты</Alert>
          ) : (
            <div style={{ maxHeight: '400px', overflow: 'auto' }}>
              {pushLog.map((log, idx) => (
                <div key={idx} style={{
                  background: 'var(--sf)', padding: '10px 12px', marginBottom: '8px',
                  borderRadius: '6px', fontSize: '13px', borderLeft: `3px solid ${log.status === 'sent' ? '#8bc47a' : '#e07a60'}`
                }}>
                  <div style={{ fontWeight: 600 }}>{log.employee_name} ({log.recipient_telegram_id})</div>
                  <div style={{ color: 'var(--mt)', marginTop: '4px' }}>{log.text}</div>
                  <div style={{ color: 'var(--cu)', fontSize: '11px', marginTop: '4px', fontFamily: 'monospace' }}>
                    {new Date(log.created_at).toLocaleString('ru-RU')} • {log.status}
                  </div>
                </div>
              ))}
            </div>
          )}
        </div>
      )}

      {/* График пушей */}
      {tab === 'push-schedule' && (
        <div>
          <div style={{ display: 'flex', gap: '8px', marginBottom: '12px', alignItems: 'center' }}>
            <label>
              Дата:
              <input
                type="date"
                value={selectedDate}
                onChange={(e) => setSelectedDate(e.target.value)}
                style={{ marginLeft: '8px', padding: '6px' }}
              />
            </label>
            <Button onClick={() => setEditModal(true)}>+ Добавить пуш</Button>
          </div>

          {pushSchedule.length === 0 ? (
            <Alert type="info">График пуш на этот день пуст</Alert>
          ) : (
            pushSchedule.map((item, idx) => (
              <div key={idx} style={{
                background: 'var(--sf)', padding: '10px 12px', marginBottom: '8px',
                borderRadius: '6px', display: 'flex', justifyContent: 'space-between', alignItems: 'center'
              }}>
                <div>
                  <div style={{ fontWeight: 600 }}>{item.time || 'Без времени'} → {item.recipient}</div>
                  <div style={{ fontSize: '12px', color: 'var(--mt)', marginTop: '4px' }}>{item.text}</div>
                </div>
                <button
                  onClick={() => handleDeleteScheduleItem(idx)}
                  style={{ background: 'none', border: 'none', color: '#e07a60', cursor: 'pointer', fontSize: '18px' }}
                >
                  ✕
                </button>
              </div>
            ))
          )}

          <Modal
            isOpen={editModal}
            title="Добавить пуш в расписание"
            onClose={() => setEditModal(false)}
            actions={[
              <Button key="cancel" variant="secondary" onClick={() => setEditModal(false)}>Отмена</Button>,
              <Button key="save" onClick={handleSaveSchedule}>Сохранить</Button>
            ]}
          >
            <div style={{ display: 'flex', flexDirection: 'column', gap: '12px' }}>
              <div>
                <label style={{ display: 'block', fontSize: '13px', fontWeight: 500, marginBottom: '4px' }}>Время</label>
                <input
                  type="time"
                  value={newScheduleItem.time}
                  onChange={(e) => setNewScheduleItem({ ...newScheduleItem, time: e.target.value })}
                  style={{ width: '100%', padding: '8px', borderRadius: '6px', border: '1px solid var(--bd)' }}
                />
              </div>
              <div>
                <label style={{ display: 'block', fontSize: '13px', fontWeight: 500, marginBottom: '4px' }}>Адресат</label>
                <select
                  value={newScheduleItem.recipient}
                  onChange={(e) => setNewScheduleItem({ ...newScheduleItem, recipient: e.target.value })}
                  style={{ width: '100%', padding: '8px', borderRadius: '6px', border: '1px solid var(--bd)' }}
                >
                  <option value="">Выберите сотрудника...</option>
                  {Object.keys(bindings).map(name => (
                    <option key={name} value={name}>{name}</option>
                  ))}
                </select>
              </div>
              <div>
                <label style={{ display: 'block', fontSize: '13px', fontWeight: 500, marginBottom: '4px' }}>Текст сообщения</label>
                <textarea
                  value={newScheduleItem.text}
                  onChange={(e) => setNewScheduleItem({ ...newScheduleItem, text: e.target.value })}
                  style={{ width: '100%', padding: '8px', borderRadius: '6px', border: '1px solid var(--bd)', minHeight: '80px', fontFamily: 'inherit' }}
                />
              </div>
            </div>
          </Modal>
        </div>
      )}

      {/* Синхронизация расписания */}
      {tab === 'sync' && (
        <div>
          <h2 style={{fontSize:'16px',fontWeight:600,marginBottom:4}}>🔄 Расписание из Google Sheets</h2>
          <div style={{fontSize:12,color:'var(--mt)',marginBottom:16,lineHeight:1.6}}>
            Автоматически обновляет будущие смены барменов из таблицы. Запускается при старте и каждые 12 часов.<br/>
            Прошлые даты не затрагиваются.
          </div>

          {syncStatus && (
            <div style={{background:'var(--sf)',borderRadius:10,padding:'14px 16px',marginBottom:16}}>
              <div style={{display:'flex',alignItems:'center',gap:8,marginBottom:6}}>
                {syncStatus.error
                  ? <AlertTriangle size={15} color="#e07a60"/>
                  : <CheckCircle size={15} color="#8bc47a"/>}
                <span style={{fontWeight:600,fontSize:14}}>
                  {syncStatus.error ? 'Ошибка' : `Обновлено ${syncStatus.daysUpdated} дней`}
                </span>
              </div>
              {syncStatus.lastRun && (
                <div style={{fontSize:12,color:'var(--mt)'}}>
                  Последний запуск: {new Date(syncStatus.lastRun).toLocaleString('ru-RU')}
                </div>
              )}
              {syncStatus.error && (
                <div style={{fontSize:12,color:'#e07a60',marginTop:6,fontFamily:'monospace'}}>{syncStatus.error}</div>
              )}
            </div>
          )}

          <button
            onClick={runSync}
            disabled={syncLoading}
            style={{display:'flex',alignItems:'center',gap:8,padding:'10px 20px',borderRadius:8,
              background:'var(--pp)',color:'#fff',border:'none',fontWeight:600,fontSize:14,
              cursor:syncLoading?'not-allowed':'pointer',opacity:syncLoading?0.7:1}}
          >
            <RefreshCw size={15} style={{animation:syncLoading?'spin 1s linear infinite':undefined}}/>
            {syncLoading ? 'Синхронизация...' : 'Синхронизировать сейчас'}
          </button>
        </div>
      )}

      {/* Привязки */}
      {tab === 'bindings' && (
        <div>
          <h2 style={{ fontSize: '16px', fontWeight: 600, marginBottom: '12px' }}>👥 Сотрудники</h2>
          {Object.keys(bindings).length === 0 ? (
            <Alert type="info">Привязок еще нет</Alert>
          ) : (
            Object.entries(bindings).map(([name, telegramId]) => (
              <div key={name} style={{
                background: 'var(--sf)', padding: '10px 12px', marginBottom: '8px',
                borderRadius: '6px', display: 'flex', justifyContent: 'space-between', alignItems: 'center'
              }}>
                <div>
                  <div style={{ fontWeight: 600 }}>{name}</div>
                  <div style={{ fontSize: '11px', color: 'var(--mt)', fontFamily: 'monospace', marginTop: '2px' }}>
                    TG ID: {telegramId}
                  </div>
                </div>
              </div>
            ))
          )}
        </div>
      )}

      {/* Чаты бота */}
      {tab === 'bot-chats' && (
        <div>
          <h2 style={{ fontSize: '16px', fontWeight: 600, marginBottom: '8px', display:'flex', alignItems:'center', gap:7 }}><MessageSquare size={14}/>Чаты для рассылки</h2>
          <div style={{ fontSize: 12, color: 'var(--mt)', marginBottom: 14, lineHeight: 1.6, background:'var(--sf)', borderRadius:8, padding:'10px 12px' }}>
            Как добавить чат:<br/>
            1. Добавь бота «Работяга» в нужный групповой чат или канал (как участника/админа).<br/>
            2. Напиши в этом чате команду <b>/id</b> (или <b>/id@имя_бота</b>, если бот не отвечает).<br/>
            3. Бот ответит <code>chatId: ...</code> — скопируй это число (с минусом для групп) сюда.
          </div>

          <div style={{ display:'flex', gap:8, flexWrap:'wrap', marginBottom:16 }}>
            <input
              placeholder="Название чата"
              value={newChat.name}
              onChange={(e) => setNewChat({ ...newChat, name: e.target.value })}
              style={{ flex:'1 1 140px', padding:'8px', borderRadius:6, border:'1px solid var(--bd)' }}
            />
            <input
              placeholder="chatId (напр. -1001234567890)"
              value={newChat.chatId}
              onChange={(e) => setNewChat({ ...newChat, chatId: e.target.value })}
              style={{ flex:'1 1 180px', padding:'8px', borderRadius:6, border:'1px solid var(--bd)', fontFamily:'monospace' }}
            />
            <Button onClick={handleAddChat}>+ Добавить</Button>
          </div>

          {botChats.length === 0 ? (
            <Alert type="info">Чатов пока нет — добавь по инструкции выше</Alert>
          ) : (
            botChats.map(c => (
              <div key={c.id} style={{
                background: 'var(--sf)', padding: '10px 12px', marginBottom: '8px',
                borderRadius: '6px', display: 'flex', justifyContent: 'space-between', alignItems: 'center'
              }}>
                <div>
                  <div style={{ fontWeight: 600 }}>{c.name}</div>
                  <div style={{ fontSize: '11px', color: 'var(--mt)', fontFamily: 'monospace', marginTop: '2px' }}>{c.chatId}</div>
                </div>
                <button onClick={() => handleDeleteChat(c.id)} title="Удалить"
                  style={{ background:'none', border:'none', color:'#e07a60', cursor:'pointer', display:'flex', alignItems:'center' }}>
                  <Trash2 size={16}/>
                </button>
              </div>
            ))
          )}
        </div>
      )}

      {/* Макросы рассылки */}
      {tab === 'bot-macros' && (
        <div>
          <div style={{ display:'flex', justifyContent:'space-between', alignItems:'center', marginBottom:8 }}>
            <h2 style={{ fontSize: '16px', fontWeight: 600, display:'flex', alignItems:'center', gap:7 }}><Send size={14}/>Макросы рассылки</h2>
            <Button onClick={openCreateMacro} disabled={botChats.length === 0}>+ Макрос</Button>
          </div>
          {botChats.length === 0 && (
            <Alert type="warning">Сначала добавь хотя бы один чат во вкладке «Чаты бота».</Alert>
          )}

          {botMacros.length === 0 ? (
            <Alert type="info">Макросов пока нет</Alert>
          ) : (
            botMacros.map(m => (
              <div key={m.id} style={{
                background: 'var(--sf)', padding: '10px 12px', marginBottom: '8px', borderRadius: '6px',
                borderLeft: `3px solid ${m.active ? '#8bc47a' : 'var(--bd)'}`
              }}>
                <div style={{ display:'flex', justifyContent:'space-between', alignItems:'flex-start', gap:8 }}>
                  <div style={{ minWidth:0 }}>
                    <div style={{ fontWeight: 600 }}>{m.name}</div>
                    <div style={{ fontSize: '12px', color: 'var(--mt)', marginTop: 3 }}>
                      → {chatNameOf(m.chatId)} · {scheduleLabel(m.schedule)}
                    </div>
                    <div style={{ fontSize: '12px', color: 'var(--mt)', marginTop: 4, whiteSpace:'pre-wrap', opacity:0.85 }}>{m.template}</div>
                  </div>
                  <div style={{ display:'flex', gap:6, flexShrink:0 }}>
                    <button onClick={() => handleToggleMacro(m)} title={m.active ? 'Выключить' : 'Включить'}
                      style={{ background:'none', border:'none', cursor:'pointer', color: m.active ? '#8bc47a' : 'var(--mt)', display:'flex', alignItems:'center' }}>
                      <Power size={16}/>
                    </button>
                    <button onClick={() => openEditMacro(m)} title="Редактировать"
                      style={{ background:'none', border:'none', cursor:'pointer', color:'var(--mt)', display:'flex', alignItems:'center' }}>
                      <Pencil size={16}/>
                    </button>
                    <button onClick={() => handleDeleteMacro(m.id)} title="Удалить"
                      style={{ background:'none', border:'none', cursor:'pointer', color:'#e07a60', display:'flex', alignItems:'center' }}>
                      <Trash2 size={16}/>
                    </button>
                  </div>
                </div>
              </div>
            ))
          )}

          <Modal
            isOpen={macroForm !== null}
            title={macroForm?.id ? 'Редактировать макрос' : 'Новый макрос'}
            onClose={() => setMacroForm(null)}
            actions={[
              <Button key="cancel" variant="secondary" onClick={() => setMacroForm(null)}>Отмена</Button>,
              <Button key="save" onClick={handleSaveMacro}>Сохранить</Button>
            ]}
          >
            {macroForm && (
              <div style={{ display: 'flex', flexDirection: 'column', gap: '12px' }}>
                <div>
                  <label style={{ display:'block', fontSize:13, fontWeight:500, marginBottom:4 }}>Название</label>
                  <input value={macroForm.name}
                    onChange={(e) => setMacroForm({ ...macroForm, name: e.target.value })}
                    style={{ width:'100%', padding:8, borderRadius:6, border:'1px solid var(--bd)' }}/>
                </div>
                <div>
                  <label style={{ display:'block', fontSize:13, fontWeight:500, marginBottom:4 }}>Чат</label>
                  <select value={macroForm.chatId}
                    onChange={(e) => setMacroForm({ ...macroForm, chatId: e.target.value })}
                    style={{ width:'100%', padding:8, borderRadius:6, border:'1px solid var(--bd)' }}>
                    {botChats.map(c => <option key={c.id} value={c.chatId}>{c.name}</option>)}
                  </select>
                </div>
                <div>
                  <label style={{ display:'block', fontSize:13, fontWeight:500, marginBottom:4 }}>Текст сообщения</label>
                  <textarea value={macroForm.template}
                    onChange={(e) => setMacroForm({ ...macroForm, template: e.target.value })}
                    style={{ width:'100%', padding:8, borderRadius:6, border:'1px solid var(--bd)', minHeight:90, fontFamily:'inherit' }}/>
                  <div style={{ fontSize:11, color:'var(--mt)', marginTop:4 }}>
                    Переменные: <code>{'{{дата}}'}</code> · <code>{'{{день_недели}}'}</code> · <code>{'{{неделя}}'}</code>
                  </div>
                </div>
                <div style={{ display:'flex', gap:8, flexWrap:'wrap' }}>
                  <div style={{ flex:'1 1 140px' }}>
                    <label style={{ display:'block', fontSize:13, fontWeight:500, marginBottom:4 }}>Повтор</label>
                    <select value={macroForm.schedule.type}
                      onChange={(e) => setMacroForm({ ...macroForm, schedule: { ...macroForm.schedule, type: e.target.value } })}
                      style={{ width:'100%', padding:8, borderRadius:6, border:'1px solid var(--bd)' }}>
                      <option value="once">Один раз</option>
                      <option value="daily">Ежедневно</option>
                      <option value="weekly">Еженедельно</option>
                      <option value="every_n">Каждые N дней</option>
                    </select>
                  </div>
                  <div style={{ flex:'0 0 110px' }}>
                    <label style={{ display:'block', fontSize:13, fontWeight:500, marginBottom:4 }}>Время</label>
                    <input type="time" value={macroForm.schedule.time}
                      onChange={(e) => setMacroForm({ ...macroForm, schedule: { ...macroForm.schedule, time: e.target.value } })}
                      style={{ width:'100%', padding:8, borderRadius:6, border:'1px solid var(--bd)' }}/>
                  </div>
                </div>
                {macroForm.schedule.type === 'weekly' && (
                  <div>
                    <label style={{ display:'block', fontSize:13, fontWeight:500, marginBottom:4 }}>День недели</label>
                    <select value={macroForm.schedule.weekday}
                      onChange={(e) => setMacroForm({ ...macroForm, schedule: { ...macroForm.schedule, weekday: Number(e.target.value) } })}
                      style={{ width:'100%', padding:8, borderRadius:6, border:'1px solid var(--bd)' }}>
                      {['Воскресенье','Понедельник','Вторник','Среда','Четверг','Пятница','Суббота'].map((d, i) =>
                        <option key={i} value={i}>{d}</option>)}
                    </select>
                  </div>
                )}
                {macroForm.schedule.type === 'every_n' && (
                  <div>
                    <label style={{ display:'block', fontSize:13, fontWeight:500, marginBottom:4 }}>Интервал (дней)</label>
                    <input type="number" min="1" value={macroForm.schedule.interval}
                      onChange={(e) => setMacroForm({ ...macroForm, schedule: { ...macroForm.schedule, interval: e.target.value } })}
                      style={{ width:'100%', padding:8, borderRadius:6, border:'1px solid var(--bd)' }}/>
                  </div>
                )}
                {macroForm.schedule.type === 'once' && (
                  <div>
                    <label style={{ display:'block', fontSize:13, fontWeight:500, marginBottom:4 }}>Дата</label>
                    <input type="date" value={macroForm.schedule.runDate}
                      onChange={(e) => setMacroForm({ ...macroForm, schedule: { ...macroForm.schedule, runDate: e.target.value } })}
                      style={{ width:'100%', padding:8, borderRadius:6, border:'1px solid var(--bd)' }}/>
                  </div>
                )}
              </div>
            )}
          </Modal>
        </div>
      )}

      {/* Пуши — расписание и шаблоны */}
      {tab === 'push-editor' && (
        <div>
          <h2 style={{ fontSize: '16px', fontWeight: 600, marginBottom: '8px', display:'flex', alignItems:'center', gap:7 }}><Clock size={14}/>Расписание и шаблоны пушей</h2>
          <div style={{ fontSize: 12, color: 'var(--mt)', marginBottom: 14, lineHeight: 1.6, background:'var(--sf)', borderRadius:8, padding:'10px 12px' }}>
            Время задаётся по Москве (часовой пояс <code>PUSH_TZ</code>, дефолт Europe/Moscow). Выключенные пуши не отправляются.<br/>
            Если шаблон пуст — используется встроенный текст. Плейсхолдеры <code>{'{tasks}'}</code>/<code>{'{sets}'}</code> подставляют список.
          </div>

          {!pushSettings ? (
            <Alert type="info">Загрузка настроек…</Alert>
          ) : (
            <>
              {PUSH_JOBS_META.map(job => {
                const j = pushSettings.jobs?.[job.key] || {};
                const open = expandedTpl === job.key;
                return (
                  <div key={job.key} style={{
                    background: 'var(--sf)', padding: '12px', marginBottom: '10px', borderRadius: '8px',
                    borderLeft: `3px solid ${j.enabled === false ? 'var(--bd)' : '#8bc47a'}`
                  }}>
                    <div style={{ display:'flex', justifyContent:'space-between', alignItems:'center', gap:10, flexWrap:'wrap' }}>
                      <label style={{ display:'flex', alignItems:'center', gap:8, cursor:'pointer', fontWeight:600 }}>
                        <input type="checkbox" checked={j.enabled !== false}
                          onChange={(e) => patchPushJob(job.key, { enabled: e.target.checked })} />
                        {job.label}
                      </label>
                      <input type="time" value={j.time || job.defTime}
                        onChange={(e) => patchPushJob(job.key, { time: e.target.value })}
                        style={{ padding:'6px 8px', borderRadius:6, border:'1px solid var(--bd)' }} />
                    </div>
                    <div style={{ fontSize:12, color:'var(--mt)', marginTop:6 }}>
                      {job.desc} <span style={{ opacity:0.7 }}>Дефолт: {job.defTime}</span>
                    </div>
                    <button onClick={() => setExpandedTpl(open ? null : job.key)}
                      style={{ display:'flex', alignItems:'center', gap:4, background:'none', border:'none', color:'var(--pp)',
                        cursor:'pointer', fontSize:13, marginTop:8, padding:0 }}>
                      {open ? <ChevronDown size={14}/> : <ChevronRight size={14}/>}
                      Шаблон текста{pushSettings.templates?.[job.key]?.trim() ? '' : ' (встроенный)'}
                    </button>
                    {open && (
                      <div style={{ marginTop:8 }}>
                        <textarea value={pushSettings.templates?.[job.key] || ''}
                          onChange={(e) => patchPushTpl(job.key, e.target.value)}
                          placeholder="Пусто — используется встроенный текст"
                          style={{ width:'100%', padding:8, borderRadius:6, border:'1px solid var(--bd)', minHeight:90, fontFamily:'inherit' }} />
                        <div style={{ fontSize:11, color:'var(--mt)', marginTop:4 }}>
                          Переменные: <code>{job.vars}</code>
                        </div>
                      </div>
                    )}
                  </div>
                );
              })}
              <div style={{ display:'flex', alignItems:'center', gap:12, marginTop:8 }}>
                <Button onClick={handleSavePushSettings}>Сохранить</Button>
                {pushSaveMsg && <span style={{ fontSize:13, color:'var(--mt)' }}>{pushSaveMsg}</span>}
              </div>
            </>
          )}
        </div>
      )}
    </div>
  );
}
