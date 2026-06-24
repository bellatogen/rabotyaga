// Вкладка «События» — рич-мероприятия (events:v2): создание/редактирование,
// повторяемость, ответственные, локация, смета, план постов, аналитика.
import { useState } from 'react';
import { Plus, Trash2, Calendar, Clock, MapPin, Users, Wallet, Megaphone, Pencil, X, Repeat } from 'lucide-react';
import { DOW_FULL, MONTHS_RU } from '../constants/locale.js';
import {
  EVENT_TYPES, eventTypeById, RECURRENCE_TYPES, WEEKDAYS, EVENT_PLATFORMS,
  emptyEvent, isEventToday, recurrenceLabel,
} from '../constants/events.js';
import { uid, nowISO } from '../utils/dateUtils.js';

const inp = {
  width: '100%', padding: '8px 10px', borderRadius: 8, border: '1px solid var(--bd)',
  background: 'var(--bg)', color: 'var(--pp)', fontFamily: 'inherit', fontSize: 14, boxSizing: 'border-box',
};

function fmtDay(dateStr) {
  const d = new Date(dateStr + 'T12:00:00');
  return `${DOW_FULL[d.getDay()]}, ${d.getDate()} ${MONTHS_RU[d.getMonth()]}`;
}

// Метаданные типа: цвет/эмодзи из реестра либо нейтральный фолбек
function typeMeta(typeId) {
  return eventTypeById(typeId) || { emoji: '📅', shortName: '', color: 'var(--cu)', bg: 'var(--sf)' };
}

