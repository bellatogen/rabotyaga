// Вкладка «Сегодня» — прогресс, выручка, гоу-лист, состав смены, задачи дня
import { CheckCircle, Bell, Send, User, AlertTriangle, FileText } from 'lucide-react';
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
      <div className="sec-head"><span className="sec-lbl"><User size={12}/>На смене · норма {check.norm.count}</span></div>
      {!check.ok&&<div className="alert danger"><AlertTriangle size={16} style={{flexShrink:0,marginTop:1}}/><span>{check.msg}</span></div>}
      {check.ok&&check.msg&&<div className="alert warn"><AlertTriangle size={16} style={{flexShrink:0,marginTop:1}}/><span>{check.msg}</span></div>}
      {todayShifts.filter(s=>!s.guest).map((s,i)=>{const ss=SHIFT_STATUSES[getShiftStatus(s.name,ds,schedule,statusOverrides,now)];
        return(<div className="sc" key={i} onClick={()=>onViewEmployee&&onViewEmployee(s.name)} style={{cursor:onViewEmployee?"pointer":"default"}}>
          <div className="sr">
            <div><div className="sn"><User size={13} color="var(--cu)"/>{s.name}</div>{s.start&&<div className="st">{s.start}{s.end?` · ${s.end}ч`:""}</div>}</div>
            <div style={{display:"flex",gap:4,flexWrap:"wrap",justifyContent:"flex-end"}}>
              {s.report&&<span style={{fontSize:10,fontWeight:700,padding:"3px 8px",borderRadius:8,background:"rgba(232,160,48,.18)",color:"var(--am)"}}>отчёт</span>}
              <span style={{fontSize:10,fontWeight:700,padding:"3px 8px",borderRadius:8,background:ss?.bg,color:ss?.color}}>{ss?.label}</span>
            </div>
          </div>
        </div>);})}
      {!isManager&&myStatus==="day_off"&&<div className="empty" style={{padding:"12px 0"}}>Выходной 🍺</div>}
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
