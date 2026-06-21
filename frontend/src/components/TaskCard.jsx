// Карточка задачи — богатая версия с drag handle, @mention, pills, isReport-звёздочкой
import { CheckCircle, Clock, AtSign, User, Send, Pencil } from 'lucide-react';
import { REPEAT_OPTS } from '../constants/locale.js';

export function TaskCard({task,done,onToggle,onEdit,onHandover,highlight,dragHandle,dragging}){
  const rl=REPEAT_OPTS.find(r=>r.id===task.repeat)?.label;
  return(<div className={`task${done?" done":""}${dragging?" dragging":""}`} style={highlight&&!done?{borderColor:"rgba(232,160,48,.45)",borderLeftWidth:3}:undefined}>
    <div className="task-top">
      {dragHandle}
      <button className={`chk${done?" done":""}`} onClick={onToggle}>{done&&<CheckCircle size={14} color="#fff"/>}</button>
      <span className={`t-title${done?" done":""}`}>{task.title}{task.isReport&&<span style={{color:"var(--am)",fontSize:12}}> ★</span>}</span>
    </div>
    <div className="t-meta">
      {task.time&&<span className="pill p-t"><Clock size={10}/>{task.time}</span>}
      {task.assignedTo&&<span className="pill" style={{background:"rgba(232,160,48,.18)",color:"var(--am)"}}><AtSign size={10}/>{task.assignedTo}</span>}
      {task.assignee&&task.assignee!=="смена"&&<span className="pill p-w"><User size={10}/>{task.assignee}</span>}
      {task.assignee==="смена"&&!task.assignedTo&&<span className="pill p-w">вся смена</span>}
      {rl&&<span className="pill p-r">{rl}</span>}
    </div>
    {task.notes&&<div style={{fontSize:12,color:"var(--mt)",paddingLeft:35,marginTop:5,lineHeight:1.5}}>{task.notes}</div>}
    {(onEdit||onHandover)&&<div className="acts">
      {onHandover&&<button className="mini-btn" onClick={onHandover}><Send size={11}/>передать смене</button>}
      {onEdit&&<button className="mini-btn" onClick={onEdit}><Pencil size={11}/>изменить</button>}
    </div>}
  </div>);
}

export default TaskCard;
