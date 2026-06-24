// Вкладка «Команда» — состав, статистика, карточки, журнал
import { useState } from 'react';
import { Users, Plus, Trash2, Key, BarChart2, TrendingUp, TrendingDown, Minus, Award, Eye, EyeOff, Lock, LockOpen, AlertTriangle } from 'lucide-react';
import { Avatar } from '../components/Avatar.jsx';
import { ROLES, ALL_PERMS } from '../constants/roles.js';
import { SHIFT_STATUSES } from '../constants/shifts.js';
import { accountLabel, canViewPasswords } from '../utils/authUtils.js';
import { rateFor, progressTrend, suspiciousFlags } from '../utils/statsUtils.js';
import { getActiveCards } from '../utils/cardUtils.js';
import { hmm, rangeDays, fmtDate } from '../utils/dateUtils.js';
import { todayStr } from '../utils/taskUtils.js';
import { LogsTab } from './LogsTab.jsx';

export function TeamHubTab({canTeam,canStats,isManager,who,eventsLog,tasks,history,ds,schedule,cards,onView,onRevoke,setCardModal,...rest}){
  const subs=[...(canTeam?[["roster","Состав"]]:[]),...(canStats?[["stats","Статистика"]]:[]),...(isManager?[["cards","Карточки"]]:[]),["logs","Журнал"]];
  const[sub,setSub]=useState(subs[0]?.[0]||"roster");
  return(<>
    <div className="sec" style={{paddingBottom:0}}>
      <div style={{display:"flex",gap:4,marginBottom:4}}>
        {subs.map(([id,label])=><button key={id} className={`tab${sub===id?" on":""}`} onClick={()=>setSub(id)} style={{flex:1,textAlign:"center"}}>{label}</button>)}
      </div>
    </div>
    {sub==="roster"&&canTeam&&<TeamTab profiles={rest.profiles} members={rest.members} statusOverrides={rest.statusOverrides}
      account={rest.account} isManager={isManager} isDeveloper={rest.isDeveloper} auth={rest.auth} acl={rest.acl}
      onAddMember={rest.onAddMember} onRemoveMember={rest.onRemoveMember}
      onResetPassword={rest.onResetPassword} onToggleAclPwd={rest.onToggleAclPwd}
      onUpdateProfile={rest.onUpdateProfile} onAddOverride={rest.onAddOverride} onRemoveOverride={rest.onRemoveOverride}/>}
    {sub==="stats"&&canStats&&<StatsTab tasks={tasks} history={history} ds={ds} members={rest.members} schedule={schedule} cards={cards} onView={onView}/>}
    {sub==="cards"&&isManager&&<CardsTab cards={cards} members={rest.members} setCardModal={setCardModal} onRevoke={onRevoke}/>}
    {sub==="logs"&&<LogsTab tasks={tasks} history={history} members={rest.members} who={who} isManager={isManager} ds={ds} eventsLog={eventsLog}/>}
  </>);
}

