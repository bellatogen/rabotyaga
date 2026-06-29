import { useState, useEffect, useMemo } from "react";
import { Plus, User, Lock, Shield, Inbox, ChevronLeft, Sun, Moon, MonitorSmartphone } from "lucide-react";
import { AdminTab } from "./AdminTab.jsx";
import './styles/app.css';
import { ROLES } from './constants/roles.js';
import { SHIFT_STATUSES } from './constants/shifts.js';
import { MONTHS_RU, DOW_FULL, DEFAULT_MEMBERS, DEFAULT_PROFILES } from './constants/locale.js';
import { EMBEDDED_SCHEDULE, EMBEDDED_EVENTS } from './constants/schedule.js';
import { isEventToday, buildEventsFlatMap, migrateEventsV1toV2 } from './constants/events.js';
import { defaultTasks, mergeSeeds } from './constants/seeds.js';
import { uid, nowISO, fmtDate, addDays } from './utils/dateUtils.js';
import { isToday, isDone, todayStr, buildDaySummary } from './utils/taskUtils.js';
import { hasPerm, accountLabel } from './utils/authUtils.js';
import { afterPushGate, getShiftStatus } from './utils/staffUtils.js';
import { DEFAULT_HOUR_NORMS } from './constants/staff.js';
import { processCard } from './utils/cardUtils.js';
import { applyTheme, THEME_KEY } from './utils/theme.js';
  import { ld, sv, pingServer, tgBind, authLogin, authLogout, authMe, authHasPassword, authChangePassword, authResetPassword, notifyShiftClosed, fetchRoster } from './services/api.js';
import { usePersist } from './hooks/usePersist.js';
import { Mascot } from './components/Mascot.jsx';
import { TodayTab } from './pages/TodayTab.jsx';
import { TasksTab } from './pages/TasksTab.jsx';
import { ScheduleTab, DayDetail } from './pages/ScheduleTab.jsx';
import { PersonalCabinet } from './pages/PersonalCabinet.jsx';
import { TeamHubTab } from './pages/TeamHubTab.jsx';
import { EventsTab } from './pages/EventsTab.jsx';
import { TapsTab } from './pages/TapsTab.jsx';
import { TaskModal } from './modals/TaskModal.jsx';
import { CardModal } from './modals/CardModal.jsx';
import { HandoverModal } from './modals/HandoverModal.jsx';
  import { IncomingHandoverModal } from './modals/IncomingHandoverModal.jsx';
import { InboxModal } from './modals/InboxModal.jsx';
import { ClosingSummaryModal } from './modals/ClosingSummaryModal.jsx';
import { AuthModal } from './modals/AuthModal.jsx';

