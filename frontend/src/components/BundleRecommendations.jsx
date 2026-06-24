// Рекомендации сэтов — блюда, которые часто берут вместе (market basket analysis).
// Данные: GET /api/iiko/basket — кэшируется на сервере 20ч.
// Кнопка «GoList» → добавляет пару в гоу-лист смены.
import { useState, useEffect } from 'react';
import { Zap, Plus, RefreshCw, ChevronDown, ChevronUp } from 'lucide-react';
import { iikoBasket } from '../services/api.js';

export function BundleRecommendations({ onGoAdd, defaultOpen = false }) {
  const [open,    setOpen]    = useState(defaultOpen);
  const [data,    setData]    = useState(null);   // { pairs, totalOrders, from, to }
  const [loading, setLoading] = useState(false);
  const [err,     setErr]     = useState(null);
  const [added,   setAdded]   = useState(new Set());

  const load = async (force = false) => {
    setLoading(true); setErr(null);
    // Сброс «добавлено» при принудительном обновлении — данные могут измениться
    if (force) setAdded(new Set());
    try {
      const json = await iikoBasket(force);
      setData(json);
    } catch (e) { setErr(e.message); }
    finally { setLoading(false); }
  };

  // Загружаем при первом раскрытии (один раз)
  // eslint-disable-next-line react-hooks/exhaustive-deps
  useEffect(() => { if (open && !data && !loading) load(); }, [open]);

  const addToGoList = pair => {
    const text = `${pair.a} + ${pair.b} — предлагай сетом (${pair.confAB}% берут вместе)`;
    onGoAdd && onGoAdd(text);
    setAdded(prev => new Set([...prev, pairKey(pair)]));
  };

  const pairKey = p => `${p.a}|||${p.b}`;
  const top = (data?.pairs || []).slice(0, 6);

  return (
    <div style={{border:'1px solid var(--bd)',borderRadius:10,overflow:'hidden',background:'var(--sf)'}}>
      <div style={{display:'flex',alignItems:'center'}}>
        <button onClick={() => setOpen(o => !o)} className="acc-head" style={{flex:1}}>
          <span style={{display:'flex',alignItems:'center',gap:6}}>
            <Zap size={13} color="var(--am)"/>
            <span>Сэты · часто берут вместе</span>
            {top.length > 0 && <span className="mono" style={{opacity:.5,fontSize:10}}>{top.length}</span>}
          </span>
          <div style={{display:'flex',alignItems:'center',gap:6}}>
            {open ? <ChevronUp size={15}/> : <ChevronDown size={15}/>}
          </div>
        </button>
        {open && (
          <button onClick={()=>load(true)}
            title="Обновить"
            style={{background:'transparent',border:'none',color:'var(--mt)',cursor:'pointer',
              padding:'8px 10px',display:'flex',lineHeight:0,opacity:.7,flexShrink:0}}>
            <RefreshCw size={12} style={{animation:loading?'spin 1s linear infinite':undefined}}/>
          </button>
        )}
      </div>

      {open && (
        <div style={{padding:'4px 12px 12px'}}>
          {/* Мета */}
          {data && (
            <div style={{fontSize:10,color:'var(--mt)',marginBottom:8,opacity:.6}}>
              Анализ за {data.from}–{data.to} · {data.totalChecks} чеков
            </div>
          )}

          {loading && (
            <div style={{fontSize:12,color:'var(--mt)',padding:'10px 0',textAlign:'center'}}>
              Анализирую заказы за 14 дней…
            </div>
          )}

          {err && (
            <div style={{fontSize:12,color:'#e8593c',padding:'8px 0'}}>⚠ {err}</div>
          )}

          {!loading && !err && data && top.length === 0 && (
            <div style={{fontSize:12,color:'var(--mt)',padding:'8px 0',lineHeight:1.5}}>
              Недостаточно данных — нужно минимум ~50 чеков с 2+ блюдами за 14 дней.
            </div>
          )}

          {top.map((pair, i) => {
            const key     = pairKey(pair);
            const isAdded = added.has(key);
            const conf    = Math.max(pair.confAB, pair.confBA);
            return (
              <div key={i} style={{
                display:'flex', alignItems:'flex-start',
                justifyContent:'space-between', gap:10,
                padding:'9px 0',
                borderBottom: i < top.length - 1 ? '1px solid var(--bd)' : undefined,
              }}>
                <div style={{flex:1,minWidth:0}}>
                  {/* Блюда */}
                  <div style={{fontSize:13,fontWeight:500,marginBottom:3,lineHeight:1.35}}>
                    {pair.a}
                    <span style={{color:'var(--mt)',fontWeight:400,margin:'0 5px'}}>+</span>
                    {pair.b}
                  </div>
                  {/* Метрики */}
                  <div style={{display:'flex',gap:10,flexWrap:'wrap'}}>
                    <span style={{fontSize:11,color:'var(--mt)'}}>
                      вместе в{' '}
                      <span style={{color:'var(--am)',fontWeight:700}}>{conf}%</span>
                      {' '}случаев
                    </span>
                    <span style={{fontSize:11,color:'var(--mt)',opacity:.6}}>
                      lift {pair.lift}× · {pair.count} раз
                    </span>
                  </div>
                </div>

                {/* GoList кнопка */}
                <button onClick={() => !isAdded && addToGoList(pair)}
                  disabled={isAdded}
                  style={{flexShrink:0,
                    background: isAdded ? 'rgba(76,175,130,.15)' : 'transparent',
                    border: `1px solid ${isAdded ? 'var(--cu)' : 'var(--bd)'}`,
                    borderRadius:7, padding:'5px 8px', cursor: isAdded ? 'default' : 'pointer',
                    display:'flex', alignItems:'center', gap:3,
                    color: isAdded ? 'var(--cu)' : 'var(--mt)',
                    fontSize:11, fontWeight:600, fontFamily:'inherit', whiteSpace:'nowrap'}}>
                  {isAdded ? '✓ В листе' : <><Plus size={12}/>GoList</>}
                </button>
              </div>
            );
          })}
        </div>
      )}
    </div>
  );
}
