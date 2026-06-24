// Умные соты — ABC-анализ продаж в виде шестиугольников
// 🟢 Зелёный = группа A (лидеры продаж)
// 🟡 Жёлтый  = маржинальная позиция не в группе A (нужно продавать активнее)
// 🔴 Красный  = группа C, немаржинальная (застой)
// ⬜ Серый    = группа B, немаржинальная (средний уровень)
import { useState, useEffect, useCallback } from 'react';
import { Hexagon, RefreshCw, AlertTriangle, ChevronDown, ChevronUp, Plus, Star } from 'lucide-react';
import { iikoSalesABC } from '../services/api.js';

const STATUS = {
  green:  { border: '#4caf82', bg: 'rgba(76,175,130,.18)', text: '#4caf82',  badge: 'A',  label: 'Лидеры' },
  yellow: { border: '#f0b429', bg: 'rgba(240,180,41,.18)', text: '#f0b429',  badge: '★',  label: 'Маржинальные' },
  red:    { border: '#e8593c', bg: 'rgba(232,89,60,.18)',  text: '#e8593c',  badge: 'C',  label: 'Застой' },
  grey:   { border: 'var(--bd)', bg: 'var(--sf)',          text: 'var(--mt)', badge: 'B', label: 'Средние' },
};

// Шестиугольник с двойным слоем для имитации рамки поверх clip-path
// onAdd() — вызывается без аргументов, логика формирования текста в родителе
function HexCell({ item, onAdd, added }) {
  const s = STATUS[item.status] || STATUS.grey;
  const name = item.name.length > 13 ? item.name.slice(0, 12) + '…' : item.name;
  const isAdded = added;

  function handleClick() {
    if (!onAdd || isAdded) return;
    onAdd();
  }

  return (
    <div
      title={`${item.name}\n${item.count} шт · группа ${item.abcGroup}${item.isMargin ? ' · маржинальный' : ''}\nНажми чтобы добавить в GoList`}
      onClick={handleClick}
      style={{
        position: 'relative',
        width: 76,
        height: 66,
        flexShrink: 0,
        cursor: onAdd && !isAdded ? 'pointer' : 'default',
        opacity: isAdded ? 0.55 : 1,
      }}
    >
      {/* Слой рамки */}
      <div style={{
        position: 'absolute', inset: 0,
        clipPath: 'polygon(50% 0%, 100% 25%, 100% 75%, 50% 100%, 0% 75%, 0% 25%)',
        background: s.border,
      }}/>
      {/* Слой заливки (2px отступ = толщина рамки) */}
      <div style={{
        position: 'absolute', inset: 2,
        clipPath: 'polygon(50% 0%, 100% 25%, 100% 75%, 50% 100%, 0% 75%, 0% 25%)',
        background: s.bg,
        display: 'flex',
        flexDirection: 'column',
        alignItems: 'center',
        justifyContent: 'center',
        gap: 1,
        padding: '4px 6px',
      }}>
        {/* Бейдж группы */}
        <div style={{ fontSize: 8, fontWeight: 800, color: s.text, letterSpacing: '0.05em', lineHeight: 1 }}>
          {isAdded ? '✓' : s.badge}
        </div>
        {/* Название блюда */}
        <div style={{
          fontSize: 8,
          textAlign: 'center',
          color: s.text,
          lineHeight: 1.25,
          wordBreak: 'break-word',
          maxWidth: 58,
        }}>
          {name}
        </div>
        {/* Кол-во */}
        <div style={{ fontSize: 7, color: s.text, opacity: 0.7, lineHeight: 1 }}>
          {item.count}шт
        </div>
      </div>
    </div>
  );
}

// Легенда внизу
function Legend() {
  return (
    <div style={{ display: 'flex', flexWrap: 'wrap', gap: '6px 12px', marginTop: 10 }}>
      {Object.entries(STATUS).map(([key, s]) => (
        <div key={key} style={{ display: 'flex', alignItems: 'center', gap: 4 }}>
          <div style={{ width: 8, height: 8, borderRadius: 2, background: s.border, flexShrink: 0 }}/>
          <span style={{ fontSize: 10, color: 'var(--mt)' }}>{s.label}</span>
        </div>
      ))}
    </div>
  );
}

