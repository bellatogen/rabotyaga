// Модалка выдачи дисциплинарной карточки
import { useState } from 'react';
import { Lock, Award } from 'lucide-react';

export function CardModal({targetName,onClose,onIssue}){
  const[type,setType]=useState("yellow");const[comment,setComment]=useState("");const[isPrivate,setIsPrivate]=useState(false);
  return(<div className="overlay" onClick={e=>e.target===e.currentTarget&&onClose()}><div className="modal">
    <div className="handle"/><div className="m-title">Карточка → {targetName}</div>
    <div className="field"><label>Тип</label><div className="chip-row">{[["yellow","🟡 Жёлтая"],["orange","🟠 Оранжевая"],["red","🔴 Красная"]].map(([t,l])=><button key={t} className={`chip${type===t?" on":""}`} onClick={()=>setType(t)}>{l}</button>)}</div></div>
    <div className="field"><label>Комментарий</label><textarea rows={3} value={comment} onChange={e=>setComment(e.target.value)} placeholder="Причина…"/></div>
    <div className="field"><label>Видимость</label><div className="chip-row"><button className={`chip${!isPrivate?" on":""}`} onClick={()=>setIsPrivate(false)}>Уведомить команду</button><button className={`chip${isPrivate?" on":""}`} onClick={()=>setIsPrivate(true)}><Lock size={12}/>Конфиденциально</button></div></div>
    <button className="btn btn-p" onClick={()=>onIssue(type,comment,isPrivate)}><Award size={15}/>Выдать карточку</button>
    <button className="btn btn-g" onClick={onClose}>Отмена</button>
  </div></div>);
}