function TeamTab({profiles,members,statusOverrides,account,isDeveloper,auth,acl,onResetPassword,onToggleAclPwd,onUpdateProfile,onAddOverride,onRemoveOverride,onAddMember,onRemoveMember}){
  const[editing,setEditing]=useState(null);
  const[newName,setNewName]=useState("");
  const seePwd=canViewPasswords(account,acl||{});
  const ACCOUNTS=[...members,"manager","developer"];
  const addNew=()=>{if(newName.trim()){onAddMember(newName);setNewName("");}};
  return(<div className="sec">
    <div className="sec-head"><span className="sec-lbl"><Users size={12}/>Состав команды</span><span className="sec-cnt">{members.length}</span></div>
    {onAddMember&&<div style={{display:"flex",gap:8,marginBottom:14}}>
      <input value={newName} onChange={e=>setNewName(e.target.value)} onKeyDown={e=>e.key==="Enter"&&addNew()} placeholder="Имя нового сотрудника…"
        style={{flex:1,background:"var(--bg)",border:"1px solid var(--bd)",borderRadius:8,padding:"10px 12px",color:"var(--pp)",fontSize:14,fontFamily:"inherit"}}/>
      <button className="btn btn-p" style={{width:"auto",padding:"0 16px",margin:0}} onClick={addNew}><Plus size={16}/></button>
    </div>}
    {members.map(name=>{const p=profiles.find(x=>x.name===name)||{name,role:"barman",perms:ROLES.barman.perms};const ov=statusOverrides.find(o=>o.name===name);const isEditing=editing===name;
      return(<div className="pr" key={name}>
        <div className="pr-nm"><span>{name}</span>
          <div style={{display:"flex",gap:6,alignItems:"center"}}>
            {ov&&<span style={{fontSize:11,padding:"2px 7px",borderRadius:8,background:"rgba(201,125,60,.15)",color:"var(--cu)"}}>{SHIFT_STATUSES[ov.status]?.label}</span>}
            <span style={{fontSize:11,color:"var(--mt)"}}>{ROLES[p.role]?.label}</span>
            <button onClick={()=>setEditing(isEditing?null:name)} style={{background:"transparent",border:"1px solid var(--bd)",borderRadius:6,color:"var(--mt)",padding:"3px 8px",fontSize:11,cursor:"pointer"}}>{isEditing?"готово":"изм."}</button>
          </div></div>
        {isEditing&&<div style={{marginTop:8}}>
          <div style={{fontSize:11,color:"var(--mt)",marginBottom:6,textTransform:"uppercase"}}>Роль</div>
          <div className="chip-row" style={{marginBottom:10}}>{Object.entries(ROLES).map(([id,{label}])=><button key={id} className={`chip${p.role===id?" on":""}`} onClick={()=>onUpdateProfile({...p,role:id,perms:ROLES[id].perms})}>{label}</button>)}</div>
          <div style={{fontSize:11,color:"var(--mt)",marginBottom:6,textTransform:"uppercase"}}>Статус</div>
          <div className="chip-row" style={{marginBottom:10}}>{["sick","vacation","business_trip"].map(s=><button key={s} className={`chip${ov?.status===s?" on":""}`} onClick={()=>onAddOverride({name,status:s,from:todayStr(),until:""})}>{SHIFT_STATUSES[s]?.label}</button>)}{ov&&<button className="chip" onClick={()=>onRemoveOverride(name)}>Сбросить</button>}</div>
          <div style={{fontSize:11,color:"var(--mt)",marginBottom:6,textTransform:"uppercase"}}>Разрешения</div>
          {ALL_PERMS.map(perm=><label key={perm.id} style={{display:"flex",alignItems:"center",gap:8,padding:"5px 0",fontSize:13,cursor:"pointer"}}>
            <input type="checkbox" checked={p.perms.includes(perm.id)||p.perms.includes("*")} onChange={e=>{const np=e.target.checked?[...p.perms,perm.id]:p.perms.filter(x=>x!==perm.id);onUpdateProfile({...p,perms:np});}} style={{width:16,height:16,accentColor:"var(--hp)"}}/>
            <span style={{color:"var(--pp)"}}>{perm.label}</span></label>)}
          {onRemoveMember&&<button onClick={()=>{if(confirm(`Удалить сотрудника ${name} из команды?`))onRemoveMember(name);}} style={{marginTop:12,width:"100%",background:"transparent",border:"1px solid rgba(176,74,54,.4)",color:"#e07a60",borderRadius:8,padding:"9px",fontSize:13,cursor:"pointer",display:"flex",alignItems:"center",justifyContent:"center",gap:6}}><Trash2 size={14}/>Удалить из команды</button>}
        </div>}
      </div>);})}

    <div className="sec-head" style={{margin:"16px 0 9px"}}><span className="sec-lbl"><Key size={12}/>Пароли и доступы</span></div>
    {isDeveloper&&<label style={{display:"flex",alignItems:"center",gap:8,padding:"8px 0",fontSize:13,cursor:"pointer"}}>
      <input type="checkbox" checked={!!(acl&&acl.managerCanViewPasswords)} onChange={e=>onToggleAclPwd(e.target.checked)} style={{width:16,height:16,accentColor:"var(--hp)"}}/>
      <span>Управляющий может видеть пароли</span></label>}
    {!seePwd&&<div className="info-box" style={{fontSize:12}}>У тебя нет права видеть пароли. Это право выдаёт разработчик.</div>}
    {seePwd&&<>
      <div className="info-box" style={{fontSize:12}}>Пароли хранятся bcrypt-хешами на сервере — просмотр невозможен. Можно только сбросить (сотрудник задаст новый при следующем входе).</div>
      {ACCOUNTS.map(a=><PwdRow key={a} account={a} hasPassword={!!(auth&&auth[a])} onReset={()=>onResetPassword(a)}/>)}
    </>}
  </div>);
}