export function HoneycombGrid({ onGoAdd, defaultOpen = false }) {
  const [open,    setOpen]    = useState(defaultOpen);
  const [data,    setData]    = useState(null);
  const [loading, setLoading] = useState(false);
  const [err,     setErr]     = useState(null);
  const [added,   setAdded]   = useState(new Set());

  const load = useCallback(async (force = false) => {
    setLoading(true);
    setErr(null);
    if (force) setAdded(new Set());
    try {
      const json = await iikoSalesABC(force);
      setData(json);
    } catch (e) { setErr(e.message); }
    finally { setLoading(false); }
  }, []);

  // Загружаем при первом раскрытии
  useEffect(() => {
    if (open && !data && !loading && !err) load();
  }, [open, data, loading, err, load]);

  const rawItems = data?.items || [];
  // Показываем только actionable соты: A (зелёные), маржинальные (жёлтые), застой C (красные).
  // Серые (B/немаржинальные) — шум, убираем. Отсекаем баг данных (>500 шт/день). Максимум 12.
  const items = rawItems
    .filter(i => i.count <= 500)
    .filter(i => i.status !== 'grey')
    .slice(0, 12);

  // Строим строки по 4 сота с шахматным смещением
  const COLS = 4;
  const HEX_W = 76;
  const HEX_H = 66;
  const GAP_X = 5;
  const OVERLAP_Y = Math.round(HEX_H * 0.28); // ~18px вертикальное перекрытие

  const rows = [];
  for (let i = 0; i < items.length; i += COLS) {
    rows.push(items.slice(i, i + COLS));
  }

  const cntA = items.filter(i => i.abcGroup === 'A').length;
  const cntRed = items.filter(i => i.status === 'red').length;
  const cntYellow = items.filter(i => i.status === 'yellow').length;

  return (
    <div style={{ border: '1px solid var(--bd)', borderRadius: 10, overflow: 'hidden', background: 'var(--sf)' }}>
      {/* Шапка-аккордеон */}
      <div style={{ display: 'flex', alignItems: 'center' }}>
        <button onClick={() => setOpen(o => !o)} className="acc-head" style={{ flex: 1 }}>
          <span style={{ display: 'flex', alignItems: 'center', gap: 6 }}>
            <Hexagon size={13} color="var(--am)"/>
            <span>Умные соты</span>
            {items.length > 0 && (
              <span style={{ display: 'flex', gap: 4, alignItems: 'center' }}>
                {cntRed > 0 && <span style={{ fontSize: 10, color: '#e8593c', fontWeight: 700 }}>{cntRed}🔴</span>}
                {cntYellow > 0 && <span style={{ fontSize: 10, color: '#f0b429', fontWeight: 700 }}>{cntYellow}🟡</span>}
                {cntA > 0 && <span style={{ fontSize: 10, color: '#4caf82', fontWeight: 700 }}>{cntA}🟢</span>}
              </span>
            )}
          </span>
          <div style={{ display: 'flex', alignItems: 'center', gap: 6 }}>
            {open ? <ChevronUp size={15}/> : <ChevronDown size={15}/>}
          </div>
        </button>
        {open && (
          <button
            onClick={() => load(true)}
            title="Обновить"
            style={{ background: 'transparent', border: 'none', color: 'var(--mt)', cursor: 'pointer',
              padding: '8px 10px', display: 'flex', lineHeight: 0, opacity: 0.7, flexShrink: 0 }}>
            <RefreshCw size={12} style={{ animation: loading ? 'spin 1s linear infinite' : undefined }}/>
          </button>
        )}
      </div>

      {open && (
        <div style={{ padding: '4px 12px 14px' }}>
          {/* Мета */}
          {data && (
            <div style={{ fontSize: 10, color: 'var(--mt)', marginBottom: 10, opacity: 0.65 }}>
              Данные {data.periodLabel || 'сегодня'} · {items.length} позиций
              {' · '}{new Date(data.ts).toLocaleTimeString('ru-RU', { hour: '2-digit', minute: '2-digit' })}
              {' · '}нажми сот → GoList
            </div>
          )}

          {loading && (
            <div style={{ fontSize: 12, color: 'var(--mt)', padding: '16px 0', textAlign: 'center' }}>
              Анализирую продажи за сегодня…
            </div>
          )}

          {err && (
            <div style={{ fontSize: 12, color: '#e8593c', padding: '8px 0', display: 'flex', alignItems: 'center', gap: 4 }}>
              <AlertTriangle size={12}/>{err}
            </div>
          )}

          {!loading && !err && data && items.length < 3 && (
            <div style={{ fontSize: 12, color: 'var(--mt)', padding: '8px 0', lineHeight: 1.5 }}>
              {rawItems.length === 0
                ? 'Продаж за сегодня нет — подождите, пока пройдут первые чеки.'
                : 'Недостаточно ключевых позиций для анализа — нужно больше продаж за день.'}
            </div>
          )}

          {/* Шестиугольная сетка */}
          {items.length >= 3 && (
            <div style={{ position: 'relative' }}>
              {rows.map((row, ri) => (
                <div
                  key={ri}
                  style={{
                    display: 'flex',
                    gap: GAP_X,
                    marginTop: ri === 0 ? 0 : -OVERLAP_Y,
                    marginLeft: ri % 2 === 1 ? (HEX_W + GAP_X) / 2 : 0,
                  }}
                >
                  {row.map((item) => (
                    <HexCell
                      key={item.name}
                      item={item}
                      onAdd={onGoAdd ? () => {
                        const reason = item.abcGroup === 'C'
                          ? 'застой — предложить в смену'
                          : item.isMargin
                            ? 'маржинальный — активно предлагать'
                            : 'группа A — держать темп';
                        onGoAdd(`${item.name} (${reason}, ${item.count} шт сегодня)`);
                        setAdded(prev => new Set([...prev, item.name]));
                      } : null}
                      added={added.has(item.name)}
                    />
                  ))}
                </div>
              ))}
            </div>
          )}

          {items.length >= 3 && <Legend/>}
        </div>
      )}
    </div>
  );
}
