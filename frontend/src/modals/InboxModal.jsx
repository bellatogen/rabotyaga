// Модалка «Мои задачи» — упоминания пользователя
import { Inbox } from 'lucide-react';
import { DueRow } from '../components/DueRow.jsx';
import { dueLabel } from '../utils/taskUtils.js';

export function InboxModal({who,tasks,history,ds,onClose,onToggle}){
  return(<div className="overlay" onClick={e=>e.target===e.currentTarget&&onClose()}><div className="modal">
    <div className="handle"/>
    <div className="m-title" style={{display:"flex",alignItems:"center",gap:8}}><Inbox size={18} color="var(--cu)"/>Мои задачи · {who}</div>
    <div className="info-box" style={{fontSize:12}}>Здесь все задачи, где упомянули именно тебя (@{who}). Можно отметить выполнение, если срок сегодня.</div>
    {tasks.length===0&&<div className="empty">Пока нет задач с твоим упоминанием</div>}
    {tasks.map(t=><DueRow key={t.id} task={t} history={history} ds={ds} onToggle={dueLabel(t,ds).dueDate===ds?onToggle:null}/>)}
    <button className="btn btn-g" onClick={onClose} style={{marginTop:14}}>Закрыть</button>
  </div></div>);
}
