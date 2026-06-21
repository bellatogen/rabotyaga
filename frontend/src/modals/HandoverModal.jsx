// Модалка передачи дел следующей смене
import { useState } from 'react';
import { Send } from 'lucide-react';
import { fmtDate, addDays } from '../utils/dateUtils.js';

export function HandoverModal({task,ds,onClose,onSubmit}){
  const[text,setText]=useState(task?`Не успели: ${task.title}. `:"");
  const[createTask,setCreateTask]=useState(true);
  return(<div className="overlay" onClick={e=>e.target===e.currentTarget&&onClose()}><div className="modal">
    <div className="handle"/><div className="m-title">Передать следующей смене</div>
    <div className="info-box">Не успели в эту смену — не беда. Опиши, что осталось, и при желании поставь задачу на завтра ({fmtDate(addDays(ds,1))}).</div>
    <div className="field"><label>Сообщение следующей смене</label><textarea rows={3} value={text} onChange={e=>setText(e.target.value)} placeholder="Что не доделали и что нужно сделать…"/></div>
    <div className="field"><label>Создать задачу на завтра</label><div className="chip-row"><button className={`chip${createTask?" on":""}`} onClick={()=>setCreateTask(true)}>Да</button><button className={`chip${!createTask?" on":""}`} onClick={()=>setCreateTask(false)}>Нет, только заметка</button></div></div>
    <button className="btn btn-p" onClick={()=>{if(text.trim())onSubmit(text,createTask);}}><Send size={15}/>Передать</button>
    <button className="btn btn-g" onClick={onClose}>Отмена</button>
  </div></div>);
}
