// Журнал — задачи по дням + лента событий
import { useState, useMemo } from 'react';
import { FileText } from 'lucide-react';
import { isToday, isDone, doneInfo } from '../utils/taskUtils.js';
import { fmtDate } from '../utils/dateUtils.js';

export function LogsTab({tasks,history,members,who,isManager,ds,eventsLog}){
  const[view,setView]=useState("tasks");
  const[filterPerson,setFilterPerson]=useState(isManager?"all":who);
  const[filterDate,setFilterDate]=useState(ds);
  const allDays=useMemo(()=>{const s=new Set();Object.keys(history).forEach(k=>{const p=k.split("::");if(p[1])s.add(p[1]);});return Array.from(s).sort().reverse().slice(0,30);},[history]);
  const dd=filterDate||ds;
  const myTasks=tasks.filter(t=>(filterPerson==="all"||t.assignee===filterPerson||t.assignee==="смена")&&isToday(t,dd));
  const doneCount=myTasks.filter(t=>isDone(history[`${t.id}::${dd}`])).length;
  const LABELS={opening:"Открытие",closing:"Закрытие",daily:"День",workday:"Будни",weekly:"Неделя",once:"Разово"};
  const EV_LABELS={task_done:"✅ Задача выполнена",task_undone:"↩️ Задача снята",card_issued:"🟥 Карточка",handover:"📨 Передача смене",task_added:"➕ Новая задача",assigned:"@ Назначен ответственный",shift_closed:"🎉 Смена закрыта",login:"🔑 Вход в систему",password_set:"🔐 Пароль задан",password_changed:"🔐 Пароль изменён",password_reset:"♻️ Пароль сброшен",acl_changed:"🛡️ Изменены доступы",task_deleted:"🗑️ Задача удалена",task_archived:"📦 Задача в архиве",task_restored:"♻️ Задача из архива"};
  return(<div className="sec">
    <div className="sec-head"><span className="sec-lbl"><FileText size={12}/>Журнал</span>
      <div style={{display:"flex",gap:4}}>{[["tasks","Задачи"],["events","События"]].map(([v,l])=><button key={v} className={`tab${view===v?" on":""}`} onClick={()=>setView(v)} style={{padding:"4px 10px",fontSize:11}}>{l}</button>)}</div>
    </div>
    {view==="tasks"&&<>
      <div className="field"><label>Дата</label><select value={filterDate} onChange={e=>setFilterDate(e.target.value)}>{[ds,...allDays.filter(d=>d!==ds)].map(d=><option key={d} value={d}>{fmtDate(d)}{d===ds?" — сегодня":""}</option>)}</select></div>
      {isManager&&<div className="field"><label>Сотрудник</label><select value={filterPerson} onChange={e=>setFilterPerson(e.target.value)}><option value="all">Все</option>{members.map(m=><option key={m} value={m}>{m}</option>)}</select></div>}
      <div style={{background:"var(--sf)",border:"1px solid var(--bd)",borderRadius:10,padding:"4px 14px"}}>
        {myTasks.length===0&&<div className="empty" style={{padding:"20px 0"}}>Нет задач за этот день</div>}
        {myTasks.map(t=>{const di=doneInfo(history[`${t.id}::${dd}`]);const done=!!di?.done;
          return(<div key={t.id} style={{display:"flex",alignItems:"center",gap:8,padding:"8px 0",borderBottom:"1px dashed var(--bd)"}}>
            <span style={{width:8,height:8,borderRadius:"50%",flexShrink:0,background:done?"var(--hp)":"var(--rs)"}}/>
            <span style={{flex:1,fontSize:13.5}}>{t.title}{di?.ts&&done&&<span className="mono" style={{fontSize:10,color:"var(--mt)",marginLeft:6}}>{new Date(di.ts).toLocaleTimeString("ru-RU",{hour:"2-digit",minute:"2-digit"})}</span>}</span>
            <span className="pill p-r">{LABELS[t.repeat]||t.repeat}</span>
            <span style={{fontSize:11,fontWeight:700,color:done?"var(--hp)":"var(--rs)"}}>{done?"✓":"✗"}</span>
          </div>);})}
      </div>
      {myTasks.length>0&&<div className="info-box" style={{marginTop:10}}>Выполнено: <span className="mono" style={{color:"var(--am)"}}>{doneCount}/{myTasks.length}</span></div>}
    </>}
    {view==="events"&&<div style={{background:"var(--sf)",border:"1px solid var(--bd)",borderRadius:10,padding:"4px 14px"}}>
      {eventsLog.length===0&&<div className="empty" style={{padding:"20px 0"}}>Событий пока нет</div>}
      {eventsLog.slice(0,80).map(e=><div className="log-ev" key={e.id}>
        <span className="log-ev-ts">{new Date(e.ts).toLocaleDateString("ru-RU",{day:"2-digit",month:"2-digit"})}<br/>{new Date(e.ts).toLocaleTimeString("ru-RU",{hour:"2-digit",minute:"2-digit"})}</span>
        <span style={{flex:1}}>{EV_LABELS[e.type]||e.type}<div style={{fontSize:11,color:"var(--mt)",marginTop:2}}>{e.who} · {e.detail}</div></span>
      </div>)}
    </div>}
  </div>);
}
