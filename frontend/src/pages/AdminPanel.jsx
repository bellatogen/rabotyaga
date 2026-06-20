import { useState, useEffect } from 'react';
import { Modal, Alert, Button } from '../components/Common.jsx';
import { getPushLog, getPushSchedule, setPushSchedule, getBindings } from '../services/api.js';

export function AdminPanel({ token }) {
  const [tab, setTab] = useState('push-log');
  const [pushLog, setPushLog] = useState([]);
  const [pushSchedule, setPushScheduleData] = useState([]);
  const [bindings, setBindings] = useState({});
  const [loading, setLoading] = useState(true);
  const [selectedDate, setSelectedDate] = useState(new Date().toISOString().slice(0, 10));
  const [editModal, setEditModal] = useState(false);
  const [newScheduleItem, setNewScheduleItem] = useState({ time: '', recipient: '', text: '' });

  useEffect(() => {
    loadAdminData();
  }, [token, selectedDate]);

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

  if (loading) return <div style={{ padding: '20px' }}>Загрузка админки...</div>;

  return (
    <div style={{ padding: '12px' }}>
      <h1 style={{ fontSize: '20px', fontWeight: 700, marginBottom: '16px' }}>⚙️ Админ-панель</h1>

      {/* Табы */}
      <div style={{ display: 'flex', gap: '8px', marginBottom: '16px', borderBottom: '1px solid var(--bd)', paddingBottom: '12px' }}>
        {[
          { id: 'push-log', label: '📬 Логи пушей' },
          { id: 'push-schedule', label: '📅 График пушей' },
          { id: 'bindings', label: '👥 Привязки' }
        ].map(t => (
          <button
            key={t.id}
            onClick={() => setTab(t.id)}
            style={{
              background: tab === t.id ? 'var(--pp)' : 'transparent',
              color: tab === t.id ? '#fff' : 'var(--mt)',
              border: 'none', padding: '8px 12px', borderRadius: '6px', cursor: 'pointer',
              fontSize: '13px', fontWeight: 500
            }}
          >
            {t.label}
          </button>
        ))}
      </div>

      {/* Логи пушей */}
      {tab === 'push-log' && (
        <div>
          <h2 style={{ fontSize: '16px', fontWeight: 600, marginBottom: '12px' }}>📬 История рассылок</h2>
          {pushLog.length === 0 ? (
            <Alert type="info">ℹ️ Логи отправок еще пусты</Alert>
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
            <Alert type="info">ℹ️ График пуш на этот день пуст</Alert>
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

      {/* Привязки */}
      {tab === 'bindings' && (
        <div>
          <h2 style={{ fontSize: '16px', fontWeight: 600, marginBottom: '12px' }}>👥 Сотрудники</h2>
          {Object.keys(bindings).length === 0 ? (
            <Alert type="info">ℹ️ Привязок еще нет</Alert>
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
    </div>
  );
}
