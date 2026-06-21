import { AdminTab } from "./AdminTab.jsx";

import { useState, useEffect, useLayoutEffect, useRef, useMemo } from "react";
import { CheckCircle, Plus, X, BarChart2, Clock, User, ArrowRight, Trash2, Pencil,
  Beer, Award, FileText, Users, Lock, Bell, AtSign, Inbox, Key, Shield, Eye, EyeOff, GripVertical, Archive, RotateCcw, ChevronDown, ChevronUp, ChevronLeft, ChevronRight, CalendarDays,
  AlertTriangle, TrendingUp, TrendingDown, Minus, Send, Activity, Sun, Moon, MonitorSmartphone } from "lucide-react";
import './styles/app.css';
import { ROLES, ALL_PERMS } from './constants/roles.js';
import { SHIFT_STATUSES } from './constants/shifts.js';
import { DAYS_RU, MONTHS_RU, REPEAT_OPTS, DEFAULT_MEMBERS, DEFAULT_PROFILES } from './constants/locale.js';
import { EMBEDDED_SCHEDULE, EMBEDDED_EVENTS, HOLIDAYS } from './constants/schedule.js';
import { HOUR_NORMS, hourNorm } from './constants/staff.js';
import { SEED_TASKS, defaultTasks, mergeSeeds } from './constants/seeds.js';
import { uid, nowISO, hmm, fmtDate, addDays, rangeDays } from './utils/dateUtils.js';
import { isToday, isDone, todayStr, getTodayTasks, doneInfo, nextDue, dueLabel, buildDaySummary } from './utils/taskUtils.js';
import { hasPerm } from './utils/authUtils.js';
import { PUSH_GATE_MIN, afterPushGate, staffNorm, staffCheck, getShiftStatus } from './utils/staffUtils.js';
import { getActiveCards, processCard } from './utils/cardUtils.js';
import { rateFor, progressTrend, suspiciousFlags, genRecs } from './utils/statsUtils.js';
import { applyTheme, THEME_KEY, systemPrefersLight } from './utils/theme.js';
import { ld, sv, pingServer, tgBind } from './services/api.js';
import { usePersist } from './hooks/usePersist.js';

const DOW_FULL=["Воскресенье","Понедельник","Вторник","Среда","Четверг","Пятница","Суббота"];
const accountLabel=acc=>acc==="manager"?"Управляющий":acc==="developer"?"Разработчик":acc;
// SERVER: пароли в проде хранятся хешированными (bcrypt) на сервере, проверка серверная, сессия по токену.
function canManageAccounts(acc){return acc==="manager"||acc==="developer";}
function canViewPasswords(acc,acl){return acc==="developer"||(acc==="manager"&&!!acl.managerCanViewPasswords);}

// Telegram Mini App
const TG=(typeof window!=="undefined"&&window.Telegram)?window.Telegram.WebApp:null;
function tgUserId(){try{return TG?.initDataUnsafe?.user?.id||null;}catch{return null;}}

// Маскот «Работяга» — контурный скетч по фото (пучок-хвостик + широкая улыбка со щербинкой)
function Mascot({size=24,color="var(--cu)"}){
  return(
    <svg width={size} height={size} viewBox="0 0 64 64" fill="none" stroke={color} strokeWidth="2.4" strokeLinecap="round" strokeLinejoin="round">
      <circle cx="32" cy="7" r="3.4"/>
      <path d="M18 28 C18 15 24 9 32 9 C40 9 46 15 46 28"/>
      <path d="M18 27 C16 38 20 47 32 49 C44 47 48 38 46 27"/>
      <path d="M28 35 Q32 38 36 35"/>
      <circle cx="27" cy="32" r="1.5"/>
      <circle cx="37" cy="32" r="1.5"/>
    </svg>
  );
}

