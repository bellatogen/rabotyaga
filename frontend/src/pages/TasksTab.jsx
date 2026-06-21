// Вкладка «Задачи» — все активные задачи + архив
import { useState } from 'react';
import { Archive, RotateCcw, ChevronUp, ChevronDown } from 'lucide-react';
import { TaskCard } from '../components/TaskCard.jsx';

export function TasksTab({tasks,doneMap,onToggle,onEdit,onArchive}){
  const [showArch,setShowArch]=useState(false);
  const active=tasks.filter(t=>!t.archived);
  const archived=tasks.filter(t=>t.archived);
  return(<div className="sec">
    <div className="sec-head"><span className="sec-lbl">Все задачи ({active.length})</span></div>
    {active.length===0&&<div className="empty">Нет задач</div>}
    {active.map(t=><TaskCard key={t.id} task={t} done={!!doneMap[t.id]} onToggle={()=>onToggle(t.id)} onEdit={onEdit?()=>onEdit(t):null}/>)}
    {archived.length>0&&<div className="acc" style={{marginLeft:0,marginRight:0,marginTop:14}}>
      <button className="acc-head" onClick={()=>setShowArch(o=>!o)}>
        <span style={{display:"flex",alignItems:"center",gap:6}}><Archive size={13}/>Архив · {archived.length}</span>
        {showArch?<ChevronUp size={16}/>:<ChevronDown size={16}/>}
      </button>
      {showArch&&<div className="acc-body">{archived.map(t=>(
        <div className="task" key={t.id} style={{opacity:.7,display:"flex",alignItems:"center",justifyContent:"space-between"}}>
          <span style={{fontSize:14}}>{t.title}</span>
          {onArchive&&<button className="mini-btn" onClick={()=>onArchive(t.id,false)}><RotateCcw size={12}/>вернуть</button>}
        </div>
      ))}</div>}
    </div>}
  </div>);
}
