// Личный кабинет сотрудника — обзор, задачи, цифры, советы, карточки, журнал
import { useState } from 'react';
import { AlertTriangle, Award, AtSign, User, Plus, TrendingUp, TrendingDown, Minus, Lock, Key } from 'lucide-react';
import { ROLES } from '../constants/roles.js';
import { SHIFT_STATUSES } from '../constants/shifts.js';
import { hourNorm } from '../constants/staff.js';
import { accountLabel } from '../utils/authUtils.js';
import { getShiftStatus } from '../utils/staffUtils.js';
import { getActiveCards } from '../utils/cardUtils.js';
import { rateFor, progressTrend, suspiciousFlags, genRecs } from '../utils/statsUtils.js';
import { dueLabel } from '../utils/taskUtils.js';
import { hmm, rangeDays, fmtDate } from '../utils/dateUtils.js';
import { DueRow } from '../components/DueRow.jsx';
import { LogsTab } from './LogsTab.jsx';

export function PersonalCabinet({name,isOwnCabinet,tasks,history,schedule,cards,profiles,ds,now,statusOverrides,members,eventsLog,onIssueCard,onUpdateProfile,onAddOverride,setCardModal,onToggle,onChangePassword,onLogout,adminPanel,leaveRequests=[],onLeaveRequest,onLeaveDecide}){
  const isSpecialAccount=name==="manager"||name==="developer";
  const[subtab,setSubtab]=useState(isSpecialAccount?"settings":"overview");

  const pendingLeaves=(leaveRequests||[]).filter(r=>r.status==="pending");

  if(isSpecialAccount)return(
    <>
      <div className="sec">
        <div className="cab-hero">
          <div style={{display:"flex",justifyContent:"space-between",alignItems:"center"}}>
            <div>
              <div className="cab-name">{name==="developer"?"Разработчик":"Управляющий"}</div>
              <div className="cab-role">{name==="developer"?"developer":"manager"}</div>
            </div>
            {onLogout&&<button className="btn btn-d" onClick={onLogout} style={{width:"auto",padding:"7px 16px",fontSize:13}}>Выйти</button>}
          </div>
        </div>
        <div style={{display:"flex",gap:4,marginBottom:4}}>
          {["settings","leaves",...(adminPanel?["admin"]:[])].map(s=>(
            <button key={s} className={`tab${subtab===s?" on":""}`} onClick={()=>setSubtab(s)} style={{flex:1,textAlign:"center",position:"relative"}}>
              {s==="settings"?"Настройки":s==="leaves"?"Заявки":"Администрирование"}
              {s==="leaves"&&pendingLeaves.length>0&&<span style={{position:"absolute",top:2,right:4,background:"var(--rs)",color:"#fff",fontSize:9,fontWeight:700,borderRadius:8,minWidth:14,height:14,display:"inline-flex",alignItems:"center",justifyContent:"center",padding:"0 3px"}}>{pendingLeaves.length}</span>}
            </button>
          ))}
        </div>
      </div>
      {subtab==="settings"&&<div className="sec">
        {isOwnCabinet&&onChangePassword&&<PasswordChanger onChange={onChangePassword}/>}
      </div>}
      {subtab==="leaves"&&<LeaveManager requests={leaveRequests} onDecide={onLeaveDecide} ds={ds}/>}
      {subtab==="admin"&&adminPanel}
    </>
  );
  const profile=profiles.find(p=>p.name===name)||{name,role:"barman",perms:ROLES.barman.perms};
  const ss=SHIFT_STATUSES[getShiftStatus(name,ds,schedule,statusOverrides,now)];
  const activeCards=getActiveCards(cards,name);
  const myShift=(schedule[ds]||[]).find(s=>s.name===name);
  const r14=rateFor(name,tasks,history,ds,0,14);
  const r30=rateFor(name,tasks,history,ds,0,30);
  const rate=r14.rate;
  const tr=progressTrend(name,tasks,history,ds);
  const susp=suspiciousFlags(name,tasks,history);
  const monthDays=Object.keys(schedule).filter(d=>d.startsWith("2026-06"));
  const monthHours=monthDays.reduce((a,d)=>{const s=(schedule[d]||[]).find(x=>x.name===name);return a+(s&&s.end?hmm(s.end)/60:0);},0);
  const weekHours=rangeDays(ds,7).reduce((a,d)=>{const s=(schedule[d]||[]).find(x=>x.name===name);return a+(s&&s.end?hmm(s.end)/60:0);},0);
  const recs=genRecs(name,tasks,history,schedule,cards,profiles,ds);
  return(<>
    <div className="sec">
      <div className="cab-hero">
        <div style={{display:"flex",justifyContent:"space-between",alignItems:"flex-start"}}>
          <div><div className="cab-name">{name}</div><div className="cab-role">{ROLES[profile.role]?.label||profile.role}</div></div>
          <span className="sb" style={{background:ss?.bg,color:ss?.color}}>{ss?.label}</span>
        </div>
        {myShift&&<div className="mono" style={{fontSize:12,color:"var(--mt)",marginTop:8}}>{myShift.start}{myShift.end?` · ${myShift.end}ч`:""}{myShift.report?" · ★отчёт":""}</div>}
        {activeCards.length>0&&<div style={{marginTop:10,display:"flex",gap:6}}>{activeCards.map(c=><span key={c.id} style={{fontSize:11,fontWeight:700,padding:"3px 10px",borderRadius:10,background:c.type==="yellow"?"rgba(232,160,48,.2)":c.type==="orange"?"rgba(201,125,60,.2)":"rgba(158,63,43,.2)",color:c.type==="yellow"?"var(--am)":c.type==="orange"?"var(--cu)":"#e07a60"}}>{c.type==="yellow"?"🟡":c.type==="orange"?"🟠":"🔴"} Карточка</span>)}</div>}
      </div>
      <div style={{display:"flex",gap:4,marginBottom:4}}>
        {["overview","tasks","stats","recs","cards",...(isOwnCabinet?["log","leave"]:[])].map(s=>{
          const myPendingLeaves=isOwnCabinet&&s==="leave"?(leaveRequests||[]).filter(r=>r.name===name&&r.status==="pending").length:0;
          return(<button key={s} className={`tab${subtab===s?" on":""}`} onClick={()=>setSubtab(s)} style={{flex:1,textAlign:"center",position:"relative"}}>
            {s==="overview"?"Обзор":s==="tasks"?"Задачи":s==="stats"?"Цифры":s==="recs"?"Советы":s==="cards"?"Карты":s==="log"?"Журнал":"Отпуск"}
            {myPendingLeaves>0&&<span style={{position:"absolute",top:2,right:4,background:"var(--am)",color:"#fff",fontSize:9,fontWeight:700,borderRadius:8,minWidth:14,height:14,display:"inline-flex",alignItems:"center",justifyContent:"center",padding:"0 3px"}}>{myPendingLeaves}</span>}
          </button>);})}
      </div>
    </div>
    {subtab==="overview"&&<div className="sec">
      {susp.length>0&&!isOwnCabinet&&<div className="alert danger"><AlertTriangle size={16} style={{flexShrink:0,marginTop:1}}/><span>Нереалистичное закрытие задач ({susp.length}). Проверь поведение сотрудника.</span></div>}
      <div className="grid2">
        <div className="stat-c"><div className="stat-n">{rate!==null?`${Math.round(rate*100)}%`:"—"}</div><div className="stat-l">Задачи (14 дн.)</div>{tr&&<div className="stat-s" style={{color:tr.delta>=0?"#8bc47a":"#e07a60"}}>{tr.delta>=0?"↑":"↓"} {Math.abs(Math.round(tr.delta*100))}пп к прошлым 15 дн.</div>}</div>
        <div className="stat-c"><div className="stat-n">{Math.round(weekHours)}ч</div><div className="stat-l">Часов за неделю</div></div>
      </div>
      {!isOwnCabinet&&onIssueCard&&<button className="btn btn-p" onClick={()=>setCardModal&&setCardModal({_card:true,targetName:name})} style={{marginBottom:8}}><Award size={15}/>Выдать карточку</button>}
      {!isOwnCabinet&&onUpdateProfile&&<><div className="sec-lbl" style={{margin:"10px 0 8px"}}>Роль</div><div className="chip-row">{Object.entries(ROLES).map(([id,{label}])=><button key={id} className={`chip${profile.role===id?" on":""}`} onClick={()=>onUpdateProfile({...profile,role:id,perms:ROLES[id].perms})}>{label}</button>)}</div></>}
      {!isOwnCabinet&&onAddOverride&&<><div className="sec-lbl" style={{margin:"12px 0 8px"}}>Статус</div><div className="chip-row">{["sick","vacation","business_trip"].map(s=><button key={s} className="chip" onClick={()=>onAddOverride({name,status:s,from:ds,until:""})}>{SHIFT_STATUSES[s]?.label}</button>)}</div></>}
      {isOwnCabinet&&onChangePassword&&<PasswordChanger onChange={onChangePassword}/>}
      {isOwnCabinet&&onLogout&&<button className="btn btn-d" onClick={onLogout} style={{marginTop:12}}>Выйти из аккаунта</button>}
    </div>}
    {subtab==="tasks"&&(()=>{
      const personal=tasks.filter(t=>t.assignedTo===name||t.assignee===name).sort((a,b)=>dueLabel(a,ds).dueDate.localeCompare(dueLabel(b,ds).dueDate));
      const mentioned=personal.filter(t=>t.assignedTo===name);
      const responsible=personal.filter(t=>t.assignedTo!==name);
      return(<div className="sec">
        <div className="info-box" style={{fontSize:12}}>Все задачи {name} со сроками: персональные упоминания (@) и задачи, закреплённые за тобой как исполнителем.</div>
        {mentioned.length>0&&<><div className="sec-lbl" style={{margin:"4px 0 8px"}}><AtSign size={12}/>Упоминания ({mentioned.length})</div>
          {mentioned.map(t=><DueRow key={t.id} task={t} history={history} ds={ds} onToggle={isOwnCabinet&&dueLabel(t,ds).dueDate===ds?onToggle:null}/>)}</>}
        {responsible.length>0&&<><div className="sec-lbl" style={{margin:"12px 0 8px"}}><User size={12}/>Закреплено за тобой ({responsible.length})</div>
          {responsible.map(t=><DueRow key={t.id} task={t} history={history} ds={ds} onToggle={isOwnCabinet&&dueLabel(t,ds).dueDate===ds?onToggle:null}/>)}</>}
        {personal.length===0&&<div className="empty">Персональных задач нет</div>}
      </div>);
    })()}
    {subtab==="stats"&&<div className="sec">
      <div className="grid2">
        <div className="stat-c"><div className="stat-n">{Math.round(monthHours)}ч</div><div className="stat-l">Часов за июнь</div><div className="stat-s">норма {hourNorm(name).min}–{hourNorm(name).max}ч</div></div>
        <div className="stat-c"><div className="stat-n">{Math.round(weekHours)}ч</div><div className="stat-l">За неделю</div></div>
        <div className="stat-c"><div className="stat-n">{r30.rate!==null?`${Math.round(r30.rate*100)}%`:"—"}</div><div className="stat-l">Задачи 30 дней</div><div className="stat-s">{r30.d}/{r30.t}</div></div>
        <div className="stat-c"><div className="stat-n">{r14.rate!==null?`${Math.round(r14.rate*100)}%`:"—"}</div><div className="stat-l">Задачи 14 дней</div></div>
      </div>
      {tr&&<div className="pr"><div className="pr-nm"><span>Динамика (15 vs 15 дней)</span><span style={{display:"flex",alignItems:"center",gap:4,color:tr.delta>=0?"#8bc47a":"#e07a60"}}>{tr.delta>0?<TrendingUp size={15}/>:tr.delta<0?<TrendingDown size={15}/>:<Minus size={15}/>}<span className="mono" style={{fontSize:13}}>{tr.delta>=0?"+":""}{Math.round(tr.delta*100)}пп</span></span></div>
        <div className="mono" style={{fontSize:12,color:"var(--mt)"}}>Прошлые 15 дн.: {Math.round(tr.prev*100)}% → Последние 15 дн.: {Math.round(tr.recent*100)}%</div></div>}
      {susp.length>0&&<><div className="sec-lbl" style={{margin:"10px 0 8px"}}>Проверка закрытия задач</div>{susp.slice(0,6).map((f,i)=><div className="alert warn" key={i} style={{marginBottom:6}}><AlertTriangle size={14} style={{flexShrink:0,marginTop:1}}/><span>{f.text}</span></div>)}</>}
    </div>}
    {subtab==="recs"&&<div className="sec">{recs.map((r,i)=><div key={i} className={`rec ${r.type}`}><span className="rec-icon">{r.icon}</span><span className="rec-text">{r.text}</span></div>)}</div>}
    {subtab==="cards"&&<div className="sec">
      {!isOwnCabinet&&onIssueCard&&<button className="btn btn-p" style={{marginBottom:12}} onClick={()=>setCardModal&&setCardModal({_card:true,targetName:name})}><Plus size={15}/>Выдать карточку</button>}
      {cards.filter(c=>c.name===name).length===0&&<div className="empty">Карточек нет — чистая история</div>}
      {[...cards].filter(c=>c.name===name&&(!c.isPrivate||!isOwnCabinet)).reverse().map(c=><div key={c.id} className={`dc ${c.type}`}>
        <div className="dc-head"><span className="dc-type">{c.type==="yellow"?"🟡 Жёлтая":c.type==="orange"?"🟠 Оранжевая":"🔴 Красная"} {c.active?"(активна)":"(снята)"}</span><span className="dc-date">{fmtDate(c.date)}</span></div>
        {c.comment&&<div className="dc-comment">{c.comment}</div>}{c.isPrivate&&<div style={{fontSize:11,color:"var(--mt)",marginTop:4,display:"flex",alignItems:"center",gap:3}}><Lock size={11}/>Конфиденциально</div>}</div>)}
    </div>}
    {subtab==="log"&&<LogsTab tasks={tasks} history={history} members={members||[name]} who={name} isManager={false} ds={ds} eventsLog={eventsLog||[]}/>}
    {subtab==="leave"&&<LeaveSection name={name} isOwnCabinet={isOwnCabinet} requests={(leaveRequests||[]).filter(r=>r.name===name)} onRequest={onLeaveRequest} ds={ds}/>}
  </>);
}

