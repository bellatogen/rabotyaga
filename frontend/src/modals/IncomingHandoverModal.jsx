// Экран «Осталось от прошлой смены» — показывается при входе если есть перенесённые задачи
// или заметки предыдущей смены. Кнопка «Понял, принял» снимает его на весь день.
import { CheckCheck, ClipboardList } from 'lucide-react';

export function IncomingHandoverModal({ carryOverTasks, handoverNotes, onAccept }) {
  const hasNotes = handoverNotes.length > 0;
  const hasTasks = carryOverTasks.length > 0;

  return (
    <div className="overlay" style={{ zIndex: 200 }}>
      <div className="modal">
        <div className="handle"/>
        <div className="m-title" style={{ display:'flex', alignItems:'center', gap:8 }}>
          <ClipboardList size={20}/> Осталось от прошлой смены
        </div>

        {hasNotes && (
          <div style={{ marginTop: 12 }}>
            <div style={{ fontSize: 12, fontWeight: 600, textTransform: 'uppercase', letterSpacing: '.05em', opacity: .55, marginBottom: 6 }}>
              Заметки предыдущей смены
            </div>
            {handoverNotes.map(n => (
              <div key={n.id} className="info-box" style={{ marginBottom: 8 }}>
                <div style={{ whiteSpace: 'pre-wrap' }}>{n.text}</div>
                <div style={{ fontSize: 12, opacity: .55, marginTop: 4 }}>
                  {n.by} · {new Date(n.ts).toLocaleTimeString('ru-RU', { hour: '2-digit', minute: '2-digit' })}
                </div>
              </div>
            ))}
          </div>
        )}

        {hasTasks && (
          <div style={{ marginTop: hasNotes ? 8 : 12 }}>
            <div style={{ fontSize: 12, fontWeight: 600, textTransform: 'uppercase', letterSpacing: '.05em', opacity: .55, marginBottom: 6 }}>
              Не выполнено вчера
            </div>
            {carryOverTasks.map(t => (
              <div key={t.id} style={{ display: 'flex', alignItems: 'flex-start', gap: 10, padding: '9px 0', borderBottom: '1px solid var(--bd)' }}>
                <span style={{ fontSize: 18, marginTop: 1, flexShrink: 0 }}>⬜️</span>
                <div>
                  <div style={{ fontWeight: 500 }}>
                    {t.title.startsWith('[Перенос] ') ? t.title.slice(10) : t.title}
                  </div>
                  {t.assignedTo && (
                    <div style={{ fontSize: 12, opacity: .55, marginTop: 2 }}>
                      отвечал: {t.assignedTo}
                    </div>
                  )}
                  {t.notes && (
                    <div style={{ fontSize: 12, opacity: .65, marginTop: 2 }}>{t.notes}</div>
                  )}
                </div>
              </div>
            ))}
          </div>
        )}

        <button className="btn btn-p" onClick={onAccept} style={{ width: '100%', marginTop: 18 }}>
          <CheckCheck size={16}/>Понял, принял
        </button>
      </div>
    </div>
  );
}