// Telegram Mini App
const TG=(typeof window!=="undefined"&&window.Telegram)?window.Telegram.WebApp:null;
function tgUserId(){try{return TG?.initDataUnsafe?.user?.id||null;}catch{return null;}}
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
  const[monthPlan,setMonthPlan]=useState({}); // { "YYYY-MM": число } — месячный план выручки
  const[hourNorms,setHourNorms]=useState(DEFAULT_HOUR_NORMS); // { имя: {min,max} } — нормы часов
  const[handovers,setHandovers]=useState({});
    const[handoverSeen,setHandoverSeen]=useState({});
  const[eventsLog,setEventsLog]=useState([]);
  const[leaveRequests,setLeaveRequests]=useState([]);
  const[inboxSeen,setInboxSeen]=useState({});
  const[shiftClosed,setShiftClosed]=useState({});
  const[closeNotified,setCloseNotified]=useState({});
  const[auth,setAuth]=useState({}); // после миграции auth:v1 не грузится на клиент — только для совместимости TeamHub
  const[authHasPasswordMap,setAuthHasPasswordMap]=useState({}); // кешируем hasPassword флаги
  const[taskOrder,setTaskOrder]=useState([]);
  const[members,setMembers]=useState(DEFAULT_MEMBERS);
  const[schedule,setSchedule]=useState(EMBEDDED_SCHEDULE);
  const[eventsData,setEventsData]=useState(EMBEDDED_EVENTS); // events:v1 — плоская карта {дата:строка} из Google-таблицы (scheduleSync)
  const[eventsV2,setEventsV2]=useState([]); // events:v2 — рич-события (создаются в EventsTab)
  const[goList,setGoList]=useState([]);
  const[taskComments,setTaskComments]=useState({});
  const[serverOk,setServerOk]=useState(null);
  const[acl,setAcl]=useState({});
  const[authPending,setAuthPending]=useState(null);
  const[toast,setToast]=useState(null);
  const[modal,setModal]=useState(null);
  const[viewingEmployee,setViewingEmployee]=useState(null);
  const[viewingDay,setViewingDay]=useState(null);
  const[loading,setLoading]=useState(true);
  const[themePref,setThemePref]=useState(()=>{try{return localStorage.getItem(THEME_KEY)||"auto";}catch{return "auto";}});
  // Порядок вкладок (drag-and-drop), хранится в localStorage
  const[navTabOrder,setNavTabOrder]=useState(()=>{try{return JSON.parse(localStorage.getItem('rab:nav_tab_order')||'[]');}catch{return [];}});
  const[dragTab,setDragTab]=useState(null);
  const[mozgDashboard,setMozgDashboard]=useState({});

  const ds=todayStr(), now=new Date(), dateObj=new Date(ds);
  const dateLabel=`${DOW_FULL[dateObj.getDay()]}, ${dateObj.getDate()} ${MONTHS_RU[dateObj.getMonth()]}`;
  // Плоская карта событий для календаря/аналитики/норматива штата: v1 (Google-таблица)
  // + развёрнутые вхождения рич-событий v2 в окне ±400 дней. v1 не перезаписывается.
  // (React Compiler авто-мемоизирует эти вычисления — ручной useMemo не нужен)
  const events=buildEventsFlatMap(eventsData,eventsV2,addDays(ds,-400),addDays(ds,400));
  // Рич-события, применимые к сегодняшнему дню (для вкладки «Сегодня»)
  const todayEvents=eventsV2.filter(e=>isEventToday(e,ds));

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
  // Живой рефреш состава, пока открыт экран входа: добавленный на другом
  // устройстве появляется, удалённый пропадает — без перезапуска мини-аппы.
  // setX(prev=>...) с JSON-сравнением: не дёргаем стейт и не эхоим запись,
  // если ничего не изменилось (иначе usePersist гнал бы лишние PUT каждые 12с).
  useEffect(()=>{if(!picking)return;let on=true;
    const refresh=async()=>{try{
      const roster=await fetchRoster(); // публичный ростер: members + hasPassword одним запросом
      if(!on||!roster)return;
      const mem=roster.members;
      if(Array.isArray(mem))setMembers(prev=>JSON.stringify(prev)===JSON.stringify(mem)?prev:mem);
      const hpMap=roster.hasPassword||{};
      setAuthHasPasswordMap(prev=>JSON.stringify(prev)===JSON.stringify(hpMap)?prev:hpMap);
    }catch{}};
    refresh();
    const id=setInterval(refresh,12000);
    const onVis=()=>{if(document.visibilityState==='visible')refresh();};
    document.addEventListener('visibilitychange',onVis);
    window.addEventListener('focus',refresh);
    return()=>{on=false;clearInterval(id);document.removeEventListener('visibilitychange',onVis);window.removeEventListener('focus',refresh);};
  },[picking]);
  // Сохраняем порядок вкладок в localStorage (хук здесь — до early returns)
  useEffect(()=>{localStorage.setItem('rab:nav_tab_order',JSON.stringify(navTabOrder));},[navTabOrder]);
  useEffect(()=>{(async()=>{
  const _loaded=await Promise.all([
      ld("tasks:v4",defaultTasks()),ld("done:hist:v2",{}),ld("profiles:v1",DEFAULT_PROFILES),
      ld("cards:v1",[]),ld("status_overrides:v1",[]),ld("revenue:v1",{}),ld("month_plan:v1",{}),
      ld("handovers:v1",{}),ld("events_log:v1",[]),ld("inbox_seen:v1",{}),ld("shift_closed:v1",{}),ld("close_notified:v1",{}),ld("acl:v1",{}),ld("task_order:v1",[]),ld("members:v1",DEFAULT_MEMBERS),ld("schedule:v1",EMBEDDED_SCHEDULE),ld("events:v1",EMBEDDED_EVENTS),ld("golist:v1",[]),ld("leave_requests:v1",[]),ld("task_comments:v1",{}),
      ld("hour_norms:v1",DEFAULT_HOUR_NORMS),ld("events:v2",[]),ld("handover_seen:v1",{}),
      ld("mozg:dashboard:v1",{}),
    ]);
    const[t,hist,profs,cds,so,rev,mp,ho,ev,seen,sc,cn,ac,tord,mem,sch,evKV,gl,lr,tc,hn,evV2,hs,mozgDb]=_loaded;
    setTasks(mergeSeeds(t));setHistory(hist);setProfiles(profs);setCards(cds);setStatusOverrides(so);
    setRevenue(rev);setMonthPlan(mp||{});setHandovers(ho);setEventsLog(ev);setInboxSeen(seen);setShiftClosed(sc);setCloseNotified(cn);setHandoverSeen(hs||{});setAcl(ac);setTaskOrder(tord);setMembers(mem);setSchedule(sch);if(evKV&&Object.keys(evKV).length)setEventsData(evKV);setGoList(gl);if(lr&&lr.length)setLeaveRequests(lr);if(tc&&Object.keys(tc).length)setTaskComments(tc);
    if(hn&&Object.keys(hn).length)setHourNorms(hn);
    if(mozgDb&&Object.keys(mozgDb).length)setMozgDashboard(mozgDb);
    // Миграция events:v1 → events:v2 (один раз, пока v2 пуст) — детерминированные id
    const v1src=(evKV&&Object.keys(evKV).length)?evKV:EMBEDDED_EVENTS;
    setEventsV2((Array.isArray(evV2)&&evV2.length)?evV2:migrateEventsV1toV2(v1src));
    // Восстанавливаем сессию по httpOnly cookie (серверная авторизация)
    const restoredAccount = await authMe();
    if(restoredAccount){setWho(restoredAccount);}else{setPicking(true);}
      // hasPassword флаги пачкой из публичного /api/roster — без бёрста
      // по /auth/has-password (он упирался в rate-limit → ложное «нет пароля»).
      const roster=await fetchRoster();
      if(roster){
        if(Array.isArray(roster.members))setMembers(roster.members);
        setAuthHasPasswordMap(roster.hasPassword||{});
      }
    setLoading(false);
  })();},[]);
  const ready=!loading;
  // Перезагружает revenue + schedule из KV после backfill (AdminTab вызывает после успеха)
  async function reloadAfterBackfill(){
    const[rev,sch]=await Promise.all([
      ld("revenue:v1",{}),
      ld("schedule:v1",EMBEDDED_SCHEDULE),
    ]);
    setRevenue(rev);
    setSchedule(sch);
  }
  // Спред-сеттеры — не затираем другие записи
  const setMonthPlanFor=(ym,n)=>setMonthPlan(p=>({...p,[ym]:n}));
  const setHourNormFor=(name,min,max)=>setHourNorms(p=>({...p,[name]:{min,max}}));
  usePersist("tasks:v4",tasks,ready);
  usePersist("done:hist:v2",history,ready);
  usePersist("profiles:v1",profiles,ready);
  usePersist("cards:v1",cards,ready);
  usePersist("status_overrides:v1",statusOverrides,ready);
  usePersist("revenue:v1",revenue,ready);
  usePersist("month_plan:v1",monthPlan,ready);
  usePersist("hour_norms:v1",hourNorms,ready);
  usePersist("handovers:v1",handovers,ready);
  usePersist("events_log:v1",eventsLog,ready);
  usePersist("inbox_seen:v1",inboxSeen,ready);
  usePersist("shift_closed:v1",shiftClosed,ready);
  usePersist("close_notified:v1",closeNotified,ready);
    usePersist("handover_seen:v1",handoverSeen,ready);
  // auth:v1 НЕ синхронизируется на клиент — управляется только через /api/auth/*
  usePersist("acl:v1",acl,ready);
  usePersist("task_order:v1",taskOrder,ready);
  usePersist("members:v1",members,ready);
  usePersist("schedule:v1",schedule,ready);
  usePersist("golist:v1",goList,ready);
  usePersist("events:v1",eventsData,ready);
  usePersist("events:v2",eventsV2,ready);
  usePersist("leave_requests:v1",leaveRequests,ready);
  usePersist("task_comments:v1",taskComments,ready);

  const isManager=who==="manager"||who==="developer";
  const isDeveloper=who==="developer";
  const myStatus=who&&!isManager?getShiftStatus(who,ds,schedule,statusOverrides,now):null;
  const todayShifts=schedule[ds]||[];
  const myShift=who&&!isManager?todayShifts.find(s=>s.name===who):null;
  const imOnShift=["on_shift","today_shift","worked"].includes(myStatus);
  const imReport=myShift?.report;

  const logEvent=(type,detail)=>setEventsLog(prev=>[{id:uid(),ts:nowISO(),who:accountLabel(who),type,detail},...prev].slice(0,500));
  const saveEventV2=ev=>setEventsV2(prev=>prev.some(e=>e.id===ev.id)?prev.map(e=>e.id===ev.id?ev:e):[...prev,ev]);
  const deleteEventV2=id=>setEventsV2(prev=>prev.filter(e=>e.id!==id));
  const onLeaveRequest=req=>setLeaveRequests(prev=>[...prev,{...req,id:uid(),ts:nowISO(),status:"pending",decidedBy:null,decidedAt:null}]);
  const onLeaveDecide=(id,approved)=>{
    const req=leaveRequests.find(r=>r.id===id);
    setLeaveRequests(prev=>prev.map(r=>r.id===id?{...r,status:approved?"approved":"rejected",decidedBy:accountLabel(who),decidedAt:nowISO()}:r));
    if(approved&&req)setStatusOverrides(prev=>[...prev.filter(x=>x.name!==req.name||x.from!==req.from),{name:req.name,status:req.type,from:req.from,until:req.until||req.from}]);
  };

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
      notifyShiftClosed({
        date:ds,done:summary.done,total:summary.total,
        revenueFact:revenue[ds]?.fact??null,
        revenuePlan:revenue[ds]?.plan??null,
        workers:(schedule[ds]||[]).map(s=>s.name),
      }).catch(()=>{});
      setToast("✅ Смена закрыта. Управляющий уведомлён.");
      setTimeout(()=>setToast(null),6000);
      setModal({_closing:true,summary,auto:true});
    }
  // eslint-disable-next-line
  },[loading,who,dayClosed]);

  const fireClosing=(snapHistory)=>{
    const summary=buildDaySummary(tasks,snapHistory,ds);
    setCloseNotified(prev=>({...prev,[ds]:true}));
    logEvent("shift_closed",`Смена закрыта · выполнено ${summary.done}/${summary.total}`);
    notifyShiftClosed({
      date:ds,done:summary.done,total:summary.total,
      revenueFact:revenue[ds]?.fact??null,
      revenuePlan:revenue[ds]?.plan??null,
      workers:(schedule[ds]||[]).map(s=>s.name),
    }).catch(()=>{});
    setToast("✅ Смена закрыта. Управляющий уведомлён.");
    setTimeout(()=>setToast(null),6000);
    setModal({_closing:true,summary,auto:true});
  };
  const openSummary=()=>{const summary=buildDaySummary(tasks,history,ds);setModal({_closing:true,summary,auto:false});};
  const carryOverTasks=useMemo(()=>tasks.filter(t=>!t.archived&&t.title.startsWith('[Перенос]')&&isToday(t,ds)&&!isDone(history[`${t.id}::${ds}`])),[tasks,history,ds]);
  const todayHandoverNotes=handovers[ds]||[];
  const showHandover=!loading&&!!who&&!handoverSeen[ds]&&(carryOverTasks.length>0||todayHandoverNotes.length>0);
  const acceptHandover=()=>{setHandoverSeen(prev=>({...prev,[ds]:true}));logEvent('handover_accepted',`принято: ${carryOverTasks.length} задач перенесено`);sv('handover_seen:v1',{...handoverSeen,[ds]:true}).catch(()=>{});};
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
      // Новая задача — фиксируем автора
      if(!existing) nt={...nt,createdBy:accountLabel(who),createdAt:nowISO()};
      // Назначение изменилось — фиксируем кто назначил
      if(t.assignedTo&&(!existing||existing.assignedTo!==t.assignedTo))
        nt={...nt,assignedTs:nowISO(),assignedBy:accountLabel(who)};
      return p.some(x=>x.id===t.id)?p.map(x=>x.id===t.id?nt:x):[...p,nt];
    });
    logEvent(t.assignedTo?"assigned":"task_added",t.assignedTo?`@${t.assignedTo}: ${t.title}`:t.title);
    setModal(null);
  };
  const onAddComment=(taskId,comment)=>setTaskComments(prev=>({...prev,[taskId]:[...(prev[taskId]||[]),comment]}));
  const delTask=id=>{const t=tasks.find(x=>x.id===id);setTasks(p=>p.filter(x=>x.id!==id));logEvent("task_deleted",t?.title||id);setModal(null);};
  const archiveTask=(id,val=true)=>{const t=tasks.find(x=>x.id===id);setTasks(p=>p.map(x=>x.id===id?{...x,archived:val}:x));logEvent(val?"task_archived":"task_restored",t?.title||id);};
  const issueCard=(name,type,comment,isPrivate)=>{
    const notDoneTasks=tasks.filter(t=>!t.archived&&isToday(t,ds)&&!isDone(history[`${t.id}::${ds}`])).map(t=>t.title);
    setCards(prev=>{const r=processCard(prev,name,type,comment,isPrivate,accountLabel(who),notDoneTasks);logEvent("card_issued",`${name}: ${r.finalType}${isPrivate?" (конфид.)":""}`);return r.cards;});
  };
  const addHandover=(forDate,text,createTask,taskTitle)=>{
    setHandovers(prev=>({...prev,[forDate]:[...(prev[forDate]||[]),{id:uid(),text,by:accountLabel(who),ts:nowISO()}]}));
    if(createTask&&taskTitle){const nt={id:uid(),title:`[Перенос] ${taskTitle}`,repeat:"once",date:forDate,time:"",assignee:"смена",notes:text,isReport:false};setTasks(p=>[...p,nt]);}
    logEvent("handover",`на ${fmtDate(forDate)}: ${text.slice(0,40)}`);
  };
  const doLogin=name=>{setWho(name);setPicking(false);setAuthPending(null);logEvent("login",accountLabel(name));tgBind(name, tgUserId());};
  const requestLogin=async account=>{
    // Проверяем наличие пароля на сервере перед показом модалки
    const has=await authHasPassword(account);
    setAuthHasPasswordMap(prev=>({...prev,[account]:has}));
    setAuthPending(account);
  };
  const submitAuth=async(account,pwd)=>{
    try{
      await authLogin(account,pwd);
      doLogin(account);
      return{ok:true};
    }catch(e){
      return{ok:false,error:e.message};
    }
  };
  const handleLogout=async()=>{
    await authLogout();
    setWho(null);
    setPicking(true);
    logEvent("logout",accountLabel(who));
  };
  const changePassword=async(account,newPwd,currentPwd)=>{
    await authChangePassword(account,newPwd,currentPwd);
    logEvent("password_changed",accountLabel(account));
  };
  const resetPassword=async account=>{
    await authResetPassword(account);
    logEvent("password_reset",accountLabel(account));
  };
  const setManagerCanViewPasswords=v=>{setAcl(prev=>({...prev,managerCanViewPasswords:v}));logEvent("acl_changed",`Управляющий ${v?"может":"не может"} видеть пароли`);};
  const canAddTasks=hasPerm(who,profiles,"add_tasks");
  const isChef=!isManager&&(profiles.find(p=>p.name===who)?.role==="head_barman");
  const canTeam=isManager||isChef; // шеф/управляющий/разраб управляют составом
  // --- управление командой ---
  const addMember=name=>{const n=(name||"").trim();if(!n||members.includes(n))return;setMembers(p=>[...p,n]);setProfiles(p=>p.some(x=>x.name===n)?p:[...p,{name:n,role:"barman",perms:ROLES.barman.perms}]);logEvent("member_added",n);};
  // Удаление сотрудника: убираем и из состава (members), и из профилей
  // (profiles), а копию пишем в архив staff_archive:v1 — увольнённый исчезает
  // с фронта на всех устройствах, но сохраняется в логах/архиве.
  const removeMember=async name=>{
    const prof=profiles.find(x=>x.name===name)||{name};
    setMembers(p=>p.filter(x=>x!==name));
    setProfiles(p=>p.filter(x=>x.name!==name));
    try{
      const arch=await ld("staff_archive:v1",[]);
      const list=Array.isArray(arch)?arch:[];
      const next=[...list.filter(x=>x.name!==name),{...prof,archivedAt:new Date().toISOString()}];
      await sv("staff_archive:v1",next);
    }catch{}
    logEvent("member_removed",name);
  };
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
              {!authHasPasswordMap[m]&&<span style={{fontSize:10,color:"var(--mt)"}}>нет пароля</span>}
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
        {authPending&&<AuthModal account={authPending} hasPassword={!!authHasPasswordMap[authPending]} onCancel={()=>setAuthPending(null)} onSubmit={pwd=>submitAuth(authPending,pwd)}/>}
    </div>);

  if(viewingDay)return (
    <div className="app">
      <div className="nav"><div className="nav-row">
        <button onClick={()=>setViewingDay(null)} style={{background:"transparent",border:"none",color:"var(--cu)",cursor:"pointer",display:"flex",alignItems:"center",gap:6,fontSize:14,fontWeight:600,padding:"6px 10px",borderRadius:6,transition:"all .2s ease"}} onMouseEnter={e=>{e.currentTarget.style.background="var(--sf)";e.currentTarget.style.color="var(--pp)";}} onMouseLeave={e=>{e.currentTarget.style.background="transparent";e.currentTarget.style.color="var(--cu)";}}><ChevronLeft size={16}/>Календарь</button>
      </div><div className="nav-date" style={{paddingTop:6}}>День</div></div>
      <DayDetail date={viewingDay} schedule={schedule} events={events} tasks={tasks} history={history}
        revenue={revenue} handovers={handovers} isManager={isManager} canTeam={canTeam} members={members}
        onAddTask={canAddTasks?()=>setModal({_new:true,_date:viewingDay}):null}
        onEditTask={isManager?t=>setModal(t):null}
        onSetRevenue={isManager?(plan,fact)=>setRevenue(prev=>({
          ...prev,
          [viewingDay]:{
            // Сохраняем guests/avgCheck/lastYear от iiko, приводим plan/fact к числа
            ...(prev[viewingDay]||{}),
            plan: plan!=='' ? Number(plan) : '',
            fact: fact!=='' ? Number(fact) : '',
          }
        })):null}
        onAddShift={canTeam?addShift:null} onRemoveShift={canTeam?removeShift:null} onUpdateShift={canTeam?updateShift:null}/>
    </div>);

  if(viewingEmployee&&isManager)return (
    <div className="app">
      <div className="nav"><div className="nav-row">
        <button onClick={()=>setViewingEmployee(null)} style={{background:"transparent",border:"none",color:"var(--cu)",cursor:"pointer",display:"flex",alignItems:"center",gap:6,fontSize:14,fontWeight:600,padding:"6px 10px",borderRadius:6,transition:"all .2s ease"}} onMouseEnter={e=>{e.currentTarget.style.background="var(--sf)";e.currentTarget.style.color="var(--pp)";}} onMouseLeave={e=>{e.currentTarget.style.background="transparent";e.currentTarget.style.color="var(--cu)";}}><ChevronLeft size={16}/>Назад</button>
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
    {id:"events",label:"События"},
    ...((isChef||isManager)?[{id:"taps",label:"Краны"}]:[]),
    ...(!isManager?[{id:"settings",label:"Кабинет"}]:[]),
  ];
  const visibleTabs=tabs.filter(t=>!t.hidden);
  const orderedTabs=navTabOrder.length
    ?[...visibleTabs].sort((a,b)=>{const ai=navTabOrder.indexOf(a.id),bi=navTabOrder.indexOf(b.id);return(ai<0?99:ai)-(bi<0?99:bi);})
    :visibleTabs;
  const onTabDragStart=(e,id)=>{setDragTab(id);e.dataTransfer.effectAllowed='move';};
  const onTabDragOver=(e,id)=>{e.preventDefault();if(dragTab&&dragTab!==id){const ids=orderedTabs.map(t=>t.id);const fi=ids.indexOf(dragTab),ti=ids.indexOf(id);if(fi<0||ti<0)return;const n=[...ids];n.splice(fi,1);n.splice(ti,0,dragTab);setNavTabOrder(n);}};
  const onTabDragEnd=()=>setDragTab(null);

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
            <button className="nav-who" onClick={()=>setTab("settings")}><User size={12}/>{accountLabel(who)}
              <span title={serverOk===false?"Сервер недоступен — данные только на этом устройстве":serverOk?"Сервер на связи":"проверка связи"}
                style={{width:7,height:7,borderRadius:"50%",marginLeft:6,display:"inline-block",
                background:serverOk===false?"var(--rs)":serverOk?"var(--hp)":"var(--mt)"}}/></button>
          </div>
        </div>
        <div className="nav-date">{dateLabel}{events[ds]&&<span style={{color:"var(--cu)",marginLeft:8}}>· {events[ds]}</span>}</div>
        <div className="tabs">{orderedTabs.map(t=><button key={t.id} className={`tab${tab===t.id?" on":""}`} onClick={()=>setTab(t.id)} draggable onDragStart={e=>onTabDragStart(e,t.id)} onDragOver={e=>onTabDragOver(e,t.id)} onDragEnd={onTabDragEnd} style={{opacity:dragTab===t.id?.4:1,cursor:'grab'}}>{t.label}</button>)}</div>
      </div>
      {toast&&<div onClick={()=>setToast(null)} style={{position:"sticky",top:0,zIndex:45,margin:"10px 16px 0",background:"rgba(78,112,64,.18)",border:"1px solid rgba(78,112,64,.5)",color:"#a8d894",borderRadius:10,padding:"12px 14px",fontSize:13.5,lineHeight:1.5,cursor:"pointer"}}>{toast}</div>}

      {tab==="today"&&<TodayTab who={who} isManager={isManager} ds={ds} todayTasks={todayTasks} doneMap={doneToday}
        pct={pct} doneTodayCount={doneTodayCount} todayShifts={todayShifts} myStatus={myStatus} myAssigned={myAssigned}
        schedule={schedule} events={events} todayEvents={todayEvents} statusOverrides={statusOverrides} now={now} revenue={revenue} handovers={handovers}
        dayClosed={dayClosed} dayRegularCount={dayRegular.length} irregular={irregularTasks} irregularDoneMap={irregularDoneMap} cards={cards}
        pushGateOk={afterPushGate(now)} onSummary={openSummary} taskOrder={taskOrder} onReorder={setTaskOrder}
        canManage={canAddTasks} onDelete={canAddTasks?delTask:null} onArchive={canAddTasks?archiveTask:null}
        goList={goList} onGoAdd={goAdd} onGoToggle={goToggle} onGoRemove={goRemove}
        onToggle={toggle} onEdit={isManager?t=>setModal(t):null} onViewEmployee={isManager?n=>setViewingEmployee(n):null}
        onHandover={t=>setModal({_handover:true,task:t})}
        onEventClick={()=>setTab('events')}
        onIikoLoad={(date,json)=>setRevenue(prev=>({...prev,[date]:{...(prev[date]||{}),...(json.fact>0?{fact:json.fact}:{}),...(json.lastYear>0?{lastYear:json.lastYear}:{})}}))}  
        sectionsOpen={profiles.find(p=>p.name===who)?.sectionsOpen??false}
        tasksView={profiles.find(p=>p.name===who)?.tasksView??'list'}/>}

      {tab==="admin"&&isManager&&<AdminTab auth={auth} members={members} ds={ds} onReloadData={reloadAfterBackfill}/>}
      {tab==="settings"&&<PersonalCabinet name={who} account={who} isOwnCabinet={true} tasks={tasks} history={history}
        schedule={schedule} cards={cards} profiles={profiles} ds={ds} now={now} statusOverrides={statusOverrides}
        members={members} eventsLog={eventsLog}
        onIssueCard={isManager?issueCard:null} onUpdateProfile={isManager?p=>setProfiles(prev=>prev.map(x=>x.name===p.name?p:x)):null}
        onAddOverride={isManager?o=>setStatusOverrides(prev=>[...prev.filter(x=>x.name!==o.name),o]):null} setCardModal={v=>setModal(v)} onToggle={toggle}
        onChangePassword={(newPwd,curPwd)=>changePassword(who,newPwd,curPwd)}
        onLogout={handleLogout}
        adminPanel={isManager?<AdminTab auth={auth} members={members} ds={ds} onReloadData={reloadAfterBackfill}/>:null}
        leaveRequests={leaveRequests}
        onLeaveRequest={isManager?null:onLeaveRequest}
        onLeaveDecide={isManager?onLeaveDecide:null}
        onUpdateProfile={p=>setProfiles(prev=>prev.map(x=>x.name===p.name?p:x))}/>}

      {tab==="tasks"&&<TasksTab tasks={tasks} doneMap={doneToday} onToggle={toggle} onEdit={isManager?t=>setModal(t):null} onArchive={canAddTasks?archiveTask:null}/>}
      {tab==="schedule"&&<ScheduleTab schedule={schedule} events={events} revenue={revenue} ds={ds} members={members} onOpenDay={d=>setViewingDay(d)} isManager={isManager} monthPlan={monthPlan} onSetMonthPlan={isManager?setMonthPlanFor:null} hourNorms={hourNorms} onSetHourNorm={isManager?setHourNormFor:null} mozgDashboard={mozgDashboard}/>}
        {tab=="events"&&<EventsTab events={eventsV2} isManager={isManager} onSave={saveEventV2} onDelete={deleteEventV2} ds={ds} staff={members}/>}
      {tab==="taps"&&(isChef||isManager)&&<TapsTab/>}
      {tab==="team"&&(canTeam||canStats)&&<TeamHubTab canTeam={canTeam} canStats={canStats} isManager={isManager}
        profiles={profiles} members={members} statusOverrides={statusOverrides}
        account={who} who={who} isDeveloper={isDeveloper} auth={authHasPasswordMap} acl={acl}
        onAddMember={addMember} onRemoveMember={removeMember}
        onResetPassword={resetPassword} onToggleAclPwd={setManagerCanViewPasswords}
        onUpdateProfile={p=>setProfiles(prev=>prev.map(x=>x.name===p.name?p:x))}
        onAddOverride={o=>setStatusOverrides(prev=>[...prev.filter(x=>x.name!==o.name),o])}
        onRemoveOverride={name=>setStatusOverrides(prev=>prev.filter(x=>x.name!==name))}
        tasks={tasks} history={history} ds={ds} schedule={schedule} cards={cards} eventsLog={eventsLog}
        onView={isManager?n=>setViewingEmployee(n):null}
        setCardModal={v=>setModal(v)} onRevoke={id=>setCards(prev=>prev.map(c=>c.id===id?{...c,active:false}:c))}/>}


      {canAddTasks&&["today"].includes(tab)&&<button className="fab" onClick={()=>setModal({_new:true})}><Plus size={24} color="var(--bg)"/></button>}
      {modal&&!modal._card&&!modal._handover&&!modal._inbox&&!modal._closing&&<TaskModal task={modal._new?null:modal} ds={modal._date||ds} members={members} who={accountLabel(who)} onClose={()=>setModal(null)} onSave={saveTask} onDelete={delTask} comments={modal&&!modal._new?taskComments[modal.id]||[]:undefined} onAddComment={onAddComment}/>}
      {modal?._card&&<CardModal targetName={modal.targetName} onClose={()=>setModal(null)} onIssue={(type,comment,isPrivate)=>{issueCard(modal.targetName,type,comment,isPrivate);setModal(null);}}/>}
      {modal?._handover&&<HandoverModal task={modal.task} ds={ds} onClose={()=>setModal(null)} onSubmit={(text,createTask)=>{addHandover(addDays(ds,1),text,createTask,modal.task?.title);setModal(null);}}/>}
      {modal?._inbox&&<InboxModal who={who} tasks={inboxItems} history={history} ds={ds} onClose={()=>setModal(null)} onToggle={toggle}/>}
      {modal?._closing&&<ClosingSummaryModal summary={modal.summary} auto={modal.auto} onClose={()=>setModal(null)} onCarryOver={carryOver}/>}
        {showHandover&&<IncomingHandoverModal carryOverTasks={carryOverTasks} handoverNotes={todayHandoverNotes} ds={ds} onAccept={acceptHandover}/>}
    </div>);
}