function PasswordChanger({onChange}){
  const[cur,setCur]=useState("");const[v,setV]=useState("");const[v2,setV2]=useState("");
  const[msg,setMsg]=useState("");const[loading,setLoading]=useState(false);
  const submit=async()=>{
    if(v.length<3){setMsg("Минимум 3 символа");return;}
    if(v!==v2){setMsg("Пароли не совпадают");return;}
    setLoading(true);setMsg("");
    try{
      await onChange(v,cur);
      setV("");setV2("");setCur("");setMsg("Пароль обновлён ✓");
    }catch(e){setMsg(e.message||"Ошибка");}
    finally{setLoading(false);}
  };
  return(<div style={{marginTop:14}}>
    <div className="sec-lbl" style={{marginBottom:8}}><Key size={12}/> Сменить пароль</div>
    <div className="field" style={{marginBottom:8}}><input type="password" value={cur} onChange={e=>{setCur(e.target.value);setMsg("");}} placeholder="Текущий пароль"/></div>
    <div className="field" style={{marginBottom:8}}><input type="password" value={v} onChange={e=>{setV(e.target.value);setMsg("");}} placeholder="Новый пароль"/></div>
    <div className="field" style={{marginBottom:8}}><input type="password" value={v2} onChange={e=>{setV2(e.target.value);setMsg("");}} placeholder="Повторите пароль"/></div>
    {msg&&<div style={{fontSize:12,color:msg.includes("✓")?"#8bc47a":"#e07a60",marginBottom:8}}>{msg}</div>}
    <button className="btn btn-p" onClick={submit} disabled={loading}><Key size={15}/>{loading?"Сохранение…":"Обновить пароль"}</button>
  </div>);
}