function StatsTab({tasks,history,ds,members,schedule,cards,onView}){
  const[range,setRange]=useState(30);
  const stats=members.map(name=>{
    const r=rateFor(name,tasks,history,ds,0,range);
    const hours=rangeDays(ds,range).reduce((a,d)=>{const s=(schedule[d]||[]).find(x=>x.name===name);return a+(s&&s.end?hmm(s.end)/60:0);},0);
    const ac=getActiveCards(cards,name);
    const tr=progressTrend(name,tasks,history,ds);
    const susp=suspiciousFlags(name,tasks,history);
    return{name,tot:r.t,don:r.d,pct:r.rate!==null?Math.round(r.rate*100):0,hours:Math.round(hours),ac,tr,susp:susp.length};
  });
  return(<div className="sec">
    <div className="sec-head"><span className="sec-lbl"><BarChart2 size={12}/>Команда</span>
      <select value={range} onChange={e=>setRange(Number(e.target.value))} style={{background:"var(--sf)",border:"1px solid var(--bd)",color:"var(--pp)",borderRadius:6,padding:"4px 8px",fontSize:12}}>
        <option value={7}>7 дней</option><option value={14}>14 дней</option><option value={30}>30 дней</option></select>
    </div>
    <div className="info-box" style={{fontSize:12}}>Статистика за {range} дней, обновляется автоматически. Стрелка = тренд (последние 15 vs предыдущие 15 дней). 🔍 — замечено нереалистичное закрытие.</div>
    {stats.sort((a,b)=>b.pct-a.pct).map(m=><div className="pr" key={m.name} onClick={()=>onView&&onView(m.name)} style={{cursor:onView?"pointer":"default"}}>
      <div style={{display:"flex",alignItems:"center",gap:10,marginBottom:8}}>
        <Avatar name={m.name} size={34}/>
        <div style={{flex:1,minWidth:0}}>
          <div style={{display:"flex",justifyContent:"space-between",alignItems:"center"}}>
            <span style={{fontWeight:600,fontSize:14,display:"flex",alignItems:"center",gap:5}}>{m.name}
              {m.ac.some(c=>c.type==="red")&&<span>🔴</span>}{!m.ac.some(c=>c.type==="red")&&m.ac.some(c=>c.type==="orange")&&<span>🟠</span>}{!m.ac.some(c=>c.type==="orange")&&m.ac.some(c=>c.type==="yellow")&&<span>🟡</span>}
              {m.susp>0&&<AlertTriangle size={12} color="#e07a60" title="нереалистичное закрытие"/>}
            </span>
            <span style={{display:"flex",gap:8,alignItems:"center"}}>
              {m.tr&&<span style={{color:m.tr.delta>=0?"#8bc47a":"#e07a60",display:"flex",alignItems:"center"}}>{m.tr.delta>0?<TrendingUp size={13}/>:m.tr.delta<0?<TrendingDown size={13}/>:<Minus size={13}/>}</span>}
              <span className="mono" style={{fontSize:11,color:"var(--mt)"}}>{m.hours}ч</span>
              <span style={{fontSize:14,fontWeight:700,fontFamily:'"Fraunces",serif',color:m.pct>=80?"#8bc47a":m.pct>=50?"var(--am)":"#e07a60"}}>{m.pct}%</span>
            </span>
          </div>
          <div className="bar-bg" style={{marginTop:5}}><div className="bar-fill" style={{width:`${m.pct}%`,background:m.pct>=80?"#8bc47a":m.pct>=50?"var(--am)":"#e07a60"}}/></div>
        </div>
      </div>
    </div>)}
  </div>);
}

