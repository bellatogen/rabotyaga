// Вкладка «Сегодня» — прогресс, события, задачи смены, выручка, гоу-лист, состав смены
import { useState } from 'react';
import { CheckCircle, Bell, Send, AlertTriangle, FileText, ChevronDown, ChevronUp, AlignJustify, Square, CalendarDays, MapPin, Clock, Users } from 'lucide-react';
import { eventTypeById } from '../constants/events.js';
import { TaskCarousel } from '../components/TaskCarousel.jsx';
import { Avatar } from '../components/Avatar.jsx';
import { SHIFT_STATUSES } from '../constants/shifts.js';
import { staffCheck, getShiftStatus } from '../utils/staffUtils.js';
import { fmtDate } from '../utils/dateUtils.js';
import { RevenueCard } from '../components/RevenueCard.jsx';
import { GoListBlock } from '../components/GoList.jsx';
import { HoneycombGrid } from '../components/HoneycombGrid.jsx';
import { DailySets } from '../components/DailySets.jsx';
import { TaskCard } from '../components/TaskCard.jsx';
import { DraggableTaskList } from '../components/DraggableTaskList.jsx';
import { DoneAccordion } from '../components/DoneAccordion.jsx';

export function TodayTab({isManager,ds,todayTasks,doneMap,pct,doneTodayCount,todayShifts,myStatus,myAssigned,schedule,events,todayEvents=[],statusOverrides,now,revenue,handovers,dayClosed,dayRegularCount,irregular,irregularDoneMap,pushGateOk,onSummary,taskOrder,onReorder,onDelete,onArchive,goList,onGoAdd,onGoToggle,onGoRemove,onToggle,onEdit,onViewEmployee,onHandover,onIikoLoad,onEventClick,sectionsOpen=false,tasksView='list',cards=[]}){
  // Гард: нет расписания на сегодня и нет выручки за месяц → подсказка менеджеру
  const month=ds.slice(0,7);
  const hasAnyRevenue=Object.keys(revenue||{}).some(d=>d.startsWith(month));
  const hasAnySchedule=Object.keys(schedule||{}).some(d=>d.startsWith(month));
  const showDataBanner=isManager&&!hasAnyRevenue&&!hasAnySchedule;
  const [shiftOpen, setShiftOpen] = useState(sectionsOpen);
  const [tasksOpen, setTasksOpen] = useState(sectionsOpen);
  const [viewMode,  setViewMode]  = useState(tasksView);
  const check=staffCheck(ds,schedule,events);
  const todayHandovers=handovers[ds]||[];
  const regularTasks=todayTasks.filter(t=>t.kind!=="irregular");
  const irregularOpen=(irregular||[]).filter(t=>!irregularDoneMap[t.id]);
  // активные (невыполненные) — наверх, в пользовательском порядке; выполненные — в аккордеон
  const orderIdx=id=>{const i=(taskOrder||[]).indexOf(id);return i===-1?9999:i;};
  const active=regularTasks.filter(t=>!doneMap[t.id]).sort((a,b)=>orderIdx(a.id)-orderIdx(b.id));
  const done=regularTasks.filter(t=>doneMap[t.id]);
  // Дашборд управляющего
  const _rev=revenue[ds];
  const _fact=Number(_rev?.fact||0);
  const _plan=Number(_rev?.plan||0);
  const _revPct=_fact>0&&_plan>0?Math.round(_fact/_plan*100):null;
  const _revClr=_revPct==null?'var(--ft)':_revPct>=100?'#8bc47a':_revPct>=90?'#e8a030':'#e85535';
  const _todayCards=(cards||[]).filter(c=>c.date===ds);
  return(<>
    {showDataBanner&&<div className="sec" style={{paddingBottom:4}}>
      <div className="alert warn" style={{fontSize:12,lineHeight:1.5}}>
        <AlertTriangle size={14} style={{flexShrink:0,marginTop:1}}/>
        <span>Данные за этот месяц не загружены. Перейдите в <b>Кабинет → Управление → Синхронизация</b> и нажмите <b>«Восстановить данные»</b>.</span>
      </div>
    </div>}

    {/* 0. Дашборд управляющего — итог дня */}
    {isManager&&<div className="sec" style={{paddingBottom:4}}>
      <div className="sec-head"><span className="sec-lbl">📊 Итог дня</span></div>
      <div style={{display:'grid',gridTemplateColumns:'1fr 1fr',gap:8}}>
        <div style={{background:'var(--sf)',border:'1px solid var(--bd)',borderRadius:10,padding:'10px 12px'}}>
          <div style={{fontSize:11,opacity:.55,marginBottom:3}}>Задачи</div>
          <div style={{fontWeight:700,fontSize:20}}>{doneTodayCount}/{todayTasks.length}</div>
          <div style={{marginTop:6,height:4,background:'var(--bd)',borderRadius:2}}><div style={{height:'100%',width:`${pct}%`,background:'var(--hp)',borderRadius:2}}/></div>
          <div style={{fontSize:11,opacity:.55,marginTop:3}}>{pct}%</div>
        </div>
        <div style={{background:'var(--sf)',border:'1px solid var(--bd)',borderRadius:10,padding:'10px 12px'}}>
          <div style={{fontSize:11,opacity:.55,marginBottom:3}}>Выручка</div>
          {_fact>0?<><div style={{fontWeight:700,fontSize:16}}>{_fact.toLocaleString('ru-RU')} ₽</div>{_plan>0&&<div style={{fontSize:11,opacity:.6,marginTop:1}}>план {_plan.toLocaleString('ru-RU')} ₽</div>}{_revPct!=null&&<div style={{fontSize:13,fontWeight:600,color:_revClr,marginTop:3}}>{_revPct}%</div>}</>:<div style={{fontSize:12,opacity:.45,marginTop:4}}>не внесена</div>}
        </div>
        <div style={{background:'var(--sf)',border:'1px solid var(--bd)',borderRadius:10,padding:'10px 12px'}}>
          <div style={{fontSize:11,opacity:.55,marginBottom:3}}>Смена</div>
          {todayShifts.filter(s=>!s.guest).length===0
            ?<div style={{fontSize:12,opacity:.45}}>не запланирована</div>
            :todayShifts.filter(s=>!s.guest).map((s,i)=>{const ss=SHIFT_STATUSES[getShiftStatus(s.name,ds,schedule,statusOverrides,now)];return(<div key={i} style={{display:'flex',alignItems:'center',gap:5,marginBottom:3}}><span style={{width:6,height:6,borderRadius:'50%',background:ss?.bg||'var(--bd)',flexShrink:0}}/><span style={{fontSize:12,fontWeight:500}}>{s.name.split(' ')[0]}</span><span style={{fontSize:10,opacity:.55,marginLeft:2}}>{ss?.label}</span></div>);})
          }
        </div>
        <div style={{background:'var(--sf)',border:'1px solid var(--bd)',borderRadius:10,padding:'10px 12px'}}>
          <div style={{fontSize:11,opacity:.55,marginBottom:3}}>Карточки</div>
          {_todayCards.length===0
            ?<div style={{fontSize:13,opacity:.55}}>нет</div>
            :<><div style={{fontWeight:700,fontSize:18}}>{_todayCards.length}</div><div style={{fontSize:13,marginTop:2}}>{_todayCards.map(c=>c.type==='yellow'?'🟡':c.type==='orange'?'🟠':'🔴').join(' ')}</div></>
          }
        </div>
      </div>
    </div>}

    {/* 1. Прогресс-бар */}
    <div style={{padding:"12px 16px 0"}}>
      <div className="prog-bg"><div className="prog-fill" style={{width:`${pct}%`}}/></div>
      <div style={{display:"flex",justifyContent:"space-between",marginTop:6}}>
        <span className="mono" style={{fontSize:12,color:"var(--mt)"}}>{doneTodayCount} из {todayTasks.length}</span>
        <span className="mono" style={{fontSize:15,fontWeight:600,color:"var(--am)"}}>{pct}%</span>
      </div>
    </div>

    {/* 2. Алерт закрытия смены */}
    {dayClosed&&<div className="sec"><div className="alert ok"><CheckCircle size={16} style={{flexShrink:0,marginTop:1}}/><span>
      {pushGateOk
        ?`Смена закрыта — все ${dayRegularCount} регулярных задач выполнены. Пуш отправлен управляющему.`
        :`Все ${dayRegularCount} регулярных задач выполнены ✅ Пуш о закрытии уйдёт после 23:30.`}
    </span></div></div>}

    {/* 3. События сегодня (кликабельны → вкладка «События») */}
    {todayEvents.length>0&&<div className="sec">
      <div className="sec-head"><span className="sec-lbl" style={{color:'var(--cu)'}}><CalendarDays size={12}/>События сегодня</span></div>
      {todayEvents.map(ev=>{const t=eventTypeById(ev.type);return(
        <div key={ev.id} className="ev-clickable" onClick={()=>onEventClick&&onEventClick(ev)}
          style={{display:'flex',gap:10,padding:'10px 12px',background:'var(--sf)',
          border:'1px solid var(--cu)',borderRadius:10,marginBottom:8,cursor:onEventClick?'pointer':'default'}}>
          <div style={{fontSize:20,lineHeight:1,flexShrink:0}}>{t?t.emoji:'📅'}</div>
          <div style={{flex:1,minWidth:0}}>
            <div style={{fontWeight:600,fontSize:14}}>{ev.title}</div>
            {ev.description&&<div style={{fontSize:12,color:'var(--mt)',marginTop:2,lineHeight:1.4}}>{ev.description}</div>}
            <div style={{display:'flex',gap:8,flexWrap:'wrap',marginTop:6,fontSize:11,color:'var(--mt)'}}>
              {ev.timing&&(ev.timing.start||ev.timing.end)&&<span style={{display:'inline-flex',alignItems:'center',gap:3}}><Clock size={11}/>{ev.timing.start||'?'}{ev.timing.end?`–${ev.timing.end}`:''}</span>}
              {ev.location&&ev.location.type==='external'&&<span style={{display:'inline-flex',alignItems:'center',gap:3}}><MapPin size={11}/>{ev.location.address||'Выезд'}</span>}
              {ev.responsible&&ev.responsible.length>0&&<span style={{display:'inline-flex',alignItems:'center',gap:3}}><Users size={11}/>{ev.responsible.join(', ')}</span>}
            </div>
          </div>
        </div>
      );})}
    </div>}

    {/* 4. Задачи смены — главное содержимое */}
    <div className="sec">
      <div style={{border:'1px solid var(--bd)',borderRadius:10,overflow:'hidden',background:'var(--sf)'}}>
        <button onClick={()=>setTasksOpen(o=>!o)} className="acc-head">
          <span style={{display:'flex',alignItems:'center',gap:6}}>
            <CheckCircle size={13} color="var(--hp)"/>Задачи смены
          </span>
          <div style={{display:'flex',alignItems:'center',gap:8}}>
            <span className="mono" style={{fontSize:11,opacity:.55}}>{done.length}/{regularTasks.length}</span>
            {tasksOpen&&(
              <button onClick={e=>{e.stopPropagation();setViewMode(m=>m==='list'?'carousel':'list');}}
                title={viewMode==='list'?'Режим карусели':'Режим списка'}
                style={{background:'transparent',border:'1px solid var(--bd)',borderRadius:6,
                  width:26,height:26,display:'flex',alignItems:'center',justifyContent:'center',
                  color:'var(--mt)',cursor:'pointer',padding:0,flexShrink:0}}>
                {viewMode==='list' ? <Square size={11}/> : <AlignJustify size={11}/>}
              </button>
            )}
            {tasksOpen ? <ChevronUp size={15}/> : <ChevronDown size={15}/>}
          </div>
        </button>
        {tasksOpen&&<div style={{padding:'0 12px 12px'}}>
          {active.length===0&&regularTasks.length>0&&<div className="empty" style={{padding:'14px 0'}}>Все задачи выполнены 🎉</div>}
          {regularTasks.length===0&&<div className="empty" style={{padding:'14px 0'}}>Задач на сегодня нет</div>}
          {active.length>0&&viewMode==='list'&&(
            <DraggableTaskList tasks={active} onReorder={ids=>onReorder(ids)}
              onToggle={onToggle} onEdit={onEdit} onHandover={onHandover} doneMap={doneMap}
              onDelete={onDelete} onArchive={onArchive}/>
          )}
          {active.length>0&&viewMode==='carousel'&&(
            <TaskCarousel tasks={active} doneMap={doneMap}
              onToggle={onToggle} onEdit={onEdit} onHandover={onHandover}/>
          )}
          {done.length>0&&<DoneAccordion compact tasks={done} onToggle={onToggle} onEdit={onEdit} onDelete={onDelete} onArchive={onArchive}/>}
        </div>}
      </div>
    </div>

    {/* 5. Назначено вам */}
    {myAssigned&&myAssigned.length>0&&<div className="sec">
      <div className="sec-head"><span className="sec-lbl" style={{color:"var(--am)"}}><Bell size={12}/>Назначено вам</span><span className="sec-cnt">{myAssigned.filter(t=>doneMap[t.id]).length}/{myAssigned.length}</span></div>
      {myAssigned.map(t=><TaskCard key={t.id} task={t} done={!!doneMap[t.id]} onToggle={()=>onToggle(t.id)} onEdit={onEdit?()=>onEdit(t):null} highlight/>)}
    </div>}

    {/* 6. Передано прошлой сменой */}
    {todayHandovers.length>0&&<div className="sec">
      <div className="sec-head"><span className="sec-lbl"><Send size={12}/>Передано прошлой сменой</span></div>
      {todayHandovers.map(h=><div className="handover" key={h.id}>{h.text}<div className="handover-by">— {h.by}, {fmtDate(h.ts.slice(0,10))}</div></div>)}
    </div>}

    {/* 7. Выручка */}
    <div className="sec"><RevenueCard date={ds} revenue={revenue} onIikoLoad={onIikoLoad}/></div>

    {/* 8. Сэты дня */}
    <DailySets onGoAdd={onGoAdd}/>

    {/* 9. GoList */}
    {goList&&<div className="sec"><GoListBlock items={goList} onAdd={onGoAdd} onToggle={onGoToggle} onRemove={onGoRemove} defaultOpen={sectionsOpen}/></div>}

    {/* 10. Умные соты */}
    <div className="sec"><HoneycombGrid onGoAdd={onGoAdd} defaultOpen={sectionsOpen}/></div>

    {/* 11. Состав смены */}
    <div className="sec">
      <div style={{border:'1px solid var(--bd)',borderRadius:10,overflow:'hidden',background:'var(--sf)'}}>
        {/* Шапка-кнопка — всегда показывает аватары + имена */}
        <button onClick={()=>setShiftOpen(o=>!o)} className="acc-head">
          <div style={{display:'flex',alignItems:'center',gap:6}}>
            {todayShifts.filter(s=>!s.guest).slice(0,4).map((s,i)=>(
              <Avatar key={i} name={s.name} size={22} style={{marginLeft:i>0?-6:0,
                boxShadow:'0 0 0 2px var(--sf)',zIndex:4-i,flexShrink:0}}/>
            ))}
            <span style={{marginLeft:2}}>
              {todayShifts.filter(s=>!s.guest).map(s=>s.name.split(' ')[0]).join(', ') || 'Никто'}
            </span>
          </div>
          {shiftOpen ? <ChevronUp size={15}/> : <ChevronDown size={15}/>}
        </button>
        {shiftOpen&&<div style={{padding:'0 12px 12px'}}>
          {!check.ok&&<div className="alert danger" style={{marginBottom:8,marginTop:4}}><AlertTriangle size={16} style={{flexShrink:0}}/><span>{check.msg}</span></div>}
          {check.ok&&check.msg&&<div className="alert warn" style={{marginBottom:8,marginTop:4}}><AlertTriangle size={16} style={{flexShrink:0}}/><span>{check.msg}</span></div>}
          <div style={{display:'grid',gridTemplateColumns:'1fr 1fr',gap:8}}>
            {todayShifts.filter(s=>!s.guest).map((s,i)=>{
              const ss=SHIFT_STATUSES[getShiftStatus(s.name,ds,schedule,statusOverrides,now)];
              return(
                <div key={i} onClick={()=>onViewEmployee&&onViewEmployee(s.name)}
                  style={{background:'var(--bg)',border:`1px solid ${ss?.bg||'var(--bd)'}`,borderRadius:9,
                    padding:'10px',cursor:onViewEmployee?'pointer':'default',display:'flex',flexDirection:'column',gap:7}}>
                  <div style={{display:'flex',alignItems:'center',gap:8}}>
                    <Avatar name={s.name} size={34}/>
                    <div style={{minWidth:0,flex:1}}>
                      <div style={{fontWeight:600,fontSize:13,overflow:'hidden',textOverflow:'ellipsis',whiteSpace:'nowrap'}}>{s.name}</div>
                      <span style={{fontSize:9,fontWeight:700,padding:'2px 6px',borderRadius:6,
                        background:ss?.bg,color:ss?.color,display:'inline-block',marginTop:2,letterSpacing:'.04em'}}>{ss?.label}</span>
                    </div>
                  </div>
                  {s.start&&<div className="mono" style={{fontSize:11,color:'var(--mt)',display:'flex',alignItems:'center',gap:4}}>
                    {s.start}{s.end?` · ${s.end}ч`:''}
                    {s.report&&<span style={{color:'var(--am)',fontWeight:700}}>★</span>}
                  </div>}
                </div>
              );
            })}
          </div>
          {todayShifts.filter(s=>!s.guest).length===0&&<div className="empty" style={{padding:'16px 0'}}>Никто не запланирован на смену</div>}
          {!isManager&&myStatus==='day_off'&&<div className="empty" style={{padding:'4px 0'}}>Выходной 🍺</div>}
        </div>}
      </div>
    </div>

    {/* 12. Нерегулярные задачи */}
    {irregularOpen.length>0&&<div className="sec">
      <div className="sec-head"><span className="sec-lbl" style={{color:"#9bb0c4"}}><FileText size={12}/>Нерегулярные · требуют внимания</span><span className="sec-cnt">{irregularOpen.length}</span></div>
      <div style={{fontSize:11,color:"var(--mt)",marginBottom:8,lineHeight:1.5}}>Не влияют на закрытие смены. Остаются в списке, пока не выполнены.</div>
      {irregularOpen.map(t=><TaskCard key={t.id} task={t} done={false} onToggle={()=>onToggle(t.id,"irregular")} onEdit={onEdit?()=>onEdit(t):null}/>)}
    </div>}

    {/* 13. Кнопка итогов */}
    {onSummary&&<div className="sec" style={{paddingBottom:8}}>
      <button className="btn btn-g" onClick={onSummary}><FileText size={15}/>Итоги дня</button>
    </div>}
  </>);
}
