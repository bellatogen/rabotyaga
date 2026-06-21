// Вкладка «График» — календарь, дашборд часов, таблица часов + детальный просмотр дня
import { useState } from 'react';
import { CalendarDays, ChevronLeft, ChevronRight, AlertTriangle, CheckCircle, Send, User, Plus, Clock } from 'lucide-react';
import { MONTHS_RU, DOW_FULL, REPEAT_OPTS } from '../constants/locale.js';
import { hourNorm } from '../constants/staff.js';
import { staffCheck } from '../utils/staffUtils.js';
import { isToday, isDone } from '../utils/taskUtils.js';
import { hmm, rangeDays } from '../utils/dateUtils.js';
import { RevenueCard } from '../components/RevenueCard.jsx';
import { Ring } from '../components/Ring.jsx';

export function ScheduleTab({schedule,events,revenue,ds,members,onOpenDay}){
  const[sub,setSub]=useState("calendar");
  return(<>
    <div className="sec" style={{paddingBottom:0}}>
      <div style={{display:"flex",gap:4,marginBottom:4}}>
        {[["calendar","Календарь"],["dashboard","Дашборд"],["hours","Часы"]].map(([id,label])=>
          <button key={id} className={`tab${sub===id?" on":""}`} onClick={()=>setSub(id)} style={{flex:1,textAlign:"center"}}>{label}</button>)}
      </div>
    </div>
    {sub==="calendar"&&<CalendarTab schedule={schedule} events={events} revenue={revenue} ds={ds} onOpenDay={onOpenDay}/>}
    {sub==="dashboard"&&<DashboardTab schedule={schedule} members={members} ds={ds}/>}
    {sub==="hours"&&<HoursTab schedule={schedule} members={members} ds={ds}/>}
  </>);
}

// Светофор по выручке: синий >110%, зелёный 100-110%, жёлтый 90-100%, красный <90%
function getRevenueColor(pct){
  if(pct>=110)return '#5b8b9b';
  if(pct>=100)return '#8bc47a';
  if(pct>=90)return '#e8a030';
  return '#e85535';
}