function CardsTab({cards,members,setCardModal,onRevoke}){
  const[target,setTarget]=useState(members[0]);
  return(<div className="sec">
    <div className="sec-head"><span className="sec-lbl"><Award size={12}/>Карточки</span></div>
    <div className="info-box">🟡 × 2 = 🟠 · 🟠 + 🟡 (в течение 3 мес) = 🔴 Красная</div>
    <div className="field"><label>Сотрудник</label><select value={target} onChange={e=>setTarget(e.target.value)}>{members.map(m=><option key={m} value={m}>{m}</option>)}</select></div>
    <button className="btn btn-p" onClick={()=>setCardModal({_card:true,targetName:target})} style={{marginBottom:16}}><Plus size={15}/>Выдать карточку — {target}</button>
    <div className="sec-lbl" style={{marginBottom:8}}>История</div>
    {cards.length===0&&<div className="empty">Карточек ещё не выдавалось</div>}
    {[...cards].reverse().map(c=><div key={c.id} className={`dc ${c.type}`}>
      <div className="dc-head"><span className="dc-type">{c.type==="yellow"?"🟡":c.type==="orange"?"🟠":"🔴"} {c.name} · {c.active?"активна":"снята"}</span>
        <div style={{display:"flex",gap:8,alignItems:"center"}}><span className="dc-date">{fmtDate(c.date)}</span>{c.active&&<button onClick={()=>onRevoke(c.id)} style={{background:"transparent",border:"none",color:"var(--mt)",cursor:"pointer",fontSize:12}}>снять</button>}</div></div>
      {c.comment&&<div className="dc-comment">{c.comment}</div>}{c.notDoneTasks?.length>0&&<div className="dc-comment" style={{marginTop:4,fontSize:12,opacity:.8}}><span style={{opacity:.7}}>Не выполнено в тот день: </span>{c.notDoneTasks.join(', ')}</div>}{c.isPrivate&&<div style={{fontSize:11,color:"var(--mt)",marginTop:4,display:"flex",alignItems:"center",gap:3}}><Lock size={11}/>Конфиденциально</div>}</div>)}
  </div>);
}

// PwdRow: пароли больше не передаются на клиент — только флаг hasPassword
function PwdRow({account,hasPassword,onReset}){
  return(<div className="pr" style={{display:"flex",justifyContent:"space-between",alignItems:"center"}}>
    <div><div style={{fontWeight:600,fontSize:14}}>{accountLabel(account)}</div>
      <div className="mono" style={{fontSize:13,color:hasPassword?"var(--hp)":"var(--mt)",marginTop:3,display:'flex',alignItems:'center',gap:4}}>{hasPassword?<><Lock size={11}/>пароль задан</>:<><LockOpen size={11}/>пароль не задан</>}</div></div>
    <div style={{display:"flex",gap:6,alignItems:"center"}}>
      {hasPassword&&<button onClick={onReset} style={{background:"transparent",border:"1px solid rgba(158,63,43,.35)",color:"#e07a60",borderRadius:6,padding:"4px 9px",fontSize:11,cursor:"pointer"}}>сбросить</button>}
    </div>
  </div>);
}