export default function App(){
  const[who,setWho]=useState(null);
  const[picking,setPicking]=useState(false);
  const[tab,setTab]=useState("today");
  const[tasks,setTasks]=useState([]);
  const[history,setHistory]=useState({});
  const[profiles,setProfiles]=useState(DEFAULT_PROFILES);
  const[cards,setCards]=useState([]);
  const[statusOverrides,setStatusOverrides]=useState([]);
  const[revenue,setRevenue]=useState({});
  const[handovers,setHandovers]=useState({});
  const[eventsLog,setEventsLog]=useState([]);
  const[inboxSeen,setInboxSeen]=useState({});
  const[shiftClosed,setShiftClosed]=useState({});
  const[closeNotified,setCloseNotified]=useState({});
  const[auth,setAuth]=useState({});
  const[taskOrder,setTaskOrder]=useState([]);
  const[members,setMembers]=useState(DEFAULT_MEMBERS);
  const[schedule,setSchedule]=useState(EMBEDDED_SCHEDULE);
  const[goList,setGoList]=useState([]);
  const[serverOk,setServerOk]=useState(null);
  const events=EMBEDDED_EVENTS;
  const[acl,setAcl]=useState({});
  const[authPending,setAuthPending]=useState(null);
  const[toast,setToast]=useState(null);
  const[modal,setModal]=useState(null);
  const[viewingEmployee,setViewingEmployee]=useState(null);
  const[viewingDay,setViewingDay]=useState(null);
  const[loading,setLoading]=useState(true);
  const[themePref,setThemePref]=useState(()=>{try{return localStorage.getItem(THEME_KEY)||"auto";}catch{return "auto";}});

  const ds=todayStr(), now=new Date(), dateObj=new Date(ds);
  const dateLabel=`${DOW_FULL[dateObj.getDay()]}, ${dateObj.getDate()} ${MONTHS_RU[dateObj.getMonth()]}`;

  useEffect(()=>{if(TG){try{TG.ready();TG.expand();}catch{}}},[]);
  useEffect(()=>{
    applyTheme(themePref);
    try{localStorage.setItem(THEME_KEY,themePref);}catch{}
    if(themePref!=="auto")return;
    // в режиме "авто" следим за сменой темы устройства вживую, без перезагрузки страницы
    let mq;
    try{mq=window.matchMedia("(prefers-color-scheme: light)");}catch{return;}
    const onChange=()=>applyTheme("auto");
    mq.addEventListener?.("change",onChange);
    return()=>mq.removeEventListener?.("change",onChange);
  },[themePref]);
  function cycleTheme(){setThemePref(p=>p==="auto"?"light":p==="light"?"dark":"auto");}
  useEffect(()=>{let on=true;const tick=async()=>{const ok=await pingServer();if(on)setServerOk(ok);};tick();const id=setInterval(tick,15000);return()=>{on=false;clearInterval(id);};},[]);
  useEffect(()=>{(async()=>{
    const[t,hist,profs,cds,so,rev,ho,ev,savedWho,seen,sc,cn,au,ac,tord,mem,sch,gl]=await Promise.all([
      ld("tasks:v4",defaultTasks()),ld("done:hist:v2",{}),ld("profiles:v1",DEFAULT_PROFILES),
      ld("cards:v1",[]),ld("status_overrides:v1",[]),ld("revenue:v1",{}),
      ld("handovers:v1",{}),ld("events_log:v1",[]),ld("currentUser",null),ld("inbox_seen:v1",{}),ld("shift_closed:v1",{}),ld("close_notified:v1",{}),ld("auth:v1",{}),ld("acl:v1",{}),ld("task_order:v1",[]),ld("members:v1",DEFAULT_MEMBERS),ld("schedule:v1",EMBEDDED_SCHEDULE),ld("golist:v1",[]),
    ]);
    setTasks(mergeSeeds(t));setHistory(hist);setProfiles(profs);setCards(cds);setStatusOverrides(so);
    setRevenue(rev);setHandovers(ho);setEventsLog(ev);setInboxSeen(seen);setShiftClosed(sc);setCloseNotified(cn);setAuth(au);setAcl(ac);setTaskOrder(tord);setMembers(mem);setSchedule(sch);setGoList(gl);
    if(savedWho)setWho(savedWho);else setPicking(true);
    setLoading(false);
  })();},[]);
  const ready=!loading;
  usePersist("tasks:v4",tasks,ready);
  usePersist("done:hist:v2",history,ready);
  usePersist("profiles:v1",profiles,ready);
  usePersist("cards:v1",cards,ready);
  usePersist("status_overrides:v1",statusOverrides,ready);
  usePersist("revenue:v1",revenue,ready);
  usePersist("handovers:v1",handovers,ready);
  usePersist("events_log:v1",eventsLog,ready);
  usePersist("inbox_seen:v1",inboxSeen,ready);
  usePersist("shift_closed:v1",shiftClosed,ready);
  usePersist("close_notified:v1",closeNotified,ready);
  usePersist("auth:v1",auth,ready);
  usePersist("acl:v1",acl,ready);
  usePersist("task_order:v1",taskOrder,ready);
  usePersist("members:v1",members,ready);
  usePersist("schedule:v1",schedule,ready);
  usePersist("golist:v1",goList,ready);

  const isManager=who==="manager"||who==="developer";
  const isDeveloper=who==="developer";
  const myStatus=who&&!isManager?getShiftStatus(who,ds,schedule,statusOverrides,now):null;
  const todayShifts=schedule[ds]||[];
  const myShift=who&&!isManager?todayShifts.find(s=>s.name===who):null;
  const imOnShift=["on_shift","today_shift","worked"].includes(myStatus);
  const imReport=myShift?.report;

  const logEvent=(type,detail)=>setEventsLog(prev=>[{id:uid(),ts:nowISO(),who:accountLabel(who),type,detail},...prev].slice(0,500));

  const todayTasks=useMemo(()=>{
    if(!who)return[];
    return tasks.filter(t=>{
      if(t.archived)return false;
      if(!isToday(t,ds))return false;
      if(isManager)return true;
      if(t.assignedTo===who)return true;
      if(t.isReport&&!imReport)return false;
      if(t.assignee&&t.assignee!=="смена")return t.assignee===who;
      return imOnShift;
    });
  },[tasks,who,ds,imOnShift,imReport,isManager]);

  const doneToday=useMemo(()=>{const m={};tasks.forEach(t=>{m[t.id]=isDone(history[`${t.id}::${ds}`]);});return m;},[history,tasks,ds]);
  const myAssigned=useMemo(()=>{
    if(!who||isManager)return[];
    return tasks.filter(t=>!t.archived&&t.assignedTo===who&&isToday(t,ds));
  },[tasks,who,ds,isManager]);
  const myAssignedOpen=myAssigned.filter(t=>!doneToday[t.id]).length;
  const inboxItems=useMemo(()=>{
    if(!who||isManager)return[];
    return tasks.filter(t=>!t.archived&&t.assignedTo===who).sort((a,b)=>(b.assignedTs||"").localeCompare(a.assignedTs||""));
  },[tasks,who,isManager]);
  const inboxUnread=inboxItems.filter(t=>t.assignedTs&&(!inboxSeen[who]||t.assignedTs>inboxSeen[who])).length;
  const openInbox=()=>{setInboxSeen(prev=>({...prev,[who]:nowISO()}));setModal({_inbox:true});};
  const doneTodayCount=todayTasks.filter(t=>doneToday[t.id]).length;
  const pct=todayTasks.length?Math.round(doneTodayCount/todayTasks.length*100):0;

  // регулярные задачи дня (для логики закрытия смены) — глобально, не по пользователю
  const dayRegular=useMemo(()=>tasks.filter(t=>!t.archived&&t.kind!=="irregular"&&isToday(t,ds)),[tasks,ds]);
  const dayClosed=dayRegular.length>0&&dayRegular.every(t=>isDone(history[`${t.id}::${ds}`]));
  // нерегулярные задачи (бэклог «требует внимания»)
  const irregularTasks=useMemo(()=>tasks.filter(t=>!t.archived&&t.kind==="irregular"),[tasks]);
  const irregularDoneMap=useMemo(()=>{const m={};irregularTasks.forEach(t=>{m[t.id]=isDone(history[`${t.id}::irregular`]);});return m;},[history,irregularTasks]);
  // если зашли после 23:30, а смена уже закрыта и пуш ещё не отправлялся — показать попап один раз
  useEffect(()=>{
    if(loading||!who)return;
    if(dayClosed&&afterPushGate(now)&&!closeNotified[ds]){
      const summary=buildDaySummary(tasks,history,ds);
      setCloseNotified(prev=>({...prev,[ds]:true}));
      logEvent("shift_closed",`Смена закрыта · выполнено ${summary.done}/${summary.total}`);
      setToast("✅ Смена закрыта. Пуш отправлен управляющему и шеф-бармену (после 23:30).");
      setTimeout(()=>setToast(null),6000);
      setModal({_closing:true,summary,auto:true});
    }
  // eslint-disable-next-line
  },[loading,who,dayClosed]);

  const fireClosing=(snapHistory)=>{
    const summary=buildDaySummary(tasks,snapHistory,ds);
    setCloseNotified(prev=>({...prev,[ds]:true}));
    logEvent("shift_closed",`Смена закрыта · выполнено ${summary.done}/${summary.total}`);
    setToast("✅ Смена закрыта. Пуш отправлен управляющему и шеф-бармену (после 23:30).");
    setTimeout(()=>setToast(null),6000);
    setModal({_closing:true,summary,auto:true});
  };
  const openSummary=()=>{const summary=buildDaySummary(tasks,history,ds);setModal({_closing:true,summary,auto:false});};
  const carryOver=(notDoneTasks)=>{
    const tomorrow=addDays(ds,1);
    setTasks(prev=>{
      const adds=[];
      notDoneTasks.forEach(t=>{
        const title=`[Перенос] ${t.title}`;
        if(!prev.some(x=>x.title===title&&x.date===tomorrow))
          adds.push({id:uid(),title,kind:"regular",repeat:"once",date:tomorrow,time:t.time||"",assignee:t.assignee||"смена",assignedTo:t.assignedTo||null,notes:t.notes||"",isReport:false});
      });
      return adds.length?[...prev,...adds]:prev;
    });
    if(notDoneTasks.length)logEvent("handover",`перенос ${notDoneTasks.length} невыполненных на ${fmtDate(tomorrow)}`);
    setModal(null);
  };

  const toggle=(id,dateKey=ds)=>{
    const key=`${id}::${dateKey}`;
    const cur=isDone(history[key]);
    const next={...history,[key]:{done:!cur,ts:nowISO(),by:accountLabel(who)}};
    setHistory(next);sv("done:hist:v2",next);
    const t=tasks.find(x=>x.id===id);
    logEvent(cur?"task_undone":"task_done",(dateKey==="irregular"?"[нерегул.] ":"")+(t?.title||id));
    if(dateKey===ds){
      const reg=tasks.filter(x=>!x.archived&&x.kind!=="irregular"&&isToday(x,ds));
      const closed=reg.length>0&&reg.every(x=>isDone(next[`${x.id}::${ds}`]));
      if(!cur){
        if(closed&&!shiftClosed[ds])setShiftClosed(prev=>({...prev,[ds]:true}));
        // пуш + попап только после 23:30
        if(closed&&afterPushGate(now)&&!closeNotified[ds])fireClosing(next);
      }else if(shiftClosed[ds]&&!closed){
        setShiftClosed(prev=>{const n={...prev};delete n[ds];return n;});
      }
    }
  };
  const saveTask=t=>{
    setTasks(p=>{
      const existing=p.find(x=>x.id===t.id);
      let nt=t;
      if(t.assignedTo&&(!existing||existing.assignedTo!==t.assignedTo))
        nt={...t,assignedTs:nowISO(),assignedBy:accountLabel(who)};
      return p.some(x=>x.id===t.id)?p.map(x=>x.id===t.id?nt:x):[...p,nt];
    });
    logEvent(t.assignedTo?"assigned":"task_added",t.assignedTo?`@${t.assignedTo}: ${t.title}`:t.title);
    setModal(null);
  };
  const delTask=id=>{const t=tasks.find(x=>x.id===id);setTasks(p=>p.filter(x=>x.id!==id));logEvent("task_deleted",t?.title||id);setModal(null);};
  const archiveTask=(id,val=true)=>{const t=tasks.find(x=>x.id===id);setTasks(p=>p.map(x=>x.id===id?{...x,archived:val}:x));logEvent(val?"task_archived":"task_restored",t?.title||id);};
  const issueCard=(name,type,comment,isPrivate)=>{setCards(prev=>{const r=processCard(prev,name,type,comment,isPrivate,accountLabel(who));logEvent("card_issued",`${name}: ${r.finalType}${isPrivate?" (конфид.)":""}`);return r.cards;});};
  const addHandover=(forDate,text,createTask,taskTitle)=>{
    setHandovers(prev=>({...prev,[forDate]:[...(prev[forDate]||[]),{id:uid(),text,by:accountLabel(who),ts:nowISO()}]}));
    if(createTask&&taskTitle){const nt={id:uid(),title:`[Перенос] ${taskTitle}`,repeat:"once",date:forDate,time:"",assignee:"смена",notes:text,isReport:false};setTasks(p=>[...p,nt]);}
    logEvent("handover",`на ${fmtDate(forDate)}: ${text.slice(0,40)}`);
  };
  const doLogin=name=>{setWho(name);sv("currentUser",name);setPicking(false);setAuthPending(null);logEvent("login",accountLabel(name));tgBind(name, tgUserId());};
  const requestLogin=account=>setAuthPending(account);
  const submitAuth=(account,pwd)=>{
    const existing=auth[account];
    if(!existing){ // первый вход — задаём пароль
      setAuth(prev=>({...prev,[account]:pwd}));
      logEvent("password_set",accountLabel(account));
      doLogin(account);
      return{ok:true};
    }
    if(existing===pwd){doLogin(account);return{ok:true};}
    return{ok:false,error:"Неверный пароль"};
  };
  const changePassword=(account,newPwd)=>{setAuth(prev=>({...prev,[account]:newPwd}));logEvent("password_changed",accountLabel(account));};
  const resetPassword=account=>{setAuth(prev=>{const n={...prev};delete n[account];return n;});logEvent("password_reset",accountLabel(account));};
  const setManagerCanViewPasswords=v=>{setAcl(prev=>({...prev,managerCanViewPasswords:v}));logEvent("acl_changed",`Управляющий ${v?"может":"не может"} видеть пароли`);};
  const canAddTasks=hasPerm(who,profiles,"add_tasks");
  const isChef=!isManager&&(profiles.find(p=>p.name===who)?.role==="head_barman");
  const canTeam=isManager||isChef; // шеф/управляющий/разраб управляют составом
  // --- управление командой ---
  const addMember=name=>{const n=(name||"").trim();if(!n||members.includes(n))return;setMembers(p=>[...p,n]);setProfiles(p=>p.some(x=>x.name===n)?p:[...p,{name:n,role:"barman",perms:ROLES.barman.perms}]);logEvent("member_added",n);};
  const removeMember=name=>{setMembers(p=>p.filter(x=>x!==name));logEvent("member_removed",name);};
  // --- редактирование смен внутри дня ---
  const addShift=(date,shift)=>{setSchedule(p=>({...p,[date]:[...(p[date]||[]),shift]}));logEvent("shift_added",`${shift.name} · ${fmtDate(date)}`);};
  const removeShift=(date,idx)=>{setSchedule(p=>({...p,[date]:(p[date]||[]).filter((_,i)=>i!==idx)}));logEvent("shift_removed",fmtDate(date));};
  const updateShift=(date,idx,patch)=>{setSchedule(p=>({...p,[date]:(p[date]||[]).map((s,i)=>i===idx?{...s,...patch}:s)}));};
  // --- гоу-лист (общий, редактирует вся команда) ---
  const goAdd=text=>{const t=(text||"").trim();if(!t)return;setGoList(p=>[...p,{id:uid(),text:t,done:false,by:accountLabel(who)}]);};
  const goToggle=id=>setGoList(p=>p.map(i=>i.id===id?{...i,done:!i.done}:i));
  const goRemove=id=>setGoList(p=>p.filter(i=>i.id!==id));

  if(loading)return (<div className="app" style={{display:"flex",alignItems:"center",justifyContent:"center",height:"100vh"}}><span className="mono" style={{color:"var(--mt)"}}>Загрузка…</span></div>);

  if(picking)return (
    <div className="app">
      <div className="login">
        <div style={{marginBottom:16}}><Mascot size={56} color="var(--cu)"/></div>
        <div className="login-title">Работяга</div>
        <div className="login-sub">Выбери себя и войди по паролю</div>
        <div style={{fontSize:12,marginBottom:18,padding:"8px 12px",borderRadius:8,textAlign:"center",
          background:tgUserId()?"rgba(78,112,64,.15)":"rgba(232,160,48,.12)",
          color:tgUserId()?"#8bc47a":"#e8a030"}}>
          {TG&&tgUserId()
            ? `✅ Telegram подключён · ID ${tgUserId()}`
            : TG
              ? "⚠️ Открыто в Telegram, но ID не пришёл (обнови приложение Telegram / переоткрой через кнопку бота)"
              : "📵 Открыто вне Telegram — пуши работают только при входе через бота"}
        </div>
        <div style={{fontSize:12,marginBottom:18,padding:"8px 12px",borderRadius:8,textAlign:"center",
          background:serverOk===false?"rgba(176,74,54,.15)":serverOk?"rgba(78,112,64,.15)":"rgba(138,133,125,.12)",
          color:serverOk===false?"#e07a60":serverOk?"#8bc47a":"var(--mt)"}}>
          {serverOk===false
            ? "⛔ Сервер недоступен — данные сохранятся только на этом устройстве. Запусти бэкенд / проверь vite-прокси."
            : serverOk
              ? "🟢 Сервер на связи — память синхронизируется между устройствами"
              : "… проверяю связь с сервером"}
        </div>
        {members.map(m=>{const ss=SHIFT_STATUSES[getShiftStatus(m,ds,schedule,statusOverrides,now)];
          return(<button key={m} className="login-btn" onClick={()=>requestLogin(m)}>
            <span className="dot" style={{background:ss?.color||"var(--bd)"}}/>{m}
            <span style={{marginLeft:"auto",display:"flex",alignItems:"center",gap:6}}>
              {!auth[m]&&<span style={{fontSize:10,color:"var(--mt)"}}>нет пароля</span>}
              <Lock size={12} color="var(--mt)"/>
            </span>
          </button>);})}
        <button className="login-btn" style={{marginTop:8,borderColor:"var(--cu2)"}} onClick={()=>requestLogin("manager")}>
          <span className="dot" style={{background:"var(--cu)"}}/>Управляющий<span style={{marginLeft:"auto"}}><Lock size={12} color="var(--mt)"/></span>
        </button>
        <button className="login-btn" style={{borderColor:"#5b8b9b"}} onClick={()=>requestLogin("developer")}>
          <span className="dot" style={{background:"#5b8b9b"}}/><Shield size={13} color="#7fb0c0"/> Разработчик<span style={{marginLeft:"auto"}}><Lock size={12} color="var(--mt)"/></span>
        </button>
        <div style={{fontSize:11,color:"var(--mt)",marginTop:16,textAlign:"center",lineHeight:1.5}}>Первый вход — задаёшь пароль. Прототип: пароли хранятся локально, реальная защита — на сервере.</div>
      </div>
      {authPending&&<AuthModal account={authPending} hasPassword={!!auth[authPending]} onCancel={()=>setAuthPending(null)} onSubmit={pwd=>submitAuth(authPending,pwd)}/>}
    </div>);

  if(viewingDay)return (
    <div className="app">
      <div className="nav"><div className="nav-row">
        <button onClick={()=>setViewingDay(null)} style={{background:"transparent",border:"none",color:"var(--cu)",cursor:"pointer",display:"flex",alignItems:"center",gap:6,fontSize:14,fontWeight:600}}><ChevronLeft size={16}/>Календарь</button>
      </div><div className="nav-date" style={{paddingTop:6}}>День</div></div>
      <DayDetail date={viewingDay} schedule={schedule} events={events} tasks={tasks} history={history}
        revenue={revenue} handovers={handovers} isManager={isManager} canTeam={canTeam} members={members}
        onAddTask={canAddTasks?()=>setModal({_new:true,_date:viewingDay}):null}
        onEditTask={isManager?t=>setModal(t):null}
        onSetRevenue={isManager?(plan,fact)=>setRevenue(prev=>({...prev,[viewingDay]:{plan,fact}})):null}
        onAddShift={canTeam?addShift:null} onRemoveShift={canTeam?removeShift:null} onUpdateShift={canTeam?updateShift:null}/>
    </div>);

  if(viewingEmployee&&isManager)return (
    <div className="app">
      <div className="nav"><div className="nav-row">
        <button onClick={()=>setViewingEmployee(null)} style={{background:"transparent",border:"none",color:"var(--cu)",cursor:"pointer",display:"flex",alignItems:"center",gap:6,fontSize:14,fontWeight:600}}><ChevronLeft size={16}/>Назад</button>
      </div><div className="nav-date" style={{paddingTop:6}}>Кабинет сотрудника</div></div>
      <PersonalCabinet name={viewingEmployee} isOwnCabinet={false} tasks={tasks} history={history}
        schedule={schedule} cards={cards} profiles={profiles} ds={ds} now={now} statusOverrides={statusOverrides}
        onIssueCard={issueCard} onUpdateProfile={p=>setProfiles(prev=>prev.map(x=>x.name===p.name?p:x))}
        onAddOverride={o=>setStatusOverrides(prev=>[...prev.filter(x=>x.name!==o.name),o])} setCardModal={v=>setModal(v)}/>
    </div>);

  const canStats=hasPerm(who,profiles,"view_team_stats")||isManager;
  const tabs=[
    {id:"today",label:"Сегодня"},
    ...(hasPerm(who,profiles,"view_all_tasks")||hasPerm(who,profiles,"view_own_tasks")?[{id:"tasks",label:"Задачи"}]:[]),
    ...(hasPerm(who,profiles,"view_schedule")?[{id:"schedule",label:"График"}]:[]),
    ...(canTeam||canStats?[{id:"team",label:"Команда"}]:[]),
    {id:"settings",label:"️ Управление"},
  ];

  return (
    <div className="app">
      <div className="nav">
        <div className="nav-row">
          <div className="nav-title"><Mascot size={26} color="var(--cu)"/>Работяга</div>
          <div style={{display:"flex",gap:8,alignItems:"center"}}>
            {!isManager&&<button onClick={openInbox} style={{position:"relative",background:"transparent",border:"none",cursor:"pointer",color:inboxUnread>0?"var(--am)":"var(--mt)",display:"flex",alignItems:"center"}} title="Мои задачи (упоминания)">
              <Inbox size={19}/>{inboxUnread>0&&<span style={{position:"absolute",top:-5,right:-7,background:"var(--rs)",color:"#fff",fontSize:9,fontWeight:700,borderRadius:8,minWidth:15,height:15,display:"flex",alignItems:"center",justifyContent:"center",padding:"0 3px"}}>{inboxUnread}</span>}
            </button>}
            {myStatus&&<span className="sb" style={{background:SHIFT_STATUSES[myStatus]?.bg,color:SHIFT_STATUSES[myStatus]?.color}}>{SHIFT_STATUSES[myStatus]?.label}</span>}
            <button className="theme-btn" onClick={cycleTheme}
              title={themePref==="auto"?"Тема: авто (по устройству)":themePref==="light"?"Тема: светлая":"Тема: тёмная"}>
              {themePref==="auto"?<MonitorSmartphone size={14}/>:themePref==="light"?<Sun size={14}/>:<Moon size={14}/>}
            </button>
            <button className="nav-who" onClick={()=>setPicking(true)}><User size={12}/>{accountLabel(who)}
              <span title={serverOk===false?"Сервер недоступен — данные только на этом устройстве":serverOk?"Сервер на связи":"проверка связи"}
                style={{width:7,height:7,borderRadius:"50%",marginLeft:6,display:"inline-block",
                background:serverOk===false?"var(--rs)":serverOk?"var(--hp)":"var(--mt)"}}/></button>
          </div>
        </div>
        <div className="nav-date">{dateLabel}{events[ds]&&<span style={{color:"var(--cu)",marginLeft:8}}>· {events[ds]}</span>}</div>
        <div className="tabs">{tabs.map(t=><button key={t.id} className={`tab${tab===t.id?" on":""}`} onClick={()=>setTab(t.id)}>{t.label}</button>)}</div>
      </div>
      {toast&&<div onClick={()=>setToast(null)} style={{position:"sticky",top:0,zIndex:45,margin:"10px 16px 0",background:"rgba(78,112,64,.18)",border:"1px solid rgba(78,112,64,.5)",color:"#a8d894",borderRadius:10,padding:"12px 14px",fontSize:13.5,lineHeight:1.5,cursor:"pointer"}}>{toast}</div>}

      {tab==="today"&&<TodayTab who={who} isManager={isManager} ds={ds} todayTasks={todayTasks} doneMap={doneToday}
        pct={pct} doneTodayCount={doneTodayCount} todayShifts={todayShifts} myStatus={myStatus} myAssigned={myAssigned}
        schedule={schedule} events={events} statusOverrides={statusOverrides} now={now} revenue={revenue} handovers={handovers}
        dayClosed={dayClosed} dayRegularCount={dayRegular.length} irregular={irregularTasks} irregularDoneMap={irregularDoneMap}
        pushGateOk={afterPushGate(now)} onSummary={openSummary} taskOrder={taskOrder} onReorder={setTaskOrder}
        canManage={canAddTasks} onDelete={canAddTasks?delTask:null} onArchive={canAddTasks?archiveTask:null}
        goList={goList} onGoAdd={goAdd} onGoToggle={goToggle} onGoRemove={goRemove}
        onToggle={toggle} onEdit={isManager?t=>setModal(t):null} onViewEmployee={isManager?n=>setViewingEmployee(n):null}
        onHandover={t=>setModal({_handover:true,task:t})}/>}

      {tab==="settings"&&isManager&&<AdminTab auth={auth} members={members} ds={ds}/>}      {tab==="settings"&&!isManager&&<PersonalCabinet name={who==="manager"||who==="developer"?who:who} account={who} isOwnCabinet={true} tasks={tasks} history={history}
        schedule={schedule} cards={cards} profiles={profiles} ds={ds} now={now} statusOverrides={statusOverrides}
        members={members} eventsLog={eventsLog}
        onIssueCard={isManager?issueCard:null} onUpdateProfile={isManager?p=>setProfiles(prev=>prev.map(x=>x.name===p.name?p:x)):null}
        onAddOverride={isManager?o=>setStatusOverrides(prev=>[...prev.filter(x=>x.name!==o.name),o]):null} setCardModal={v=>setModal(v)} onToggle={toggle}
        onChangePassword={pwd=>changePassword(who,pwd)}/>}

      {tab==="tasks"&&<TasksTab tasks={tasks} doneMap={doneToday} onToggle={toggle} onEdit={isManager?t=>setModal(t):null} onArchive={canAddTasks?archiveTask:null}/>}
      {tab==="schedule"&&<ScheduleTab schedule={schedule} events={events} revenue={revenue} ds={ds} members={members} onOpenDay={d=>setViewingDay(d)}/>}
      {tab==="team"&&(canTeam||canStats)&&<TeamHubTab canTeam={canTeam} canStats={canStats} isManager={isManager}
        profiles={profiles} members={members} statusOverrides={statusOverrides}
        account={who} who={who} isDeveloper={isDeveloper} auth={auth} acl={acl}
        onAddMember={addMember} onRemoveMember={removeMember}
        onResetPassword={resetPassword} onToggleAclPwd={setManagerCanViewPasswords}
        onUpdateProfile={p=>setProfiles(prev=>prev.map(x=>x.name===p.name?p:x))}
        onAddOverride={o=>setStatusOverrides(prev=>[...prev.filter(x=>x.name!==o.name),o])}
        onRemoveOverride={name=>setStatusOverrides(prev=>prev.filter(x=>x.name!==name))}
        tasks={tasks} history={history} ds={ds} schedule={schedule} cards={cards} eventsLog={eventsLog}
        onView={isManager?n=>setViewingEmployee(n):null}
        setCardModal={v=>setModal(v)} onRevoke={id=>setCards(prev=>prev.map(c=>c.id===id?{...c,active:false}:c))}/>}


      {canAddTasks&&["today"].includes(tab)&&<button className="fab" onClick={()=>setModal({_new:true})}><Plus size={24} color="var(--bg)"/></button>}
      {modal&&!modal._card&&!modal._handover&&!modal._inbox&&!modal._closing&&<TaskModal task={modal._new?null:modal} ds={modal._date||ds} members={members} onClose={()=>setModal(null)} onSave={saveTask} onDelete={delTask}/>}
      {modal?._card&&<CardModal targetName={modal.targetName} onClose={()=>setModal(null)} onIssue={(type,comment,isPrivate)=>{issueCard(modal.targetName,type,comment,isPrivate);setModal(null);}}/>}
      {modal?._handover&&<HandoverModal task={modal.task} ds={ds} onClose={()=>setModal(null)} onSubmit={(text,createTask)=>{addHandover(addDays(ds,1),text,createTask,modal.task?.title);setModal(null);}}/>}
      {modal?._inbox&&<InboxModal who={who} tasks={inboxItems} history={history} ds={ds} onClose={()=>setModal(null)} onToggle={toggle}/>}
      {modal?._closing&&<ClosingSummaryModal summary={modal.summary} auto={modal.auto} onClose={()=>setModal(null)} onCarryOver={carryOver}/>}
    </div>);
}