// --- Заявки на отгул/отпуск (сотрудник) ---
const LEAVE_TYPES=[
  {id:"vacation",  label:"Отпуск",       emoji:"🏖️"},
  {id:"sick",      label:"Больничный",   emoji:"🤒"},
  {id:"business_trip", label:"Командировка", emoji:"✈️"},
  {id:"day_off",   label:"Отгул",        emoji:"💤"},
];
const LEAVE_STATUS={
  pending:  {label:"На рассмотрении", color:"var(--am)"},
  approved: {label:"Одобрено",        color:"#8bc47a"},
  rejected: {label:"Отклонено",       color:"#e07a60"},
};

function LeaveSection({name,isOwnCabinet,requests,onRequest,ds}){
  const[showForm,setShowForm]=useState(false);
  const[type,setType]=useState(null);
  const[from,setFrom]=useState(ds);
  const[until,setUntil]=useState(ds);
  const[comment,setComment]=useState("");

  const submit=()=>{
    if(!type||!from) return;
    onRequest&&onRequest({name,type:type.id,from,until,comment});
    setShowForm(false);setType(null);setComment("");
  };

  const sorted=[...requests].sort((a,b)=>b.ts.localeCompare(a.ts));

  return(<div className="sec">
    {isOwnCabinet&&onRequest&&!showForm&&(
      <button className="btn btn-p" style={{marginBottom:12}} onClick={()=>setShowForm(true)}>
        <Plus size={15}/>Подать заявку
      </button>
    )}
    {showForm&&(
      <div style={{background:"var(--sf)",border:"1px solid var(--bd)",borderRadius:12,padding:14,marginBottom:12}}>
        <div className="sec-lbl" style={{marginBottom:8}}>Тип</div>
        <div className="chip-row" style={{marginBottom:12}}>
          {LEAVE_TYPES.map(t=><button key={t.id} className={`chip${type?.id===t.id?" on":""}`} onClick={()=>setType(t)}>{t.emoji} {t.label}</button>)}
        </div>
        <div style={{display:"flex",gap:8,marginBottom:12}}>
          <div style={{flex:1}}>
            <div className="sec-lbl" style={{marginBottom:4}}>С</div>
            <input type="date" value={from} onChange={e=>setFrom(e.target.value)}
              style={{width:"100%",padding:"7px 8px",borderRadius:8,border:"1px solid var(--bd)",background:"var(--bg)",color:"var(--pp)",fontFamily:"inherit",fontSize:13,boxSizing:"border-box"}}/>
          </div>
          <div style={{flex:1}}>
            <div className="sec-lbl" style={{marginBottom:4}}>По</div>
            <input type="date" value={until} onChange={e=>setUntil(e.target.value)}
              style={{width:"100%",padding:"7px 8px",borderRadius:8,border:"1px solid var(--bd)",background:"var(--bg)",color:"var(--pp)",fontFamily:"inherit",fontSize:13,boxSizing:"border-box"}}/>
          </div>
        </div>
        <div className="field" style={{marginBottom:10}}>
          <input value={comment} onChange={e=>setComment(e.target.value)} placeholder="Комментарий (необязательно)"/>
        </div>
        <div style={{display:"flex",gap:8}}>
          <button className="btn btn-p" onClick={submit} style={{flex:2}} disabled={!type}>Отправить</button>
          <button className="btn btn-g" onClick={()=>setShowForm(false)} style={{flex:1}}>Отмена</button>
        </div>
      </div>
    )}
    {sorted.length===0&&<div className="empty">Заявок нет</div>}
    {sorted.map(r=>{
      const lt=LEAVE_TYPES.find(t=>t.id===r.type)||{emoji:"📋",label:r.type};
      const st=LEAVE_STATUS[r.status]||LEAVE_STATUS.pending;
      return(<div key={r.id} style={{background:"var(--sf)",border:"1px solid var(--bd)",borderRadius:10,padding:"10px 12px",marginBottom:8}}>
        <div style={{display:"flex",alignItems:"center",gap:8,marginBottom:4}}>
          <span style={{fontSize:18}}>{lt.emoji}</span>
          <span style={{fontWeight:600,fontSize:14,flex:1}}>{lt.label}</span>
          <span style={{fontSize:11,fontWeight:700,color:st.color}}>{st.label}</span>
        </div>
        <div style={{fontSize:12,color:"var(--mt)"}}>
          {r.from}{r.until&&r.until!==r.from?` — ${r.until}`:""}
          {r.comment&&<span style={{marginLeft:8}}>· {r.comment}</span>}
        </div>
        {r.decidedBy&&<div style={{fontSize:11,color:"var(--mt)",marginTop:3}}>Решил: {r.decidedBy}</div>}
      </div>);
    })}
  </div>);
}

