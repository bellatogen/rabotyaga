// Вкладка «События» — просмотр и редактирование мероприятий по датам
import { useState } from 'react';
import { Plus, Trash2, Calendar } from 'lucide-react';
import { DOW_FULL, MONTHS_RU } from '../constants/locale.js';

export const EVENT_TYPES = [
  {id:"stereo55",  label:"Стерео 55",           emoji:"🎸"},
  {id:"bottles",   label:"История в бутылке",   emoji:"🍾"},
  {id:"pubquiz",   label:"Паб-квиз",            emoji:"🧠"},
  {id:"darts",     label:"Турнир по дартсу",    emoji:"🎯"},
  {id:"guest",     label:"Гест",                emoji:"🎤"},
  {id:"collab",    label:"Коллаборация",         emoji:"🤝"},
  {id:"inventa",   label:"Инвентаризация",       emoji:"📋"},
];

// Матчим строку события к типу (для иконки)
function resolveType(str){
  if(!str) return {emoji:"📅",label:str};
  const s=str.toLowerCase();
  if(s.includes("стерео")) return EVENT_TYPES[0];
  if(s.includes("бутыл")||s.includes("истори")) return EVENT_TYPES[1];
  if(s.includes("квиз")) return EVENT_TYPES[2];
  if(s.includes("дарт")) return EVENT_TYPES[3];
  if(s.includes("гест")||s.includes("guest")) return EVENT_TYPES[4];
  if(s.includes("коллаб")) return EVENT_TYPES[5];
  if(s.includes("инвент")) return EVENT_TYPES[6];
  return {emoji:"📅",label:str};
}

function fmtDay(dateStr){
  const d=new Date(dateStr+"T12:00:00");
  return `${DOW_FULL[d.getDay()]}, ${d.getDate()} ${MONTHS_RU[d.getMonth()]}`;
}

export function EventsTab({events,isManager,onSetEvent,ds}){
  const[addDate,setAddDate]=useState(ds);
  const[addType,setAddType]=useState(null);
  const[addCustom,setAddCustom]=useState("");
  const[showForm,setShowForm]=useState(false);

  const entries=Object.entries(events).sort(([a],[b])=>a.localeCompare(b));
  const upcoming=entries.filter(([d])=>d>=ds);
  const past=entries.filter(([d])=>d<ds).reverse();

  const handleAdd=()=>{
    const label=addType?addType.label:(addCustom.trim()||null);
    if(!label||!addDate) return;
    onSetEvent(addDate,label);
    setShowForm(false);setAddType(null);setAddCustom("");
  };

  const EventRow=({dateStr,label,removable})=>{
    const t=resolveType(label);
    const isToday=dateStr===ds;
    return(
      <div style={{display:"flex",alignItems:"center",gap:10,padding:"10px 12px",
        background:"var(--sf)",border:`1px solid ${isToday?"var(--cu)":"var(--bd)"}`,
        borderRadius:10,marginBottom:8,opacity:removable?1:.5}}>
        <div style={{fontSize:22,lineHeight:1,flexShrink:0}}>{t.emoji}</div>
        <div style={{flex:1,minWidth:0}}>
          <div style={{fontWeight:600,fontSize:14,display:"flex",alignItems:"center",gap:6}}>
            {t.label||label}
            {isToday&&<span style={{fontSize:10,fontWeight:700,background:"var(--cu)",color:"var(--bg)",
              padding:"2px 6px",borderRadius:6,letterSpacing:".04em"}}>СЕГОДНЯ</span>}
          </div>
          <div style={{fontSize:12,color:"var(--mt)",marginTop:2}}>{fmtDay(dateStr)}</div>
        </div>
        {isManager&&removable&&(
          <button onClick={()=>onSetEvent(dateStr,null)}
            style={{background:"transparent",border:"none",cursor:"pointer",
              color:"var(--mt)",padding:4,display:"flex",alignItems:"center",flexShrink:0}}>
            <Trash2 size={15}/>
          </button>
        )}
      </div>
    );
  };

  return(
    <div>
      {isManager&&(
        <div className="sec" style={{paddingBottom:12}}>
          {!showForm?(
            <button className="btn btn-p" onClick={()=>setShowForm(true)}>
              <Plus size={16}/>Добавить событие
            </button>
          ):(
            <div style={{background:"var(--sf)",border:"1px solid var(--bd)",borderRadius:12,padding:14}}>
              <div className="sec-lbl" style={{marginBottom:8}}><Calendar size={12}/>Дата</div>
              <input type="date" value={addDate} onChange={e=>setAddDate(e.target.value)}
                style={{width:"100%",padding:"8px 10px",borderRadius:8,border:"1px solid var(--bd)",
                  background:"var(--bg)",color:"var(--pp)",fontFamily:"inherit",fontSize:14,
                  boxSizing:"border-box",marginBottom:14}}/>
              <div className="sec-lbl" style={{marginBottom:8}}>Тип события</div>
              <div className="chip-row" style={{marginBottom:12}}>
                {EVENT_TYPES.map(t=>(
                  <button key={t.id} className={`chip${addType?.id===t.id?" on":""}`}
                    onClick={()=>{setAddType(t);setAddCustom("");}}>
                    {t.emoji} {t.label}
                  </button>
                ))}
              </div>
              {!addType&&(
                <div style={{marginBottom:12}}>
                  <div className="sec-lbl" style={{marginBottom:6}}>Или введи название</div>
                  <input value={addCustom} onChange={e=>setAddCustom(e.target.value)}
                    placeholder="Название события"
                    style={{width:"100%",padding:"8px 10px",borderRadius:8,border:"1px solid var(--bd)",
                      background:"var(--bg)",color:"var(--pp)",fontFamily:"inherit",fontSize:14,
                      boxSizing:"border-box"}}/>
                </div>
              )}
              <div style={{display:"flex",gap:8,marginTop:4}}>
                <button className="btn btn-p" onClick={handleAdd} style={{flex:2}}>Сохранить</button>
                <button className="btn btn-g" onClick={()=>{setShowForm(false);setAddType(null);setAddCustom("");}} style={{flex:1}}>Отмена</button>
              </div>
            </div>
          )}
        </div>
      )}

      {upcoming.length===0&&past.length===0&&(
        <div className="sec"><div className="empty">Событий нет — {isManager?"добавь первое":"спроси управляющего"}</div></div>
      )}

      {upcoming.length>0&&(
        <div className="sec">
          <div className="sec-lbl" style={{marginBottom:10}}>Предстоящие</div>
          {upcoming.map(([d,l])=><EventRow key={d} dateStr={d} label={l} removable={true}/>)}
        </div>
      )}

      {past.length>0&&(
        <div className="sec" style={{paddingTop:4}}>
          <div className="sec-lbl" style={{marginBottom:10,opacity:.6}}>Прошедшие</div>
          {past.slice(0,8).map(([d,l])=><EventRow key={d} dateStr={d} label={l} removable={false}/>)}
        </div>
      )}
    </div>
  );
}