// ── Карточка плана выручки ──
function RevenueCard({date,revenue}){
  const r=revenue[date];
  if(!r||(r.plan==null||r.plan==="")) return (
    <div className="alert warn"><AlertTriangle size={16} style={{flexShrink:0,marginTop:1}}/>
      <span>Не хватает данных: план выручки на {fmtDate(date)} не загружен. Управляющий может ввести вручную в карточке дня.</span></div>);
  const plan=Number(r.plan), fact=r.fact!=null&&r.fact!==""?Number(r.fact):null;
  const pct=fact!=null&&plan?Math.round(fact/plan*100):null;
  return (
    <div className="rev-card">
      <div style={{display:"flex",justifyContent:"space-between",alignItems:"flex-start"}}>
        <div><div className="stat-l" style={{marginBottom:4}}>План выручки</div><div className="rev-plan">{plan.toLocaleString("ru-RU")} ₽</div></div>
        {fact!=null&&<div style={{textAlign:"right"}}><div className="stat-l" style={{marginBottom:4}}>Факт</div>
          <div className="mono" style={{fontSize:18,fontWeight:600,color:pct>=100?"#8bc47a":"#e07a60"}}>{fact.toLocaleString("ru-RU")} ₽</div>
          {pct!=null&&<div className="mono" style={{fontSize:12,color:pct>=100?"#8bc47a":"#e07a60",marginTop:2}}>{pct}% плана</div>}</div>}
      </div>
    </div>);
}