// --- Список заявок для менеджера ---
function LeaveManager({requests,onDecide,ds}){
  const pending=requests.filter(r=>r.status==="pending").sort((a,b)=>a.from.localeCompare(b.from));
  const decided=requests.filter(r=>r.status!=="pending").sort((a,b)=>b.ts.localeCompare(a.ts));
  if(requests.length===0) return <div className="sec"><div className="empty">Заявок нет</div></div>;
  return(<div className="sec">
    {pending.length>0&&<>
      <div className="sec-lbl" style={{marginBottom:10}}>На рассмотрении ({pending.length})</div>
      {pending.map(r=>{
        const lt=LEAVE_TYPES.find(t=>t.id===r.type)||{emoji:"📋",label:r.type};
        return(<div key={r.id} style={{background:"var(--sf)",border:"1px solid var(--am)",borderRadius:10,padding:"10px 12px",marginBottom:8}}>
          <div style={{display:"flex",alignItems:"center",gap:8,marginBottom:6}}>
            <span style={{fontSize:18}}>{lt.emoji}</span>
            <div style={{flex:1,minWidth:0}}>
              <div style={{fontWeight:600,fontSize:14}}>{r.name} · {lt.label}</div>
              <div style={{fontSize:12,color:"var(--mt)"}}>{r.from}{r.until&&r.until!==r.from?` — ${r.until}`:""}{r.comment&&` · ${r.comment}`}</div>
            </div>
          </div>
          <div style={{display:"flex",gap:6}}>
            <button className="btn btn-p" onClick={()=>onDecide&&onDecide(r.id,true)} style={{flex:1,padding:"8px"}}>✓ Одобрить</button>
            <button className="btn btn-d" onClick={()=>onDecide&&onDecide(r.id,false)} style={{flex:1,padding:"8px"}}>✗ Отклонить</button>
          </div>
        </div>);
      })}
    </>}
    {decided.length>0&&<>
      <div className="sec-lbl" style={{marginBottom:10,marginTop:decided.length?12:0,opacity:.7}}>Рассмотренные</div>
      {decided.slice(0,10).map(r=>{
        const lt=LEAVE_TYPES.find(t=>t.id===r.type)||{emoji:"📋",label:r.type};
        const st=LEAVE_STATUS[r.status];
        return(<div key={r.id} style={{background:"var(--sf)",border:"1px solid var(--bd)",borderRadius:10,padding:"9px 12px",marginBottom:6,opacity:.7}}>
          <div style={{display:"flex",alignItems:"center",gap:8}}>
            <span>{lt.emoji}</span>
            <div style={{flex:1,fontSize:13}}>{r.name} · {lt.label} · {r.from}{r.until&&r.until!==r.from?` — ${r.until}`:""}</div>
            <span style={{fontSize:11,fontWeight:700,color:st?.color}}>{st?.label}</span>
          </div>
        </div>);
      })}
    </>}
  </div>);
}
