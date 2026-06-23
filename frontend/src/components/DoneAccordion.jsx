// Аккордеон выполненных задач
import { useState } from 'react';
import { CheckCircle, ChevronUp, ChevronDown } from 'lucide-react';
import { TaskCard } from './TaskCard.jsx';
import { SwipeRow } from './SwipeRow.jsx';

export function DoneAccordion({tasks,onToggle,onEdit,onDelete,onArchive,compact=false}){
  const [open,setOpen]=useState(false);
  // compact=true — встраивается внутрь родительской карточки (без внешних отступов и бордера)
  const wrapStyle=compact
    ?{borderTop:'1px solid var(--bd)',marginTop:8,background:'transparent'}
    :undefined;
  return(<div className={compact?'':"acc"} style={wrapStyle}>
    <button className="acc-head" onClick={()=>setOpen(o=>!o)}>
      <span style={{display:"flex",alignItems:"center",gap:6}}><CheckCircle size={13} color="var(--hp)"/>Выполнено · {tasks.length}</span>
      {open?<ChevronUp size={16}/>:<ChevronDown size={16}/>}
    </button>
    {open&&<div className="acc-body">{tasks.map(t=>(
      <SwipeRow key={t.id} onDelete={onDelete?()=>onDelete(t.id):null} onArchive={onArchive?()=>onArchive(t.id):null}>
        <TaskCard task={t} done onToggle={()=>onToggle(t.id)} onEdit={onEdit?()=>onEdit(t):null}/>
      </SwipeRow>
    ))}</div>}
  </div>);
}