function TodayTab({who,isManager,ds,todayTasks,doneMap,pct,doneTodayCount,todayShifts,myStatus,myAssigned,schedule,events,statusOverrides,now,revenue,handovers,dayClosed,dayRegularCount,irregular,irregularDoneMap,pushGateOk,onSummary,taskOrder,onReorder,canManage,onDelete,onArchive,goList,onGoAdd,onGoToggle,onGoRemove,onToggle,onEdit,onViewEmployee,onHandover}){
  const check=staffCheck(ds,schedule,events);
  const todayHandovers=handovers[ds]||[];
  const regularTasks=todayTasks.filter(t=>t.kind!=="irregular");
  const irregularOpen=(irregular||[]).filter(t=>!irregularDoneMap[t.id]);
  // активные (невыполненные) — наверх, в пользовательском порядке; выполненные — в аккордеон
  const orderIdx=id=>{const i=(taskOrder||[]).indexOf(id);return i===-1?9999:i;};
  const active=regularTasks.filter(t=>!doneMap[t.id]).sort((a,b)=>orderIdx(a.id)-orderIdx(b.id));
  const done=regularTasks.filter(t=>doneMap[t.id]);
  return(<>
    <div style={{padding:"12px 16px 0"}}>
      <div className="prog-bg"><div className="prog-fill" style={{width:`${pct}%`}}/></div>
      <div style={{display:"flex",justifyContent:"space-between",marginTop:6}}>
        <span className="mono" style={{fontSize:11,color:"var(--mt)",textTransform:"uppercase"}}>{doneTodayCount} из {todayTasks.length}</span>
        <span className="mono" style={{fontSize:20,fontWeight:600,color:"var(--am)"}}>{pct}%</span>
      </div>
    </div>

    {dayClosed&&<div className="sec"><div className="alert ok"><CheckCircle size={16} style={{flexShrink:0,marginTop:1}}/><span>
      {pushGateOk
        ?`Смена закрыта — все ${dayRegularCount} регулярных задач выполнены. Пуш отправлен управляющему.`
        :`Все ${dayRegularCount} регулярных задач выполнены ✅ Пуш о закрытии уйдёт после 23:30.`}
    </span></div></div>}

    <div className="sec"><RevenueCard date={ds} revenue={revenue}/></div>

    {goList&&<div className="sec"><GoListBlock items={goList} onAdd={onGoAdd} onToggle={onGoToggle} onRemove={onGoRemove}/></div>}

    {myAssigned&&myAssigned.length>0&&<div className="sec">
      <div className="sec-head"><span className="sec-lbl" style={{color:"var(--am)"}}><Bell size={12}/>Назначено вам</span><span className="sec-cnt">{myAssigned.filter(t=>doneMap[t.id]).length}/{myAssigned.length}</span></div>
      {myAssigned.map(t=><TaskCard key={t.id} task={t} done={!!doneMap[t.id]} onToggle={()=>onToggle(t.id)} onEdit={onEdit?()=>onEdit(t):null} highlight/>)}
    </div>}

    {todayHandovers.length>0&&<div className="sec">
      <div className="sec-head"><span className="sec-lbl"><Send size={12}/>Передано прошлой сменой</span></div>
      {todayHandovers.map(h=><div className="handover" key={h.id}>{h.text}<div className="handover-by">— {h.by}, {fmtDate(h.ts.slice(0,10))}</div></div>)}
    </div>}

    <div className="sec">
      <div className="sec-head"><span className="sec-lbl"><User size={12}/>На смене · норма {check.norm.count}</span></div>
      {!check.ok&&<div className="alert danger"><AlertTriangle size={16} style={{flexShrink:0,marginTop:1}}/><span>{check.msg}</span></div>}
      {check.ok&&check.msg&&<div className="alert warn"><AlertTriangle size={16} style={{flexShrink:0,marginTop:1}}/><span>{check.msg}</span></div>}
      {todayShifts.filter(s=>!s.guest).map((s,i)=>{const ss=SHIFT_STATUSES[getShiftStatus(s.name,ds,schedule,statusOverrides,now)];
        return(<div className="sc" key={i} onClick={()=>onViewEmployee&&onViewEmployee(s.name)} style={{cursor:onViewEmployee?"pointer":"default"}}>
          <div className="sr">
            <div><div className="sn"><User size={13} color="var(--cu)"/>{s.name}</div>{s.start&&<div className="st">{s.start}{s.end?` · ${s.end}ч`:""}</div>}</div>
            <div style={{display:"flex",gap:4,flexWrap:"wrap",justifyContent:"flex-end"}}>
              {s.report&&<span style={{fontSize:10,fontWeight:700,padding:"3px 8px",borderRadius:8,background:"rgba(232,160,48,.18)",color:"var(--am)"}}>отчёт</span>}
              <span style={{fontSize:10,fontWeight:700,padding:"3px 8px",borderRadius:8,background:ss?.bg,color:ss?.color}}>{ss?.label}</span>
            </div>
          </div>
        </div>);})}
      {!isManager&&myStatus==="day_off"&&<div className="empty" style={{padding:"12px 0"}}>Выходной 🍺</div>}
    </div>

    <div className="sec">
      <div className="sec-head"><span className="sec-lbl"><CheckCircle size={12}/>Задачи смены</span><span className="sec-cnt">{done.length}/{regularTasks.length}</span></div>
      {active.length===0&&regularTasks.length>0&&<div className="empty" style={{padding:"14px 0"}}>Все задачи выполнены 🎉</div>}
      {regularTasks.length===0&&<div className="empty" style={{padding:"14px 0"}}>Задач на сегодня нет</div>}
      <DraggableTaskList tasks={active} onReorder={ids=>onReorder(ids)}
        onToggle={onToggle} onEdit={onEdit} onHandover={onHandover} doneMap={doneMap}
        onDelete={onDelete} onArchive={onArchive}/>
    </div>
    {done.length>0&&<DoneAccordion tasks={done} onToggle={onToggle} onEdit={onEdit} onDelete={onDelete} onArchive={onArchive}/>}

    {irregularOpen.length>0&&<div className="sec">
      <div className="sec-head"><span className="sec-lbl" style={{color:"#9bb0c4"}}><FileText size={12}/>Нерегулярные · требуют внимания</span><span className="sec-cnt">{irregularOpen.length}</span></div>
      <div style={{fontSize:11,color:"var(--mt)",marginBottom:8,lineHeight:1.5}}>Не влияют на закрытие смены. Остаются в списке, пока не выполнены.</div>
      {irregularOpen.map(t=><TaskCard key={t.id} task={t} done={false} onToggle={()=>onToggle(t.id,"irregular")} onEdit={onEdit?()=>onEdit(t):null}/>)}
    </div>}

    {onSummary&&<div className="sec" style={{paddingBottom:8}}>
      <button className="btn btn-g" onClick={onSummary}><FileText size={15}/>Итоги дня</button>
    </div>}
  </>);
}

