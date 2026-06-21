// Вкладка «График» — календарь, дашборд часов, таблица часов + детальный просмотр дня
import { useState, useEffect } from 'react';
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
  const[ym,setYm]=useState("2026-06");
  const[tooltip,setTooltip]=useState(null);
  // Скролл/ресайз сдвигают ячейки — fixed-тултип иначе залипает не на месте.
  useEffect(()=>{
    if(!tooltip)return;
    const hide=()=>setTooltip(null);
    window.addEventListener("scroll",hide,true);
    window.addEventListener("resize",hide);
    return()=>{window.removeEventListener("scroll",hide,true);window.removeEventListener("resize",hide);};
  },[tooltip]);
  const showTip=(e,c)=>{
    // Только мышь: на тач-устройствах (Telegram) hover не работает — там тап открывает день (DayDetail со всей инфой).
    if(e.pointerType&&e.pointerType!=="mouse")return;
    const r=e.currentTarget.getBoundingClientRect();
    const rev=revenue[c]||{};
    const pct=rev.plan&&rev.fact?(rev.fact/rev.plan)*100:null;
    const below=r.top<180;
    const vw=typeof window!=="undefined"?window.innerWidth:360;
    const cx=Math.max(150,Math.min(vw-150,r.left+r.width/2)); // не даём тултипу уехать за край экрана
    setTooltip({x:cx,y:below?r.bottom:r.top,below,date:c,check:staffCheck(c,schedule,events),shifts:schedule[c]||[],event:events[c]||null,rev,pct});
  };
  const[y,m]=ym.split("-").map(Number);
  const first=new Date(y,m-1,1);
  const startDow=(first.getDay()+6)%7; // пн=0
  const daysInMonth=new Date(y,m,0).getDate();
  const cells=[];
  for(let i=0;i<startDow;i++)cells.push(null);
  for(let d=1;d<=daysInMonth;d++)cells.push(`${ym}-${String(d).padStart(2,"0")}`);
  const shift=(n)=>{setTooltip(null);let nm=m+n,ny=y;if(nm<1){nm=12;ny--;}if(nm>12){nm=1;ny++;}setYm(`${ny}-${String(nm).padStart(2,"0")}`);};
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
        return(<div key={i} className={`cal-cell${c===ds?" today":""}${!check.ok?" short":""}`} onClick={()=>onOpenDay(c)}
          onPointerEnter={e=>showTip(e,c)} onPointerLeave={()=>setTooltip(null)}
          style={pct!=null?{background:getRevenueColor(pct)+"22"}:undefined}>
          <div style={{display:"flex",justifyContent:"space-between",alignItems:"center"}}>
            <span className="cal-num" style={pct!=null?{color:getRevenueColor(pct)}:undefined}>{dnum}</span>
            {hasRev&&<span style={{fontSize:11,color:"var(--am)",fontWeight:700}}>₽</span>}
          </div>
          <span className="cal-staff" style={{color:check.ok?"var(--mt)":"#e07a60"}}>{check.actual}/{check.norm.count}</span>
          {pct!=null&&<span style={{fontSize:10,fontWeight:600,color:getRevenueColor(pct)}}>{Math.round(pct)}%</span>}
          {events[c]&&<span className="cal-ev">{events[c]}</span>}
        </div>);
      })}
    </div>

    {tooltip&&<div className="cal-tooltip" style={{left:tooltip.x,top:tooltip.y,transform:tooltip.below?"translate(-50%,10px)":"translate(-50%,calc(-100% - 10px))"}}>
      <div className="cal-tt-head">
        <span style={{fontWeight:600}}>{new Date(tooltip.date).toLocaleDateString("ru-RU",{day:"numeric",month:"long"})}</span>
        <span className="cal-tt-mt" style={{fontSize:11}}>{DOW_FULL[new Date(tooltip.date).getDay()]}</span>
      </div>
      <div className="cal-tt-row"><span className="cal-tt-mt">👥 Штат</span><span style={{color:tooltip.check.ok?"var(--hp)":"#e07a60",fontWeight:600}}>{tooltip.check.actual}/{tooltip.check.norm.count}{tooltip.check.ok?"":" · недобор"}</span></div>
      {tooltip.shifts.length>0&&<div style={{margin:"4px 0 2px"}}>
        {tooltip.shifts.map((s,idx)=><div className="cal-tt-row" key={idx} style={{fontSize:12}}><span>{s.name}{s.guest?" (гость)":""}{s.sub?" · подмена":""}</span><span className="cal-tt-mt">{s.start||""}{s.end?` · ${s.end}ч`:""}</span></div>)}
      </div>}
      {tooltip.rev.plan!=null&&tooltip.rev.plan!==""&&<div style={{borderTop:"1px solid var(--bd)",paddingTop:6,marginTop:4}}>
        <div className="cal-tt-row"><span className="cal-tt-mt">₽ План</span><span>{Number(tooltip.rev.plan).toLocaleString("ru-RU")} ₽</span></div>
        {tooltip.rev.fact!=null&&tooltip.rev.fact!==""&&<div className="cal-tt-row"><span className="cal-tt-mt">📈 Факт</span><span style={{color:tooltip.pct!=null?getRevenueColor(tooltip.pct):"var(--pp)",fontWeight:600}}>{Number(tooltip.rev.fact).toLocaleString("ru-RU")} ₽{tooltip.pct!=null?` · ${Math.round(tooltip.pct)}%`:""}</span></div>}
      </div>}
      {tooltip.event&&<div className="cal-tt-mt" style={{marginTop:6,paddingTop:6,borderTop:"1px solid var(--bd)",fontSize:12}}>📌 {tooltip.event}</div>}
    </div>}
  </div>);
}