export function EventsTab({ events, isManager, onSave, onDelete, ds, staff = [] }) {
  const [editing, setEditing] = useState(null); // объект-черновик в режиме формы либо null

  const list = Array.isArray(events) ? events : [];
  // Сортировка по дате старта
  const sorted = [...list].sort((a, b) => (a.startDate || '').localeCompare(b.startDate || ''));
  const todays = sorted.filter(e => isEventToday(e, ds));
  const todayIds = new Set(todays.map(e => e.id));
  // Предстоящие: повторяющиеся (не once) либо once, чей период ещё не закончился
  const isPast = e => {
    if (todayIds.has(e.id)) return false;
    if (e.recurrence && e.recurrence.type !== 'once') {
      return e.recurrence.endDate ? e.recurrence.endDate < ds : false;
    }
    const end = e.endDate || e.startDate;
    return end < ds;
  };
  const upcoming = sorted.filter(e => !todayIds.has(e.id) && !isPast(e));
  const past = sorted.filter(isPast).reverse();

  const startCreate = () => setEditing(emptyEvent({ id: uid(), startDate: ds, createdAt: nowISO() }));
  const startEdit = ev => setEditing(JSON.parse(JSON.stringify(ev)));
  const handleSave = ev => { onSave(ev); setEditing(null); };

  if (editing) {
    return <EventForm draft={editing} staff={staff} onSave={handleSave} onCancel={() => setEditing(null)} />;
  }

  const EventCard = ({ ev, faded }) => {
    const t = typeMeta(ev.type);
    const today = todayIds.has(ev.id);
    const period = ev.recurrence && ev.recurrence.type !== 'once'
      ? recurrenceLabel(ev.recurrence)
      : (ev.endDate && ev.endDate !== ev.startDate
        ? `${fmtDay(ev.startDate)} — ${fmtDay(ev.endDate)}`
        : fmtDay(ev.startDate));
    return (
      <div style={{
        background: 'var(--sf)', border: `1px solid ${today ? 'var(--cu)' : 'var(--bd)'}`,
        borderRadius: 12, padding: 12, marginBottom: 8, opacity: faded ? 0.55 : 1,
      }}>
        <div style={{ display: 'flex', alignItems: 'flex-start', gap: 10 }}>
          <div style={{ fontSize: 22, lineHeight: 1, flexShrink: 0 }}>{t.emoji}</div>
          <div style={{ flex: 1, minWidth: 0 }}>
            <div style={{ fontWeight: 600, fontSize: 14, display: 'flex', alignItems: 'center', gap: 6, flexWrap: 'wrap' }}>
              {ev.title || t.shortName || 'Событие'}
              {today && <span style={{
                fontSize: 10, fontWeight: 700, background: 'var(--cu)', color: 'var(--bg)',
                padding: '2px 6px', borderRadius: 6, letterSpacing: '.04em',
              }}>СЕГОДНЯ</span>}
            </div>
            <div style={{ fontSize: 12, color: 'var(--mt)', marginTop: 3, display: 'flex', alignItems: 'center', gap: 5, flexWrap: 'wrap' }}>
              {ev.recurrence && ev.recurrence.type !== 'once' && <Repeat size={11} />}
              {period}
              {ev.timing && (ev.timing.start || ev.timing.end) && (
                <span style={{ display: 'inline-flex', alignItems: 'center', gap: 3 }}>
                  · <Clock size={11} />{ev.timing.start || '?'}{ev.timing.end ? `–${ev.timing.end}` : ''}
                </span>
              )}
            </div>
            {ev.description && <div style={{ fontSize: 12, color: 'var(--pp)', marginTop: 6, lineHeight: 1.5, opacity: 0.85 }}>{ev.description}</div>}
            <div style={{ display: 'flex', gap: 6, flexWrap: 'wrap', marginTop: 8 }}>
              {ev.location && ev.location.type === 'external' && (
                <span style={badge}><MapPin size={11} />{ev.location.address || 'Выезд'}</span>
              )}
              {ev.responsible && ev.responsible.length > 0 && (
                <span style={badge}><Users size={11} />{ev.responsible.join(', ')}</span>
              )}
              {ev.budget && ev.budget.enabled && (
                <span style={badge}><Wallet size={11} />{budgetTotal(ev.budget)} ₽</span>
              )}
              {ev.marketing && ev.marketing.posts && ev.marketing.posts.length > 0 && (
                <span style={badge}><Megaphone size={11} />{ev.marketing.posts.length} пост.</span>
              )}
            </div>
          </div>
          {isManager && (
            <div style={{ display: 'flex', flexDirection: 'column', gap: 6, flexShrink: 0 }}>
              <button onClick={() => startEdit(ev)} style={iconBtn} title="Редактировать"><Pencil size={15} /></button>
              <button onClick={() => { if (confirm('Удалить событие?')) onDelete(ev.id); }} style={iconBtn} title="Удалить"><Trash2 size={15} /></button>
            </div>
          )}
        </div>
      </div>
    );
  };

  return (
    <div>
      {isManager && (
        <div className="sec" style={{ paddingBottom: 8 }}>
          <button className="btn btn-p" onClick={startCreate}><Plus size={16} />Добавить событие</button>
        </div>
      )}

      {list.length === 0 && (
        <div className="sec"><div className="empty">Событий нет — {isManager ? 'добавь первое' : 'спроси управляющего'}</div></div>
      )}

      {todays.length > 0 && (
        <div className="sec">
          <div className="sec-lbl" style={{ marginBottom: 10, color: 'var(--am)' }}><Calendar size={12} />Сегодня</div>
          {todays.map(ev => <EventCard key={ev.id} ev={ev} />)}
        </div>
      )}

      {upcoming.length > 0 && (
        <div className="sec">
          <div className="sec-lbl" style={{ marginBottom: 10 }}>Предстоящие и регулярные</div>
          {upcoming.map(ev => <EventCard key={ev.id} ev={ev} />)}
        </div>
      )}

      {past.length > 0 && (
        <div className="sec" style={{ paddingTop: 4 }}>
          <div className="sec-lbl" style={{ marginBottom: 10, opacity: 0.6 }}>Прошедшие</div>
          {past.slice(0, 12).map(ev => <EventCard key={ev.id} ev={ev} faded />)}
        </div>
      )}
    </div>
  );
}

