// Модалка создания/редактирования задачи
import { useState } from 'react';
import { CheckCircle, Trash2, AtSign } from 'lucide-react';
import { REPEAT_OPTS, DAYS_RU } from '../constants/locale.js';
import { uid, addDays } from '../utils/dateUtils.js';

export function TaskModal({task,ds,members,onClose,onSave,onDelete}){
  const[d,set_]=useState(task||{id:uid(),kind:"regular",repeat:"daily",date:ds,time:"",assignee:"смена",notes:"",isReport:false,dayOfWeek:new Date(ds).getDay(),from:"",until:""});
  const s=p=>set_(prev=>({...prev,...p}));
  const isReg=d.kind!=="irregular";
  const isRecurring=isReg&&["daily","workday","weekly"].includes(d.repeat);
  return(<div className="overlay" onClick={e=>e.target===e.currentTarget&&onClose()}><div className="modal">
    <div className="handle"/><div className="m-title">{task?"Редактировать":"Новая задача"}</div>
    <div className="field"><label>Название</label><input value={d.title} onChange={e=>s({title:e.target.value})} placeholder="Что нужно сделать?"/></div>
    <div className="field"><label>Статус задачи</label><div className="chip-row">
      <button className={`chip${isReg?" on":""}`} onClick={()=>s({kind:"regular"})}>Регулярная</button>
      <button className={`chip${!isReg?" on":""}`} onClick={()=>s({kind:"irregular"})}>Нерегулярная</button>
    </div>
    <div style={{fontSize:11,color:"var(--mt)",marginTop:6,lineHeight:1.5}}>{isReg?"Появляется в нужные дни автоматически и влияет на закрытие смены.":"Разовое дело «на потом». Не влияет на закрытие смены, висит в списке, пока не выполнено."}</div></div>

    {isReg&&<>
      <div className="field"><label>Повторение</label><select value={d.repeat} onChange={e=>s({repeat:e.target.value})}>{REPEAT_OPTS.map(r=><option key={r.id} value={r.id}>{r.label}</option>)}</select></div>
      {d.repeat==="once"&&<div className="field"><label>Дата</label><input type="date" value={d.date} onChange={e=>s({date:e.target.value})}/></div>}
      {d.repeat==="weekly"&&<div className="field"><label>День недели</label><select value={d.dayOfWeek} onChange={e=>s({dayOfWeek:Number(e.target.value)})}>{DAYS_RU.map((dy,i)=><option key={i} value={i}>{dy}</option>)}</select></div>}
      {isRecurring&&<div className="field"><label>Период действия (необязательно — напр. летнее меню/открытая дверь)</label>
        <div className="r2"><input type="date" value={d.from||""} onChange={e=>s({from:e.target.value})} placeholder="с"/><input type="date" value={d.until||""} onChange={e=>s({until:e.target.value})} placeholder="по"/></div>
        <div className="chip-row" style={{marginTop:8}}>
          <button className="chip" onClick={()=>s({from:ds,until:addDays(ds,30)})}>месяц</button>
          <button className="chip" onClick={()=>s({from:ds,until:addDays(ds,365)})}>год</button>
          <button className="chip" onClick={()=>s({from:"",until:""})}>бессрочно</button>
        </div>
      </div>}
    </>}

    <div className="r2"><div className="field"><label>Время</label><input type="time" value={d.time||""} onChange={e=>s({time:e.target.value})}/></div>
      <div className="field"><label>Видит (смена/кому)</label><select value={d.assignee||"смена"} onChange={e=>s({assignee:e.target.value})}><option value="смена">Вся смена</option>{members.map(m=><option key={m} value={m}>{m}</option>)}</select></div></div>
    <div className="field"><label><AtSign size={11} style={{display:"inline",verticalAlign:"-1px"}}/> Ответственный (упомянуть — придёт уведомление)</label>
      <select value={d.assignedTo||""} onChange={e=>s({assignedTo:e.target.value||null})}>
        <option value="">Никого</option>{members.map(m=><option key={m} value={m}>@{m}</option>)}
      </select></div>
    {isReg&&<div className="field"><label>Только ответственному за отчёт ★</label><div className="chip-row"><button className={`chip${d.isReport?" on":""}`} onClick={()=>s({isReport:!d.isReport})}>{d.isReport?"Да":"Нет"}</button></div></div>}
    <div className="field"><label>Заметка</label><textarea rows={2} value={d.notes||""} onChange={e=>s({notes:e.target.value})} placeholder="Детали…"/></div>
    <button className="btn btn-p" onClick={()=>{if(d.title.trim())onSave(d);}}><CheckCircle size={15}/>Сохранить</button>
    {task&&<button className="btn btn-d" onClick={()=>onDelete(task.id)}><Trash2 size={14}/>Удалить</button>}
    <button className="btn btn-g" onClick={onClose}>Отмена</button>
  </div></div>);
}