export function DayDetail({date,schedule,events,tasks,history,revenue,handovers,isManager,canTeam,members,onAddTask,onEditTask,onSetRevenue,onAddShift,onRemoveShift,onUpdateShift}){
  const dObj=new Date(date);
  const check=staffCheck(date,schedule,events);
  const shifts=(schedule[date]||[]);
  const dayTasks=tasks.filter(t=>!t.archived&&isToday(t,date));
  const r=revenue[date]||{};
  const[plan,setPlan]=useState(r.plan??"");
  const[fact,setFact]=useState(r.fact??"");
  const[adding,setAdding]=useState(false);
  const[an,setAn]=useState("");const[acustom,setAcustom]=useState("");const[ast,setAst]=useState("13:00");const[ah,setAh]=useState(10);const[asub,setAsub]=useState(true);
  const ho=handovers[date]||[];
  const submitAdd=()=>{const name=(acustom.trim()||an);if(!name)return;onAddShift(date,{name,start:ast,end:String(ah),report:false,sub:asub});setAdding(false);setAn("");setAcustom("");};
  return(<div className="sec">
    <div className="cab-hero">
      <div className="cab-name">{dObj.getDate()} {MONTHS_RU[dObj.getMonth()]}</div>
      <div className="cab-role">{DOW_FULL[dObj.getDay()]}{events[date]?` · ${events[date]}`:""}</div>
      <div className="mono" style={{fontSize:12,color:"var(--mt)",marginTop:8}}>Норма штата: {check.norm.count} чел. ({check.norm.reason}){check.norm.thirdFrom?`, третий с ${check.norm.thirdFrom}`:""}</div>
    </div>

    {!check.ok&&<div className="alert danger"><AlertTriangle size={16} style={{flexShrink:0,marginTop:1}}/><span>{check.msg}</span></div>}
    {check.ok&&check.msg&&<div className="alert warn"><AlertTriangle size={16} style={{flexShrink:0,marginTop:1}}/><span>{check.msg}</span></div>}
    {check.ok&&!check.msg&&<div className="alert ok"><CheckCircle size={16} style={{flexShrink:0,marginTop:1}}/><span>Штат укомплектован по норме ({check.actual}/{check.norm.count})</span></div>}

    <div className="sec-lbl" style={{margin:"14px 0 8px"}}><span style={{fontSize:14,fontWeight:700,color:"var(--am)"}}>₽</span> План выручки</div>
    {!isManager&&<RevenueCard date={date} revenue={revenue}/>}
    {isManager&&<div className="rev-card">
      <div className="r2">
        <div className="field" style={{marginBottom:0}}><label>План ₽</label><input type="number" value={plan} onChange={e=>setPlan(e.target.value)} placeholder="нет данных"/></div>
        <div className="field" style={{marginBottom:0}}><label>Факт ₽</label><input type="number" value={fact} onChange={e=>setFact(e.target.value)} placeholder="—"/></div>
      </div>
      <button className="btn btn-g" style={{marginTop:10}} onClick={()=>onSetRevenue(plan,fact)}>Сохранить выручку</button>
      <div style={{fontSize:11,color:"var(--mt)",marginTop:8,lineHeight:1.5}}>SERVER: эти поля будет автозаполнять Google Sheets API (план из таблицы, факт из iiko/mozg.rest).</div>
    </div>}

    {ho.length>0&&<><div className="sec-lbl" style={{margin:"14px 0 8px"}}><Send size={12} style={{display:"inline"}}/> Передано на этот день</div>
      {ho.map(h=><div className="handover" key={h.id}>{h.text}<div className="handover-by">— {h.by}</div></div>)}</>}

    <div className="sec-head" style={{margin:"14px 0 9px"}}>
      <span className="sec-lbl"><User size={12}/>Бармены ({check.actual})</span>
      {canTeam&&<button className="mini-btn" onClick={()=>setAdding(a=>!a)}><Plus size={12}/>добавить</button>}
    </div>
    {shifts.length===0&&<div className="empty" style={{padding:"14px 0"}}>Смен нет</div>}
    {shifts.map((s,i)=><div className="sc" key={i}>
      <div className="sr">
        <div><div className="sn"><User size={13} color="var(--cu)"/>{s.name}{s.guest?" (гость)":""}{s.sub&&<span style={{fontSize:9,fontWeight:700,padding:"2px 6px",borderRadius:7,background:"rgba(91,139,155,.2)",color:"#7fb0c0",marginLeft:6}}>подмена</span>}</div>{s.start&&<div className="st">{s.start}{s.end?` · ${s.end}ч`:""}</div>}</div>
        {s.report&&!canTeam&&<span style={{fontSize:10,fontWeight:700,padding:"3px 8px",borderRadius:8,background:"rgba(232,160,48,.18)",color:"var(--am)"}}>отчёт</span>}
        {canTeam&&<button onClick={()=>onRemoveShift(date,i)} style={{background:"transparent",border:"1px solid rgba(158,63,43,.35)",color:"#e07a60",borderRadius:6,padding:"3px 8px",fontSize:11,cursor:"pointer"}}>убрать</button>}
      </div>
      {canTeam&&<div style={{display:"flex",gap:8,alignItems:"center",marginTop:8,flexWrap:"wrap"}}>
        <label style={{fontSize:11,color:"var(--mt)"}}>с</label>
        <input type="time" value={s.start||""} onChange={e=>onUpdateShift(date,i,{start:e.target.value})} style={{width:92,background:"var(--bg)",border:"1px solid var(--bd)",borderRadius:7,padding:"5px 8px",color:"var(--pp)",fontSize:13}}/>
        <label style={{fontSize:11,color:"var(--mt)"}}>часов</label>
        <input type="number" min="1" max="16" value={parseInt(s.end)||""} onChange={e=>onUpdateShift(date,i,{end:String(e.target.value)})} style={{width:64,background:"var(--bg)",border:"1px solid var(--bd)",borderRadius:7,padding:"5px 8px",color:"var(--pp)",fontSize:13}}/>
        <button onClick={()=>onUpdateShift(date,i,{report:!s.report})} className={`chip${s.report?" on":""}`} style={{padding:"4px 9px"}}>★ отчёт</button>
        <button onClick={()=>onUpdateShift(date,i,{sub:!s.sub})} className={`chip${s.sub?" on":""}`} style={{padding:"4px 9px"}}>подмена</button>
      </div>}
    </div>)}

    {adding&&canTeam&&<div className="sc" style={{borderColor:"var(--cu)"}}>
      <div className="field" style={{marginBottom:8}}><label>Сотрудник из команды</label>
        <select value={an} onChange={e=>setAn(e.target.value)}><option value="">— выбрать —</option>{members.map(m=><option key={m} value={m}>{m}</option>)}</select></div>
      <div className="field" style={{marginBottom:8}}><label>Или вписать имя подменного (из другого проекта)</label>
        <input value={acustom} onChange={e=>setAcustom(e.target.value)} placeholder="напр. Костя (Залив)"/></div>
      <div style={{display:"flex",gap:8,alignItems:"center",marginBottom:8,flexWrap:"wrap"}}>
        <label style={{fontSize:11,color:"var(--mt)"}}>с</label>
        <input type="time" value={ast} onChange={e=>setAst(e.target.value)} style={{width:92,background:"var(--bg)",border:"1px solid var(--bd)",borderRadius:7,padding:"5px 8px",color:"var(--pp)",fontSize:13}}/>
        <label style={{fontSize:11,color:"var(--mt)"}}>часов</label>
        <input type="number" min="1" max="16" value={ah} onChange={e=>setAh(e.target.value)} style={{width:64,background:"var(--bg)",border:"1px solid var(--bd)",borderRadius:7,padding:"5px 8px",color:"var(--pp)",fontSize:13}}/>
        <button onClick={()=>setAsub(v=>!v)} className={`chip${asub?" on":""}`} style={{padding:"4px 9px"}}>подмена</button>
      </div>
      <button className="btn btn-p" onClick={submitAdd}><Plus size={15}/>Добавить на смену</button>
    </div>}

    <div className="sec-head" style={{margin:"14px 0 9px"}}>
      <span className="sec-lbl"><CheckCircle size={12}/>Задачи дня ({dayTasks.length})</span>
      {onAddTask&&<button className="mini-btn" onClick={onAddTask}><Plus size={12}/>задача</button>}
    </div>
    {dayTasks.length===0&&<div className="empty" style={{padding:"14px 0"}}>Задач нет</div>}
    {dayTasks.map(t=>{const done=isDone(history[`${t.id}::${date}`]);
      return(<div className="sc" key={t.id} onClick={()=>onEditTask&&onEditTask(t)} style={{cursor:onEditTask?"pointer":"default"}}>
        <div className="sr"><div className="sn" style={{fontWeight:500}}><span style={{width:8,height:8,borderRadius:"50%",background:done?"var(--hp)":"var(--rs)",display:"inline-block"}}/>{t.title}</div>
        <span className="pill p-r">{REPEAT_OPTS.find(r=>r.id===t.repeat)?.label||t.repeat}</span></div>
      </div>);})}
  </div>);
}

