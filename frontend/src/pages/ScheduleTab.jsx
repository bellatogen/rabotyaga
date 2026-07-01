// Вкладка «График» — календарь, дашборд часов, таблица часов + детальный просмотр дня
import { useState, useEffect, useRef } from 'react';
import { CalendarDays, ChevronLeft, ChevronRight, AlertTriangle, CheckCircle, Send, User, Plus, Clock, Users, TrendingUp, Download, Pencil, X, RefreshCw } from 'lucide-react';
import { MONTHS_RU, DOW_FULL, REPEAT_OPTS } from '../constants/locale.js';
import { hourNorm } from '../constants/staff.js';
import { staffCheck } from '../utils/staffUtils.js';
import { isToday, isDone } from '../utils/taskUtils.js';
import { hmm, rangeDays } from '../utils/dateUtils.js';
import { RevenueCard } from '../components/RevenueCard.jsx';
import { classifyEvent } from '../constants/events.js';
import { getEventIcon } from '../utils/eventIcons.jsx';
import stereo55Img from '../assets/stereo55.png';
import { MonthAnalytics } from '../components/analytics/MonthAnalytics.jsx';
import { revColor, kRub } from '../utils/revenueUtils.js';

export function ScheduleTab({schedule,events,revenue,ds,members,onOpenDay,isManager,monthPlan={},onSetMonthPlan,hourNorms={},onSetHourNorm,mozgDashboard={}}){
  const[sub,setSub]=useState("calendar");

  // Гард: проверяем наличие данных за текущий месяц
  const month=ds.slice(0,7);
  const hasSchedule=Object.keys(schedule).some(d=>d.startsWith(month));
  const hasRevenue=Object.values(revenue).some(r=>r&&(r.fact||r.plan));

  return(<>
    <div className="sec" style={{paddingBottom:0}}>
      <div className="subtabs">
        {[["calendar","Календарь"],["dashboard","Дашборд"]].map(([id,label])=>
            <button key={id} className={`tab${sub===id?" on":""}`} onClick={()=>setSub(id)}>{label}</button>)}
      </div>
    </div>
    {/* Предупреждение об отсутствии данных — подсказка менеджеру */}
    {(!hasSchedule||!hasRevenue)&&<div className="sec" style={{paddingBottom:0}}>
      <div className="alert warn" style={{fontSize:12,lineHeight:1.5}}>
        <AlertTriangle size={14} style={{flexShrink:0,marginTop:1}}/>
        <span>
          {!hasSchedule&&'Расписание на этот месяц не загружено. '}
          {!hasRevenue&&'Данные выручки отсутствуют. '}
          {isManager
            ? <>Восстановите через значок профиля (справа вверху) → <b>Администрирование → Синхронизация → Восстановить историю</b>.</>
            : 'Обратитесь к управляющему, чтобы обновить данные.'}
        </span>
      </div>
    </div>}
    {sub=="calendar"&&<CalendarTab schedule={schedule} events={events} revenue={revenue} ds={ds} onOpenDay={onOpenDay} isManager={isManager} monthPlan={monthPlan} onSetMonthPlan={onSetMonthPlan} mozgDashboard={mozgDashboard}/>}
    {sub==="dashboard"&&<DashboardTab schedule={schedule} members={members} ds={ds} isManager={isManager} hourNorms={hourNorms} onSetHourNorm={onSetHourNorm}/>}
  </>);
}

// revColor и kRub — импортированы из utils/revenueUtils.js

// Бейдж события в ячейке календаря
function CalEventBadge({ eventStr }) {
  if (!eventStr) return null;
  const et = classifyEvent(eventStr);
  if (!et) return <span className="cal-ev">{eventStr}</span>;
  if (et.id === 'stereo') return (
    <img src={stereo55Img} className="stereo-badge-img" alt="Стерео 55" />
  );
  const Icon = getEventIcon(et.id);
  return (
    <span style={{ display: 'flex', alignItems: 'center', gap: 2, fontSize: 9, fontWeight: 700, color: et.color, lineHeight: 1.2, marginTop: 2 }}>
      {Icon && <Icon size={8} strokeWidth={2.5} />}
      {et.shortName}
    </span>
  );
}

