// Вкладка «Сегодня» — прогресс, выручка, гоу-лист, состав смены, задачи дня
import { CheckCircle, Bell, Send, AlertTriangle, FileText } from 'lucide-react';
import { Avatar } from '../components/Avatar.jsx';
import { SHIFT_STATUSES } from '../constants/shifts.js';
import { staffCheck, getShiftStatus } from '../utils/staffUtils.js';
import { fmtDate } from '../utils/dateUtils.js';
import { RevenueCard } from '../components/RevenueCard.jsx';
import { GoListBlock } from '../components/GoList.jsx';
import { TaskCard } from '../components/TaskCard.jsx';
import { DraggableTaskList } from '../components/DraggableTaskList.jsx';
import { DoneAccordion } from '../components/DoneAccordion.jsx';

export function TodayTab({isManager,ds,todayTasks,doneMap,pct,doneTodayCount,todayShifts,myStatus,myAssigned,schedule,events,statusOverrides,now,revenue,handovers,dayClosed,dayRegularCount,irregular,irregularDoneMap,pushGateOk,onSummary,taskOrder,onReorder,onDelete,onArchive,goList,onGoAdd,onGoToggle,onGoRemove,onToggle,onEdit,onViewEmployee,onHandover}){
  const check=staffCheck(ds,schedule,events);
  const todayHandovers=handovers[ds]||[];
  const regularTasks=todayTasks.filter(t=>t.kind!=="irregular");
  const irregularOpen=(irregular||[]).filter(t=>!irregularDoneMap[t.id]);
  // активные (невыполненные) — наверх, в пользовательском порядке; выполненные — в аккордеон
  const orderIdx=id=>{const i=(taskOrder||[]).indexOf(id);return i===-1?9999:i;};
  const active=regularTasks.filter(t=>!doneMap[t.id]).sort((a,b)=>orderIdx(a.id)-orderIdx(b.id));
  const done=regularTasks.filter(t=>doneMap[t.id]);
  return(<>
    <div style={{padding:"12px 16px 0"}}>
      <div className="prog-bg"><div className="prog-fill" style={{width:`${pct}%`}}/></div>
      <div style={{display:"flex",justifyContent:"space-between",marginTop:6}}>
        <span className="mono" style={{fontSize:11,color:"var(--mt)",textTransform:"uppercase"}}>{doneTodayCount} из {todayTasks.length}</span>
        <span className="mono" style={{fontSize:20,fontWeight:600,color:"var(--am)"}}>{pct}%</span>
      </div>
    </div>

    {dayClosed&&<div className="sec"><div className="alert ok"><CheckCircle size={16} style={{flexShrink:0,marginTop:1}}/><span>
      {pushGateOk
        ?`Смена закрыта — все ${dayRegularCount} регулярных задач выполнены. Пуш отправлен управляющему.`
        :`Все ${dayRegularCount} регулярных задач выполнены ✅ Пуш о закрытии уйдёт после 23:30.`}
    </span></div></div>}

    <div className="sec"><RevenueCard date={ds} revenue={revenue}/></div>

    {goList&&<div className="sec"><GoListBlock items={goList} onAdd={onGoAdd} onToggle={onGoToggle} onRemove={onGoRemove}/></div>}

    {myAssigned&&myAssigned.length>0&&<div className="sec">
      <div className="sec-head"><span className="sec-lbl" style={{color:"var(--am)"}}><Bell size={12}/>Назначено вам</span><span className="sec-cnt">{myAssigned.filter(t=>doneMap[t.id]).length}/{myAssigned.length}</span></div>
      {myAssigned.map(t=><TaskCard key={t.id} task={t} done={!!doneMap[t.id]} onToggle={()=>onToggle(t.id)} onEdit={onEdit?()=>onEdit(t):null} highlight/>)}
    </div>}

    {todayHandovers.length>0&&<div className="sec">
      <div className="sec-head"><span className="sec-lbl"><Send size={12}/>Передано прошлой сменой</span></div>
      {todayHandovers.map(h=><div className="handover" key={h.id}>{h.text}<div className="handover-by">— {h.by}, {fmtDate(h.ts.slice(0,10))}</div></div>)}
    </div>}

    <div className="sec">
      <div className="sec-head" style={{marginBottom:10}}>
        <span className="sec-lbl">👥 Смена сегодня</span>
        <span className="sec-cnt">{todayShifts.filter(s=>!s.guest).length} / {check.norm.count} норма</span>
      </div>
      {!check.ok&&<div className="alert danger" style={{marginBottom:8}}><AlertTriangle size={16} style={{flexShrink:0}}/><span>{check.msg}</span></div>}
      {check.ok&&check.msg&&<div className="alert warn" style={{marginBottom:8}}><AlertTriangle size={16} style={{flexShrink:0}}/><span>{check.msg}</span></div>}
      <div style={{display:"grid",gridTemplateColumns:"1fr 1fr",gap:8}}>
        {todayShifts.filter(s=>!s.guest).map((s,i)=>{
          const ss=SHIFT_STATUSES[getShiftStatus(s.name,ds,schedule,statusOverrides,now)];
          return(
            <div key={i} onClick={()=>onViewEmployee&&onViewEmployee(s.name)}
              style={{background:"var(--sf)",border:`1px solid ${ss?.bg||"var(--bd)"}`,borderRadius:12,
                padding:"11px",cursor:onViewEmployee?"pointer":"default",display:"flex",flexDirection:"column",gap:8}}>
              <div style={{display:"flex",alignItems:"center",gap:8}}>
                <Avatar name={s.name} size={36}/>
                <div style={{minWidth:0,flex:1}}>
                  <div style={{fontWeight:600,fontSize:13,overflow:"hidden",textOverflow:"ellipsis",whiteSpace:"nowrap"}}>{s.name}</div>
                  <span style={{fontSize:9,fontWeight:700,padding:"2px 6px",borderRadius:6,
                    background:ss?.bg,color:ss?.color,display:"inline-block",marginTop:2,letterSpacing:".04em"}}>{ss?.label}</span>
                </div>
              </div>
              {s.start&&<div className="mono" style={{fontSize:11,color:"var(--mt)",display:"flex",alignItems:"center",gap:4}}>
                {s.start}{s.end?` · ${s.end}ч`:""}
                {s.report&&<span style={{color:"var(--am)",fontWeight:700}}>★</span>}
              </div>}
            </div>
          );
        })}
      </div>
      {todayShifts.filter(s=>!s.guest).length===0&&<div className="empty">Никто не запланирован на смену</div>}
      {!isManager&&myStatus==="day_off"&&<div className="empty" style={{padding:"4px 0"}}>Выходной 🍺</div>}
    </div>

    <div className="sec">
      <div className="sec-head"><span className="sec-lbl"><CheckCircle size={12}/>Задачи смены</span><span className="sec-cnt">{done.length}/{regularTasks.length}</span></div>
      {active.length===0&&regularTasks.length>0&&<div className="empty" style={{padding:"14px 0"}}>Все задачи выполнены 🎉</div>}
      {regularTasks.length===0&&<div className="empty" style={{padding:"14px 0"}}>Задач на сегодня нет</div>}
      <DraggableTaskList tasks={active} onReorder={ids=>onReorder(ids)}
        onToggle={onToggle} onEdit={onEdit} onHandover={onHandover} doneMap={doneMap}
        onDelete={onDelete} onArchive={onArchive}/>
    </div>
    {done.length>0&&<DoneAccordion tasks={done} onToggle={onToggle} onEdit={onEdit} onDelete={onDelete} onArchive={onArchive}/>}

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
