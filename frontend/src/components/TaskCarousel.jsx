// Карусель задач — одна задача за раз, свайп вверх/вниз + точки прогресса
import { useState, useRef } from 'react';
import { ChevronUp, ChevronDown } from 'lucide-react';
import { TaskCard } from './TaskCard.jsx';

export function TaskCarousel({ tasks, doneMap, onToggle, onEdit, onHandover }) {
  const [idx, setIdx] = useState(0);
  const startY = useRef(null);

  const active  = tasks.filter(t => !doneMap[t.id]);
  const total   = active.length;
  const safeIdx = Math.min(idx, Math.max(0, total - 1));

  if (total === 0) return (
    <div className="empty" style={{padding:'16px 0'}}>Все задачи выполнены 🎉</div>
  );

  const cur  = active[safeIdx];
  const prev = () => setIdx(i => Math.max(0, i - 1));
  const next = () => setIdx(i => Math.min(total - 1, i + 1));

  const onTouchStart = e => { startY.current = e.touches[0].clientY; };
  const onTouchEnd   = e => {
    if (startY.current == null) return;
    const dy = startY.current - e.changedTouches[0].clientY;
    if (Math.abs(dy) > 40) dy > 0 ? next() : prev();
    startY.current = null;
  };

  const handleToggle = () => {
    onToggle(cur.id);
    // После выполнения задача уходит из active — остаёмся на корректном индексе
    if (safeIdx >= total - 1 && safeIdx > 0) setIdx(i => i - 1);
  };

  return (
    <div onTouchStart={onTouchStart} onTouchEnd={onTouchEnd} style={{userSelect:'none'}}>
      {/* Навигация */}
      <div style={{display:'flex',alignItems:'center',justifyContent:'space-between',marginBottom:10}}>
        <button onClick={prev} disabled={safeIdx===0}
          style={{background:'transparent',border:'1px solid var(--bd)',borderRadius:8,
            width:34,height:34,display:'flex',alignItems:'center',justifyContent:'center',
            color:safeIdx===0?'var(--bd)':'var(--mt)',cursor:safeIdx===0?'default':'pointer'}}>
          <ChevronUp size={15}/>
        </button>
        <span className="mono" style={{fontSize:11,color:'var(--mt)'}}>{safeIdx+1} / {total}</span>
        <button onClick={next} disabled={safeIdx===total-1}
          style={{background:'transparent',border:'1px solid var(--bd)',borderRadius:8,
            width:34,height:34,display:'flex',alignItems:'center',justifyContent:'center',
            color:safeIdx===total-1?'var(--bd)':'var(--mt)',cursor:safeIdx===total-1?'default':'pointer'}}>
          <ChevronDown size={15}/>
        </button>
      </div>

      {/* Текущая задача */}
      <TaskCard task={cur} done={false}
        onToggle={handleToggle}
        onEdit={onEdit ? () => onEdit(cur) : null}
        onHandover={onHandover ? () => onHandover(cur) : null}
      />

      {/* Точки прогресса (до 12 задач) */}
      {total <= 12 && (
        <div style={{display:'flex',justifyContent:'center',gap:5,marginTop:12}}>
          {active.map((_, i) => (
            <div key={i} onClick={() => setIdx(i)}
              style={{width:safeIdx===i?16:6,height:6,borderRadius:3,cursor:'pointer',
                background:safeIdx===i?'var(--cu)':'var(--bd)',
                transition:'width .18s ease,background .18s ease'}}/>
          ))}
        </div>
      )}
    </div>
  );
}