function CalendarTab({schedule,events,revenue,ds,onOpenDay,isManager,monthPlan={},onSetMonthPlan,mozgDashboard={}}){
  // Инициализация из текущей даты — не хардкодим месяц
  const[ym,setYm]=useState(()=>ds.slice(0,7));
  const[tooltip,setTooltip]=useState(null);   // только desktop hover
  const[daySheet,setDaySheet]=useState(null);
  const[helpOpen,setHelpOpen]=useState(false); // mobile bottom sheet
  const sheetSwipeY=useRef(null);

  // Скролл/ресайз — скрываем тултип
  useEffect(()=>{
    if(!tooltip)return;
    const hide=()=>setTooltip(null);
    window.addEventListener("scroll",hide,true);
    window.addEventListener("resize",hide);
    return()=>{window.removeEventListener("scroll",hide,true);window.removeEventListener("resize",hide);};
  },[tooltip]);
  // Закрытие шита при скролле
  useEffect(()=>{
    if(!daySheet)return;
    const hide=()=>setDaySheet(null);
    window.addEventListener("scroll",hide,true);
    return()=>window.removeEventListener("scroll",hide,true);
  },[daySheet]);

  const press=useRef({timer:null,long:false,ptype:'mouse'});
  const clearPress=()=>{clearTimeout(press.current.timer);press.current.timer=null;};

  const openTip=(el,c)=>{
    const r=el.getBoundingClientRect();
    const rev=revenue[c]||{};
    const pct=rev.plan&&rev.fact?(rev.fact/rev.plan)*100:null;
    const below=r.top<180;
    const vw=typeof window!=="undefined"?window.innerWidth:360;
    const cx=Math.max(150,Math.min(vw-150,r.left+r.width/2));
    setTooltip({x:cx,y:below?r.bottom:r.top,below,date:c,check:staffCheck(c,schedule,events),shifts:schedule[c]||[],event:events[c]||null,rev,pct});
  };

  const onCellEnter=(e,c)=>{if(e.pointerType==="mouse")openTip(e.currentTarget,c);};
  const onCellLeave=(e)=>{if(e.pointerType==="mouse")setTooltip(null);clearPress();};
  const onCellDown=(e,c)=>{
    press.current.ptype=e.pointerType;
    if(e.pointerType==="mouse")return;
    clearPress();press.current.long=false;
    // long press на тач — не используем (шит открывается по тапу)
  };
  const onCellClick=(c)=>{
    if(press.current.long){press.current.long=false;return;}
    if(press.current.ptype==="touch"||press.current.ptype==="pen"){
      // Мобилка: открываем bottom sheet
      const rev=revenue[c]||{};
      const pct=rev.plan&&rev.fact?(rev.fact/rev.plan)*100:null;
      setDaySheet({date:c,check:staffCheck(c,schedule,events),shifts:schedule[c]||[],event:events[c]||null,rev,pct});
    } else {
      // Десктоп: сразу открываем день
      onOpenDay(c);
    }
  };
  const[y,m]=ym.split("-").map(Number);
  const first=new Date(y,m-1,1);
  const startDow=(first.getDay()+6)%7; // пн=0
  const daysInMonth=new Date(y,m,0).getDate();
  const cells=[];
  for(let i=0;i<startDow;i++)cells.push(null);
  for(let d=1;d<=daysInMonth;d++)cells.push(`${ym}-${String(d).padStart(2,"0")}`);
  const shift=(n)=>{setTooltip(null);let nm=m+n,ny=y;if(nm<1){nm=12;ny--;}if(nm>12){nm=1;ny++;}setYm(`${ny}-${String(nm).padStart(2,"0")}`);};
  return(<>
  <div className="sec">
    <div className="sec-head">
      <span className="sec-lbl"><CalendarDays size={12}/>Календарь</span>
      <div style={{display:"flex",gap:8,alignItems:"center"}}>
        <button onClick={()=>shift(-1)} style={{background:"transparent",border:"none",color:"var(--mt)",cursor:"pointer"}}><ChevronLeft size={18}/></button>
        <span className="mono" style={{fontSize:13,color:"var(--pp)",minWidth:90,textAlign:"center"}}>{MONTHS_RU[m-1]} {y}</span>
        <button onClick={()=>shift(1)} style={{background:"transparent",border:"none",color:"var(--mt)",cursor:"pointer"}}><ChevronRight size={18}/></button>
      </div>
      <button className="cal-help-btn" onClick={()=>setHelpOpen(v=>!v)} aria-label="Как читать календарь">?</button>
    </div>
    {helpOpen&&<>
      <div onClick={()=>setHelpOpen(false)} style={{position:"fixed",inset:0,background:"rgba(0,0,0,.45)",zIndex:200}}/>
      <div className="cal-help-pop">
        <div style={{display:"flex",justifyContent:"space-between",alignItems:"center",marginBottom:10}}>
          <strong style={{fontSize:13}}>Как читать календарь</strong>
          <button onClick={()=>setHelpOpen(false)} style={{background:"transparent",border:"none",color:"var(--mt)",cursor:"pointer",fontSize:18,lineHeight:1,padding:0}}>×</button>
        </div>
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
    </>}
    <div className="cal-grid" style={{marginBottom:5}}>{["пн","вт","ср","чт","пт","сб","вс"].map(d=><div className="cal-dow" key={d}>{d}</div>)}</div>
    <div className="cal-grid">
      {cells.map((c,i)=>{
        if(!c)return (<div key={i}/>);
        const check=staffCheck(c,schedule,events);
        const dnum=Number(c.slice(-2));
        const rev=revenue[c]||{};
        const factN=Number(rev.fact)||0;
        const planN=Number(rev.plan)||0;
        const pct=planN>0&&factN>0?(factN/planN)*100:null;
        const cellColor=pct!=null?revColor(pct):null;
        const evType=classifyEvent(events[c]||null);
        return(<div key={i} className={`cal-cell${c===ds?" today":""}${!check.ok?" short":""}`} onClick={()=>onCellClick(c)}
          onPointerEnter={e=>onCellEnter(e,c)} onPointerLeave={onCellLeave}
          onPointerDown={e=>onCellDown(e,c)} onPointerMove={clearPress} onPointerUp={clearPress} onPointerCancel={clearPress}
          style={{touchAction:"manipulation",...(cellColor?{background:cellColor+"22"}:evType?{background:evType.bg}:null)}}>
          <span className="cal-num" style={cellColor?{color:cellColor}:undefined}>{dnum}</span>
          {/* Выручка-факт показывается ВСЕГДА когда есть — даже без плана */}
          {factN>0&&<span style={{fontSize:12,fontWeight:700,lineHeight:1.05,color:cellColor||"var(--pp)"}}>{kRub(factN)}</span>}
          {/* Процент плана — мелким, только если план задан */}
          {pct!=null&&<span style={{fontSize:9,fontWeight:600,lineHeight:1,color:cellColor,opacity:.9}}>{Math.round(pct)}%</span>}
          <CalEventBadge eventStr={events[c]||null}/>
        </div>);
      })}
    </div>

    {tooltip&&<div className="cal-tooltip" style={{left:tooltip.x,top:tooltip.y,transform:tooltip.below?"translate(-50%,10px)":"translate(-50%,calc(-100% - 10px))"}}>
      <div className="cal-tt-head">
        <span style={{fontWeight:600}}>{new Date(tooltip.date).toLocaleDateString("ru-RU",{day:"numeric",month:"long"})}</span>
        <span className="cal-tt-mt" style={{fontSize:11}}>{DOW_FULL[new Date(tooltip.date).getDay()]}</span>
      </div>
      <div className="cal-tt-row"><span className="cal-tt-mt" style={{display:"flex",alignItems:"center",gap:3}}><Users size={11}/>Штат</span><span style={{color:tooltip.check.ok?"var(--hp)":"#e07a60",fontWeight:600}}>{tooltip.check.actual}/{tooltip.check.norm.count}{tooltip.check.ok?"":" · недобор"}</span></div>
      {tooltip.shifts.length>0&&<div style={{margin:"4px 0 2px"}}>
        {tooltip.shifts.map((s,idx)=><div className="cal-tt-row" key={idx} style={{fontSize:12}}><span>{s.name}{s.guest?" (гость)":""}{s.sub?" · подмена":""}</span><span className="cal-tt-mt">{s.start||""}{s.end?` · ${s.end}ч`:""}</span></div>)}
      </div>}
      {tooltip.rev.plan!=null&&tooltip.rev.plan!==""&&<div style={{borderTop:"1px solid var(--bd)",paddingTop:6,marginTop:4}}>
        <div className="cal-tt-row"><span className="cal-tt-mt">₽ План</span><span>{Number(tooltip.rev.plan).toLocaleString("ru-RU")} ₽</span></div>
        {tooltip.rev.fact!=null&&tooltip.rev.fact!==""&&<div className="cal-tt-row"><span className="cal-tt-mt" style={{display:'flex',alignItems:'center',gap:3}}><TrendingUp size={11}/>Факт</span><span style={{color:tooltip.pct!=null?revColor(tooltip.pct):"var(--pp)",fontWeight:600}}>{Number(tooltip.rev.fact).toLocaleString("ru-RU")} ₽{tooltip.pct!=null?` · ${Math.round(tooltip.pct)}%`:""}</span></div>}
      </div>}
      {tooltip.event&&(()=>{const et=classifyEvent(tooltip.event);const Icon=et&&getEventIcon(et.id);return(<div style={{marginTop:6,paddingTop:6,borderTop:"1px solid var(--bd)"}}><div className="cal-tt-ev-pill" style={{color:et?et.color:"var(--cu)",background:et?et.bg:"rgba(76,175,130,.1)"}}>{et?.id==='stereo'?<img src={stereo55Img} className="stereo-badge-img" alt="" style={{width:14,height:14,borderRadius:'50%',objectFit:'cover',flexShrink:0}}/>:Icon?<Icon size={12} strokeWidth={2} style={{flexShrink:0}}/>:null}<span>{tooltip.event}</span></div></div>);})()}
    </div>}

    {/* ── Mobile bottom sheet ── */}
    {daySheet&&<>
      <div onClick={()=>setDaySheet(null)} style={{position:"fixed",inset:0,background:"rgba(0,0,0,.45)",zIndex:200,touchAction:"none"}}/>
      <div
        style={{position:"fixed",bottom:0,left:0,right:0,zIndex:201,background:"var(--bg)",
          borderRadius:"18px 18px 0 0",padding:"0 0 env(safe-area-inset-bottom)",
          maxHeight:"82vh",overflowY:"auto",boxShadow:"0 -4px 32px rgba(0,0,0,.25)"}}
        onTouchStart={e=>{sheetSwipeY.current=e.touches[0].clientY;}}
        onTouchMove={e=>{if(sheetSwipeY.current!==null&&e.touches[0].clientY-sheetSwipeY.current>64)setDaySheet(null);}}
        onTouchEnd={()=>{sheetSwipeY.current=null;}}
      >
        {/* drag handle */}
        <div style={{width:40,height:4,background:"var(--bd)",borderRadius:2,margin:"10px auto 0"}}/>

        {/* заголовок */}
        <div style={{padding:"14px 18px 10px",borderBottom:"1px solid var(--bd)"}}>
          <div style={{fontSize:20,fontWeight:700}}>
            {new Date(daySheet.date).toLocaleDateString("ru-RU",{day:"numeric",month:"long"})}
          </div>
          <div style={{fontSize:13,color:"var(--mt)",marginTop:2}}>
            {DOW_FULL[new Date(daySheet.date).getDay()]}
            {daySheet.event&&(()=>{const et=classifyEvent(daySheet.event);return(<span style={{color:et?et.color:"var(--cu)",marginLeft:8,fontWeight:et?600:400}}>· {et?et.emoji+' ':''}{daySheet.event}</span>);})()}
          </div>
        </div>

        <div style={{padding:"12px 18px"}}>
          {/* Штат */}
          <div style={{marginBottom:14}}>
            <div className="sec-lbl" style={{marginBottom:8,display:'flex',alignItems:'center',gap:5}}><Users size={12}/>Штат</div>
            <div style={{display:"flex",alignItems:"center",gap:10,marginBottom:8}}>
              <span style={{fontSize:22,fontWeight:700,color:daySheet.check.ok?"var(--hp)":"#e07a60"}}>
                {daySheet.check.actual}/{daySheet.check.norm.count}
              </span>
              <span style={{fontSize:13,color:daySheet.check.ok?"var(--hp)":"#e07a60",fontWeight:600}}>
                {daySheet.check.ok?"в норме":"недобор"}
              </span>
            </div>
            {daySheet.shifts.length>0&&daySheet.shifts.map((s,i)=>(
              <div key={i} style={{display:"flex",justifyContent:"space-between",alignItems:"center",
                padding:"7px 0",borderBottom:"1px solid var(--bd)"}}>
                <div>
                  <span style={{fontWeight:600,fontSize:14}}>{s.name}</span>
                  {s.report&&<span style={{fontSize:10,fontWeight:700,padding:"2px 6px",borderRadius:6,
                    background:"rgba(232,160,48,.18)",color:"var(--am)",marginLeft:6}}>отчёт</span>}
                  {(s.sub||s.guest)&&<span style={{fontSize:10,color:"var(--mt)",marginLeft:6}}>подмена</span>}
                </div>
                <span style={{fontSize:12,color:"var(--mt)",fontFamily:"monospace"}}>
                  {s.start||"—"}{s.end?` · ${s.end}ч`:""}
                </span>
              </div>
            ))}
            {daySheet.shifts.length===0&&<div style={{fontSize:13,color:"var(--mt)"}}>Смен нет</div>}
          </div>

          {/* Выручка */}
          {daySheet.rev.plan!=null&&daySheet.rev.plan!==""&&(
            <div style={{marginBottom:14}}>
              <div className="sec-lbl" style={{marginBottom:8}}>₽ Выручка</div>
              <div style={{display:"flex",gap:16}}>
                <div>
                  <div style={{fontSize:11,color:"var(--mt)",marginBottom:2}}>План</div>
                  <div style={{fontSize:18,fontWeight:700}}>{Number(daySheet.rev.plan).toLocaleString("ru-RU")} ₽</div>
                </div>
                {daySheet.rev.fact!=null&&daySheet.rev.fact!==""&&<div>
                  <div style={{fontSize:11,color:"var(--mt)",marginBottom:2}}>Факт</div>
                  <div style={{fontSize:18,fontWeight:700,color:daySheet.pct!=null?revColor(daySheet.pct):"var(--tx)"}}>    
                    {Number(daySheet.rev.fact).toLocaleString("ru-RU")} ₽
                    {daySheet.pct!=null&&<span style={{fontSize:12,marginLeft:6}}>{Math.round(daySheet.pct)}%</span>}
                  </div>
                </div>}
              </div>
            </div>
          )}

          {/* Кнопка */}
          <button className="btn btn-p" style={{width:"100%",marginTop:4,fontSize:15,padding:"13px"}}
            onClick={()=>{setDaySheet(null);onOpenDay(daySheet.date);}}>
            Открыть день →
          </button>
        </div>
      </div>
    </>}
  </div>
  <MonthAnalytics revenue={revenue} events={events} ym={ym} ds={ds} isManager={isManager} monthPlan={monthPlan} onSetMonthPlan={onSetMonthPlan} mozgData={mozgDashboard[ym]}/>
  </>
  );
}

