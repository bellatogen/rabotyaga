// «Сэты дня» — фокус-блок в TodayTab: пары «напиток + закуска» или топ маржинальных позиций.
// Источник — GET /api/iiko/basket (кэш 20ч). При ошибке/отсутствии iiko блок скрыт.
import { useState, useEffect, useCallback } from 'react';
import { Sparkles, Plus, Check, TrendingUp, RefreshCw } from 'lucide-react';
import { iikoBasket } from '../services/api.js';
import { drinkFoodPool, buildSoloPool, topMarginKeys, pairKey, setGoText } from '../utils/setsUtils.js';

const PAGE = 3; // пар на страницу

export function DailySets({ onGoAdd }) {
  const [raw,    setRaw]    = useState(null);  // сырой ответ API
  const [err,    setErr]    = useState(null);
  const [offset, setOffset] = useState(0);
  const [added,  setAdded]  = useState(new Set());

  const load = useCallback((force = false) => {
    setErr(null);
    iikoBasket(force)
      .then(j  => setRaw(j))
      .catch(e => setErr(e.message));
  }, []);

  useEffect(() => { load(false); }, [load]);

  // Тихо скрываем при ошибке (iiko не настроен)
  if (err) return null;
  if (!raw) return null;

  const typeMap = raw.dishTypeMap || null;
  const pool      = drinkFoodPool(raw.pairs || [], typeMap);  // только напиток+закуска
  const hasPairs  = pool.length > 0;
  const soloPool  = hasPairs ? [] : buildSoloPool(raw.pairs || [], typeMap);

  // Ничего показывать не можем
  if (!hasPairs && soloPool.length === 0) return null;

  const activePool = hasPairs ? pool : soloPool;
  const total      = activePool.length;
  const page       = activePool.slice(offset, offset + PAGE);
  const canNext    = total > PAGE;

  const nextPage = () => setOffset(o => (o + PAGE) >= total ? 0 : o + PAGE);

  const marginTop = topMarginKeys(page, PAGE);

  const add = p => {
    onGoAdd && onGoAdd(setGoText(p));
    setAdded(prev => new Set([...prev, pairKey(p)]));
  };

  return (
    <div className="sec">
      <div className="sec-head">
        <span className="sec-lbl" style={{ color: 'var(--am)' }}>
          <Sparkles size={12}/>{hasPairs ? 'Сэты дня' : 'Рекомендуй сегодня'}
        </span>
        <div style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
          {hasPairs && <span style={{ fontSize: 11, color: 'var(--mt)', opacity: .6 }}>
            {offset + 1}–{Math.min(offset + PAGE, total)} из {total}
          </span>}
          {canNext && (
            <button onClick={nextPage}
              title="Следующие варианты"
              style={{ background: 'transparent', border: '1px solid var(--bd)', borderRadius: 6,
                width: 26, height: 26, display: 'flex', alignItems: 'center', justifyContent: 'center',
                color: 'var(--mt)', cursor: 'pointer', padding: 0, flexShrink: 0 }}>
              <RefreshCw size={12}/>
            </button>
          )}
        </div>
      </div>
      <div style={{ fontSize: 11, color: 'var(--mt)', marginBottom: 8, lineHeight: 1.45 }}>
        {hasPairs
          ? 'Пары «напиток + закуска», которые чаще берут вместе и дают маржу.'
          : 'Позиции с высокой маржой — предлагай гостям активно.'}
      </div>

      {/* Режим пар */}
      {hasPairs && page.map((p, i) => {
        const key     = pairKey(p);
        const isAdded = added.has(key);
        const conf    = Math.max(p.confAB || 0, p.confBA || 0);
        const isTop   = marginTop.has(key);
        return (
          <div key={i} style={{
            display: 'flex', alignItems: 'flex-start', justifyContent: 'space-between', gap: 10,
            padding: '10px 12px', background: 'var(--sf)', border: '1px solid var(--am)',
            borderRadius: 10, marginBottom: 8,
          }}>
            <div style={{ flex: 1, minWidth: 0 }}>
              <div style={{ fontSize: 13, fontWeight: 600, marginBottom: 4, lineHeight: 1.35 }}>
                {p.a}<span style={{ color: 'var(--mt)', fontWeight: 400, margin: '0 5px' }}>+</span>{p.b}
              </div>
              <div style={{ display: 'flex', gap: 8, flexWrap: 'wrap', alignItems: 'center' }}>
                {conf > 0 && <span style={{ fontSize: 11, color: 'var(--mt)' }}>
                  вместе в <span style={{ color: 'var(--am)', fontWeight: 700 }}>{conf}%</span> случаев
                </span>}
                {p.margin != null && (
                  <span style={{ fontSize: 11, color: isTop ? 'var(--cu)' : 'var(--mt)',
                    fontWeight: isTop ? 700 : 400, display: 'inline-flex', alignItems: 'center', gap: 3 }}>
                    {isTop && <TrendingUp size={11}/>}маржа ~{p.margin}%
                  </span>
                )}
              </div>
            </div>
            <button onClick={() => !isAdded && add(p)} disabled={isAdded}
              style={{ flexShrink: 0,
                background: isAdded ? 'rgba(76,175,130,.15)' : 'transparent',
                border: `1px solid ${isAdded ? 'var(--cu)' : 'var(--bd)'}`,
                borderRadius: 7, padding: '5px 8px', cursor: isAdded ? 'default' : 'pointer',
                display: 'flex', alignItems: 'center', gap: 3,
                color: isAdded ? 'var(--cu)' : 'var(--mt)',
                fontSize: 11, fontWeight: 600, fontFamily: 'inherit', whiteSpace: 'nowrap' }}>
              {isAdded ? <><Check size={12}/>В листе</> : <><Plus size={12}/>GoList</>}
            </button>
          </div>
        );
      })}

      {/* Режим одиночных позиций (нет пар напиток+закуска) */}
      {!hasPairs && page.map((item, i) => (
        <div key={i} style={{
          display: 'flex', alignItems: 'center', gap: 10,
          padding: '10px 12px', background: 'var(--sf)', border: '1px solid var(--am)',
          borderRadius: 10, marginBottom: 8,
        }}>
          <div style={{ flex: 1, minWidth: 0 }}>
            <div style={{ fontSize: 13, fontWeight: 600, lineHeight: 1.35 }}>{item.name}</div>
            {item.margin != null && (
              <div style={{ fontSize: 11, color: 'var(--cu)', fontWeight: 700,
                display: 'inline-flex', alignItems: 'center', gap: 3, marginTop: 3 }}>
                <TrendingUp size={11}/>маржа ~{item.margin}%
              </div>
            )}
          </div>
          <button
            onClick={() => { onGoAdd && onGoAdd(`${item.name} — рекомендуй гостям`); }}
            style={{ flexShrink: 0, background: 'transparent', border: '1px solid var(--bd)',
              borderRadius: 7, padding: '5px 8px', cursor: 'pointer',
              display: 'flex', alignItems: 'center', gap: 3,
              color: 'var(--mt)', fontSize: 11, fontWeight: 600, fontFamily: 'inherit' }}>
            <Plus size={12}/>GoList
          </button>
        </div>
      ))}
    </div>
  );
}
