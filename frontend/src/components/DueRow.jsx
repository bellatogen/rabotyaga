// Строка задачи с признаком срочности — используется в PersonalCabinet и InboxModal
import { CheckCircle, AlertTriangle, Circle } from 'lucide-react';
import { dueLabel, isDone } from '../utils/taskUtils.js';

export function DueRow({task,history,ds,onToggle}){
  const dl=dueLabel(task,ds);
  const done=isDone(history[`${task.id}::${dl.dueDate}`]);
  const overdue=dl.overdue&&!done;
  return(<div className="sc" style={overdue?{borderColor:"rgba(158,63,43,.45)"}:undefined}>
    <div className="sr">
      <div style={{flex:1}}>
        <div className="sn" style={{fontWeight:500}}>
          {onToggle&&<button className={`chk${done?" done":""}`} style={{width:20,height:20}} onClick={()=>onToggle(task.id)}>{done&&<CheckCircle size={12} color="#fff"/>}</button>}
          <span className={done?"":""} style={{textDecoration:done?"line-through":"none",color:done?"var(--mt)":"var(--pp)"}}>{task.title}{task.isReport&&<span style={{color:"var(--am)"}}> ★</span>}</span>
        </div>
        <div className="st" style={{marginTop:4,display:"flex",gap:8,flexWrap:"wrap"}}>
          <span style={{color:overdue?"#e07a60":"var(--mt)",display:'flex',alignItems:'center',gap:3}}>{overdue&&<AlertTriangle size={10}/>}{overdue?"просрочено · ":""}{dl.text}</span>
          {task.assignedTo&&task.assignedBy&&<span>от {task.assignedBy}</span>}
        </div>
      </div>
      <span style={{display:'flex',alignItems:'center',color:done?"var(--hp)":"var(--mt)"}}>{done?<CheckCircle size={13}/>:<Circle size={13}/>}</span>
    </div>
  </div>);
}