function PersonalCabinet({name,account,isOwnCabinet,tasks,history,schedule,cards,profiles,ds,now,statusOverrides,members,eventsLog,onIssueCard,onUpdateProfile,onAddOverride,setCardModal,onToggle,onChangePassword}){
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

function ScheduleTab({schedule,events,revenue,ds,members,onOpenDay}){
  const[sub,setSub]=useState("calendar");
  return(<>
    <div className="sec" style={{paddingBottom:0}}>
      <div style={{display:"flex",gap:4,marginBottom:4}}>
        {[["calendar","Календарь"],["dashboard","Дашборд"],["hours","Часы"]].map(([id,label])=>
          <button key={id} className={`tab${sub===id?" on":""}`} onClick={()=>setSub(id)} style={{flex:1,textAlign:"center"}}>{label}</button>)}
      </div>
    </div>
    {sub==="calendar"&&<CalendarTab schedule={schedule} events={events} revenue={revenue} ds={ds} onOpenDay={onOpenDay}/>}
    {sub==="dashboard"&&<DashboardTab schedule={schedule} members={members} ds={ds}/>}
    {sub==="hours"&&<HoursTab schedule={schedule} members={members} ds={ds}/>}
  </>);
}

function CalendarTab({schedule,events,revenue,ds,onOpenDay}){
  const[ym,setYm]=useState("2026-06");
  const[y,m]=ym.split("-").map(Number);
  const first=new Date(y,m-1,1);
  const startDow=(first.getDay()+6)%7; // пн=0
  const daysInMonth=new Date(y,m,0).getDate();
  const cells=[];
  for(let i=0;i<startDow;i++)cells.push(null);
  for(let d=1;d<=daysInMonth;d++)cells.push(`${ym}-${String(d).padStart(2,"0")}`);
  const shift=(n)=>{let nm=m+n,ny=y;if(nm<1){nm=12;ny--;}if(nm>12){nm=1;ny++;}setYm(`${ny}-${String(nm).padStart(2,"0")}`);};
  return(<div className="sec">
    <div className="sec-head">
      <span className="sec-lbl"><CalendarDays size={12}/>Календарь</span>
      <div style={{display:"flex",gap:8,alignItems:"center"}}>
        <button onClick={()=>shift(-1)} style={{background:"transparent",border:"none",color:"var(--mt)",cursor:"pointer"}}><ChevronLeft size={18}/></button>
        <span className="mono" style={{fontSize:13,color:"var(--pp)",minWidth:90,textAlign:"center"}}>{MONTHS_RU[m-1]} {y}</span>
        <button onClick={()=>shift(1)} style={{background:"transparent",border:"none",color:"var(--mt)",cursor:"pointer"}}><ChevronRight size={18}/></button>
      </div>
    </div>
    <div className="info-box" style={{fontSize:12}}>Нормы: пн/вт/чт/вс — 2 чел., ср/пт/сб — 3 (третий с 18:00). Вс со «Стерео 55» и праздники — тоже 3 с 18:00. Цвета: 🔴&lt;90% 🟡90-100% 🟢100-110% 🔵&gt;110%. Нажми день, чтобы открыть.</div>
    <div className="cal-grid" style={{marginBottom:5}}>{["пн","вт","ср","чт","пт","сб","вс"].map(d=><div className="cal-dow" key={d}>{d}</div>)}</div>
    <div className="cal-grid">
      {cells.map((c,i)=>{
        if(!c)return (<div key={i}/>);
        const check=staffCheck(c,schedule,events);
        const dnum=Number(c.slice(-2));
        const hasRev=revenue[c]&&revenue[c].plan!=null&&revenue[c].plan!=="";
        const rev = revenue[c] || {};
          const pct = rev.plan && rev.fact ? (rev.fact / rev.plan) * 100 : null;
          const bgColor = pct ? getRevenueColor(pct) : (!check.ok ? 'rgba(224,122,96,.15)' : 'transparent');
          return(<div key={i} className={`cal-cell${c===ds?" today":""}`} style={{background: bgColor}} onClick={()=>onOpenDay(c)}>
          <div style={{display:"flex",justifyContent:"space-between",alignItems:"center"}}>
            <span className="cal-num">{dnum}</span>
            {hasRev&&<span style={{fontSize:11,color:"var(--am)",fontWeight:700}}>₽</span>}
          </div>
          <span className="cal-staff" style={{color:check.ok?"var(--mt)":"#e07a60"}}>{check.actual}/{check.norm.count}</span>
          {pct!=null&&<span style={{fontSize:10,fontWeight:600,color:getRevenueColor(pct)}}>{Math.round(pct)}%</span>}
          {events[c]&&<span className="cal-ev">{events[c]}</span>}
        </div>);
      })}
    </div>
  </div>);
}

function DayDetail({date,schedule,events,tasks,history,revenue,handovers,isManager,canTeam,members,onAddTask,onEditTask,onSetRevenue,onAddShift,onRemoveShift,onUpdateShift}){
  const dObj=new Date(date);
  const check=staffCheck(date,schedule,events);
  const shifts=(schedule[date]||[]);
  const dayTasks=tasks.filter(t=>!t.archived&&isToday(t,date));
  const r=revenue[date]||{};
  const[plan,setPlan]=useState(r.plan??"");
  const[fact,setFact]=useState(r.fact??"");
  const[adding,setAdding]=useState(false);
  const[an,setAn]=useState("");const[acustom,setAcustom]=useState("");const[ast,setAst]=useState("13:00");const[ah,setAh]=useState(10);const[asub,setAsub]=useState(true);
  const ho=handovers[date]||[];
  const submitAdd=()=>{const name=(acustom.trim()||an);if(!name)return;onAddShift(date,{name,start:ast,end:String(ah),report:false,sub:asub});setAdding(false);setAn("");setAcustom("");};
  return(<div className="sec">
    <div className="cab-hero">
      <div className="cab-name">{dObj.getDate()} {MONTHS_RU[dObj.getMonth()]}</div>
      <div className="cab-role">{DOW_FULL[dObj.getDay()]}{events[date]?` · ${events[date]}`:""}</div>
      <div className="mono" style={{fontSize:12,color:"var(--mt)",marginTop:8}}>Норма штата: {check.norm.count} чел. ({check.norm.reason}){check.norm.thirdFrom?`, третий с ${check.norm.thirdFrom}`:""}</div>
    </div>

    {!check.ok&&<div className="alert danger"><AlertTriangle size={16} style={{flexShrink:0,marginTop:1}}/><span>{check.msg}</span></div>}
    {check.ok&&check.msg&&<div className="alert warn"><AlertTriangle size={16} style={{flexShrink:0,marginTop:1}}/><span>{check.msg}</span></div>}
    {check.ok&&!check.msg&&<div className="alert ok"><CheckCircle size={16} style={{flexShrink:0,marginTop:1}}/><span>Штат укомплектован по норме ({check.actual}/{check.norm.count})</span></div>}

    <div className="sec-lbl" style={{margin:"14px 0 8px"}}><span style={{fontSize:14,fontWeight:700,color:"var(--am)"}}>₽</span> План выручки</div>
    {!isManager&&<RevenueCard date={date} revenue={revenue}/>}
    {isManager&&<div className="rev-card">
      <div className="r2">
        <div className="field" style={{marginBottom:0}}><label>План ₽</label><input type="number" value={plan} onChange={e=>setPlan(e.target.value)} placeholder="нет данных"/></div>
        <div className="field" style={{marginBottom:0}}><label>Факт ₽</label><input type="number" value={fact} onChange={e=>setFact(e.target.value)} placeholder="—"/></div>
      </div>
      <button className="btn btn-g" style={{marginTop:10}} onClick={()=>onSetRevenue(plan,fact)}>Сохранить выручку</button>
      <div style={{fontSize:11,color:"var(--mt)",marginTop:8,lineHeight:1.5}}>SERVER: эти поля будет автозаполнять Google Sheets API (план из таблицы, факт из iiko/mozg.rest).</div>
    </div>}

    {ho.length>0&&<><div className="sec-lbl" style={{margin:"14px 0 8px"}}><Send size={12} style={{display:"inline"}}/> Передано на этот день</div>
      {ho.map(h=><div className="handover" key={h.id}>{h.text}<div className="handover-by">— {h.by}</div></div>)}</>}

    <div className="sec-head" style={{margin:"14px 0 9px"}}>
      <span className="sec-lbl"><User size={12}/>Бармены ({check.actual})</span>
      {canTeam&&<button className="mini-btn" onClick={()=>setAdding(a=>!a)}><Plus size={12}/>добавить</button>}
    </div>
    {shifts.length===0&&<div className="empty" style={{padding:"14px 0"}}>Смен нет</div>}
    {shifts.map((s,i)=><div className="sc" key={i}>
      <div className="sr">
        <div><div className="sn"><User size={13} color="var(--cu)"/>{s.name}{s.guest?" (гость)":""}{s.sub&&<span style={{fontSize:9,fontWeight:700,padding:"2px 6px",borderRadius:7,background:"rgba(91,139,155,.2)",color:"#7fb0c0",marginLeft:6}}>подмена</span>}</div>{s.start&&<div className="st">{s.start}{s.end?` · ${s.end}ч`:""}</div>}</div>
        {s.report&&!canTeam&&<span style={{fontSize:10,fontWeight:700,padding:"3px 8px",borderRadius:8,background:"rgba(232,160,48,.18)",color:"var(--am)"}}>отчёт</span>}
        {canTeam&&<button onClick={()=>onRemoveShift(date,i)} style={{background:"transparent",border:"1px solid rgba(158,63,43,.35)",color:"#e07a60",borderRadius:6,padding:"3px 8px",fontSize:11,cursor:"pointer"}}>убрать</button>}
      </div>
      {canTeam&&<div style={{display:"flex",gap:8,alignItems:"center",marginTop:8,flexWrap:"wrap"}}>
        <label style={{fontSize:11,color:"var(--mt)"}}>с</label>
        <input type="time" value={s.start||""} onChange={e=>onUpdateShift(date,i,{start:e.target.value})} style={{width:92,background:"var(--bg)",border:"1px solid var(--bd)",borderRadius:7,padding:"5px 8px",color:"var(--pp)",fontSize:13}}/>
        <label style={{fontSize:11,color:"var(--mt)"}}>часов</label>
        <input type="number" min="1" max="16" value={parseInt(s.end)||""} onChange={e=>onUpdateShift(date,i,{end:String(e.target.value)})} style={{width:64,background:"var(--bg)",border:"1px solid var(--bd)",borderRadius:7,padding:"5px 8px",color:"var(--pp)",fontSize:13}}/>
        <button onClick={()=>onUpdateShift(date,i,{report:!s.report})} className={`chip${s.report?" on":""}`} style={{padding:"4px 9px"}}>★ отчёт</button>
        <button onClick={()=>onUpdateShift(date,i,{sub:!s.sub})} className={`chip${s.sub?" on":""}`} style={{padding:"4px 9px"}}>подмена</button>
      </div>}
    </div>)}

    {adding&&canTeam&&<div className="sc" style={{borderColor:"var(--cu)"}}>
      <div className="field" style={{marginBottom:8}}><label>Сотрудник из команды</label>
        <select value={an} onChange={e=>setAn(e.target.value)}><option value="">— выбрать —</option>{members.map(m=><option key={m} value={m}>{m}</option>)}</select></div>
      <div className="field" style={{marginBottom:8}}><label>Или вписать имя подменного (из другого проекта)</label>
        <input value={acustom} onChange={e=>setAcustom(e.target.value)} placeholder="напр. Костя (Залив)"/></div>
      <div style={{display:"flex",gap:8,alignItems:"center",marginBottom:8,flexWrap:"wrap"}}>
        <label style={{fontSize:11,color:"var(--mt)"}}>с</label>
        <input type="time" value={ast} onChange={e=>setAst(e.target.value)} style={{width:92,background:"var(--bg)",border:"1px solid var(--bd)",borderRadius:7,padding:"5px 8px",color:"var(--pp)",fontSize:13}}/>
        <label style={{fontSize:11,color:"var(--mt)"}}>часов</label>
        <input type="number" min="1" max="16" value={ah} onChange={e=>setAh(e.target.value)} style={{width:64,background:"var(--bg)",border:"1px solid var(--bd)",borderRadius:7,padding:"5px 8px",color:"var(--pp)",fontSize:13}}/>
        <button onClick={()=>setAsub(v=>!v)} className={`chip${asub?" on":""}`} style={{padding:"4px 9px"}}>подмена</button>
      </div>
      <button className="btn btn-p" onClick={submitAdd}><Plus size={15}/>Добавить на смену</button>
    </div>}

    <div className="sec-head" style={{margin:"14px 0 9px"}}>
      <span className="sec-lbl"><CheckCircle size={12}/>Задачи дня ({dayTasks.length})</span>
      {onAddTask&&<button className="mini-btn" onClick={onAddTask}><Plus size={12}/>задача</button>}
    </div>
    {dayTasks.length===0&&<div className="empty" style={{padding:"14px 0"}}>Задач нет</div>}
    {dayTasks.map(t=>{const done=isDone(history[`${t.id}::${date}`]);
      return(<div className="sc" key={t.id} onClick={()=>onEditTask&&onEditTask(t)} style={{cursor:onEditTask?"pointer":"default"}}>
        <div className="sr"><div className="sn" style={{fontWeight:500}}><span style={{width:8,height:8,borderRadius:"50%",background:done?"var(--hp)":"var(--rs)",display:"inline-block"}}/>{t.title}</div>
        <span className="pill p-r">{REPEAT_OPTS.find(r=>r.id===t.repeat)?.label||t.repeat}</span></div>
      </div>);})}
  </div>);
}

function TasksTab({tasks,doneMap,onToggle,onEdit,onArchive}){
  const [showArch,setShowArch]=useState(false);
  const active=tasks.filter(t=>!t.archived);
  const archived=tasks.filter(t=>t.archived);
  return(<div className="sec">
    <div className="sec-head"><span className="sec-lbl">Все задачи ({active.length})</span></div>
    {active.length===0&&<div className="empty">Нет задач</div>}
    {active.map(t=><TaskCard key={t.id} task={t} done={!!doneMap[t.id]} onToggle={()=>onToggle(t.id)} onEdit={onEdit?()=>onEdit(t):null}/>)}
    {archived.length>0&&<div className="acc" style={{marginLeft:0,marginRight:0,marginTop:14}}>
      <button className="acc-head" onClick={()=>setShowArch(o=>!o)}>
        <span style={{display:"flex",alignItems:"center",gap:6}}><Archive size={13}/>Архив · {archived.length}</span>
        {showArch?<ChevronUp size={16}/>:<ChevronDown size={16}/>}
      </button>
      {showArch&&<div className="acc-body">{archived.map(t=>(
        <div className="task" key={t.id} style={{opacity:.7,display:"flex",alignItems:"center",justifyContent:"space-between"}}>
          <span style={{fontSize:14}}>{t.title}</span>
          {onArchive&&<button className="mini-btn" onClick={()=>onArchive(t.id,false)}><RotateCcw size={12}/>вернуть</button>}
        </div>
      ))}</div>}
    </div>}
  </div>);
}

function HoursTab({schedule,members,ds}){
  const[mode,setMode]=useState("month");
  const days=mode==="week"?rangeDays(ds,7):Object.keys(schedule).filter(d=>d.startsWith("2026-06"));
  const stats=members.map(name=>{
    const h=days.reduce((a,d)=>{const s=(schedule[d]||[]).find(x=>x.name===name);return a+(s&&s.end?hmm(s.end)/60:0);},0);
    const shifts=days.filter(d=>(schedule[d]||[]).some(s=>s.name===name)).length;
    return{name,hours:Math.round(h*10)/10,shifts};
  });
  const total=stats.reduce((a,m)=>a+m.hours,0);
  return(<div className="sec">
    <div className="sec-head"><span className="sec-lbl"><Clock size={12}/>Часы работы</span>
      <div style={{display:"flex",gap:4}}>{["week","month"].map(m=><button key={m} className={`tab${mode===m?" on":""}`} onClick={()=>setMode(m)} style={{padding:"4px 10px",fontSize:11}}>{m==="week"?"7 дней":"Июнь"}</button>)}</div>
    </div>
    <div className="info-box">Итого: <span className="mono" style={{color:"var(--am)",fontWeight:600}}>{Math.round(total)}ч</span> за {mode==="week"?"неделю":"июнь"}</div>
    {stats.map(m=>{const nrm=hourNorm(m.name);const denom=mode==="month"?nrm.max:48;
      const inCorridor=mode==="month"&&m.hours>=nrm.min&&m.hours<=nrm.max;
      const over=mode==="month"&&m.hours>nrm.max;
      return(<div className="pr" key={m.name}>
      <div className="pr-nm"><span>{m.name}</span><span className="mono" style={{fontWeight:600,fontSize:14,color:over?"#e07a60":inCorridor?"#8bc47a":"var(--am)"}}>{m.hours}ч</span></div>
      <div className="bar-bg"><div className="bar-fill" style={{width:`${Math.min(m.hours/denom*100,100)}%`,background:over?"var(--rs)":inCorridor?"var(--hp)":"var(--am)"}}/></div>
      <div style={{display:"flex",justifyContent:"space-between",marginTop:4}}><span className="bar-pct">{m.shifts} смен</span>
        <span className="bar-pct">{mode==="month"?`норма ${nrm.min}–${nrm.max}ч${over?" · превышение":inCorridor?" · в норме":""}`:`${Math.round(m.hours/48*100)}% нормы`}</span></div>
    </div>);})}
  </div>);
}

function LogsTab({tasks,history,members,who,isManager,ds,eventsLog}){
  const[view,setView]=useState("tasks");
  const[filterPerson,setFilterPerson]=useState(isManager?"all":who);
  const[filterDate,setFilterDate]=useState(ds);
  const allDays=useMemo(()=>{const s=new Set();Object.keys(history).forEach(k=>{const p=k.split("::");if(p[1])s.add(p[1]);});return Array.from(s).sort().reverse().slice(0,30);},[history]);
  const dd=filterDate||ds;
  const myTasks=tasks.filter(t=>(filterPerson==="all"||t.assignee===filterPerson||t.assignee==="смена")&&isToday(t,dd));
  const doneCount=myTasks.filter(t=>isDone(history[`${t.id}::${dd}`])).length;
  const LABELS={opening:"Открытие",closing:"Закрытие",daily:"День",workday:"Будни",weekly:"Неделя",once:"Разово"};
  const EV_LABELS={task_done:"✅ Задача выполнена",task_undone:"↩️ Задача снята",card_issued:"🟥 Карточка",handover:"📨 Передача смене",task_added:"➕ Новая задача",assigned:"@ Назначен ответственный",shift_closed:"🎉 Смена закрыта",login:"🔑 Вход в систему",password_set:"🔐 Пароль задан",password_changed:"🔐 Пароль изменён",password_reset:"♻️ Пароль сброшен",acl_changed:"🛡️ Изменены доступы",task_deleted:"🗑️ Задача удалена",task_archived:"📦 Задача в архиве",task_restored:"♻️ Задача из архива"};
  return(<div className="sec">
    <div className="sec-head"><span className="sec-lbl"><FileText size={12}/>Журнал</span>
      <div style={{display:"flex",gap:4}}>{[["tasks","Задачи"],["events","События"]].map(([v,l])=><button key={v} className={`tab${view===v?" on":""}`} onClick={()=>setView(v)} style={{padding:"4px 10px",fontSize:11}}>{l}</button>)}</div>
    </div>
    {view==="tasks"&&<>
      <div className="field"><label>Дата</label><select value={filterDate} onChange={e=>setFilterDate(e.target.value)}>{[ds,...allDays.filter(d=>d!==ds)].map(d=><option key={d} value={d}>{fmtDate(d)}{d===ds?" — сегодня":""}</option>)}</select></div>
      {isManager&&<div className="field"><label>Сотрудник</label><select value={filterPerson} onChange={e=>setFilterPerson(e.target.value)}><option value="all">Все</option>{members.map(m=><option key={m} value={m}>{m}</option>)}</select></div>}
      <div style={{background:"var(--sf)",border:"1px solid var(--bd)",borderRadius:10,padding:"4px 14px"}}>
        {myTasks.length===0&&<div className="empty" style={{padding:"20px 0"}}>Нет задач за этот день</div>}
        {myTasks.map(t=>{const di=doneInfo(history[`${t.id}::${dd}`]);const done=!!di?.done;
          return(<div key={t.id} style={{display:"flex",alignItems:"center",gap:8,padding:"8px 0",borderBottom:"1px dashed var(--bd)"}}>
            <span style={{width:8,height:8,borderRadius:"50%",flexShrink:0,background:done?"var(--hp)":"var(--rs)"}}/>
            <span style={{flex:1,fontSize:13.5}}>{t.title}{di?.ts&&done&&<span className="mono" style={{fontSize:10,color:"var(--mt)",marginLeft:6}}>{new Date(di.ts).toLocaleTimeString("ru-RU",{hour:"2-digit",minute:"2-digit"})}</span>}</span>
            <span className="pill p-r">{LABELS[t.repeat]||t.repeat}</span>
            <span style={{fontSize:11,fontWeight:700,color:done?"var(--hp)":"var(--rs)"}}>{done?"✓":"✗"}</span>
          </div>);})}
      </div>
      {myTasks.length>0&&<div className="info-box" style={{marginTop:10}}>Выполнено: <span className="mono" style={{color:"var(--am)"}}>{doneCount}/{myTasks.length}</span></div>}
    </>}
    {view==="events"&&<div style={{background:"var(--sf)",border:"1px solid var(--bd)",borderRadius:10,padding:"4px 14px"}}>
      {eventsLog.length===0&&<div className="empty" style={{padding:"20px 0"}}>Событий пока нет</div>}
      {eventsLog.slice(0,80).map(e=><div className="log-ev" key={e.id}>
        <span className="log-ev-ts">{new Date(e.ts).toLocaleDateString("ru-RU",{day:"2-digit",month:"2-digit"})}<br/>{new Date(e.ts).toLocaleTimeString("ru-RU",{hour:"2-digit",minute:"2-digit"})}</span>
        <span style={{flex:1}}>{EV_LABELS[e.type]||e.type}<div style={{fontSize:11,color:"var(--mt)",marginTop:2}}>{e.who} · {e.detail}</div></span>
      </div>)}
    </div>}
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
      <div className="pr-nm">
        <span style={{display:"flex",alignItems:"center",gap:6}}>{m.name}
          {m.ac.some(c=>c.type==="red")&&<span>🔴</span>}{!m.ac.some(c=>c.type==="red")&&m.ac.some(c=>c.type==="orange")&&<span>🟠</span>}{!m.ac.some(c=>c.type==="orange")&&m.ac.some(c=>c.type==="yellow")&&<span>🟡</span>}
          {m.susp>0&&<span title="нереалистичное закрытие">🔍</span>}
        </span>
        <span style={{display:"flex",gap:10,alignItems:"center"}}>
          {m.tr&&<span style={{color:m.tr.delta>=0?"#8bc47a":"#e07a60",display:"flex",alignItems:"center"}}>{m.tr.delta>0?<TrendingUp size={13}/>:m.tr.delta<0?<TrendingDown size={13}/>:<Minus size={13}/>}</span>}
          <span className="mono" style={{fontSize:11,color:"var(--mt)"}}>{m.hours}ч</span>
          <span className="mono" style={{fontSize:12,color:"var(--mt)"}}>{m.don}/{m.tot}</span>
        </span>
      </div>
      <div className="bar-bg"><div className="bar-fill" style={{width:`${m.pct}%`}}/></div>
      <div className="bar-pct">{m.pct}%</div>
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
      {c.comment&&<div className="dc-comment">{c.comment}</div>}{c.isPrivate&&<div style={{fontSize:11,color:"var(--mt)",marginTop:4,display:"flex",alignItems:"center",gap:3}}><Lock size={11}/>Конфиденциально</div>}</div>)}
  </div>);
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
      <div className="info-box" style={{fontSize:12}}>Прототип: пароли показаны как есть (для раздачи команде). На сервере вместо просмотра будет «сброс» — пароли хранятся хешированными.</div>
      {ACCOUNTS.map(a=><PwdRow key={a} account={a} pwd={auth[a]} onReset={()=>onResetPassword(a)}/>)}
    </>}
  </div>);
}