function CalendarTab({schedule,events,revenue,ds,onOpenDay}){
  const [tooltip, setTooltip] = useState(null);
  const[ym,setYm]=useState("2026-06");
  const[y,m]=ym.split("-").map(Number);
  const first=new Date(y,m-1,1);
  const startDow=(first.getDay()+6)%7;
  const daysInMonth=new Date(y,m,0).getDate();
  const cells=[];
  for(let i=0;i<startDow;i++)cells.push(null);
  for(let d=1;d<=daysInMonth;d++)cells.push(`${ym}-${String(d).padStart(2,"0")}`);
  const shift=(n)=>{let nm=m+n,ny=y;if(nm<1){nm=12;ny--;}if(nm>12){nm=1;ny++;}setYm(`${ny}-${String(nm).padStart(2,"0")}`);};
  
  return(<div className="sec">
    <div className="sec-head">
      <span className="sec-lbl"><CalendarDays size={12}/>Календарь</span>
      <div style={{display:"flex",gap:8,alignItems:"center"}}>
        <button onClick={()=>shift(-1)} style={{background:"transparent",border:"none",color:"var(--mt)",cursor:"pointer"}}><ChevronLeft size={18}/></button>
        <span className="mono" style={{fontSize:13,color:"var(--pp)",minWidth:90,textAlign:"center"}}>{MONTHS_RU[m-1]} {y}</span>
        <button onClick={()=>shift(1)} style={{background:"transparent",border:"none",color:"var(--mt)",cursor:"pointer"}}><ChevronRight size={18}/></button>
      </div>
    </div>
    <details style={{marginBottom:10,border:"1px solid var(--bd)",borderRadius:8,background:"var(--sf)",overflow:"hidden"}}>
      <summary style={{padding:"8px 12px",cursor:"pointer",fontSize:12,fontWeight:600,color:"var(--mt)",listStyle:"none",display:"flex",alignItems:"center",gap:6,userSelect:"none"}}>
        <span style={{fontSize:14}}>❓</span>
        <span>Как читать календарь</span>
        <span style={{marginLeft:"auto",fontSize:10,opacity:.6}}>▼</span>
      </summary>
      <div style={{padding:"10px 12px",fontSize:12,lineHeight:1.6,color:"var(--tx)",borderTop:"1px solid var(--bd)"}}>
        <div style={{marginBottom:6}}><strong>Нормы штата:</strong> пн/вт/чт/вс — 2 чел., ср/пт/сб — 3 (третий с 18:00). Вс со «Стерео 55» и праздники — тоже 3 с 18:00. Недобор подсвечен рамкой.</div>
        <div style={{marginBottom:6}}><strong>Цвет числа</strong> (% выполнения плана выручки):</div>
        <div style={{display:"grid",gridTemplateColumns:"1fr 1fr",gap:4,fontSize:11}}>
          <div>🔴 &lt;90% плана</div>
          <div>🟡 90-100% плана</div>
          <div>🟢 100-110% плана</div>
          <div>🔵 &gt;110% плана</div>
        </div>
        <div style={{marginTop:8,opacity:.7}}>Нажми на день, чтобы открыть детали.</div>
      </div>
    </details>
    <div className="cal-grid" style={{marginBottom:5}}>{["пн","вт","ср","чт","пт","сб","вс"].map(d=><div className="cal-dow" key={d}>{d}</div>)}</div>
    <div className="cal-grid">
      {cells.map((c,i)=>{
        if(!c)return (<div key={i}/>);
        const check=staffCheck(c,schedule,events);
        const dnum=Number(c.slice(-2));
        const rev=revenue[c]||{};
        const hasRev=rev.plan!=null&&rev.plan!=="";
        const pct=rev.plan&&rev.fact?(rev.fact/rev.plan)*100:null;
        const color = pct!==null ? getRevenueColor(pct) : undefined;
        
        return(<div key={i} 
          className={`cal-cell${c===ds?" today":""}${!check.ok?" short":""}`} 
          onClick={()=>onOpenDay(c)}
          onMouseEnter={(e)=>{
            const rect = e.currentTarget.getBoundingClientRect();
            setTooltip({
              x: rect.left + rect.width/2,
              y: rect.top - 10,
              data: {
                date: c,
                shifts: schedule[c] || [],
                event: events[c] || null,
                revenue: rev,
                pct: pct
              }
            });
          }}
          onMouseLeave={()=>setTooltip(null)}
          style={pct!==null?{background:color+"22"}:undefined}>
          <div style={{display:"flex",justifyContent:"space-between",alignItems:"center"}}>
            <span className="cal-num" style={pct!==null?{color:color}:undefined}>{dnum}</span>
            {hasRev&&<span style={{fontSize:11,color:"var(--am)",fontWeight:700}}>₽</span>}
          </div>
          <span className="cal-staff" style={{color:check.ok?"var(--mt)":"#e07a60"}}>{check.actual}/{check.norm.count}</span>
          {pct!==null&&<span style={{fontSize:10,fontWeight:600,color:color}}>{Math.round(pct)}%</span>}
          {events[c]&&<span className="cal-ev">{events[c]}</span>}
        </div>);
      })}
    </div>
    
    {tooltip && tooltip.data && (
      <div style={{
        position: 'fixed',
        left: tooltip.x,
        top: tooltip.y,
        transform: 'translate(-50%, -100%)',
        background: '#1e293b',
        color: '#f8fafc',
        borderRadius: '12px',
        padding: '16px 20px',
        boxShadow: '0 12px 40px rgba(0,0,0,0.6)',
        zIndex: 9999,
        maxWidth: 320,
        minWidth: 250,
        fontSize: 13,
        pointerEvents: 'none',
        border: '1px solid #334155',
        animation: 'tooltipFade 0.15s ease-out'
      }}>
        <div style={{display:'flex',justifyContent:'space-between',borderBottom:'1px solid #334155',paddingBottom:8,marginBottom:8}}>
          <span style={{fontWeight:600}}>{new Date(tooltip.data.date).toLocaleDateString('ru-RU',{day:'numeric',month:'long',year:'numeric'})}</span>
          <span style={{fontSize:11,color:'#94a3b8'}}>{new Date(tooltip.data.date).toLocaleDateString('ru-RU',{weekday:'short'})}</span>
        </div>
        {tooltip.data.revenue && tooltip.data.revenue.plan && (
          <div style={{fontSize:14,fontWeight:500,marginBottom:10,color:tooltip.data.pct>=110?'#5b8b9b':tooltip.data.pct>=100?'#8bc47a':tooltip.data.pct>=90?'#e8a030':'#e85535'}}>
            {tooltip.data.pct>=110?'🔥 Отличный день!':tooltip.data.pct>=100?'👍 Хороший день':tooltip.data.pct>=90?'📊 Средний день':'📉 Тихий день'}
          </div>
        )}
        {tooltip.data.shifts && tooltip.data.shifts.length>0 && (
          <div style={{marginBottom:8}}>
            <div style={{fontSize:11,color:'#94a3b8',marginBottom:4}}>👥 Смены ({tooltip.data.shifts.length})</div>
            {tooltip.data.shifts.map((s,idx)=>(
              <div key={idx} style={{fontSize:12,display:'flex',justifyContent:'space-between',padding:'2px 0'}}>
                <span>{s.name || 'Смена ' + (idx+1)}</span>
                <span style={{color:'#94a3b8'}}>{s.start || ''}{s.end?` - ${s.end}`:''}</span>
              </div>
            ))}
          </div>
        )}
        {tooltip.data.revenue && tooltip.data.revenue.plan && (
          <div style={{borderTop:'1px solid #334155',paddingTop:8,marginTop:4,fontSize:12}}>
            <div style={{display:'flex',justifyContent:'space-between'}}>
              <span style={{color:'#94a3b8'}}>💰 План:</span>
              <span>{tooltip.data.revenue.plan.toLocaleString('ru-RU')} ₽</span>
            </div>
            {tooltip.data.revenue.fact && (
              <div style={{display:'flex',justifyContent:'space-between'}}>
                <span style={{color:'#94a3b8'}}>📈 Факт:</span>
                <span style={{color:'#8bc47a'}}>{tooltip.data.revenue.fact.toLocaleString('ru-RU')} ₽</span>
              </div>
            )}
          </div>
        )}
        {tooltip.data.event && (
          <div style={{marginTop:8,paddingTop:8,borderTop:'1px solid #334155',fontSize:12,color:'#94a3b8'}}>📌 {tooltip.data.event}</div>
        )}
      </div>
    )}
  </div>);
}