const badge = {
  display: 'inline-flex', alignItems: 'center', gap: 4, fontSize: 11, color: 'var(--mt)',
  background: 'var(--bg)', border: '1px solid var(--bd)', borderRadius: 7, padding: '3px 7px',
};
const iconBtn = {
  background: 'transparent', border: '1px solid var(--bd)', borderRadius: 7, width: 28, height: 28,
  display: 'flex', alignItems: 'center', justifyContent: 'center', color: 'var(--mt)', cursor: 'pointer', padding: 0,
};

function budgetTotal(budget) {
  return (budget && budget.items || []).reduce((s, i) => s + (Number(i.amount) || 0), 0);
}

// ── Форма создания/редактирования рич-события ──────────────────────────────
function EventForm({ draft, staff, onSave, onCancel }) {
  const [ev, setEv] = useState(draft);
  const [error, setError] = useState('');

  const set = patch => setEv(prev => ({ ...prev, ...patch }));
  const setRec = patch => setEv(prev => ({ ...prev, recurrence: { ...prev.recurrence, ...patch } }));
  const setLoc = patch => setEv(prev => ({ ...prev, location: { ...prev.location, ...patch } }));
  const setTiming = patch => setEv(prev => ({ ...prev, timing: { ...prev.timing, ...patch } }));
  const setAnalytics = patch => setEv(prev => ({ ...prev, analytics: { ...prev.analytics, ...patch } }));

  const toggleResponsible = name => setEv(prev => ({
    ...prev,
    responsible: prev.responsible.includes(name)
      ? prev.responsible.filter(n => n !== name)
      : [...prev.responsible, name],
  }));

  // Смета
  const setBudgetEnabled = enabled => setEv(prev => ({ ...prev, budget: { ...prev.budget, enabled } }));
  const addBudgetItem = () => setEv(prev => ({ ...prev, budget: { ...prev.budget, items: [...prev.budget.items, { name: '', amount: '' }] } }));
  const updateBudgetItem = (idx, patch) => setEv(prev => ({
    ...prev,
    budget: { ...prev.budget, items: prev.budget.items.map((it, i) => i === idx ? { ...it, ...patch } : it) },
  }));
  const removeBudgetItem = idx => setEv(prev => ({ ...prev, budget: { ...prev.budget, items: prev.budget.items.filter((_, i) => i !== idx) } }));

  // План постов
  const addPost = () => setEv(prev => ({
    ...prev,
    marketing: { posts: [...prev.marketing.posts, { platform: 'telegram', scheduledDate: prev.startDate, responsible: '', pushEnabled: false }] },
  }));
  const updatePost = (idx, patch) => setEv(prev => ({
    ...prev,
    marketing: { posts: prev.marketing.posts.map((p, i) => i === idx ? { ...p, ...patch } : p) },
  }));
  const removePost = idx => setEv(prev => ({ ...prev, marketing: { posts: prev.marketing.posts.filter((_, i) => i !== idx) } }));

  const handleSave = () => {
    const title = (ev.title || '').trim();
    const t = eventTypeById(ev.type);
    if (!title && !t) { setError('Укажи название или выбери тип'); return; }
    if (!ev.startDate) { setError('Укажи дату начала'); return; }
    // Нормализуем числа сметы и пустые поля
    const clean = {
      ...ev,
      title: title || (t ? t.name : ''),
      endDate: ev.endDate || null,
      budget: {
        enabled: ev.budget.enabled,
        items: ev.budget.items
          .filter(i => (i.name || '').trim() || i.amount !== '')
          .map(i => ({ name: (i.name || '').trim(), amount: Number(i.amount) || 0 })),
      },
      location: {
        type: ev.location.type,
        address: ev.location.type === 'external' ? (ev.location.address || null) : null,
        transferDetails: ev.location.type === 'external' ? (ev.location.transferDetails || null) : null,
      },
      recurrence: {
        type: ev.recurrence.type,
        interval: ev.recurrence.type === 'every_n' ? (Number(ev.recurrence.interval) || 1) : null,
        weekday: ev.recurrence.type === 'weekday' ? (ev.recurrence.weekday ?? null) : null,
        endDate: ev.recurrence.type !== 'once' ? (ev.recurrence.endDate || null) : null,
      },
    };
    onSave(clean);
  };

  return (
    <div className="sec">
      <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', marginBottom: 12 }}>
        <div style={{ fontWeight: 700, fontSize: 16 }}>{(draft.title || draft.type) ? 'Редактировать событие' : 'Новое событие'}</div>
        <button onClick={onCancel} style={iconBtn} title="Закрыть"><X size={16} /></button>
      </div>

      <div style={card}>
        {/* Название */}
        <div className="sec-lbl" style={lbl}>Название</div>
        <input value={ev.title} onChange={e => set({ title: e.target.value })} placeholder="Название события" style={inp} />

        {/* Тип */}
        <div className="sec-lbl" style={{ ...lbl, marginTop: 14 }}>Тип события</div>
        <div className="chip-row">
          {EVENT_TYPES.map(t => (
            <button key={t.id} className={`chip${ev.type === t.id ? ' on' : ''}`}
              onClick={() => set({ type: ev.type === t.id ? null : t.id })}>
              {t.emoji} {t.shortName}
            </button>
          ))}
        </div>

        {/* Описание */}
        <div className="sec-lbl" style={{ ...lbl, marginTop: 14 }}>Описание / контекст</div>
        <textarea value={ev.description} onChange={e => set({ description: e.target.value })}
          placeholder="О чём событие, детали, цель" rows={2} style={{ ...inp, resize: 'vertical' }} />

        {/* Даты */}
        <div style={{ display: 'flex', gap: 10, marginTop: 14 }}>
          <div style={{ flex: 1 }}>
            <div className="sec-lbl" style={lbl}><Calendar size={12} />Дата начала</div>
            <input type="date" value={ev.startDate} onChange={e => set({ startDate: e.target.value })} style={inp} />
          </div>
          <div style={{ flex: 1 }}>
            <div className="sec-lbl" style={lbl}>Дата конца</div>
            <input type="date" value={ev.endDate || ''} min={ev.startDate} onChange={e => set({ endDate: e.target.value || null })} style={inp} />
          </div>
        </div>
      </div>

      {/* Повторяемость */}
      <div style={card}>
        <div className="sec-lbl" style={lbl}><Repeat size={12} />Повторяемость</div>
        <div className="chip-row">
          {RECURRENCE_TYPES.map(r => (
            <button key={r.id} className={`chip${ev.recurrence.type === r.id ? ' on' : ''}`}
              onClick={() => setRec({ type: r.id })}>{r.label}</button>
          ))}
        </div>
        {ev.recurrence.type === 'every_n' && (
          <div style={{ marginTop: 12, display: 'flex', alignItems: 'center', gap: 8 }}>
            <span style={{ fontSize: 13, color: 'var(--mt)' }}>Каждые</span>
            <input type="number" min={1} value={ev.recurrence.interval ?? ''} onChange={e => setRec({ interval: e.target.value })}
              placeholder="N" style={{ ...inp, width: 80 }} />
            <span style={{ fontSize: 13, color: 'var(--mt)' }}>дней</span>
          </div>
        )}
        {ev.recurrence.type === 'weekday' && (
          <div style={{ marginTop: 12 }}>
            <div className="sec-lbl" style={lbl}>День недели</div>
            <div className="chip-row">
              {WEEKDAYS.map(w => (
                <button key={w.id} className={`chip${ev.recurrence.weekday === w.id ? ' on' : ''}`}
                  onClick={() => setRec({ weekday: w.id })}>{w.label}</button>
              ))}
            </div>
          </div>
        )}
        {ev.recurrence.type !== 'once' && (
          <div style={{ marginTop: 12 }}>
            <div className="sec-lbl" style={lbl}>Повторять до (необязательно)</div>
            <input type="date" value={ev.recurrence.endDate || ''} min={ev.startDate}
              onChange={e => setRec({ endDate: e.target.value || null })} style={inp} />
          </div>
        )}
      </div>

      {/* Тайминг */}
      <div style={card}>
        <div className="sec-lbl" style={lbl}><Clock size={12} />Тайминг</div>
        <div style={{ display: 'flex', gap: 10 }}>
          <div style={{ flex: 1 }}>
            <div className="sec-lbl" style={lbl}>Начало</div>
            <input type="time" value={ev.timing.start} onChange={e => setTiming({ start: e.target.value })} style={inp} />
          </div>
          <div style={{ flex: 1 }}>
            <div className="sec-lbl" style={lbl}>Конец</div>
            <input type="time" value={ev.timing.end} onChange={e => setTiming({ end: e.target.value })} style={inp} />
          </div>
        </div>
      </div>

      {/* Локация */}
      <div style={card}>
        <div className="sec-lbl" style={lbl}><MapPin size={12} />Локация</div>
        <div className="chip-row">
          <button className={`chip${ev.location.type === 'own' ? ' on' : ''}`} onClick={() => setLoc({ type: 'own' })}>🏠 Своя площадка</button>
          <button className={`chip${ev.location.type === 'external' ? ' on' : ''}`} onClick={() => setLoc({ type: 'external' })}>🚐 Выезд</button>
        </div>
        {ev.location.type === 'external' && (
          <>
            <div className="sec-lbl" style={{ ...lbl, marginTop: 12 }}>Адрес</div>
            <input value={ev.location.address || ''} onChange={e => setLoc({ address: e.target.value })}
              placeholder="Адрес площадки" style={inp} />
            <div className="sec-lbl" style={{ ...lbl, marginTop: 12 }}>Трансфер / логистика</div>
            <textarea value={ev.location.transferDetails || ''} onChange={e => setLoc({ transferDetails: e.target.value })}
              placeholder="Как добираемся, что везём, во сколько выезд" rows={2} style={{ ...inp, resize: 'vertical' }} />
          </>
        )}
      </div>

      {/* Ответственные */}
      <div style={card}>
        <div className="sec-lbl" style={lbl}><Users size={12} />Ответственные</div>
        {staff.length === 0
          ? <div className="empty" style={{ padding: '8px 0' }}>Нет сотрудников</div>
          : (
            <div className="chip-row">
              {staff.map(name => (
                <button key={name} className={`chip${ev.responsible.includes(name) ? ' on' : ''}`}
                  onClick={() => toggleResponsible(name)}>{name}</button>
              ))}
            </div>
          )}
      </div>

      {/* Смета */}
      <div style={card}>
        <label style={{ display: 'flex', alignItems: 'center', gap: 8, cursor: 'pointer' }}>
          <input type="checkbox" checked={ev.budget.enabled} onChange={e => setBudgetEnabled(e.target.checked)} />
          <span className="sec-lbl" style={{ ...lbl, marginBottom: 0 }}><Wallet size={12} />Смета</span>
        </label>
        {ev.budget.enabled && (
          <div style={{ marginTop: 12 }}>
            {ev.budget.items.map((it, idx) => (
              <div key={idx} style={{ display: 'flex', gap: 8, marginBottom: 8 }}>
                <input value={it.name} onChange={e => updateBudgetItem(idx, { name: e.target.value })}
                  placeholder="Статья расхода" style={{ ...inp, flex: 2 }} />
                <input type="number" value={it.amount} onChange={e => updateBudgetItem(idx, { amount: e.target.value })}
                  placeholder="₽" style={{ ...inp, flex: 1 }} />
                <button onClick={() => removeBudgetItem(idx)} style={iconBtn} title="Удалить"><Trash2 size={14} /></button>
              </div>
            ))}
            <button className="btn btn-g" onClick={addBudgetItem} style={{ marginTop: 2 }}><Plus size={14} />Статья</button>
            <div style={{ display: 'flex', justifyContent: 'space-between', marginTop: 12, paddingTop: 10, borderTop: '1px solid var(--bd)', fontSize: 14, fontWeight: 600 }}>
              <span>Итого</span><span className="mono">{budgetTotal(ev.budget)} ₽</span>
            </div>
          </div>
        )}
      </div>

      {/* Маркетинг — план постов */}
      <div style={card}>
        <div className="sec-lbl" style={lbl}><Megaphone size={12} />План постов</div>
        {ev.marketing.posts.length === 0 && <div className="empty" style={{ padding: '6px 0' }}>Постов нет</div>}
        {ev.marketing.posts.map((p, idx) => (
          <div key={idx} style={{ border: '1px solid var(--bd)', borderRadius: 10, padding: 10, marginBottom: 8, background: 'var(--bg)' }}>
            <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: 8 }}>
              <span style={{ fontSize: 12, color: 'var(--mt)' }}>Пост {idx + 1}</span>
              <button onClick={() => removePost(idx)} style={iconBtn} title="Удалить"><Trash2 size={14} /></button>
            </div>
            <div className="chip-row" style={{ marginBottom: 8 }}>
              {EVENT_PLATFORMS.map(pl => (
                <button key={pl.id} className={`chip${p.platform === pl.id ? ' on' : ''}`}
                  onClick={() => updatePost(idx, { platform: pl.id })}>{pl.emoji} {pl.label}</button>
              ))}
            </div>
            <div style={{ display: 'flex', gap: 8, marginBottom: 8 }}>
              <div style={{ flex: 1 }}>
                <div className="sec-lbl" style={lbl}>Дата</div>
                <input type="date" value={p.scheduledDate || ''} onChange={e => updatePost(idx, { scheduledDate: e.target.value })} style={inp} />
              </div>
              <div style={{ flex: 1 }}>
                <div className="sec-lbl" style={lbl}>Ответственный</div>
                <select value={p.responsible || ''} onChange={e => updatePost(idx, { responsible: e.target.value })} style={inp}>
                  <option value="">—</option>
                  {staff.map(name => <option key={name} value={name}>{name}</option>)}
                </select>
              </div>
            </div>
            <label style={{ display: 'flex', alignItems: 'center', gap: 8, cursor: 'pointer', fontSize: 13 }}>
              <input type="checkbox" checked={!!p.pushEnabled} onChange={e => updatePost(idx, { pushEnabled: e.target.checked })} />
              Напомнить пушем
            </label>
          </div>
        ))}
        <button className="btn btn-g" onClick={addPost} style={{ marginTop: 2 }}><Plus size={14} />Пост</button>
      </div>

      {/* Аналитика */}
      <div style={card}>
        <div className="sec-lbl" style={lbl}>Аналитика / отчёт</div>
        <textarea value={ev.analytics.notes} onChange={e => setAnalytics({ notes: e.target.value })}
          placeholder="Заметки по подготовке" rows={2} style={{ ...inp, resize: 'vertical', marginBottom: 10 }} />
        <textarea value={ev.analytics.report} onChange={e => setAnalytics({ report: e.target.value })}
          placeholder="Итоговый отчёт после события" rows={2} style={{ ...inp, resize: 'vertical' }} />
      </div>

      {error && <div className="alert danger" style={{ marginBottom: 10 }}>{error}</div>}
      <div style={{ display: 'flex', gap: 8 }}>
        <button className="btn btn-p" onClick={handleSave} style={{ flex: 2 }}>Сохранить</button>
        <button className="btn btn-g" onClick={onCancel} style={{ flex: 1 }}>Отмена</button>
      </div>
    </div>
  );
}

const card = {
  background: 'var(--sf)', border: '1px solid var(--bd)', borderRadius: 12, padding: 14, marginBottom: 12,
};
const lbl = { marginBottom: 8 };