function TeamHubTab({canTeam,canStats,isManager,who,eventsLog,tasks,history,ds,schedule,cards,onView,onRevoke,setCardModal,...rest}){
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

function PwdRow({account,pwd,onReset}){
  const[show,setShow]=useState(false);
  return(<div className="pr" style={{display:"flex",justifyContent:"space-between",alignItems:"center"}}>
    <div><div style={{fontWeight:600,fontSize:14}}>{accountLabel(account)}</div>
      <div className="mono" style={{fontSize:13,color:pwd?"var(--am)":"var(--mt)",marginTop:3}}>{pwd?(show?pwd:"•".repeat(Math.min(pwd.length,8))):"пароль не задан"}</div></div>
    <div style={{display:"flex",gap:6,alignItems:"center"}}>
      {pwd&&<button onClick={()=>setShow(v=>!v)} style={{background:"transparent",border:"none",color:"var(--mt)",cursor:"pointer"}}>{show?<EyeOff size={16}/>:<Eye size={16}/>}</button>}
      {pwd&&<button onClick={onReset} style={{background:"transparent",border:"1px solid rgba(158,63,43,.35)",color:"#e07a60",borderRadius:6,padding:"4px 9px",fontSize:11,cursor:"pointer"}}>сбросить</button>}
    </div>
  </div>);
}

function PasswordChanger({onChange}){
  const[v,setV]=useState("");const[v2,setV2]=useState("");const[msg,setMsg]=useState("");
  const submit=()=>{if(v.length<3){setMsg("Минимум 3 символа");return;}if(v!==v2){setMsg("Пароли не совпадают");return;}onChange(v);setV("");setV2("");setMsg("Пароль обновлён ✓");};
  return(<div style={{marginTop:14}}>
    <div className="sec-lbl" style={{marginBottom:8}}><Key size={12}/> Сменить пароль</div>
    <div className="field" style={{marginBottom:8}}><input type="password" value={v} onChange={e=>{setV(e.target.value);setMsg("");}} placeholder="Новый пароль"/></div>
    <div className="field" style={{marginBottom:8}}><input type="password" value={v2} onChange={e=>{setV2(e.target.value);setMsg("");}} placeholder="Повторите пароль"/></div>
    {msg&&<div style={{fontSize:12,color:msg.includes("✓")?"#8bc47a":"#e07a60",marginBottom:8}}>{msg}</div>}
    <button className="btn btn-p" onClick={submit}><Key size={15}/>Обновить пароль</button>
  </div>);
}

function AuthModal({account,hasPassword,onCancel,onSubmit}){
  const[pwd,setPwd]=useState("");const[pwd2,setPwd2]=useState("");const[err,setErr]=useState("");
  const submit=()=>{
    if(!hasPassword){if(pwd.length<3){setErr("Минимум 3 символа");return;}if(pwd!==pwd2){setErr("Пароли не совпадают");return;}}
    const r=onSubmit(pwd);
    if(r&&!r.ok)setErr(r.error||"Ошибка");
  };
  return(<div className="overlay" onClick={e=>e.target===e.currentTarget&&onCancel()}><div className="modal">
    <div className="handle"/>
    <div className="m-title" style={{display:"flex",alignItems:"center",gap:8}}><Lock size={18} color="var(--cu)"/>{accountLabel(account)}</div>
    {!hasPassword
      ?<div className="info-box" style={{fontSize:12}}>Первый вход — придумай пароль для этого аккаунта.</div>
      :<div className="info-box" style={{fontSize:12}}>Введи пароль для входа.</div>}
    <div className="field"><label>Пароль</label><input type="password" autoFocus value={pwd} onChange={e=>{setPwd(e.target.value);setErr("");}} onKeyDown={e=>e.key==="Enter"&&hasPassword&&submit()} placeholder="••••••"/></div>
    {!hasPassword&&<div className="field"><label>Повторите пароль</label><input type="password" value={pwd2} onChange={e=>{setPwd2(e.target.value);setErr("");}} placeholder="••••••"/></div>}
    {err&&<div style={{fontSize:13,color:"#e07a60",marginBottom:8}}>{err}</div>}
    <button className="btn btn-p" onClick={submit}><Lock size={15}/>{hasPassword?"Войти":"Задать пароль и войти"}</button>
    <button className="btn btn-g" onClick={onCancel}>Отмена</button>
  </div></div>);
}

function TaskCard({task,done,onToggle,onEdit,onHandover,highlight,dragHandle,dragging}){
  const rl=REPEAT_OPTS.find(r=>r.id===task.repeat)?.label;
  return(<div className={`task${done?" done":""}${dragging?" dragging":""}`} style={highlight&&!done?{borderColor:"rgba(232,160,48,.45)",borderLeftWidth:3}:undefined}>
    <div className="task-top">
      {dragHandle}
      <button className={`chk${done?" done":""}`} onClick={onToggle}>{done&&<CheckCircle size={14} color="#fff"/>}</button>
      <span className={`t-title${done?" done":""}`}>{task.title}{task.isReport&&<span style={{color:"var(--am)",fontSize:12}}> ★</span>}</span>
    </div>
    <div className="t-meta">
      {task.time&&<span className="pill p-t"><Clock size={10}/>{task.time}</span>}
      {task.assignedTo&&<span className="pill" style={{background:"rgba(232,160,48,.18)",color:"var(--am)"}}><AtSign size={10}/>{task.assignedTo}</span>}
      {task.assignee&&task.assignee!=="смена"&&<span className="pill p-w"><User size={10}/>{task.assignee}</span>}
      {task.assignee==="смена"&&!task.assignedTo&&<span className="pill p-w">вся смена</span>}
      {rl&&<span className="pill p-r">{rl}</span>}
    </div>
    {task.notes&&<div style={{fontSize:12,color:"var(--mt)",paddingLeft:35,marginTop:5,lineHeight:1.5}}>{task.notes}</div>}
    {(onEdit||onHandover)&&<div className="acts">
      {onHandover&&<button className="mini-btn" onClick={onHandover}><Send size={11}/>передать смене</button>}
      {onEdit&&<button className="mini-btn" onClick={onEdit}><Pencil size={11}/>изменить</button>}
    </div>}
  </div>);
}

// Перетаскивание задач (работает на мыши и на тач — через Pointer Events)
function DraggableTaskList({tasks,onReorder,onToggle,onEdit,onHandover,doneMap,onDelete,onArchive}){
  const [items,setItems]=useState(tasks);
  const key=tasks.map(t=>t.id).join("|");
  useEffect(()=>{setItems(tasks);},[key]);
  const dragIdx=useRef(null);
  const [dragging,setDragging]=useState(null);
  const contRef=useRef(null);
  // FLIP — плавное расступание карточек
  const rowEls=useRef({});
  const prevRects=useRef({});
  useLayoutEffect(()=>{
    Object.entries(rowEls.current).forEach(([id,el])=>{
      if(!el)return;
      const nr=el.getBoundingClientRect();
      const pr=prevRects.current[id];
      if(pr){
        const dy=pr.top-nr.top;
        if(dy){
          el.style.transition="none";
          el.style.transform=`translateY(${dy}px)`;
          requestAnimationFrame(()=>{el.style.transition="transform .2s cubic-bezier(.2,.7,.3,1)";el.style.transform="";});
        }
      }
      prevRects.current[id]=nr;
    });
  });
  const reorder=(from,to)=>setItems(prev=>{const a=[...prev];const[m]=a.splice(from,1);a.splice(to,0,m);return a;});
  const onMove=(clientY)=>{
    if(dragIdx.current==null||!contRef.current)return;
    const rows=[...contRef.current.querySelectorAll("[data-row]")];
    let target=rows.findIndex(r=>{const b=r.getBoundingClientRect();return clientY<b.top+b.height/2;});
    if(target===-1)target=rows.length-1;
    if(target!==dragIdx.current){reorder(dragIdx.current,target);dragIdx.current=target;setDragging(target);}
  };
  const start=(e,idx)=>{e.stopPropagation();dragIdx.current=idx;setDragging(idx);try{e.currentTarget.setPointerCapture(e.pointerId);}catch{}};
  const move=e=>{if(dragIdx.current!=null){e.preventDefault();onMove(e.clientY);}};
  const end=()=>{if(dragIdx.current!=null)onReorder(items.map(i=>i.id));dragIdx.current=null;setDragging(null);};
  return(<div ref={contRef}>
    {items.map((t,idx)=>(
      <div data-row key={t.id} ref={el=>{rowEls.current[t.id]=el;}}>
        <SwipeRow onDelete={onDelete?()=>onDelete(t.id):null} onArchive={onArchive?()=>onArchive(t.id):null}>
          <TaskCard task={t} done={!!doneMap[t.id]} dragging={dragging===idx}
            onToggle={()=>onToggle(t.id)} onEdit={onEdit?()=>onEdit(t):null} onHandover={onHandover?()=>onHandover(t):null}
            dragHandle={items.length>1?<span className="grip" onPointerDown={e=>start(e,idx)} onPointerMove={move} onPointerUp={end} onPointerCancel={end}><GripVertical size={16}/></span>:null}/>
        </SwipeRow>
      </div>
    ))}
  </div>);
}

// Свайп влево → открываются «Архив» и «Удалить». Тач + мышь, не мешает вертикальному скроллу.
function SwipeRow({children,onArchive,onDelete}){
  const enabled=!!(onArchive||onDelete);
  const W=(onArchive?78:0)+(onDelete?78:0);
  const [x,setX]=useState(0);
  const fg=useRef(null);
  const st=useRef({down:false,sx:0,sy:0,base:0,axis:null});
  if(!enabled)return children;
  const set=(v,anim)=>{const el=fg.current;if(!el)return;el.style.transition=anim?"transform .22s cubic-bezier(.2,.7,.3,1)":"none";el.style.transform=`translateX(${v}px)`;};
  const down=e=>{st.current={down:true,sx:e.clientX,sy:e.clientY,base:x,axis:null};};
  const moveH=e=>{
    const s=st.current;if(!s.down)return;
    const dx=e.clientX-s.sx,dy=e.clientY-s.sy;
    if(s.axis==null){ if(Math.abs(dx)<6&&Math.abs(dy)<6)return; s.axis=Math.abs(dx)>Math.abs(dy)?"x":"y"; if(s.axis==="x"){try{e.currentTarget.setPointerCapture(e.pointerId);}catch{}} }
    if(s.axis!=="x")return;
    e.preventDefault();
    let v=s.base+dx; v=Math.max(-W,Math.min(0,v)); setX(v); set(v,false);
  };
  const up=()=>{
    const s=st.current;if(!s.down)return;s.down=false;
    const open=x<-W/2; const v=open?-W:0; setX(v); set(v,true);
  };
  return(<div className="swipe">
    <div className="swipe-actions">
      {onArchive&&<button className="sw-arch" onClick={()=>{set(0,true);setX(0);onArchive();}}><Archive size={16}/>Архив</button>}
      {onDelete&&<button className="sw-del" onClick={()=>{set(0,true);setX(0);onDelete();}}><Trash2 size={16}/>Удалить</button>}
    </div>
    <div className="swipe-fg" ref={fg} onPointerDown={down} onPointerMove={moveH} onPointerUp={up} onPointerCancel={up}>
      {children}
    </div>
  </div>);
}

function DoneAccordion({tasks,onToggle,onEdit,onDelete,onArchive}){
  const [open,setOpen]=useState(false);
  return(<div className="acc">
    <button className="acc-head" onClick={()=>setOpen(o=>!o)}>
      <span style={{display:"flex",alignItems:"center",gap:6}}><CheckCircle size={13} color="var(--hp)"/>Выполнено · {tasks.length}</span>
      {open?<ChevronUp size={16}/>:<ChevronDown size={16}/>}
    </button>
    {open&&<div className="acc-body">{tasks.map(t=>(
      <SwipeRow key={t.id} onDelete={onDelete?()=>onDelete(t.id):null} onArchive={onArchive?()=>onArchive(t.id):null}>
        <TaskCard task={t} done onToggle={()=>onToggle(t.id)} onEdit={onEdit?()=>onEdit(t):null}/>
      </SwipeRow>
    ))}</div>}
  </div>);
}

function TaskModal({task,ds,members,onClose,onSave,onDelete}){
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

function CardModal({targetName,onClose,onIssue}){
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

function HandoverModal({task,ds,onClose,onSubmit}){
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

function DueRow({task,history,ds,onToggle}){
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
          <span style={{color:overdue?"#e07a60":"var(--mt)"}}>{overdue?"⚠ просрочено · ":""}{dl.text}</span>
          {task.assignedTo&&task.assignedBy&&<span>от {task.assignedBy}</span>}
        </div>
      </div>
      <span style={{fontSize:11,fontWeight:700,color:done?"var(--hp)":"var(--mt)"}}>{done?"✓":"○"}</span>
    </div>
  </div>);
}

function InboxModal({who,tasks,history,ds,onClose,onToggle}){
  return(<div className="overlay" onClick={e=>e.target===e.currentTarget&&onClose()}><div className="modal">
    <div className="handle"/>
    <div className="m-title" style={{display:"flex",alignItems:"center",gap:8}}><Inbox size={18} color="var(--cu)"/>Мои задачи · {who}</div>
    <div className="info-box" style={{fontSize:12}}>Здесь все задачи, где упомянули именно тебя (@{who}). Можно отметить выполнение, если срок сегодня.</div>
    {tasks.length===0&&<div className="empty">Пока нет задач с твоим упоминанием</div>}
    {tasks.map(t=><DueRow key={t.id} task={t} history={history} ds={ds} onToggle={dueLabel(t,ds).dueDate===ds?onToggle:null}/>)}
    <button className="btn btn-g" onClick={onClose} style={{marginTop:14}}>Закрыть</button>
  </div></div>);
}

function ClosingSummaryModal({summary,auto,onClose,onCarryOver}){
  const[showIrr,setShowIrr]=useState(false);
  const pct=summary.total?Math.round(summary.done/summary.total*100):100;
  return(<div className="overlay" onClick={e=>e.target===e.currentTarget&&onClose()}><div className="modal">
    <div className="handle"/>
    <div className="m-title" style={{display:"flex",alignItems:"center",gap:8}}>{auto?"🎉 Смена закрыта":"Итоги дня"} · {fmtDate(summary.date)}</div>

    <div className="grid2">
      <div className="stat-c"><div className="stat-n" style={{color:"#8bc47a"}}>{summary.done}</div><div className="stat-l">Выполнено</div><div className="stat-s">из {summary.total} регулярных</div></div>
      <div className="stat-c"><div className="stat-n" style={{color:summary.notDone.length?"#e07a60":"var(--mt)"}}>{summary.notDone.length}</div><div className="stat-l">Не выполнено</div><div className="stat-s">{summary.notDone.length?"перенос на завтра":"всё закрыто"}</div></div>
    </div>

    <div className="prog-bg" style={{marginBottom:14}}><div className="prog-fill" style={{width:`${pct}%`}}/></div>

    {summary.notDone.length>0&&<>
      <div className="sec-lbl" style={{marginBottom:8}}>Невыполненные регулярные</div>
      {summary.notDone.map(t=><div className="sc" key={t.id}><div className="sr"><div className="sn" style={{fontWeight:500}}><span style={{width:8,height:8,borderRadius:"50%",background:"var(--rs)",display:"inline-block"}}/>{t.title}</div></div></div>)}
      <button className="btn btn-p" style={{marginTop:8}} onClick={()=>onCarryOver(summary.notDone)}><ArrowRight size={15}/>Перенести {summary.notDone.length} на завтра</button>
    </>}

    <div style={{marginTop:14,border:"1px solid var(--bd)",borderRadius:10,overflow:"hidden"}}>
      <button onClick={()=>setShowIrr(v=>!v)} style={{width:"100%",background:"var(--bg)",border:"none",color:"var(--pp)",padding:"12px 14px",fontSize:13.5,fontWeight:500,cursor:"pointer",display:"flex",justifyContent:"space-between",alignItems:"center"}}>
        <span style={{display:"flex",alignItems:"center",gap:8}}><FileText size={14} color="#9bb0c4"/>Нерегулярные задачи · {summary.irregOpen.length}</span>
        {showIrr?<ChevronLeft size={16} style={{transform:"rotate(90deg)"}}/>:<ChevronRight size={16} style={{transform:"rotate(90deg)"}}/>}
      </button>
      {showIrr&&<div style={{padding:"4px 14px 10px"}}>
        {summary.irregOpen.length===0&&<div style={{fontSize:13,color:"var(--mt)",padding:"8px 0"}}>Нет висящих нерегулярных задач 👌</div>}
        {summary.irregOpen.map(t=><div key={t.id} style={{display:"flex",alignItems:"center",gap:8,padding:"7px 0",borderBottom:"1px dashed var(--bd)",fontSize:13}}>
          <span style={{width:7,height:7,borderRadius:"50%",background:"#9bb0c4",flexShrink:0}}/>{t.title}{t.assignedTo&&<span className="mono" style={{fontSize:10,color:"var(--am)",marginLeft:"auto"}}>@{t.assignedTo}</span>}
        </div>)}
      </div>}
    </div>

    <button className="btn btn-g" onClick={onClose} style={{marginTop:14}}>Закрыть</button>
  </div></div>);
}

/* ---------- Гоу-лист: общий список команды ---------- */
function GoRow({item,onToggle,onRemove}){
  return(<div className="task" style={{display:"flex",alignItems:"center",gap:10,marginBottom:6}}>
    <button className={`chk${item.done?" done":""}`} onClick={()=>onToggle(item.id)}>{item.done&&<CheckCircle size={14} color="#fff"/>}</button>
    <span style={{flex:1,fontSize:14,textDecoration:item.done?"line-through":"none",color:item.done?"var(--mt)":"var(--pp)"}}>{item.text}</span>
    {item.by&&<span style={{fontSize:10,color:"var(--mt)"}}>{item.by}</span>}
    <button onClick={()=>onRemove(item.id)} style={{background:"transparent",border:"none",color:"var(--mt)",cursor:"pointer",fontSize:20,lineHeight:1,padding:"0 2px"}}>×</button>
  </div>);
}
function GoListInput({onAdd}){
  const[txt,setTxt]=useState("");
  const add=()=>{if(txt.trim()){onAdd(txt);setTxt("");}};
  return(<div style={{display:"flex",gap:8,marginBottom:12}}>
    <input value={txt} onChange={e=>setTxt(e.target.value)} onKeyDown={e=>e.key==="Enter"&&add()} placeholder="Добавить пункт…"
      style={{flex:1,background:"var(--bg)",border:"1px solid var(--bd)",borderRadius:8,padding:"10px 12px",color:"var(--pp)",fontSize:14,fontFamily:"inherit"}}/>
    <button className="btn btn-p" style={{width:"auto",padding:"0 16px",margin:0}} onClick={add}><Plus size={16}/></button>
  </div>);
}
/* ---------- Дашборд: трекеры времени (3 вида на выбор) ---------- */
function Ring({pct,color,top,bottom}){
  const r=26,c=2*Math.PI*r,off=c*(1-Math.min(Math.max(pct,0),1));
  return(<svg viewBox="0 0 64 64" width="74" height="74">
    <circle cx="32" cy="32" r={r} fill="none" stroke="var(--bd)" strokeWidth="6"/>
    <circle cx="32" cy="32" r={r} fill="none" stroke={color} strokeWidth="6" strokeLinecap="round"
      strokeDasharray={c} strokeDashoffset={off} transform="rotate(-90 32 32)" style={{transition:"stroke-dashoffset .5s ease"}}/>
    <text x="32" y="30" textAnchor="middle" fontSize="15" fontWeight="700" fill="var(--pp)" fontFamily="'IBM Plex Mono',monospace">{top}</text>
    <text x="32" y="42" textAnchor="middle" fontSize="8" fill="var(--mt)">{bottom}</text>
  </svg>);
}
function DashboardTab({schedule,members,ds}){
  const[view,setView]=useState("bars");
  const month=ds.slice(0,7);
  const monthDays=Object.keys(schedule).filter(d=>d.startsWith(month));
  const memHours=name=>monthDays.reduce((a,d)=>{const s=(schedule[d]||[]).find(x=>x.name===name);return a+(s&&s.end?hmm(s.end)/60:0);},0);
  const memShifts=name=>monthDays.filter(d=>(schedule[d]||[]).some(s=>s.name===name)).length;
  const stats=members.map(n=>({name:n,hours:Math.round(memHours(n)*10)/10,shifts:memShifts(n),nrm:hourNorm(n)})).sort((a,b)=>b.hours-a.hours);
  const subShifts=monthDays.reduce((a,d)=>a+(schedule[d]||[]).filter(s=>s.sub||(!members.includes(s.name)&&s.name)).length,0);
  const totalH=Math.round(stats.reduce((a,m)=>a+m.hours,0));
  const week=rangeDays(ds,7).slice().reverse();
  const dayHours=d=>(schedule[d]||[]).reduce((a,s)=>a+(s.end?hmm(s.end)/60:0),0);
  const maxDay=Math.max(1,...week.map(dayHours));
  const VIEWS=[["bars","Часы"],["days","По дням"],["rings","Кольца"]];
  const col=m=>m.hours>m.nrm.max?"var(--rs)":m.hours>=m.nrm.min?"var(--hp)":"var(--am)";
  return(<div className="sec">
    <div className="sec-head"><span className="sec-lbl"><Clock size={12}/>Дашборд · {totalH}ч / мес</span></div>
    <div className="chip-row" style={{marginBottom:14}}>{VIEWS.map(([id,l])=><button key={id} className={`chip${view===id?" on":""}`} onClick={()=>setView(id)}>{l}</button>)}</div>

    {view==="bars"&&stats.map(m=>{const denom=m.nrm.max;return(<div className="pr" key={m.name}>
      <div className="pr-nm"><span>{m.name}</span><span className="mono" style={{fontWeight:600,fontSize:14,color:col(m)}}>{m.hours}ч</span></div>
      <div className="bar-bg"><div className="bar-fill" style={{width:`${Math.min(m.hours/denom*100,100)}%`,background:col(m),transition:"width .4s ease"}}/></div>
      <div style={{display:"flex",justifyContent:"space-between",marginTop:4}}><span className="bar-pct">{m.shifts} смен</span><span className="bar-pct">норма {m.nrm.min}–{m.nrm.max}ч</span></div>
    </div>);})}

    {view==="days"&&<div>
      <div style={{display:"flex",alignItems:"flex-end",gap:6,height:140,padding:"8px 0",borderBottom:"1px solid var(--bd)"}}>
        {week.map(d=>{const h=dayHours(d);const dt=new Date(d);return(<div key={d} style={{flex:1,display:"flex",flexDirection:"column",alignItems:"center",gap:4,height:"100%",justifyContent:"flex-end"}}>
          <span className="mono" style={{fontSize:10,color:"var(--am)"}}>{h?Math.round(h):""}</span>
          <div style={{width:"70%",height:`${h/maxDay*100}%`,minHeight:h?4:0,background:"linear-gradient(180deg,var(--cu),var(--cu2))",borderRadius:"4px 4px 0 0",transition:"height .4s ease"}}/>
          <span style={{fontSize:10,color:"var(--mt)"}}>{["вс","пн","вт","ср","чт","пт","сб"][dt.getDay()]}</span>
        </div>);})}
      </div>
      <div className="info-box" style={{marginTop:12}}>Часы персонала по дням за неделю. Видно перегруз/недогруз смен.</div>
    </div>}

    {view==="rings"&&<div style={{display:"grid",gridTemplateColumns:"repeat(auto-fill,minmax(110px,1fr))",gap:12,justifyItems:"center"}}>
      {stats.map(m=>{const pct=m.hours/m.nrm.max;return(<div key={m.name} style={{textAlign:"center"}}>
        <Ring pct={pct} color={col(m)} top={`${m.hours}`} bottom={`/${m.nrm.max}ч`}/>
        <div style={{fontSize:13,fontWeight:600,marginTop:4}}>{m.name}</div>
        <div style={{fontSize:10,color:"var(--mt)"}}>{m.shifts} смен</div>
      </div>);})}
    </div>}

    {subShifts>0&&<div className="info-box" style={{marginTop:14}}>Подмены из других проектов за месяц: <b style={{color:"var(--cu)"}}>{subShifts}</b> смен (в нормы команды не входят).</div>}
  </div>);
}

/* Компактный гоу-лист на «Сегодня» — всегда под рукой, сворачивается */
function GoListBlock({items,onAdd,onToggle,onRemove}){
  const[open,setOpen]=useState(true);
  const openCnt=items.filter(i=>!i.done).length;
  return(<div style={{border:"1px solid var(--bd)",borderRadius:10,overflow:"hidden",background:"var(--sf)"}}>
    <button onClick={()=>setOpen(o=>!o)} className="acc-head">
      <span style={{display:"flex",alignItems:"center",gap:6}}><FileText size={13} color="var(--cu)"/>Гоу-лист · {openCnt}</span>
      {open?<ChevronUp size={16}/>:<ChevronDown size={16}/>}
    </button>
    {open&&<div style={{padding:"4px 12px 12px"}}>
      <GoListInput onAdd={onAdd}/>
      {items.length===0&&<div style={{fontSize:12,color:"var(--mt)",padding:"4px 0"}}>Пусто. Добавь, что купить или занести.</div>}
      {items.filter(i=>!i.done).map(i=><GoRow key={i.id} item={i} onToggle={onToggle} onRemove={onRemove}/>)}
      {items.some(i=>i.done)&&<div style={{fontSize:11,color:"var(--mt)",margin:"8px 0 4px",opacity:.7}}>Куплено</div>}
      {items.filter(i=>i.done).map(i=><GoRow key={i.id} item={i} onToggle={onToggle} onRemove={onRemove}/>)}
    </div>}
  </div>);
}