export function DayDetail({date,schedule,events,tasks,history,revenue,handovers,isManager,canTeam,members,onAddTask,onEditTask,onSetRevenue,onAddShift,onRemoveShift,onUpdateShift}){
  const dObj=new Date(date);
  const check=staffCheck(date,schedule,events);
  const shifts=(schedule[date]||[]);
  const dayTasks=tasks.filter(t=>!t.archived&&isToday(t,date));
  const r=revenue[date]||{};
  const[plan,setPlan]=useState(r.plan??"");
  const[fact,setFact]=useState(r.fact??"");
  const[iikoLoading,setIikoLoading]=useState(false);
  const[iikoErr,setIikoErr]=useState(null);
  const[adding,setAdding]=useState(false);
  const[an,setAn]=useState("");const[acustom,setAcustom]=useState("");const[ast,setAst]=useState("13:00");const[ah,setAh]=useState(10);const[asub,setAsub]=useState(true);
  const ho=handovers[date]||[];
  const submitAdd=()=>{const name=(acustom.trim()||an);if(!name)return;onAddShift(date,{name,start:ast,end:String(ah),report:false,sub:asub});setAdding(false);setAn("");setAcustom("");};
  const loadIikoFact=async()=>{
    setIikoLoading(true);setIikoErr(null);
    try{
      const res=await fetch(`/api/iiko/revenue/${date}`,{credentials:'include'});
      const json=await res.json();
      if(!res.ok)throw new Error(json.error||`HTTP ${res.status}`);
      setFact(String(json.fact));
    }catch(e){setIikoErr(e.message);}
    finally{setIikoLoading(false);}
  };
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
        <div className="field" style={{marginBottom:0}}><label>Факт ₽</label>
          <div style={{display:"flex",gap:6,alignItems:"center"}}>
            <input type="number" value={fact} onChange={e=>setFact(e.target.value)} placeholder="—" style={{flex:1}}/>
            <button className="mini-btn" onClick={loadIikoFact} disabled={iikoLoading} title="Загрузить факт из iiko" style={{whiteSpace:"nowrap",flexShrink:0}}>
              {iikoLoading?<RefreshCw size={12} style={{animation:'spin 1s linear infinite'}}/>:<><Download size={12}/>iiko</>}
            </button>
          </div>
        </div>
      </div>
      {iikoErr&&<div className="alert danger" style={{marginTop:8,fontSize:12}}><AlertTriangle size={13} style={{flexShrink:0}}/><span>iiko: {iikoErr}</span></div>}
      <button className="btn btn-g" style={{marginTop:10}} onClick={()=>onSetRevenue(plan,fact)}>Сохранить выручку</button>
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
        <input type="time" value={s.start||""
        } onChange={e=>{
          const st=e.target.value;
          const update={start:st};
          if(st){const[h,m]=st.split(':').map(Number);const hrs=Math.round((23*60-(h*60+m))/60);if(hrs>0&&hrs<=16)update.end=String(hrs);}
          onUpdateShift(date,i,update);
        }} style={{width:92,background:"var(--bg)",border:"1px solid var(--bd)",borderRadius:7,padding:"5px 8px",color:"var(--pp)",fontSize:13}}/>
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

function DashboardTab({schedule,members,ds,isManager,hourNorms={},onSetHourNorm}){
  const[editingNorm,setEditingNorm]=useState(null);
  const[normDraft,setNormDraft]=useState({min:'',max:''});
  const month=ds.slice(0,7);
  const monthDays=Object.keys(schedule).filter(d=>d.startsWith(month));
  const memHours=name=>monthDays.reduce((a,d)=>{const s=(schedule[d]||[]).find(x=>x.name===name);return a+(s&&s.end?hmm(s.end)/60:0);},0);
  const memShifts=name=>monthDays.filter(d=>(schedule[d]||[]).some(s=>s.name===name)).length;
  const stats=members.map(n=>({name:n,hours:Math.round(memHours(n)*10)/10,shifts:memShifts(n),nrm:hourNorm(n,hourNorms)})).sort((a,b)=>b.hours-a.hours);
  const saveNorm=name=>{
    const mn=parseInt(normDraft.min),mx=parseInt(normDraft.max);
    if(!isFinite(mn)||!isFinite(mx)||mn<0||mx<=0||mx<mn||mx>400)return; // mx>0: нельзя делить на 0 в баре
    onSetHourNorm&&onSetHourNorm(name,mn,mx);
    setEditingNorm(null);
  };
  const subShifts=monthDays.reduce((a,d)=>a+(schedule[d]||[]).filter(s=>s.sub||(!members.includes(s.name)&&s.name)).length,0);
  const totalH=Math.round(stats.reduce((a,m)=>a+m.hours,0));
  const week=rangeDays(ds,7).slice().reverse();
  const dayHours=d=>(schedule[d]||[]).reduce((a,s)=>a+(s.end?hmm(s.end)/60:0),0);
  const maxDay=Math.max(1,...week.map(dayHours));
  const col=m=>m.hours>m.nrm.max?"var(--rs)":m.hours>=m.nrm.min?"var(--hp)":"var(--am)";
  return(<div className="sec">
    <div className="sec-head">
      <span className="sec-lbl"><Clock size={12}/>Дашборд · {totalH}ч / мес</span>
    </div>

    <div style={{display:"flex",alignItems:"flex-end",gap:6,height:120,padding:"8px 0 4px",borderBottom:"1px solid var(--bd)"}}>
      {week.map(d=>{const h=dayHours(d);const dt=new Date(d);return(<div key={d} style={{flex:1,display:"flex",flexDirection:"column",alignItems:"center",gap:4,height:"100%",justifyContent:"flex-end"}}>
        <span className="mono" style={{fontSize:10,color:"var(--am)"}}>{h?Math.round(h):""}</span>
        <div style={{width:"70%",height:`${h/maxDay*100}%`,minHeight:h?4:0,background:"linear-gradient(180deg,var(--cu),var(--cu2))",borderRadius:"4px 4px 0 0",transition:"height .4s ease"}}/>
        <span style={{fontSize:10,color:"var(--mt)"}}>{["вс","пн","вт","ср","чт","пт","сб"][dt.getDay()]}</span>
      </div>);})}
    </div>
    <div className="bar-pct" style={{textAlign:"center",margin:"7px 0 16px"}}>Часы персонала по дням за неделю</div>

    {stats.map(m=>{const denom=m.nrm.max>0?m.nrm.max:1;const editing=isManager&&editingNorm===m.name;return(<div className="pr" key={m.name}>
      <div className="pr-nm"><span>{m.name}</span><span className="mono" style={{fontWeight:600,fontSize:14,color:col(m)}}>{m.hours}ч</span></div>
      <div className="bar-bg"><div className="bar-fill" style={{width:`${Math.min(m.hours/denom*100,100)}%`,background:col(m),transition:"width .4s ease"}}/></div>
      <div style={{display:"flex",justifyContent:"space-between",alignItems:"center",marginTop:4,gap:6}}>
        <span className="bar-pct">{m.shifts} смен</span>
        {!editing&&<span className="bar-pct" style={{display:'flex',alignItems:'center',gap:4}}>
          норма {m.nrm.min}–{m.nrm.max}ч
          {isManager&&<button onClick={()=>{setEditingNorm(m.name);setNormDraft({min:m.nrm.min,max:m.nrm.max});}} style={{background:'transparent',border:'none',color:'var(--mt)',cursor:'pointer',padding:'0 2px',fontSize:11,lineHeight:1,display:'flex',alignItems:'center'}} title="Изменить норму"><Pencil size={10}/></button>}
        </span>}
        {editing&&<span style={{display:'flex',alignItems:'center',gap:4}}>
          <input type="number" min={0} max={400} value={normDraft.min} onChange={e=>setNormDraft(p=>({...p,min:e.target.value}))} onKeyDown={e=>{if(e.key==='Enter')saveNorm(m.name);if(e.key==='Escape')setEditingNorm(null);}} style={{width:48,background:'var(--bg)',border:'1px solid var(--bd)',borderRadius:5,padding:'2px 5px',color:'var(--pp)',fontSize:11,fontFamily:'inherit'}}/>
          <span style={{fontSize:10,color:'var(--mt)'}}>–</span>
          <input type="number" min={0} max={400} value={normDraft.max} onChange={e=>setNormDraft(p=>({...p,max:e.target.value}))} onKeyDown={e=>{if(e.key==='Enter')saveNorm(m.name);if(e.key==='Escape')setEditingNorm(null);}} style={{width:48,background:'var(--bg)',border:'1px solid var(--bd)',borderRadius:5,padding:'2px 5px',color:'var(--pp)',fontSize:11,fontFamily:'inherit'}}/>  
          <span style={{fontSize:10,color:'var(--mt)'}}>ч</span>
          <button onClick={()=>saveNorm(m.name)} style={{background:'var(--cu)',border:'none',borderRadius:5,color:'var(--bg)',cursor:'pointer',fontSize:10,fontWeight:700,padding:'2px 7px',fontFamily:'inherit'}}>OK</button>
          <button onClick={()=>setEditingNorm(null)} style={{background:'transparent',border:'1px solid var(--bd)',borderRadius:5,color:'var(--mt)',cursor:'pointer',fontSize:10,padding:'2px 4px',fontFamily:'inherit',display:'flex',alignItems:'center'}}><X size={12}/></button>
        </span>}
      </div>
    </div>);})}

    {subShifts>0&&<div className="info-box" style={{marginTop:14}}>Подмены из других проектов за месяц: <b style={{color:"var(--cu)"}}>{subShifts}</b> смен (в нормы команды не входят).</div>}
  </div>);
}