function HoursTab({schedule,members,ds}){
  const[mode,setMode]=useState("month");
  const days=mode==="week"?rangeDays(ds,7):Object.keys(schedule).filter(d=>d.startsWith("2026-06"));
  const stats=members.map(name=>{
    const h=days.reduce((a,d)=>{const s=(schedule[d]||[]).find(x=>x.name===name);return a+(s&&s.end?hmm(s.end)/60:0);},0);
    const shifts=days.filter(d=>(schedule[d]||[]).some(s=>s.name===name)).length;
    return{name,hours:Math.round(h*10)/10,shifts};
  });
  const total=stats.reduce((a,m)=>a+m.hours,0);
  return(<div className="sec">
    <div className="sec-head"><span className="sec-lbl"><Clock size={12}/>Часы работы</span>
      <div style={{display:"flex",gap:4}}>{["week","month"].map(m=><button key={m} className={`tab${mode===m?" on":""}`} onClick={()=>setMode(m)} style={{padding:"4px 10px",fontSize:11}}>{m==="week"?"7 дней":"Июнь"}</button>)}</div>
    </div>
    <div className="info-box">Итого: <span className="mono" style={{color:"var(--am)",fontWeight:600}}>{Math.round(total)}ч</span> за {mode==="week"?"неделю":"июнь"}</div>
    {stats.map(m=>{const nrm=hourNorm(m.name);const denom=mode==="month"?nrm.max:48;
      const inCorridor=mode==="month"&&m.hours>=nrm.min&&m.hours<=nrm.max;
      const over=mode==="month"&&m.hours>nrm.max;
      return(<div className="pr" key={m.name}>
      <div className="pr-nm"><span>{m.name}</span><span className="mono" style={{fontWeight:600,fontSize:14,color:over?"#e07a60":inCorridor?"#8bc47a":"var(--am)"}}>{m.hours}ч</span></div>
      <div className="bar-bg"><div className="bar-fill" style={{width:`${Math.min(m.hours/denom*100,100)}%`,background:over?"var(--rs)":inCorridor?"var(--hp)":"var(--am)"}}/></div>
      <div style={{display:"flex",justifyContent:"space-between",marginTop:4}}><span className="bar-pct">{m.shifts} смен</span>
        <span className="bar-pct">{mode==="month"?`норма ${nrm.min}–${nrm.max}ч${over?" · превышение":inCorridor?" · в норме":""}`:`${Math.round(m.hours/48*100)}% нормы`}</span></div>
    </div>);})}
  </div>);
}

