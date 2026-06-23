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

export function PersonalCabinet({name,isOwnCabinet,tasks,history,schedule,cards,profiles,ds,now,statusOverrides,members,eventsLog,onIssueCard,onUpdateProfile,onAddOverride,setCardModal,onToggle,onChangePassword}){
  const[subtab,setSubtab]=useState("overview");
  if(name==="manager"||name==="developer")return (
    <div className="sec">
      <div className="info-box">Кабинет {accountLabel(name)} — используй вкладки выше для управления командой.</div>
      {isOwnCabinet&&onChangePassword&&<PasswordChanger onChange={onChangePassword}/>}
    </div>);
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
        {["overview","tasks","stats","recs","cards",...(isOwnCabinet?["log"]:[])].map(s=><button key={s} className={`tab${subtab===s?" on":""}`} onClick={()=>setSubtab(s)} style={{flex:1,textAlign:"center"}}>{s==="overview"?"Обзор":s==="tasks"?"Задачи":s==="stats"?"Цифры":s==="recs"?"Советы":s==="cards"?"Карточки":"Журнал"}</button>)}
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
