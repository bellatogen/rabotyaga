// RevenueCard — спидометр выручки (план/факт/дельта/YoY) + кнопка ⬇ iiko
import { useState } from 'react';
import { Calendar, TrendingUp, TrendingDown } from 'lucide-react';
import { fmtDate } from '../utils/dateUtils.js';

// ─── SVG-спидометр ──────────────────────────────────────────────────────────
function SpeedometerGauge({ pct = 0 }) {
  const CX = 100, CY = 92;
  const RO = 68, RI = 50;
  const A0 = 150, SWEEP = 240;
  const clamp = Math.max(0, Math.min(200, pct || 0));

  const toRad = d => d * Math.PI / 180;
  const pt    = (d, r) => [CX + r * Math.cos(toRad(d)), CY + r * Math.sin(toRad(d))];
  const p2d   = p => A0 + (p / 200) * SWEEP;

  function donut(a1, a2, ro, ri) {
    const [x1,y1]=pt(a1,ro),[x2,y2]=pt(a2,ro);
    const [x3,y3]=pt(a2,ri),[x4,y4]=pt(a1,ri);
    const lg = (a2 - a1) > 180 ? 1 : 0;
    return `M${x1},${y1}A${ro},${ro},0,${lg},1,${x2},${y2}L${x3},${y3}A${ri},${ri},0,${lg},0,${x4},${y4}Z`;
  }

  function arc(a1, sweep, r) {
    const [x1,y1]=pt(a1,r),[x2,y2]=pt(a1+sweep,r);
    return `M${x1},${y1}A${r},${r},0,${sweep>180?1:0},1,${x2},${y2}`;
  }

  // Цветные зоны — ~15% ярче предыдущих
  const ZONES = [
    { from:0,   to:70,  color:'#e8593c' },
    { from:70,  to:90,  color:'#e0a41e' },
    { from:90,  to:100, color:'#f5ca10' },
    { from:100, to:150, color:'#72cc54' },
    { from:150, to:200, color:'#46b038' },
  ];

  const needleColor = clamp >= 100 ? '#72cc54' : clamp >= 80 ? '#e0a41e' : '#e8593c';
  const needleDeg   = p2d(clamp);
  const [nx, ny]    = pt(needleDeg, RI - 10);

  // Метки 0%/200% сдвинуты внутрь, чтобы не клипались
  const [lx0, ly0] = pt(A0 + 2,         RO + 11);
  const [lx2, ly2] = pt(A0 + SWEEP - 2, RO + 11);

  const [px0, py0] = pt(p2d(100), RI + 1);
  const [px1, py1] = pt(p2d(100), RO - 1);

  return (
    <svg viewBox="0 0 200 146" style={{width:'100%',maxWidth:230,display:'block',margin:'0 auto'}}>
      {ZONES.map(z => (
        <path key={z.from} d={donut(p2d(z.from), p2d(z.to), RO, RI)}
          fill={z.color} opacity={0.18}/>
      ))}
      {clamp > 0 && ZONES.map(z => {
        if (z.to <= 0 || z.from >= clamp) return null;
        const to = Math.min(z.to, clamp);
        return <path key={`f${z.from}`} d={donut(p2d(z.from), p2d(to), RO, RI)}
          fill={z.color} opacity={0.95}/>;
      })}
      <path d={arc(A0, SWEEP, RO)} fill="none" stroke="rgba(128,128,128,.2)" strokeWidth={1.5}/>
      <path d={arc(A0, SWEEP, RI)} fill="none" stroke="rgba(128,128,128,.12)" strokeWidth={1}/>
      {[0,25,50,75,100,125,150,175,200].map(t => {
        const deg = p2d(t);
        const [ix,iy]=pt(deg, RI+1), [ox,oy]=pt(deg, RO-1);
        return <line key={t} x1={ix} y1={iy} x2={ox} y2={oy}
          stroke="rgba(255,255,255,.35)" strokeWidth={t%100===0?2.5:1}/>;
      })}
      <line x1={px0} y1={py0} x2={px1} y2={py1} stroke="rgba(255,255,255,.8)" strokeWidth={2.5}/>
      <line x1={CX} y1={CY} x2={nx} y2={ny} stroke={needleColor} strokeWidth={2.5} strokeLinecap="round"/>
      <circle cx={CX} cy={CY} r={7} fill="var(--sf)" stroke="var(--bd)" strokeWidth={1.5}/>
      <circle cx={CX} cy={CY} r={3} fill={needleColor}/>
      <text x={lx0} y={ly0} fontSize={7.5} fill="var(--mt)" textAnchor="middle">0%</text>
      <text x={lx2} y={ly2} fontSize={7.5} fill="var(--mt)" textAnchor="middle">200%</text>
      <text x={CX} y={132} fontSize={9} fill="var(--mt)" textAnchor="middle" letterSpacing=".04em">100% = план</text>
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

  const fmt      = n => Number(n).toLocaleString('ru-RU');
  const sign     = n => n >= 0 ? `+${fmt(n)}` : fmt(n);
  const pctColor = p => p >= 100 ? '#72cc54' : p >= 80 ? '#e0a41e' : '#e8593c';
  const prevYear = new Date(date + 'T00:00:00').getFullYear() - 1;

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
      <SpeedometerGauge pct={pct || 0}/>

      {/* Факт / план */}
      <div style={{display:'flex',alignItems:'flex-start',justifyContent:'space-between',marginTop:2,gap:8}}>
        <div>
          <div style={{fontSize:10,fontWeight:600,letterSpacing:'.08em',color:'var(--mt)',marginBottom:3}}>ФАКТ</div>
          <div className="mono" style={{fontSize:24,fontWeight:700,lineHeight:1,
            color: pct != null ? pctColor(pct) : 'var(--pp)'}}>
            {fact != null ? `${fmt(fact)} ₽` : '—'}
          </div>
          {pct != null && (
            <div className="mono" style={{fontSize:13,fontWeight:600,color:pctColor(pct),marginTop:4}}>
              {pct}% плана
            </div>
          )}
        </div>
        <div style={{textAlign:'right',flexShrink:0}}>
          <div style={{fontSize:10,fontWeight:600,letterSpacing:'.08em',color:'var(--mt)',marginBottom:3,opacity:.6}}>ПЛАН</div>
          <div className="mono" style={{fontSize:15,fontWeight:500,opacity:.5}}>{fmt(plan)} ₽</div>
          <button onClick={loadIiko} disabled={loading}
            style={{marginTop:8,background:'transparent',border:'1px solid var(--bd)',borderRadius:7,
              padding:'3px 8px',fontSize:11,color:'var(--mt)',cursor:'pointer',
              display:'flex',alignItems:'center',gap:4,marginLeft:'auto',opacity:loading?.5:1}}>
            {loading ? '⏳' : '⬇'} iiko
          </button>
        </div>
      </div>

      {/* Дельта */}
      {delta != null && (
        <div className="mono" style={{display:'flex',alignItems:'center',gap:6,
          fontSize:12,marginTop:10,color:delta>=0?'#72cc54':'#e8593c'}}>
          <span style={{opacity:.7,display:'flex',alignItems:'center'}}>
            {delta>=0
              ? <TrendingUp size={13}/>
              : <TrendingDown size={13}/>}
          </span>
          <span style={{opacity:.55}}>дельта</span>
          <span style={{fontWeight:600}}>{sign(delta)} ₽</span>
          <span style={{opacity:.45,fontSize:11}}>{delta>=0?'выше плана':'до плана'}</span>
        </div>
      )}

      {/* YoY */}
      {ly != null && (
        <div className="mono" style={{display:'flex',alignItems:'center',gap:6,
          fontSize:12,marginTop:5,color:'var(--mt)'}}>
          <span style={{opacity:.6,display:'flex',alignItems:'center'}}><Calendar size={12}/></span>
          <span style={{opacity:.55}}>{prevYear}</span>
          <span>{fmt(ly)} ₽</span>
          {yoyDiff != null && (
            <span style={{color:yoyDiff>=0?'#72cc54':'#e8593c',fontWeight:600}}>({sign(yoyDiff)} ₽)</span>
          )}
        </div>
      )}

      {err && <div className="mono" style={{fontSize:11,marginTop:6,color:'#e8593c'}}>⚠ {err}</div>}
    </div>
  );
}