function DashboardTab({schedule,members,ds}){
  const[view,setView]=useState("bars");
  const month=ds.slice(0,7);
  const monthDays=Object.keys(schedule).filter(d=>d.startsWith(month));
  const memHours=name=>monthDays.reduce((a,d)=>{const s=(schedule[d]||[]).find(x=>x.name===name);return a+(s&&s.end?hmm(s.end)/60:0);},0);
  const memShifts=name=>monthDays.filter(d=>(schedule[d]||[]).some(s=>s.name===name)).length;
  const stats=members.map(n=>({name:n,hours:Math.round(memHours(n)*10)/10,shifts:memShifts(n),nrm:hourNorm(n)})).sort((a,b)=>b.hours-a.hours);
  const subShifts=monthDays.reduce((a,d)=>a+(schedule[d]||[]).filter(s=>s.sub||(!members.includes(s.name)&&s.name)).length,0);
  const totalH=Math.round(stats.reduce((a,m)=>a+m.hours,0));
  const week=rangeDays(ds,7).slice().reverse();
  const dayHours=d=>(schedule[d]||[]).reduce((a,s)=>a+(s.end?hmm(s.end)/60:0),0);
  const maxDay=Math.max(1,...week.map(dayHours));
  const VIEWS=[["bars","Часы"],["days","По дням"],["rings","Кольца"]];
  const col=m=>m.hours>m.nrm.max?"var(--rs)":m.hours>=m.nrm.min?"var(--hp)":"var(--am)";
  return(<div className="sec">
    <div className="sec-head"><span className="sec-lbl"><Clock size={12}/>Дашборд · {totalH}ч / мес</span></div>
    <div className="chip-row" style={{marginBottom:14}}>{VIEWS.map(([id,l])=><button key={id} className={`chip${view===id?" on":""}`} onClick={()=>setView(id)}>{l}</button>)}</div>

    {view==="bars"&&stats.map(m=>{const denom=m.nrm.max;return(<div className="pr" key={m.name}>
      <div className="pr-nm"><span>{m.name}</span><span className="mono" style={{fontWeight:600,fontSize:14,color:col(m)}}>{m.hours}ч</span></div>
      <div className="bar-bg"><div className="bar-fill" style={{width:`${Math.min(m.hours/denom*100,100)}%`,background:col(m),transition:"width .4s ease"}}/></div>
      <div style={{display:"flex",justifyContent:"space-between",marginTop:4}}><span className="bar-pct">{m.shifts} смен</span><span className="bar-pct">норма {m.nrm.min}–{m.nrm.max}ч</span></div>
    </div>);})}

    {view==="days"&&<div>
      <div style={{display:"flex",alignItems:"flex-end",gap:6,height:140,padding:"8px 0",borderBottom:"1px solid var(--bd)"}}>
        {week.map(d=>{const h=dayHours(d);const dt=new Date(d);return(<div key={d} style={{flex:1,display:"flex",flexDirection:"column",alignItems:"center",gap:4,height:"100%",justifyContent:"flex-end"}}>
          <span className="mono" style={{fontSize:10,color:"var(--am)"}}>{h?Math.round(h):""}</span>
          <div style={{width:"70%",height:`${h/maxDay*100}%`,minHeight:h?4:0,background:"linear-gradient(180deg,var(--cu),var(--cu2))",borderRadius:"4px 4px 0 0",transition:"height .4s ease"}}/>
          <span style={{fontSize:10,color:"var(--mt)"}}>{["вс","пн","вт","ср","чт","пт","сб"][dt.getDay()]}</span>
        </div>);})}
      </div>
      <div className="info-box" style={{marginTop:12}}>Часы персонала по дням за неделю. Видно перегруз/недогруз смен.</div>
    </div>}

    {view==="rings"&&<div style={{display:"grid",gridTemplateColumns:"repeat(auto-fill,minmax(110px,1fr))",gap:12,justifyItems:"center"}}>
      {stats.map(m=>{const pct=m.hours/m.nrm.max;return(<div key={m.name} style={{textAlign:"center"}}>
        <Ring pct={pct} color={col(m)} top={`${m.hours}`} bottom={`/${m.nrm.max}ч`}/>
        <div style={{fontSize:13,fontWeight:600,marginTop:4}}>{m.name}</div>
        <div style={{fontSize:10,color:"var(--mt)"}}>{m.shifts} смен</div>
      </div>);})}
    </div>}

    {subShifts>0&&<div className="info-box" style={{marginTop:14}}>Подмены из других проектов за месяц: <b style={{color:"var(--cu)"}}>{subShifts}</b> смен (в нормы команды не входят).</div>}
  </div>);
}
