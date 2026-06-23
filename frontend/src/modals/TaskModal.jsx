// TaskModal — создание задачи (форма) + детальный вид (Basecamp-стиль)
import { useState, useRef } from 'react';
import { CheckCircle, Trash2, AtSign, Plus, Send, Calendar, X } from 'lucide-react';
import { REPEAT_OPTS, DAYS_RU } from '../constants/locale.js';
import { uid, addDays, fmtDate, nowISO } from '../utils/dateUtils.js';
import { Avatar } from '../components/Avatar.jsx';

// Текст с подсвеченными @упоминаниями
function MentionText({text}){
  return <>{(text||"").split(/(@\S+)/g).map((p,i)=>
    p.startsWith("@")?<span key={i} style={{color:"var(--cu)",fontWeight:600}}>{p}</span>:p
  )}</>;
}

export function TaskModal({task,ds,members,who,onClose,onSave,onDelete,comments=[],onAddComment}){
  const isNew=!task;
  const[d,set_]=useState(task||{id:uid(),kind:"regular",repeat:"daily",date:ds,time:"",
    assignee:"смена",notes:"",isReport:false,dayOfWeek:new Date(ds).getDay(),from:"",until:""});
  const s=p=>set_(prev=>({...prev,...p}));
  const isReg=d.kind!=="irregular";
  const isRecurring=isReg&&["daily","workday","weekly"].includes(d.repeat);

  // --- субзадачи ---
  const subtasks=d.subtasks||[];
  const[newSt,setNewSt]=useState("");
  const addSt=()=>{const t=newSt.trim();if(!t)return;s({subtasks:[...subtasks,{id:uid(),title:t,done:false}]});setNewSt("");};
  const toggleSt=id=>s({subtasks:subtasks.map(st=>st.id===id?{...st,done:!st.done,doneBy:!st.done?(who||""):null,doneTs:!st.done?nowISO():null}:st)});
  const delSt=id=>s({subtasks:subtasks.filter(st=>st.id!==id)});

  // --- комментарии / @упоминания ---
  const[cmtText,setCmtText]=useState("");
  const[mentionQ,setMentionQ]=useState(null);
  const cmtRef=useRef();
  const onCmtChange=v=>{
    setCmtText(v);
    const at=v.lastIndexOf("@");
    if(at>=0&&!v.slice(at+1).includes(" "))setMentionQ({q:v.slice(at+1).toLowerCase(),at});
    else setMentionQ(null);
  };
  const insertMention=name=>{
    if(!mentionQ)return;
    setCmtText(cmtText.slice(0,mentionQ.at)+"@"+name+" ");
    setMentionQ(null);setTimeout(()=>cmtRef.current?.focus(),0);
  };
  const sendComment=()=>{
    const text=cmtText.trim();if(!text)return;
    const mentions=(text.match(/@(\S+)/g)||[]).map(m=>m.slice(1));
    onAddComment&&onAddComment(d.id,{id:uid(),author:who||"?",text,ts:nowISO(),mentions});
    setCmtText("");setMentionQ(null);
  };
  const mentionHints=mentionQ?members.filter(m=>m.toLowerCase().startsWith(mentionQ.q)).slice(0,4):[];

  // ══════════════════════════════════════════════
  //  ФОРМА СОЗДАНИЯ
  // ══════════════════════════════════════════════
  if(isNew)return(
    <div className="overlay" onClick={e=>e.target===e.currentTarget&&onClose()}>
      <div className="modal">
        <div className="handle"/>
        <div className="m-title">Новая задача</div>
        <div className="field"><label>Название</label><input value={d.title||""} onChange={e=>s({title:e.target.value})} placeholder="Что нужно сделать?" autoFocus/></div>
        <div className="field"><label>Тип</label><div className="chip-row">
          <button className={`chip${isReg?" on":""}`} onClick={()=>s({kind:"regular"})}>Регулярная</button>
          <button className={`chip${!isReg?" on":""}`} onClick={()=>s({kind:"irregular"})}>Нерегулярная</button>
        </div></div>
        {isReg&&<>
          <div className="field"><label>Повторение</label><select value={d.repeat} onChange={e=>s({repeat:e.target.value})}>{REPEAT_OPTS.map(r=><option key={r.id} value={r.id}>{r.label}</option>)}</select></div>
          {d.repeat==="once"&&<div className="field"><label>Дата</label><input type="date" value={d.date} onChange={e=>s({date:e.target.value})}/></div>}
          {d.repeat==="weekly"&&<div className="field"><label>День недели</label><select value={d.dayOfWeek} onChange={e=>s({dayOfWeek:Number(e.target.value)})}>{DAYS_RU.map((dy,i)=><option key={i} value={i}>{dy}</option>)}</select></div>}
          {isRecurring&&<div className="field"><label>Период (необязательно)</label>
            <div className="r2"><input type="date" value={d.from||""} onChange={e=>s({from:e.target.value})}/><input type="date" value={d.until||""} onChange={e=>s({until:e.target.value})}/></div>
          </div>}
        </>}
        <div className="r2">
          <div className="field"><label>Время</label><input type="time" value={d.time||""} onChange={e=>s({time:e.target.value})}/></div>
          <div className="field"><label>Видит</label><select value={d.assignee||"смена"} onChange={e=>s({assignee:e.target.value})}><option value="смена">Вся смена</option>{members.map(m=><option key={m} value={m}>{m}</option>)}</select></div>
        </div>
        <div className="r2">
          <div className="field"><label>@ Назначить</label>
            <select value={d.assignedTo||""} onChange={e=>s({assignedTo:e.target.value||null})}>
              <option value="">Никого</option>{members.map(m=><option key={m} value={m}>@{m}</option>)}
            </select>
          </div>
          <div className="field"><label>Срок</label><input type="date" value={d.dueDate||""} onChange={e=>s({dueDate:e.target.value||null})}/></div>
        </div>
        <div className="field"><label>Заметка</label><textarea rows={2} value={d.notes||""} onChange={e=>s({notes:e.target.value})} placeholder="Детали…"/></div>
        <button className="btn btn-p" onClick={()=>{if((d.title||"").trim())onSave(d);}}><CheckCircle size={15}/>Создать задачу</button>
        <button className="btn btn-g" onClick={onClose}>Отмена</button>
      </div>
    </div>
  );

  // ══════════════════════════════════════════════
  //  ДЕТАЛЬНЫЙ ВИД
  // ══════════════════════════════════════════════
  const doneCount=subtasks.filter(st=>st.done).length;
  const overdue=d.dueDate&&d.dueDate<ds;
  return(
    <div className="overlay" onClick={e=>e.target===e.currentTarget&&onClose()}>
      <div className="modal" style={{maxHeight:"92dvh",display:"flex",flexDirection:"column",padding:0,overflow:"hidden"}}>

        {/* Хедер */}
        <div style={{padding:"10px 16px 0",flexShrink:0}}>
          <div className="handle" style={{margin:"0 auto 10px"}}/>
          <textarea value={d.title} onChange={e=>s({title:e.target.value})} rows={2}
            style={{fontSize:17,fontWeight:700,background:"transparent",border:"none",
              borderBottom:"1px solid var(--bd)",padding:"0 0 8px",width:"100%",
              fontFamily:'"Fraunces",serif',color:"var(--pp)",resize:"none",outline:"none",
              lineHeight:1.3,boxSizing:"border-box",marginBottom:10}}/>
          {/* Мета-строка */}
          <div style={{display:"flex",gap:12,flexWrap:"wrap",fontSize:12,color:"var(--mt)",marginBottom:10}}>
            {d.createdBy&&<span>Поставил: <b style={{color:"var(--pp)"}}>{d.createdBy}</b></span>}
            {d.assignedTo&&<span style={{display:"flex",alignItems:"center",gap:3}}><AtSign size={10}/><b style={{color:"var(--cu)"}}>{d.assignedTo}</b></span>}
            {d.dueDate&&<span style={{display:"flex",alignItems:"center",gap:3,color:overdue?"#e07a60":"var(--mt)"}}><Calendar size={10}/>{fmtDate(d.dueDate)}{overdue?" ⚠️":""}</span>}
            {subtasks.length>0&&<span>☑ {doneCount}/{subtasks.length}</span>}
          </div>
          {/* Быстрые поля */}
          <div className="r2" style={{marginBottom:12}}>
            <div className="field" style={{margin:0}}>
              <label style={{fontSize:10}}>@ Назначить</label>
              <select value={d.assignedTo||""} onChange={e=>s({assignedTo:e.target.value||null})} style={{fontSize:12}}>
                <option value="">Никого</option>{members.map(m=><option key={m} value={m}>{m}</option>)}
              </select>
            </div>
            <div className="field" style={{margin:0}}>
              <label style={{fontSize:10}}>Срок</label>
              <input type="date" value={d.dueDate||""} onChange={e=>s({dueDate:e.target.value||null})} style={{fontSize:12}}/>
            </div>
          </div>
        </div>

        {/* Скролл-тело */}
        <div style={{overflow:"auto",flex:1,padding:"0 16px 8px"}}>

          {/* Субзадачи */}
          <div style={{marginBottom:16}}>
            <div className="sec-lbl" style={{marginBottom:8}}>☑ Субзадачи</div>
            {subtasks.length>0&&<div style={{background:"var(--sf)",border:"1px solid var(--bd)",borderRadius:10,overflow:"hidden",marginBottom:8}}>
              {subtasks.map((st,i)=>(
                <div key={st.id} style={{display:"flex",alignItems:"center",gap:8,padding:"9px 12px",
                  borderBottom:i<subtasks.length-1?"1px solid var(--bd)":"none",
                  background:st.done?"rgba(139,196,122,.07)":"transparent"}}>
                  <button onClick={()=>toggleSt(st.id)} style={{background:"transparent",border:"none",
                    cursor:"pointer",padding:0,flexShrink:0,display:"flex",color:"#8bc47a"}}>
                    {st.done
                      ?<CheckCircle size={18} color="#8bc47a"/>
                      :<div style={{width:18,height:18,borderRadius:4,border:"2px solid var(--bd)",flexShrink:0}}/>}
                  </button>
                  <span style={{flex:1,fontSize:13,textDecoration:st.done?"line-through":"none",
                    color:st.done?"var(--mt)":"var(--pp)"}}>{st.title}</span>
                  {st.done&&st.doneBy&&<span style={{fontSize:10,color:"var(--mt)"}}>{st.doneBy}</span>}
                  <button onClick={()=>delSt(st.id)} style={{background:"transparent",border:"none",
                    cursor:"pointer",color:"var(--mt)",padding:2,opacity:.5,display:"flex"}}>
                    <X size={13}/>
                  </button>
                </div>
              ))}
            </div>}
            <div style={{display:"flex",gap:8}}>
              <input value={newSt} onChange={e=>setNewSt(e.target.value)}
                onKeyDown={e=>e.key==="Enter"&&addSt()}
                placeholder="+ Добавить субзадачу…"
                style={{flex:1,background:"var(--bg)",border:"1px solid var(--bd)",borderRadius:8,
                  padding:"7px 10px",color:"var(--pp)",fontFamily:"inherit",fontSize:13}}/>
              {newSt&&<button className="btn btn-p" onClick={addSt} style={{width:"auto",padding:"0 12px",margin:0,flexShrink:0}}><Plus size={14}/></button>}
            </div>
          </div>

          {/* Заметки */}
          <div style={{marginBottom:16}}>
            <div className="sec-lbl" style={{marginBottom:6}}>📝 Заметки</div>
            <textarea value={d.notes||""} onChange={e=>s({notes:e.target.value})}
              placeholder="Описание, ссылки, детали…" rows={3}
              style={{width:"100%",background:"var(--sf)",border:"1px solid var(--bd)",borderRadius:8,
                padding:"9px 10px",color:"var(--pp)",fontFamily:"inherit",fontSize:13,
                resize:"vertical",outline:"none",boxSizing:"border-box"}}/>
          </div>

          {/* Комментарии */}
          <div style={{marginBottom:8}}>
            <div className="sec-lbl" style={{marginBottom:10}}>
              💬 Комментарии {comments.length>0&&<span style={{fontWeight:400,color:"var(--mt)"}}>({comments.length})</span>}
            </div>
            {comments.map(c=>(
              <div key={c.id} style={{display:"flex",gap:8,marginBottom:12}}>
                <Avatar name={c.author} size={28}/>
                <div style={{flex:1,minWidth:0}}>
                  <div style={{display:"flex",gap:8,alignItems:"baseline",marginBottom:3}}>
                    <span style={{fontWeight:600,fontSize:12}}>{c.author}</span>
                    <span style={{fontSize:10,color:"var(--mt)"}}>{c.ts?.slice(0,10)}</span>
                  </div>
                  <div style={{fontSize:13,lineHeight:1.5,background:"var(--sf)",
                    border:"1px solid var(--bd)",borderRadius:8,padding:"7px 10px"}}>
                    <MentionText text={c.text}/>
                  </div>
                </div>
              </div>
            ))}
            {/* Ввод комментария */}
            <div style={{display:"flex",gap:8,alignItems:"flex-end",position:"relative"}}>
              {who&&<Avatar name={who} size={28}/>}
              <div style={{flex:1,position:"relative"}}>
                {mentionHints.length>0&&(
                  <div style={{position:"absolute",bottom:"calc(100% + 4px)",left:0,right:0,
                    background:"var(--bg)",border:"1px solid var(--cu)",borderRadius:8,
                    overflow:"hidden",zIndex:10,boxShadow:"0 4px 16px rgba(0,0,0,.2)"}}>
                    {mentionHints.map(m=>(
                      <button key={m} onMouseDown={e=>{e.preventDefault();insertMention(m);}}
                        style={{display:"flex",alignItems:"center",gap:8,width:"100%",
                          background:"transparent",border:"none",padding:"8px 12px",
                          cursor:"pointer",color:"var(--pp)",fontSize:13}}>
                        <Avatar name={m} size={22}/>{m}
                      </button>
                    ))}
                  </div>
                )}
                <textarea ref={cmtRef} value={cmtText} onChange={e=>onCmtChange(e.target.value)}
                  onKeyDown={e=>{if(e.key==="Enter"&&!e.shiftKey){e.preventDefault();sendComment();}}}
                  placeholder="Комментарий… @ для упоминания"
                  rows={2}
                  style={{width:"100%",background:"var(--sf)",border:"1px solid var(--bd)",borderRadius:8,
                    padding:"8px 36px 8px 10px",color:"var(--pp)",fontFamily:"inherit",fontSize:13,
                    resize:"none",outline:"none",boxSizing:"border-box"}}/>
                <button onClick={sendComment} disabled={!cmtText.trim()}
                  style={{position:"absolute",right:6,bottom:6,background:"var(--cu)",border:"none",
                    borderRadius:6,width:26,height:26,display:"flex",alignItems:"center",
                    justifyContent:"center",cursor:"pointer",opacity:cmtText.trim()?1:.35}}>
                  <Send size={13} color="#fff"/>
                </button>
              </div>
            </div>
          </div>
        </div>

        {/* Футер */}
        <div style={{padding:"8px 16px 14px",borderTop:"1px solid var(--bd)",flexShrink:0,display:"flex",gap:8}}>
          <button className="btn btn-p" onClick={()=>{if((d.title||"").trim())onSave(d);}} style={{flex:2}}><CheckCircle size={15}/>Сохранить</button>
          <button className="btn btn-d" onClick={()=>onDelete(task.id)} style={{flex:1,padding:"13px 8px"}}><Trash2 size={14}/></button>
        </div>
      </div>
    </div>
  );
}
