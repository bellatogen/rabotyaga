// RevenueCard — спидометр выручки (план/факт/дельта/YoY) + кнопка ⬇ iiko
import { useState } from 'react';
import { fmtDate } from '../utils/dateUtils.js';

// ─── SVG-спидометр ──────────────────────────────────────────────────────────
// Шкала 0–200%: 100% = план. Дуга 240° — от 8 до 4 часов симметрично.
function SpeedometerGauge({ pct = 0 }) {
  const CX = 100, CY = 96;
  const RO = 68, RI = 50; // внешний и внутренний радиус трека

  // Начало (8 часов) = 150°, конец (4 часа) = 30° (через вверх, 240° дуга)
  const A0 = 150, SWEEP = 240;
  const clamp = Math.max(0, Math.min(200, pct || 0));

  const toRad = d => d * Math.PI / 180;
  const pt    = (d, r) => [CX + r * Math.cos(toRad(d)), CY + r * Math.sin(toRad(d))];
  const p2d   = p => A0 + (p / 200) * SWEEP; // % шкалы → угол SVG

  // Сегмент-«бублик»
  function donut(a1, a2, ro, ri) {
    const [x1,y1]=pt(a1,ro),[x2,y2]=pt(a2,ro);
    const [x3,y3]=pt(a2,ri),[x4,y4]=pt(a1,ri);
    const lg = (a2 - a1) > 180 ? 1 : 0;
    return `M${x1},${y1}A${ro},${ro},0,${lg},1,${x2},${y2}L${x3},${y3}A${ri},${ri},0,${lg},0,${x4},${y4}Z`;
  }

  // Дуга без заливки (для рамок)
  function arc(a1, sweep, r) {
    const [x1,y1]=pt(a1,r),[x2,y2]=pt(a1+sweep,r);
    return `M${x1},${y1}A${r},${r},0,${sweep>180?1:0},1,${x2},${y2}`;
  }

  // Цветные зоны (по % шкалы 0-200)
  const ZONES = [
    { from:0,   to:70,  color:'#e07a60' }, // <70% плана — красный
    { from:70,  to:90,  color:'#d4a43a' }, // 70-90% — янтарный
    { from:90,  to:100, color:'#f0c040' }, // 90-100% — жёлтый
    { from:100, to:150, color:'#8bc47a' }, // 100-150% — зелёный
    { from:150, to:200, color:'#5a9e4e' }, // 150-200% — тёмно-зелёный
  ];

  // Цвет иглы
  const needleColor = clamp >= 100 ? '#8bc47a' : clamp >= 80 ? '#d4a43a' : '#e07a60';
  const needleDeg   = p2d(clamp);
  const [nx, ny]    = pt(needleDeg, RI - 10);

  // Метки 0% и 200%
  const [lx0, ly0]   = pt(A0 - 4, RO + 13);
  const [lx2, ly2]   = pt(A0 + SWEEP + 4, RO + 13);
  // Метка «план» (100%)
  const [px0, py0]   = pt(p2d(100), RI - 1);
  const [px1, py1]   = pt(p2d(100), RO + 1);

  return (
    <svg viewBox="0 0 200 140" style={{width:'100%',maxWidth:230,display:'block',margin:'0 auto'}}>
      {/* Фоновые зоны (dim) */}
      {ZONES.map(z => (
        <path key={z.from} d={donut(p2d(z.from), p2d(z.to), RO, RI)}
          fill={z.color} opacity={0.14}/>
      ))}

      {/* Заполненный прогресс */}
      {clamp > 0 && ZONES.map(z => {
        if (z.to <= 0 || z.from >= clamp) return null;
        const to = Math.min(z.to, clamp);
        return <path key={`f${z.from}`} d={donut(p2d(z.from), p2d(to), RO, RI)}
          fill={z.color} opacity={0.88}/>;
      })}

      {/* Граница трека */}
      <path d={arc(A0, SWEEP, RO)} fill="none" stroke="rgba(128,128,128,.2)" strokeWidth={1.5}/>
      <path d={arc(A0, SWEEP, RI)} fill="none" stroke="rgba(128,128,128,.12)" strokeWidth={1}/>

      {/* Риски через 25% шкалы */}
      {[0,25,50,75,100,125,150,175,200].map(t => {
        const deg = p2d(t);
        const [ix,iy]=pt(deg, RI+1), [ox,oy]=pt(deg, RO-1);
        return <line key={t} x1={ix} y1={iy} x2={ox} y2={oy}
          stroke="rgba(255,255,255,.35)" strokeWidth={t%100===0?2.5:1}/>;
      })}

      {/* Метка плана (100%) */}
      <line x1={px0} y1={py0} x2={px1} y2={py1}
        stroke="rgba(255,255,255,.7)" strokeWidth={2.5}/>

      {/* Игла */}
      <line x1={CX} y1={CY} x2={nx} y2={ny}
        stroke={needleColor} strokeWidth={2.5} strokeLinecap="round"/>

      {/* Ось иглы */}
      <circle cx={CX} cy={CY} r={7} fill="var(--sf)" stroke="var(--bd)" strokeWidth={1.5}/>
      <circle cx={CX} cy={CY} r={3} fill={needleColor}/>

      {/* 0% / 200% */}
      <text x={lx0} y={ly0} fontSize={7.5} fill="var(--mt)" textAnchor="middle">0%</text>
      <text x={lx2} y={ly2} fontSize={7.5} fill="var(--mt)" textAnchor="middle">200%</text>

      {/* Центральный % */}
      <text x={CX} y={135} fontSize={9} fill="var(--mt)" textAnchor="middle" letterSpacing=".05em">
        100% = план
      </text>
    </svg>
  );
}

