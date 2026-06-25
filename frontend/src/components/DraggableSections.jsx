// Перетаскивание блоков вкладки «Сегодня» — режим дрожания (долгое нажатие → jiggle → drag)
import { useState, useEffect, useLayoutEffect, useRef } from 'react';

export function DraggableSections({ order, nodes, onReorder }) {
  const visible = order.filter(id => nodes[id]);
  const [items, setItems] = useState(visible);
  const key = visible.join("|");
  useEffect(() => { setItems(visible); }, [key]); // eslint-disable-line react-hooks/exhaustive-deps

  const [jiggle, setJiggle] = useState(false);
  const [dragging, setDragging] = useState(null);
  const dragIdx = useRef(null);
  const longTimer = useRef(null);
  const pointerEl = useRef(null);
  const capturedId = useRef(null);
  const startPos = useRef(null);
  const contRef = useRef(null);
  // FLIP — плавное расступание блоков при перетаскивании (только вне режима дрожания)
  const rowEls = useRef({});
  const prevRects = useRef({});

  useLayoutEffect(() => {
    if (jiggle) return; // transform: rotate от jiggle конфликтует с translateY FLIP
    Object.entries(rowEls.current).forEach(([id, el]) => {
      if (!el) return;
      const nr = el.getBoundingClientRect();
      const pr = prevRects.current[id];
      if (pr) {
        const dy = pr.top - nr.top;
        if (dy) {
          el.style.transition = "none";
          el.style.transform = `translateY(${dy}px)`;
          requestAnimationFrame(() => {
            el.style.transition = "transform .2s cubic-bezier(.2,.7,.3,1)";
            el.style.transform = "";
          });
        }
      }
      prevRects.current[id] = nr;
    });
  });

  const clearLong = () => { clearTimeout(longTimer.current); longTimer.current = null; };

  const reorder = (from, to) => setItems(prev => {
    const a = [...prev];
    const [m] = a.splice(from, 1);
    a.splice(to, 0, m);
    return a;
  });

  const onMove = (clientY) => {
    if (dragIdx.current == null || !contRef.current) return;
    const rows = [...contRef.current.querySelectorAll("[data-srow]")];
    let target = rows.findIndex(r => { const b = r.getBoundingClientRect(); return clientY < b.top + b.height / 2; });
    if (target === -1) target = rows.length - 1;
    if (target !== dragIdx.current) { reorder(dragIdx.current, target); dragIdx.current = target; setDragging(target); }
  };

  const onRowDown = (e, idx) => {
    if (jiggle) {
      // режим дрожания — сразу начать перетаскивание при касании
      dragIdx.current = idx;
      setDragging(idx);
      try { e.currentTarget.setPointerCapture(e.pointerId); } catch {}
      return;
    }
    // обычный режим — запустить таймер долгого нажатия (500 мс)
    pointerEl.current = e.currentTarget;
    capturedId.current = e.pointerId;
    startPos.current = { x: e.clientX, y: e.clientY };
    longTimer.current = setTimeout(() => {
      longTimer.current = null;
      navigator.vibrate?.(25);
      setJiggle(true);
      dragIdx.current = idx;
      setDragging(idx);
      try { pointerEl.current?.setPointerCapture(capturedId.current); } catch {}
    }, 500);
  };

  const onRowMove = (e) => {
    if (longTimer.current && startPos.current) {
      // палец сдвинулся во время ожидания — отменяем долгое нажатие
      const dx = e.clientX - startPos.current.x;
      const dy = e.clientY - startPos.current.y;
      if (dx * dx + dy * dy > 64) clearLong();
    }
    if (dragIdx.current != null) { e.preventDefault(); onMove(e.clientY); }
  };

  const onRowUp = () => {
    clearLong();
    if (dragIdx.current != null) onReorder(items);
    dragIdx.current = null;
    setDragging(null);
    // jiggle остаётся активным — выход только через кнопку «Готово»
  };

  const exitJiggle = () => {
    clearLong();
    dragIdx.current = null;
    setDragging(null);
    setJiggle(false);
  };

  return (
    <div ref={contRef}>
      {jiggle && (
        <div className="jiggle-bar">
          <button className="jiggle-done" onPointerDown={exitJiggle}>Готово</button>
        </div>
      )}
      {items.map((id, idx) => (
        <div
          data-srow
          key={id}
          ref={el => { rowEls.current[id] = el; }}
          className={[jiggle && 'sec-jiggle', dragging === idx && 'sec-dragging'].filter(Boolean).join(' ')}
          style={{ position: "relative", ...(jiggle && { animationDelay: `${(idx % 2) * 0.06}s` }) }}
          onPointerDown={e => onRowDown(e, idx)}
          onPointerMove={onRowMove}
          onPointerUp={onRowUp}
          onPointerCancel={onRowUp}
        >
          {nodes[id]}
        </div>
      ))}
    </div>
  );
}
