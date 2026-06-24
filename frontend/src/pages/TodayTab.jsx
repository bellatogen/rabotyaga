// Вкладка «Сегодня» — прогресс, выручка, гоу-лист, состав смены, задачи дня
import { useState } from 'react';
import { CheckCircle, Bell, Send, AlertTriangle, FileText, ChevronDown, ChevronUp, AlignJustify, Square } from 'lucide-react';
import { TaskCarousel } from '../components/TaskCarousel.jsx';
import { Avatar } from '../components/Avatar.jsx';
import { SHIFT_STATUSES } from '../constants/shifts.js';
import { staffCheck, getShiftStatus } from '../utils/staffUtils.js';
import { fmtDate } from '../utils/dateUtils.js';
import { RevenueCard } from '../components/RevenueCard.jsx';
import { GoListBlock } from '../components/GoList.jsx';
import { BundleRecommendations } from '../components/BundleRecommendations.jsx';
import { TaskCard } from '../components/TaskCard.jsx';
import { DraggableTaskList } from '../components/DraggableTaskList.jsx';
import { DoneAccordion } from '../components/DoneAccordion.jsx';

export function TodayTab({isManager,ds,todayTasks,doneMap,pct,doneTodayCount,todayShifts,myStatus,myAssigned,schedule,events,statusOverrides,now,revenue,handovers,dayClosed,dayRegularCount,irregular,irregularDoneMap,pushGateOk,onSummary,taskOrder,onReorder,onDelete,onArchive,goList,onGoAdd,onGoToggle,onGoRemove,onToggle,onEdit,onViewEmployee,onHandover,onIikoLoad,sectionsOpen=false,tasksView='list'}){
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
  return(<>
    {showDataBanner&&<div className="sec" style={{paddingBottom:4}}>
      <div className="alert warn" style={{fontSize:12,lineHeight:1.5}}>
        <AlertTriangle size={14} style={{flexShrink:0,marginTop:1}}/>
        <span>Данные за этот месяц не загружены. Перейдите в <b>Кабинет → Управление → Синхронизация</b> и нажмите <b>«Восстановить данные»</b>.</span>
      </div>
    </div>}

    <div style={{padding:"12px 16px 0"}}>
      <div className="prog-bg"><div className="prog-fill" style={{width:`${pct}%`}}/></div>
      <div style={{display:"flex",justifyContent:"space-between",marginTop:6}}>
        <span className="mono" style={{fontSize:12,color:"var(--mt)"}}>{doneTodayCount} из {todayTasks.length}</span>
        <span className="mono" style={{fontSize:15,fontWeight:600,color:"var(--am)"}}>{pct}%</span>
      </div>
    </div>

    {dayClosed&&<div className="sec"><div className="alert ok"><CheckCircle size={16} style={{flexShrink:0,marginTop:1}}/><span>
      {pushGateOk
        ?`Смена закрыта — все ${dayRegularCount} регулярных задач выполнены. Пуш отправлен управляющему.`
        :`Все ${dayRegularCount} регулярных задач выполнены ✅ Пуш о закрытии уйдёт после 23:30.`}
    </span></div></div>}

    <div className="sec"><RevenueCard date={ds} revenue={revenue} onIikoLoad={onIikoLoad}/></div>

    {goList&&<div className="sec"><GoListBlock items={goList} onAdd={onGoAdd} onToggle={onGoToggle} onRemove={onGoRemove} defaultOpen={sectionsOpen}/></div>}

    <div className="sec"><BundleRecommendations onGoAdd={onGoAdd} defaultOpen={sectionsOpen}/></div>

    {myAssigned&&myAssigned.length>0&&<div className="sec">
      <div className="sec-head"><span className="sec-lbl" style={{color:"var(--am)"}}><Bell size={12}/>Назначено вам</span><span className="sec-cnt">{myAssigned.filter(t=>doneMap[t.id]).length}/{myAssigned.length}</span></div>
      {myAssigned.map(t=><TaskCard key={t.id} task={t} done={!!doneMap[t.id]} onToggle={()=>onToggle(t.id)} onEdit={onEdit?()=>onEdit(t):null} highlight/>)}
    </div>}

    {todayHandovers.length>0&&<div className="sec">
      <div className="sec-head"><span className="sec-lbl"><Send size={12}/>Передано прошлой сменой</span></div>
      {todayHandovers.map(h=><div className="handover" key={h.id}>{h.text}<div className="handover-by">— {h.by}, {fmtDate(h.ts.slice(0,10))}</div></div>)}
    </div>}

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

    {irregularOpen.length>0&&<div className="sec">
      <div className="sec-head"><span className="sec-lbl" style={{color:"#9bb0c4"}}><FileText size={12}/>Нерегулярные · требуют внимания</span><span className="sec-cnt">{irregularOpen.length}</span></div>
      <div style={{fontSize:11,color:"var(--mt)",marginBottom:8,lineHeight:1.5}}>Не влияют на закрытие смены. Остаются в списке, пока не выполнены.</div>
      {irregularOpen.map(t=><TaskCard key={t.id} task={t} done={false} onToggle={()=>onToggle(t.id,"irregular")} onEdit={onEdit?()=>onEdit(t):null}/>)}
    </div>}

    {onSummary&&<div className="sec" style={{paddingBottom:8}}>
      <button className="btn btn-g" onClick={onSummary}><FileText size={15}/>Итоги дня</button>
    </div>}
  </>);
}