// ─── Карточка выручки ────────────────────────────────────────────────────────
export function RevenueCard({ date, revenue, onIikoLoad }) {
  const [loading, setLoading] = useState(false);
  const [err, setErr]         = useState(null);

  const r    = revenue[date] || {};
  const plan = r.plan != null && r.plan !== '' ? Number(r.plan) : null;
  const fact = r.fact != null && r.fact !== '' ? Number(r.fact) : null;
  const ly   = r.lastYear != null ? Number(r.lastYear) : null;

  const pct     = fact != null && plan ? Math.round(fact / plan * 100) : null;
  const delta   = fact != null && plan ? fact - plan : null;
  const yoyDiff = fact != null && ly   ? fact - ly   : null;

  const fmt = n => Number(n).toLocaleString('ru-RU');
  const sign = n => n >= 0 ? `+${fmt(n)}` : fmt(n);
  const pctColor = p => p >= 100 ? '#8bc47a' : p >= 80 ? '#d4a43a' : '#e07a60';

  const loadIiko = async () => {
    setLoading(true); setErr(null);
    try {
      const res  = await fetch(`/api/iiko/revenue/${date}`, { credentials:'include' });
      const json = await res.json();
      if (!res.ok) throw new Error(json.error || `HTTP ${res.status}`);
      onIikoLoad && onIikoLoad(date, json);
    } catch (e) { setErr(e.message); }
    finally { setLoading(false); }
  };

  if (!plan) return (
    <div style={{padding:'12px 0'}}>
      <div className="alert warn" style={{margin:0}}>
        <span>План выручки на {fmtDate(date)} не задан — управляющий вводит в карточке дня (График → день).</span>
      </div>
    </div>
  );

  return (
    <div className="rev-card">
      {/* Спидометр */}
      <SpeedometerGauge pct={pct || 0}/>

      {/* Факт / % / план */}
      <div style={{display:'flex',alignItems:'flex-end',justifyContent:'space-between',marginTop:4,gap:8}}>
        <div>
          <div className="stat-l" style={{marginBottom:2,fontSize:10}}>ФАКТ</div>
          <div className="mono" style={{fontSize:22,fontWeight:700,
            color: pct != null ? pctColor(pct) : 'var(--pp)',lineHeight:1}}>
            {fact != null ? `${fmt(fact)} ₽` : '—'}
          </div>
          {pct != null && (
            <div className="mono" style={{fontSize:13,fontWeight:600,color:pctColor(pct),marginTop:2}}>
              {pct}% плана
            </div>
          )}
        </div>
        <div style={{textAlign:'right',opacity:.5}}>
          <div className="stat-l" style={{marginBottom:2,fontSize:10}}>ПЛАН</div>
          <div className="mono" style={{fontSize:15,fontWeight:500}}>{fmt(plan)} ₽</div>
          <button onClick={loadIiko} disabled={loading}
            style={{marginTop:6,background:'transparent',border:'1px solid var(--bd)',borderRadius:7,
              padding:'4px 9px',fontSize:11,color:'var(--mt)',cursor:'pointer',
              display:'flex',alignItems:'center',gap:4,marginLeft:'auto',opacity:loading?.5:1}}>
            {loading ? '⏳' : '⬇'} iiko
          </button>
        </div>
      </div>

      {/* Дельта */}
      {delta != null && (
        <div className="mono" style={{fontSize:12,marginTop:8,color: delta>=0?'#8bc47a':'#e07a60',
          display:'flex',alignItems:'center',gap:6}}>
          <span style={{opacity:.6}}>▲ дельта</span>
          <span style={{fontWeight:600}}>{sign(delta)} ₽</span>
          <span style={{opacity:.5}}>{delta>=0?'выше плана':'до плана'}</span>
        </div>
      )}

      {/* YoY */}
      {ly != null && (
        <div className="mono" style={{fontSize:12,marginTop:4,color:'var(--mt)',
          display:'flex',alignItems:'center',gap:6}}>
          <span style={{opacity:.6}}>📅 прошлый год</span>
          <span>{fmt(ly)} ₽</span>
          {yoyDiff != null && (
            <span style={{color:yoyDiff>=0?'#8bc47a':'#e07a60',fontWeight:600}}>
              ({sign(yoyDiff)} ₽)
            </span>
          )}
        </div>
      )}

      {err && (
        <div className="mono" style={{fontSize:11,marginTop:6,color:'#e07a60'}}>⚠ {err}</div>
      )}
    </div>
  );
}
