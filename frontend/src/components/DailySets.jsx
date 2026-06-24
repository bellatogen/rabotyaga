// «Сэты дня» — фокус-блок в TodayTab: топ-3 пары напиток+закуска на смену.
// Источник — GET /api/iiko/basket (кэш 20ч). При ошибке/отсутствии iiko блок скрыт.
import { useState, useEffect } from 'react';
import { Sparkles, Plus, Check, TrendingUp } from 'lucide-react';
import { iikoBasket } from '../services/api.js';
import { pickDailySets, topMarginKeys, pairKey, setGoText } from '../utils/setsUtils.js';

export function DailySets({ onGoAdd }) {
  const [sets,  setSets]  = useState(null);  // null=загрузка, []=пусто
  const [err,   setErr]   = useState(null);
  const [added, setAdded] = useState(new Set());

  useEffect(() => {
    let alive = true;
    iikoBasket(false)
      .then(j => { if (alive) setSets(pickDailySets(j.pairs || [], 3)); })
      .catch(e => { if (alive) setErr(e.message); });
    return () => { alive = false; };
  }, []);

  // Тихо скрываем при ошибке (iiko не настроен) или при отсутствии данных
  if (err || (sets && sets.length === 0)) return null;
  if (!sets) return null; // короткая загрузка — без спиннера

  const marginTop = topMarginKeys(sets, 3);
  const add = p => {
    onGoAdd && onGoAdd(setGoText(p));
    setAdded(prev => new Set([...prev, pairKey(p)]));
  };

  return (
    <div className="sec">
      <div className="sec-head">
        <span className="sec-lbl" style={{ color: 'var(--am)' }}><Sparkles size={12}/>Сэты дня</span>
        <span className="sec-cnt">{sets.length}</span>
      </div>
      <div style={{ fontSize: 11, color: 'var(--mt)', marginBottom: 8, lineHeight: 1.45 }}>
        Что предлагать гостям сегодня — пары «напиток + закуска», которые чаще берут вместе и дают маржу.
      </div>
      {sets.map((p, i) => {
        const key     = pairKey(p);
        const isAdded = added.has(key);
        const conf    = Math.max(p.confAB || 0, p.confBA || 0);
        const isMargin = marginTop.has(key);
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
                <span style={{ fontSize: 11, color: 'var(--mt)' }}>
                  вместе в <span style={{ color: 'var(--am)', fontWeight: 700 }}>{conf}%</span> случаев
                </span>
                {p.margin != null && (
                  <span style={{ fontSize: 11, color: isMargin ? 'var(--cu)' : 'var(--mt)',
                    fontWeight: isMargin ? 700 : 400, display: 'inline-flex', alignItems: 'center', gap: 3 }}>
                    {isMargin && <TrendingUp size={11}/>}маржа ~{p.margin}%
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
    </div>
  );
}
