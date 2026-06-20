import { isDone, todayStr } from '../utils/taskUtils.js';

export function TaskCard({ task, history = {}, onToggle, ds = todayStr() }) {
  const done = isDone(history[`${task.id}::${ds}`]);
  
  const pillColors = {
    'opening': 'p-t',
    'closing': 'p-w',
    'daily': 'p-rep',
  };
  
  return (
    <div style={{
      background: 'var(--sf)', borderRadius: '10px', padding: '12px 14px',
      marginBottom: '8px', opacity: done ? 0.5 : 1
    }}>
      <div style={{ display: 'flex', alignItems: 'flex-start', gap: '10px' }}>
        <div
          onClick={() => onToggle && onToggle(task.id, !done)}
          style={{
            flexShrink: 0, width: '25px', height: '25px', borderRadius: '50%',
            border: '2px solid var(--cu)', display: 'flex', alignItems: 'center',
            justifyContent: 'center', cursor: 'pointer', background: done ? 'var(--hp)' : 'transparent',
            borderColor: done ? 'var(--hp)' : 'var(--cu)'
          }}
        >
          {done && <span style={{ color: '#fff', fontSize: '14px' }}>✓</span>}
        </div>
        <div style={{ flex: 1 }}>
          <div style={{
            fontSize: '15px', fontWeight: 500, lineHeight: '1.3',
            textDecoration: done ? 'line-through' : 'none',
            color: done ? 'var(--mt)' : 'var(--pp)'
          }}>
            {task.title}
          </div>
          {task.description && (
            <div style={{ fontSize: '13px', color: 'var(--mt)', marginTop: '6px' }}>
              {task.description}
            </div>
          )}
          <div style={{ display: 'flex', flexWrap: 'wrap', gap: '5px', marginTop: '7px' }}>
            {task.repeat && (
              <span className={`pill ${pillColors[task.repeat] || 'p-r'}`}>
                {task.repeat === 'opening' ? '🔓' : task.repeat === 'closing' ? '🔒' : '📅'} {task.repeat}
              </span>
            )}
            {task.priority && (
              <span className="pill p-r">🔴 Приоритет</span>
            )}
          </div>
        </div>
      </div>
    </div>
  );
}
