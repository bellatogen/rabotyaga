import { useState, useEffect, useRef, useMemo } from "react";
import { CheckCircle, Plus, X, BarChart2, Clock, User, ArrowRight, Trash2, Pencil,
  Beer, Award, FileText, Users, Lock, Bell, AtSign, Inbox, Key, Shield, Eye, EyeOff, ChevronLeft, ChevronRight, CalendarDays,
  AlertTriangle, TrendingUp, TrendingDown, Minus, Send, DollarSign, Activity } from "lucide-react";

const FONTS = `@import url('https://fonts.googleapis.com/css2?family=Fraunces:opsz,wght@9..144,400;9..144,600;9..144,700&family=IBM+Plex+Mono:wght@400;500;600&family=Inter:wght@400;500;600&display=swap');`;
const CSS = `
:root{--bg:#131009;--sf:#1e1710;--bd:#2e2419;--mt:#7a6a55;--pp:#f5edda;
  --cu:#c97d3c;--cu2:#a8622a;--hp:#4e7040;--am:#e8a030;--rs:#9e3f2b;}
*{box-sizing:border-box;margin:0;padding:0;-webkit-tap-highlight-color:transparent;}
body{background:var(--bg);color:var(--pp);}
.app{font-family:"Inter",sans-serif;max-width:480px;margin:0 auto;min-height:100vh;padding-bottom:90px;}
.mono{font-family:"IBM Plex Mono",monospace;}
.nav{position:sticky;top:0;z-index:40;background:var(--bg);border-bottom:1px solid var(--bd);padding:12px 16px 0;}
.nav-row{display:flex;align-items:center;justify-content:space-between;margin-bottom:3px;}
.nav-title{font-family:"Fraunces",serif;font-size:20px;font-weight:700;display:flex;align-items:center;gap:8px;}
.nav-who{font-size:12px;color:var(--cu);font-weight:600;cursor:pointer;background:rgba(201,125,60,.1);border:1px solid rgba(201,125,60,.25);padding:4px 10px;border-radius:20px;display:flex;align-items:center;gap:4px;}
.nav-date{font-family:"IBM Plex Mono",monospace;font-size:11px;color:var(--mt);margin-bottom:9px;}
.tabs{display:flex;gap:4px;overflow-x:auto;padding-bottom:10px;}
.tab{flex-shrink:0;padding:6px 11px;font-size:12px;font-weight:500;color:var(--mt);background:transparent;border:1px solid var(--bd);border-radius:7px;cursor:pointer;white-space:nowrap;}
.tab.on{background:var(--cu);color:var(--bg);border-color:var(--cu);font-weight:600;}
.sb{display:inline-flex;align-items:center;gap:5px;font-size:11px;font-weight:700;padding:4px 10px;border-radius:12px;text-transform:uppercase;letter-spacing:.04em;}
.prog-bg{height:7px;border-radius:4px;background:var(--sf);}
.prog-fill{height:7px;border-radius:4px;background:linear-gradient(90deg,var(--cu2),var(--am));transition:width .4s;}
.sec{padding:12px 16px 0;}
.sec-head{display:flex;align-items:center;justify-content:space-between;margin-bottom:9px;}
.sec-lbl{font-size:11px;font-weight:600;text-transform:uppercase;letter-spacing:.07em;color:var(--cu);display:flex;align-items:center;gap:5px;}
.sec-cnt{font-family:"IBM Plex Mono",monospace;font-size:11px;color:var(--mt);}
.task{background:var(--sf);border:1px solid var(--bd);border-radius:10px;padding:12px;margin-bottom:8px;}
.task.done{opacity:.5;}
.task-top{display:flex;align-items:flex-start;gap:10px;}
.chk{flex-shrink:0;width:25px;height:25px;border-radius:50%;border:2px solid var(--cu);display:flex;align-items:center;justify-content:center;cursor:pointer;background:transparent;}
.chk.done{background:var(--hp);border-color:var(--hp);}
.t-title{font-size:15px;font-weight:500;line-height:1.3;flex:1;}
.t-title.done{text-decoration:line-through;color:var(--mt);}
.t-meta{display:flex;flex-wrap:wrap;gap:5px;margin-top:7px;padding-left:35px;}
.pill{font-size:11px;padding:3px 8px;border-radius:9px;font-family:"IBM Plex Mono",monospace;display:inline-flex;align-items:center;gap:3px;}
.p-t{background:rgba(201,125,60,.15);color:var(--cu);}
.p-w{background:rgba(78,112,64,.15);color:#8bc47a;}
.p-r{background:rgba(255,255,255,.06);color:var(--mt);}
.p-rep{background:rgba(232,160,48,.15);color:var(--am);}
.acts{display:flex;gap:6px;margin-top:8px;margin-left:35px;}
.mini-btn{background:transparent;border:1px solid var(--bd);color:var(--mt);border-radius:6px;padding:5px 10px;font-size:12px;cursor:pointer;display:inline-flex;align-items:center;gap:4px;}
.sc{background:var(--sf);border:1px solid var(--bd);border-radius:10px;padding:11px 14px;margin-bottom:8px;}
.sr{display:flex;align-items:center;justify-content:space-between;gap:8px;}
.sn{font-size:14px;font-weight:600;display:flex;align-items:center;gap:6px;}
.st{font-family:"IBM Plex Mono",monospace;font-size:11px;color:var(--mt);margin-top:2px;}
.grid2{display:grid;grid-template-columns:1fr 1fr;gap:10px;margin-bottom:12px;}
.stat-c{background:var(--sf);border:1px solid var(--bd);border-radius:10px;padding:14px;}
.stat-n{font-family:"Fraunces",serif;font-size:30px;font-weight:700;color:var(--am);}
.stat-l{font-size:12px;color:var(--mt);margin-top:2px;}
.stat-s{font-family:"IBM Plex Mono",monospace;font-size:11px;color:var(--cu);margin-top:4px;}
.pr{background:var(--sf);border:1px solid var(--bd);border-radius:10px;padding:12px 14px;margin-bottom:8px;}
.pr-nm{font-size:14px;font-weight:600;display:flex;justify-content:space-between;margin-bottom:7px;}
.bar-bg{height:5px;border-radius:3px;background:var(--bg);}
.bar-fill{height:5px;border-radius:3px;background:var(--hp);}
.bar-pct{font-family:"IBM Plex Mono",monospace;font-size:12px;color:var(--hp);margin-top:4px;}
.rec{background:var(--sf);border-radius:10px;padding:12px 14px;margin-bottom:8px;display:flex;gap:10px;align-items:flex-start;}
.rec-icon{font-size:20px;flex-shrink:0;margin-top:1px;}
.rec-text{font-size:13.5px;line-height:1.5;}
.rec.success{border:1px solid rgba(78,112,64,.4);}
.rec.info{border:1px solid rgba(201,125,60,.3);}
.rec.warning{border:1px solid rgba(232,160,48,.4);}
.rec.danger{border:1px solid rgba(158,63,43,.5);}
.rec.growth{border:1px solid rgba(91,123,155,.4);}
.dc{border-radius:10px;padding:13px;margin-bottom:8px;}
.dc.yellow{background:rgba(232,160,48,.1);border:1px solid rgba(232,160,48,.35);}
.dc.orange{background:rgba(201,125,60,.1);border:1px solid rgba(201,125,60,.4);}
.dc.red{background:rgba(158,63,43,.13);border:1px solid rgba(158,63,43,.5);}
.dc-head{display:flex;justify-content:space-between;align-items:center;margin-bottom:6px;}
.dc-type{font-size:12px;font-weight:700;text-transform:uppercase;letter-spacing:.05em;}
.dc.yellow .dc-type{color:var(--am);} .dc.orange .dc-type{color:var(--cu);} .dc.red .dc-type{color:#e07a60;}
.dc-date{font-family:"IBM Plex Mono",monospace;font-size:11px;color:var(--mt);}
.dc-comment{font-size:13px;color:var(--pp);line-height:1.5;}
.alert{border-radius:10px;padding:12px 14px;margin-bottom:10px;display:flex;gap:9px;align-items:flex-start;font-size:13px;line-height:1.5;}
.alert.warn{background:rgba(232,160,48,.1);border:1px solid rgba(232,160,48,.4);color:var(--am);}
.alert.danger{background:rgba(158,63,43,.12);border:1px solid rgba(158,63,43,.45);color:#e07a60;}
.alert.ok{background:rgba(78,112,64,.1);border:1px solid rgba(78,112,64,.35);color:#8bc47a;}
.rev-card{background:var(--sf);border:1px solid var(--bd);border-radius:10px;padding:14px;margin-bottom:10px;}
.rev-plan{font-family:"Fraunces",serif;font-size:26px;font-weight:700;color:var(--am);}
.handover{background:rgba(91,123,155,.08);border:1px solid rgba(91,123,155,.3);border-radius:10px;padding:12px;margin-bottom:8px;font-size:13px;line-height:1.5;}
.handover-by{font-size:11px;color:var(--mt);margin-top:6px;font-family:"IBM Plex Mono",monospace;}
.overlay{position:fixed;inset:0;background:rgba(5,3,1,.82);z-index:50;display:flex;align-items:flex-end;}
.modal{background:var(--sf);width:100%;max-width:480px;margin:0 auto;border-radius:16px 16px 0 0;border-top:1px solid var(--bd);padding:20px 18px;max-height:91vh;overflow-y:auto;}
.handle{width:40px;height:4px;background:var(--bd);border-radius:2px;margin:0 auto 18px;}
.m-title{font-family:"Fraunces",serif;font-size:19px;font-weight:700;margin-bottom:16px;}
.field{margin-bottom:12px;}
.field label{display:block;font-size:11px;font-weight:600;text-transform:uppercase;letter-spacing:.05em;color:var(--mt);margin-bottom:5px;}
.field input,.field select,.field textarea{width:100%;background:var(--bg);border:1px solid var(--bd);border-radius:8px;padding:10px 12px;color:var(--pp);font-family:"Inter",sans-serif;font-size:14px;}
.field input:focus,.field select:focus,.field textarea:focus{outline:2px solid var(--cu);}
.r2{display:grid;grid-template-columns:1fr 1fr;gap:10px;}
.btn{display:flex;align-items:center;justify-content:center;gap:6px;width:100%;padding:13px;border-radius:10px;font-size:14px;font-weight:600;cursor:pointer;border:none;font-family:"Inter",sans-serif;margin-top:8px;}
.btn-p{background:var(--cu);color:var(--bg);}
.btn-g{background:transparent;color:var(--mt);border:1px solid var(--bd);}
.btn-d{background:transparent;color:#e07a60;border:1px solid rgba(158,63,43,.3);}
.chip-row{display:flex;flex-wrap:wrap;gap:6px;}
.chip{padding:7px 12px;border-radius:20px;font-size:13px;border:1px solid var(--bd);background:transparent;color:var(--mt);cursor:pointer;}
.chip.on{background:var(--hp);border-color:var(--hp);color:var(--pp);}
.fab{position:fixed;bottom:22px;right:20px;width:56px;height:56px;border-radius:28px;background:var(--cu);border:none;display:flex;align-items:center;justify-content:center;cursor:pointer;box-shadow:0 4px 20px rgba(201,125,60,.4);z-index:30;}
.empty{text-align:center;padding:36px 20px;color:var(--mt);font-size:14px;line-height:1.6;}
.info-box{background:var(--sf);border:1px solid var(--bd);border-radius:10px;padding:13px;font-size:13px;color:var(--mt);line-height:1.6;margin-bottom:10px;}
.login{display:flex;flex-direction:column;align-items:center;justify-content:center;min-height:100vh;padding:32px 24px;}
.login-title{font-family:"Fraunces",serif;font-size:26px;font-weight:700;margin-bottom:6px;text-align:center;}
.login-sub{color:var(--mt);font-size:14px;margin-bottom:28px;text-align:center;}
.login-btn{width:100%;padding:13px;border-radius:10px;background:var(--sf);border:1px solid var(--bd);color:var(--pp);font-size:15px;font-weight:500;cursor:pointer;margin-bottom:8px;display:flex;align-items:center;gap:10px;}
.login-btn:hover{border-color:var(--cu);}
.dot{width:10px;height:10px;border-radius:50%;background:var(--bd);flex-shrink:0;}
.cab-hero{background:var(--sf);border:1px solid var(--bd);border-radius:12px;padding:16px;margin-bottom:8px;}
.cab-name{font-family:"Fraunces",serif;font-size:22px;font-weight:700;}
.cab-role{font-size:12px;color:var(--cu);font-weight:600;text-transform:uppercase;letter-spacing:.05em;margin-top:2px;}
.cal-grid{display:grid;grid-template-columns:repeat(7,1fr);gap:5px;}
.cal-dow{font-size:10px;color:var(--mt);text-align:center;padding:3px 0;text-transform:uppercase;font-weight:600;}
.cal-cell{min-height:58px;background:var(--sf);border:1px solid var(--bd);border-radius:8px;padding:4px 5px;cursor:pointer;display:flex;flex-direction:column;gap:2px;position:relative;}
.cal-cell.today{border-color:var(--cu);border-width:2px;}
.cal-cell.short{background:rgba(158,63,43,.1);border-color:rgba(158,63,43,.4);}
.cal-num{font-size:12px;font-weight:700;}
.cal-staff{font-family:"IBM Plex Mono",monospace;font-size:10px;color:var(--mt);}
.cal-ev{font-size:8px;color:var(--cu);overflow:hidden;text-overflow:ellipsis;white-space:nowrap;}
.log-ev{display:flex;gap:8px;padding:9px 0;border-bottom:1px dashed var(--bd);font-size:13px;align-items:flex-start;}
.log-ev-ts{font-family:"IBM Plex Mono",monospace;font-size:10px;color:var(--mt);flex-shrink:0;width:62px;}
`;

const DAYS_RU=["вс","пн","вт","ср","чт","пт","сб"];
const DOW_FULL=["Воскресенье","Понедельник","Вторник","Среда","Четверг","Пятница","Суббота"];
const MONTHS_RU=["января","февраля","марта","апреля","мая","июня","июля","августа","сентября","октября","ноября","декабря"];
const REPEAT_OPTS=[{id:"opening",label:"Открытие смены"},{id:"closing",label:"Закрытие смены"},{id:"daily",label:"Каждый день"},{id:"workday",label:"По будням"},{id:"weekly",label:"Еженедельно"},{id:"once",label:"Разово"}];
const DEFAULT_MEMBERS=[ "Александр ", "Павел ", "Евгений ", "Тимофей ", "Ярослав ", "Антон ", "Тестовый "];
const ROLES={
  barman:{label:"Бармен",perms:["view_own_tasks","mark_own_tasks","view_schedule","view_own_stats"]},
  head_barman:{label:"Шеф-бармен",perms:["view_own_tasks","mark_own_tasks","view_schedule","view_own_stats","view_all_tasks","add_tasks","view_team_stats"]},
  manager:{label:"Управляющий",perms:["*"]},
};
const ALL_PERMS=[
  {id:"view_own_tasks",label:"Видеть свои задачи"},{id:"mark_own_tasks",label:"Отмечать задачи"},
  {id:"view_all_tasks",label:"Видеть все задачи"},{id:"add_tasks",label:"Создавать задачи"},
  {id:"view_schedule",label:"Расписание и календарь"},{id:"view_own_stats",label:"Своя статистика"},
  {id:"view_team_stats",label:"Статистика команды"},
];

// NOTE FOR TELEGRAM VERSION — push-уведомления по статусам:
// "Завтра смена" → вечером накануне (19:00) · "Сегодня смена" → 6:00 или за 1ч до начала
// "В смене" → при старте · "Карточка" → сразу сотруднику (+команде если публично)
// "Передача смене" → push следующей смене · "Задача просрочена" → в конце смены
// "@упоминание" → push назначенному (assignedTo) сразу при создании задачи
// "Смена закрыта" → push управляющему/шефу ТОЛЬКО после 23:30 (PUSH_GATE_MIN), с краткой сводкой дня
// "Регулярные задачи" → бэкенд автогенерирует на нужные дни (cron) с учётом периода from/until и расписания
const SHIFT_STATUSES={
  on_shift:{label:"В смене",color:"#4e7040",bg:"rgba(78,112,64,.2)"},
  today_shift:{label:"Сегодня смена",color:"#c97d3c",bg:"rgba(201,125,60,.18)"},
  worked:{label:"Отработал",color:"#6b7a8c",bg:"rgba(107,122,140,.18)"},
  tomorrow_shift:{label:"Завтра смена",color:"#7a6a55",bg:"rgba(122,106,85,.18)"},
  day_off:{label:"Выходной",color:"#4a4a4a",bg:"rgba(100,100,100,.12)"},
  sick:{label:"Больничный",color:"#e07a60",bg:"rgba(224,122,96,.18)"},
  vacation:{label:"Отпуск",color:"#5b8b9b",bg:"rgba(91,139,155,.18)"},
  business_trip:{label:"Командировка",color:"#8b6b9b",bg:"rgba(139,107,155,.18)"},
};
const DEFAULT_PROFILES=DEFAULT_MEMBERS.map((name,i)=>({name,role:i===0?"head_barman":"barman",perms:i===0?ROLES.head_barman.perms:ROLES.barman.perms}));

// Индивидуальные нормы часов в месяц (коридор). SERVER: вынести в редактируемый справочник.
const HOUR_NORMS={"Павел":{min:60,max:70}};
const DEFAULT_HOUR_NORM={min:140,max:160};
function hourNorm(name){const n=HOUR_NORMS[name]||DEFAULT_HOUR_NORM;return{...n,target:Math.round((n.min+n.max)/2)};}

// Праздники РФ 2026 (нужен 3-й человек с 18:00, как в загруженный день). SERVER: вынести в редактируемый справочник.
const HOLIDAYS=["2026-01-01","2026-01-07","2026-02-23","2026-03-08","2026-05-01","2026-05-09","2026-06-12","2026-11-04","2026-12-31"];

const EMBEDDED_SCHEDULE={"2026-06-01":[{"name":"сорокоумов/попов","start":"11:00/13:00","end":"","report":false,"guest":true}],"2026-06-02":[{"name":"Тимофей","start":"11:00","end":"12:00","report":true},{"name":"Попов","start":"13:00","end":"","report":false,"guest":true}],"2026-06-03":[{"name":"Александр","start":"11:00","end":"12:00","report":true},{"name":"Ярослав","start":"13:00","end":"10:00","report":false}],"2026-06-04":[{"name":"Евгений","start":"11:00","end":"12:00","report":true},{"name":"Ярослав","start":"13:00","end":"10:00","report":false}],"2026-06-05":[{"name":"Евгений","start":"13:00","end":"10:00","report":false},{"name":"Тимофей","start":"18:00","end":"5:00","report":false},{"name":"Ярослав","start":"11:00","end":"12:00","report":true}],"2026-06-06":[{"name":"Александр","start":"11:00","end":"12:00","report":true},{"name":"Тимофей","start":"13:00","end":"10:00","report":false},{"name":"Юра Воронцов","start":"18:00","end":"","report":false,"guest":true}],"2026-06-07":[{"name":"Александр","start":"11:00","end":"12:00","report":false},{"name":"Тимофей","start":"13:00","end":"10:00","report":true}],"2026-06-08":[{"name":"Александр","start":"13:00","end":"10:00","report":false},{"name":"Ярослав","start":"11:00","end":"12:00","report":true}],"2026-06-09":[{"name":"Евгений","start":"10:00","end":"13:00","report":true},{"name":"Ярослав","start":"13:00","end":"10:00","report":false}],"2026-06-10":[{"name":"Александр","start":"11:00","end":"12:00","report":true},{"name":"Ярослав","start":"13:00","end":"10:00","report":false}],"2026-06-11":[{"name":"Александр","start":"13:00","end":"10:00","report":false},{"name":"Евгений","start":"18:00","end":"5:00","report":false},{"name":"Тимофей","start":"11:00","end":"12:00","report":true}],"2026-06-12":[{"name":"Евгений","start":"13:00","end":"10:00","report":false},{"name":"Тимофей","start":"18:00","end":"5:00","report":false},{"name":"Ярослав","start":"11:00","end":"12:00","report":true}],"2026-06-13":[{"name":"Евгений","start":"18:00","end":"5:00","report":true},{"name":"Тимофей","start":"13:00","end":"10:00","report":false},{"name":"Ярослав","start":"11:00","end":"12:00","report":false}],"2026-06-14":[{"name":"Александр","start":"11:00","end":"12:00","report":true},{"name":"Евгений","start":"13:00","end":"10:00","report":false},{"name":"Ярослав","start":"18:00","end":"5:00","report":false}],"2026-06-15":[{"name":"Павел","start":"11:00","end":"12:00","report":true}],"2026-06-16":[{"name":"Александр","start":"11:00","end":"12:00","report":true},{"name":"Павел","start":"13:00","end":"10:00","report":false}],"2026-06-17":[{"name":"Павел","start":"18:00","end":"5:00","report":false},{"name":"Евгений","start":"13:00","end":"10:00","report":false},{"name":"Тимофей","start":"11:00","end":"12:00","report":true}],"2026-06-18":[{"name":"Тимофей","start":"13:00","end":"10:00","report":false},{"name":"Ярослав","start":"11:00","end":"12:00","report":true}],"2026-06-19":[{"name":"Александр","start":"11:00","end":"12:00","report":false},{"name":"Евгений","start":"13:00","end":"10:00","report":true},{"name":"Ярослав","start":"18:00","end":"5:00","report":false}],"2026-06-20":[{"name":"Александр","start":"18:00","end":"5:00","report":false},{"name":"Евгений","start":"13:00","end":"10:00","report":false},{"name":"Тимофей","start":"11:00","end":"12:00","report":true}],"2026-06-21":[{"name":"Павел","start":"13:00","end":"10:00","report":false},{"name":"Ярослав","start":"11:00","end":"12:00","report":true}],"2026-06-22":[{"name":"Александр","start":"11:00","end":"12:00","report":true},{"name":"Павел","start":"13:00","end":"10:00","report":true}],"2026-06-23":[{"name":"Евгений","start":"10:00","end":"13:00","report":false},{"name":"Тимофей","start":"12:00","end":"11:00","report":true}],"2026-06-24":[{"name":"Евгений","start":"13:00","end":"10:00","report":false},{"name":"Тимофей","start":"18:00","end":"5:00","report":false},{"name":"Ярослав","start":"11:00","end":"12:00","report":true}],"2026-06-25":[{"name":"Александр","start":"11:00","end":"12:00","report":true},{"name":"Ярослав","start":"13:00","end":"10:00","report":false}],"2026-06-26":[{"name":"Александр","start":"18:00","end":"5:00","report":false},{"name":"Павел","start":"11:00","end":"12:00","report":true},{"name":"Евгений","start":"13:00","end":"10:00","report":false}],"2026-06-27":[{"name":"Павел","start":"13:00","end":"10:00","report":false},{"name":"Евгений","start":"18:00","end":"5:00","report":false},{"name":"Тимофей","start":"11:00","end":"12:00","report":true}],"2026-06-28":[{"name":"Павел","start":"18:00","end":"5:00","report":false},{"name":"Тимофей","start":"13:00","end":"10:00","report":false},{"name":"Ярослав","start":"11:00","end":"12:00","report":true}],"2026-06-29":[{"name":"Александр","start":"11:00","end":"12:00","report":true},{"name":"Ярослав","start":"13:00","end":"10:00","report":false}],"2026-06-30":[{"name":"Евгений","start":"11:00","end":"12:00","report":true},{"name":"Тимофей","start":"13:00","end":"10:00","report":false}]};
const EMBEDDED_EVENTS={"2026-06-03":"истории в бутылке","2026-06-10":"истории в бутылке","2026-06-14":"стерео 55","2026-06-17":"истории в бутылке","2026-06-23":"инвента","2026-06-24":"истории в бутылке","2026-06-28":"стерео 55"};

const uid=()=>Math.random().toString(36).slice(2,9);
const accountLabel=acc=>acc==="manager"?"Управляющий":acc==="developer"?"Разработчик":acc;
// SERVER: пароли в проде хранятся хешированными (bcrypt) на сервере, проверка серверная, сессия по токену.
function canManageAccounts(acc){return acc==="manager"||acc==="developer";}
function canViewPasswords(acc,acl){return acc==="developer"||(acc==="manager"&&!!acl.managerCanViewPasswords);}
const todayStr=()=>new Date().toISOString().slice(0,10);
const nowISO=()=>new Date().toISOString();
const hmm=s=>{if(!s)return 0;const[h,m]=s.split(":").map(Number);return h*60+(m||0);};
const fmtDate=ds=>{const d=new Date(ds);return `${d.getDate()} ${MONTHS_RU[d.getMonth()]}`;};
const isDone=v=>v===true||(v&&typeof v==="object"&&!!v.done);
const doneInfo=v=>(v&&typeof v==="object")?v:(v===true?{done:true,ts:null,by:null}:null);
const addDays=(ds,n)=>{const d=new Date(ds);d.setDate(d.getDate()+n);return d.toISOString().slice(0,10);};
const rangeDays=(ds,n)=>Array.from({length:n},(_,i)=>addDays(ds,-i));

// ближайшая дата, когда задача актуальна
function nextDue(task,fromDs){
  if(task.repeat==="once")return task.date;
  if(["daily","opening","closing"].includes(task.repeat))return fromDs;
  if(task.repeat==="workday"){let d=fromDs;for(let i=0;i<7;i++){const dw=new Date(d).getDay();if(dw!==0&&dw!==6)return d;d=addDays(d,1);}return fromDs;}
  if(task.repeat==="weekly"){let d=fromDs;for(let i=0;i<8;i++){if(new Date(d).getDay()===task.dayOfWeek)return d;d=addDays(d,1);}return fromDs;}
  return fromDs;
}
function dueLabel(task,ds){
  if(task.kind==="irregular")return{dueDate:"irregular",text:"нерегулярная · требует внимания",overdue:false};
  if(task.repeat==="once"){const overdue=task.date<ds;return{dueDate:task.date,text:fmtDate(task.date),overdue};}
  const nd=nextDue(task,ds);const rl=REPEAT_OPTS.find(r=>r.id===task.repeat)?.label||task.repeat;
  const period=task.until?` (до ${fmtDate(task.until)})`:"";
  return{dueDate:nd,text:`${rl} · ${nd===ds?"сегодня":fmtDate(nd)}${period}`,overdue:false};
}
// Пуш о закрытии можно слать только после 23:30 (бар закрывается, отчёты сданы)
const PUSH_GATE_MIN=23*60+30;
const afterPushGate=now=>(now.getHours()*60+now.getMinutes())>=PUSH_GATE_MIN;
function buildDaySummary(tasks,history,ds){
  const reg=tasks.filter(t=>t.kind!=="irregular"&&isToday(t,ds));
  const done=reg.filter(t=>isDone(history[`${t.id}::${ds}`]));
  const notDone=reg.filter(t=>!isDone(history[`${t.id}::${ds}`]));
  const irregOpen=tasks.filter(t=>t.kind==="irregular"&&!isDone(history[`${t.id}::irregular`]));
  return{date:ds,total:reg.length,done:done.length,notDone,irregOpen};
}

function isToday(task,ds){
  if(task.kind==="irregular")return false;
  if(task.from&&ds<task.from)return false;
  if(task.until&&ds>task.until)return false;
  if(task.repeat==="once")return task.date===ds;
  if(["daily","opening","closing"].includes(task.repeat))return true;
  if(task.repeat==="workday"){const d=new Date(ds).getDay();return d!==0&&d!==6;}
  if(task.repeat==="weekly")return task.dayOfWeek===new Date(ds).getDay();
  return false;
}
function hasPerm(who,profiles,perm){
  if(who==="manager"||who==="developer")return true;
  const p=profiles.find(x=>x.name===who);
  return p?(p.perms.includes("*")||p.perms.includes(perm)):false;
}

// ── Норматив по штату ──
function staffNorm(ds,events){
  const dow=new Date(ds).getDay();
  const ev=(events[ds]||"").toLowerCase();
  const holiday=HOLIDAYS.includes(ds);
  if([3,5,6].includes(dow)||holiday) return {count:3,thirdFrom:"18:00",reason:holiday?"праздник":"пт/сб/ср"};
  if(dow===0&&ev.includes("стерео")) return {count:3,thirdFrom:"18:00",reason:"Стерео 55"};
  return {count:2,thirdFrom:null,reason:"будний"};
}
function staffCheck(ds,schedule,events){
  const norm=staffNorm(ds,events);
  const shifts=(schedule[ds]||[]).filter(s=>!s.guest);
  const actual=shifts.length;
  const hasEvening=shifts.some(s=>hmm(s.start)>=hmm("18:00"));
  let ok=actual>=norm.count;
  let msg="";
  if(actual<norm.count) msg=`Не хватает ${norm.count-actual} чел. (норма ${norm.count}, в графике ${actual})`;
  else if(norm.thirdFrom&&!hasEvening&&actual>=3) msg="Норма закрыта, но нет смены с 18:00";
  return {norm,actual,ok,msg,hasEvening};
}

function getShiftStatus(name,ds,schedule,overrides,now){
  const ov=overrides.find(o=>o.name===name&&o.from<=ds&&(!o.until||o.until>=ds));
  if(ov)return ov.status;
  const todayShifts=(schedule[ds]||[]).filter(s=>s.name===name);
  if(!todayShifts.length){
    if((schedule[addDays(ds,1)]||[]).some(s=>s.name===name))return"tomorrow_shift";
    return"day_off";
  }
  const sh=todayShifts[0];
  const nowM=now.getHours()*60+now.getMinutes();
  const startM=hmm(sh.start), endM=Math.min(startM+hmm(sh.end),1440);
  if(nowM>=startM&&nowM<endM)return"on_shift";
  if(nowM>=360&&nowM<startM)return"today_shift";
  if(nowM>=endM)return"worked";
  return"today_shift";
}
function getActiveCards(cards,name){
  const cut=addDays(todayStr(),-90);
  return cards.filter(c=>c.name===name&&c.active&&c.date>=cut);
}
function processCard(cards,name,type,comment,isPrivate,issuedBy){
  const active=getActiveCards(cards,name);
  const yellows=active.filter(c=>c.type==="yellow"), oranges=active.filter(c=>c.type==="orange");
  let finalType=type, updated=[...cards];
  if(type==="yellow"){
    if(oranges.length>0)finalType="red";
    else if(yellows.length>=1){updated=updated.map(c=>c.name===name&&c.type==="yellow"&&c.active?{...c,active:false}:c);finalType="orange";}
  }
  return{cards:[...updated,{id:uid(),name,type:finalType,date:todayStr(),comment,isPrivate,issuedBy,active:true}],finalType};
}

// ── 30-дневная статистика + тренд прогресса ──
function rateFor(name,tasks,history,ds,fromAgo,span){
  let t=0,d=0;
  for(let i=fromAgo;i<fromAgo+span;i++){
    const k=addDays(ds,-i);
    tasks.filter(x=>(x.assignee===name||x.assignee==="смена")&&isToday(x,k)).forEach(x=>{t++;if(isDone(history[`${x.id}::${k}`]))d++;});
  }
  return{t,d,rate:t?d/t:null};
}
function progressTrend(name,tasks,history,ds){
  const recent=rateFor(name,tasks,history,ds,0,15);
  const prev=rateFor(name,tasks,history,ds,15,15);
  if(recent.rate===null||prev.rate===null)return null;
  return{recent:recent.rate,prev:prev.rate,delta:recent.rate-prev.rate};
}

// ── Детектор нереалистичного закрытия ──
function suspiciousFlags(name,tasks,history){
  const byId=Object.fromEntries(tasks.map(t=>[t.id,t]));
  const byDate={};
  Object.entries(history).forEach(([k,v])=>{
    const info=doneInfo(v);
    if(!info||!info.done||!info.ts||info.by!==name)return;
    const[tid,date]=k.split("::");
    (byDate[date]=byDate[date]||[]).push({ts:info.ts,task:byId[tid]});
  });
  const flags=[];
  Object.entries(byDate).forEach(([date,arr])=>{
    const minutes={};
    arr.forEach(a=>{const m=a.ts.slice(0,16);minutes[m]=(minutes[m]||0)+1;});
    const massMin=Object.entries(minutes).find(([,c])=>c>=3);
    if(massMin)flags.push({date,type:"mass",text:`${fmtDate(date)}: ${massMin[1]} задач отмечены в одну минуту — возможно «накликал»`});
    arr.forEach(a=>{
      if(!a.task)return;
      const hour=new Date(a.ts).getHours();
      if((a.task.repeat==="closing"||a.task.isReport)&&hour>=6&&hour<20)
        flags.push({date,type:"early",text:`${fmtDate(date)}: задача закрытия отмечена в ${String(hour).padStart(2,"0")}:00 (рано)`});
    });
  });
  return flags;
}

function genRecs(name,tasks,history,schedule,cards,profiles,ds){
  const recs=[];
  const r=rateFor(name,tasks,history,ds,0,14);
  const rate=r.rate;
  // отчётные/открытие/закрытие
  let repTot=0,repDon=0,opTot=0,opDon=0,clTot=0,clDon=0;
  rangeDays(ds,14).forEach(d=>{
    tasks.filter(t=>t.assignee===name||t.assignee==="смена").filter(t=>isToday(t,d)).forEach(t=>{
      const ok=isDone(history[`${t.id}::${d}`]);
      if(t.isReport){repTot++;if(ok)repDon++;}
      if(t.repeat==="opening"){opTot++;if(ok)opDon++;}
      if(t.repeat==="closing"){clTot++;if(ok)clDon++;}
    });
  });
  if(rate!==null){
    if(rate>=.9)recs.push({type:"success",icon:"⭐",text:"Отличная дисциплина — 90%+ задач. Держи темп."});
    else if(rate>=.7)recs.push({type:"info",icon:"📈",text:`${Math.round(rate*100)}% задач — хороший уровень, есть куда расти.`});
    else if(rate>=.5)recs.push({type:"warning",icon:"⚠️",text:`${Math.round(rate*100)}% задач за 2 недели — подтяни пунктуальность.`});
    else recs.push({type:"danger",icon:"🚨",text:`Только ${Math.round(rate*100)}% задач — нужно внимание.`});
  }
  // тренд прогресса
  const tr=progressTrend(name,tasks,history,ds);
  if(tr&&Math.abs(tr.delta)>=.1){
    if(tr.delta>0)recs.push({type:"success",icon:"🚀",text:`Прогресс! Было ${Math.round(tr.prev*100)}% → стало ${Math.round(tr.recent*100)}%. Так держать.`});
    else recs.push({type:"warning",icon:"📉",text:`Снижение: было ${Math.round(tr.prev*100)}% → стало ${Math.round(tr.recent*100)}%. Вернёмся в форму.`});
  }
  if(repTot>=2){const rr=repDon/repTot;if(rate&&rr<rate-.15)recs.push({type:"warning",icon:"📋",text:"Отчётные задачи проседают — важная зона роста."});else if(rr>=.9)recs.push({type:"success",icon:"📋",text:"Отчётная дисциплина на высоте!"});}
  if(opTot>=2&&clTot>=2){const or2=opDon/opTot,cr=clDon/clTot;if(cr<or2-.2)recs.push({type:"info",icon:"🌙",text:`Открытие (${Math.round(or2*100)}%) лучше закрытия (${Math.round(cr*100)}%) — добей закрытие.`});}
  // серия смен
  let streak=0;
  for(const d of rangeDays(ds,30)){if((schedule[d]||[]).some(s=>s.name===name))streak++;else break;}
  if(streak>=5)recs.push({type:"warning",icon:"😴",text:`${streak} смен подряд — дай себе отдых, усталость бьёт по качеству.`});
  else if(streak>=3)recs.push({type:"info",icon:"💡",text:`${streak} смены подряд — отдохни на ближайшем выходном.`});
  const wh=rangeDays(ds,7).reduce((a,d)=>{const s=(schedule[d]||[]).find(x=>x.name===name);return a+(s&&s.end?hmm(s.end)/60:0);},0);
  if(wh>48)recs.push({type:"warning",icon:"⏰",text:`${Math.round(wh)}ч за 7 дней — высокая нагрузка.`});
  // подозрительное закрытие
  const susp=suspiciousFlags(name,tasks,history);
  if(susp.length)recs.push({type:"danger",icon:"🔍",text:`Замечено нереалистичное закрытие задач (${susp.length}). Стоит проверить — возможно отмечает не делая.`});
  // карточки
  const ac=getActiveCards(cards,name);
  if(ac.some(c=>c.type==="red"))recs.push({type:"danger",icon:"🟥",text:"Красная карточка — нужна встреча с руководством."});
  else if(ac.some(c=>c.type==="orange"))recs.push({type:"warning",icon:"🟧",text:"Оранжевая карточка — следующее нарушение станет красной."});
  else if(ac.some(c=>c.type==="yellow"))recs.push({type:"info",icon:"🟨",text:"Жёлтая карточка — следующая станет оранжевой."});
  else if(rate&&rate>.8&&streak<4&&!susp.length)recs.push({type:"success",icon:"✅",text:"Чистая история и хорошие показатели — супер!"});
  const p=profiles.find(x=>x.name===name);
  if(p?.role==="barman"&&rate&&rate>.85&&!ac.length&&!susp.length)recs.push({type:"growth",icon:"🎯",text:"Стабильно высокие показатели — можно брать больше ответственности."});
  if(!recs.length)recs.push({type:"info",icon:"📊",text:"Данных пока мало — выполняй задачи, рекомендации появятся."});
  return recs;
}

async function ld(k,fb){try{const r=await window.storage.get(k,true);return r?.value?JSON.parse(r.value):fb;}catch{return fb;}}
async function sv(k,v){try{await window.storage.set(k,JSON.stringify(v),true);}catch{}}

// Сохраняет value в хранилище ТОЛЬКО при реальных изменениях.
// Пропускает первый прогон после загрузки, чтобы не записать только что прочитанный снимок
// обратно и не затереть изменения с другого устройства.
function usePersist(key,value,ready){
  const first=useRef(true);
  useEffect(()=>{
    if(!ready)return;
    if(first.current){first.current=false;return;}
    sv(key,value);
  },[value,ready]);
}

function defaultTasks(){return[
  {id:uid(),title:"Проверить остатки пива",repeat:"opening",time:"10:30",assignee:"смена",notes:"",isReport:false},
  {id:uid(),title:"Протереть краны, проверить давление",repeat:"opening",time:"11:00",assignee:"смена",notes:"",isReport:false},
  {id:uid(),title:"Выставить меню и карту пива",repeat:"opening",time:"11:00",assignee:"смена",notes:"",isReport:false},
  {id:uid(),title:"Заполнить отчёт по смене",repeat:"closing",time:"23:00",assignee:"смена",notes:"Выручка, инциденты, списания",isReport:true},
  {id:uid(),title:"Инвентаризация кассы",repeat:"closing",time:"22:45",assignee:"смена",notes:"",isReport:true},
  {id:uid(),title:"Уборка зала и стойки",repeat:"closing",time:"23:00",assignee:"смена",notes:"",isReport:false},
  {id:uid(),title:"Проверить поступления на завтра",repeat:"daily",time:"15:00",assignee:"смена",notes:"",isReport:false},
  ...SEED_TASKS,
];}
// Задачи со стабильными id — подмешиваются к сохранённым, не затирая кастомные. Cadence можно менять в редакторе.
const SEED_TASKS=[
  {id:"seed-nuts",title:"Заказать орехи в Blackchops",repeat:"weekly",dayOfWeek:1,time:"12:00",assignee:"смена",assignedTo:null,notes:"",isReport:false},
  {id:"seed-cheese",title:"Заказать сыры",repeat:"weekly",dayOfWeek:1,time:"12:00",assignee:"смена",assignedTo:null,notes:"",isReport:false},
  {id:"seed-meat",title:"Заказать мясные закуски (Meatsiders)",repeat:"weekly",dayOfWeek:2,time:"12:00",assignee:"смена",assignedTo:null,notes:"",isReport:false},
  {id:"seed-sandwiches",title:"Заказать сэндвичи",repeat:"weekly",dayOfWeek:4,time:"12:00",assignee:"смена",assignedTo:null,notes:"",isReport:false},
  {id:"seed-staff",title:"Заказать стаф-питание",repeat:"weekly",dayOfWeek:1,time:"13:00",assignee:"смена",assignedTo:null,notes:"",isReport:false},
  {id:"seed-dust",title:"Протереть полки от пыли",repeat:"weekly",dayOfWeek:3,time:"11:30",assignee:"смена",assignedTo:null,notes:"",isReport:false},
  {id:"seed-cash",title:"Разменять наличные",repeat:"opening",time:"11:00",assignee:"смена",assignedTo:null,notes:"",isReport:false},
];
function mergeSeeds(tasks){
  const ids=new Set(tasks.map(t=>t.id));
  const missing=SEED_TASKS.filter(s=>!ids.has(s.id));
  return missing.length?[...tasks,...missing]:tasks;
}

// Маскот «Работяга» — контурный скетч по фото (пучок-хвостик + широкая улыбка со щербинкой)
function Mascot({size=24,color="var(--cu)"}){
  return(
    <svg width={size} height={size} viewBox="0 0 64 64" fill="none" stroke={color} strokeWidth="2.4" strokeLinecap="round" strokeLinejoin="round">
      <circle cx="32" cy="7" r="3.4"/>
      <path d="M18 28 C18 15 24 9 32 9 C40 9 46 15 46 28"/>
      <path d="M18 27 C16 38 20 47 32 49 C44 47 48 38 46 27"/>
      <path d="M21 23 C26 19 38 19 43 23"/>
      <path d="M23.5 30 q2.6 -3.2 5.2 0"/>
      <path d="M35.3 30 q2.6 -3.2 5.2 0"/>
      <path d="M23 37 C27 45 37 45 41 37"/>
      <path d="M23.5 37 L40.5 37"/>
      <path d="M28 37 L28 40.6"/>
      <path d="M36 37 L36 40.6"/>
      <path d="M29.5 13 C26 17 25 22 26 26"/>
      <path d="M16 61 C18 53 24 50 32 50 C40 50 46 53 48 61"/>
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
  const[acl,setAcl]=useState({});
  const[authPending,setAuthPending]=useState(null);
  const[toast,setToast]=useState(null);
  const[modal,setModal]=useState(null);
  const[viewingEmployee,setViewingEmployee]=useState(null);
  const[viewingDay,setViewingDay]=useState(null);
  const[loading,setLoading]=useState(true);

  const schedule=EMBEDDED_SCHEDULE, events=EMBEDDED_EVENTS;
  const ds=todayStr(), now=new Date(), dateObj=new Date(ds);
  const dateLabel=`${DOW_FULL[dateObj.getDay()]}, ${dateObj.getDate()} ${MONTHS_RU[dateObj.getMonth()]}`;

  useEffect(()=>{(async()=>{
    const[t,hist,profs,cds,so,rev,ho,ev,savedWho,seen,sc,cn,au,ac]=await Promise.all([
      ld("tasks:v4",defaultTasks()),ld("done:hist:v2",{}),ld("profiles:v1",DEFAULT_PROFILES),
      ld("cards:v1",[]),ld("status_overrides:v1",[]),ld("revenue:v1",{}),
      ld("handovers:v1",{}),ld("events_log:v1",[]),ld("currentUser",null),ld("inbox_seen:v1",{}),ld("shift_closed:v1",{}),ld("close_notified:v1",{}),ld("auth:v1",{}),ld("acl:v1",{}),
    ]);
    setTasks(mergeSeeds(t));setHistory(hist);setProfiles(profs);setCards(cds);setStatusOverrides(so);
    setRevenue(rev);setHandovers(ho);setEventsLog(ev);setInboxSeen(seen);setShiftClosed(sc);setCloseNotified(cn);setAuth(au);setAcl(ac);
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
    return tasks.filter(t=>t.assignedTo===who&&isToday(t,ds));
  },[tasks,who,ds,isManager]);
  const myAssignedOpen=myAssigned.filter(t=>!doneToday[t.id]).length;
  const inboxItems=useMemo(()=>{
    if(!who||isManager)return[];
    return tasks.filter(t=>t.assignedTo===who).sort((a,b)=>(b.assignedTs||"").localeCompare(a.assignedTs||""));
  },[tasks,who,isManager]);
  const inboxUnread=inboxItems.filter(t=>t.assignedTs&&(!inboxSeen[who]||t.assignedTs>inboxSeen[who])).length;
  const openInbox=()=>{setInboxSeen(prev=>({...prev,[who]:nowISO()}));setModal({_inbox:true});};
  const doneTodayCount=todayTasks.filter(t=>doneToday[t.id]).length;
  const pct=todayTasks.length?Math.round(doneTodayCount/todayTasks.length*100):0;

  // регулярные задачи дня (для логики закрытия смены) — глобально, не по пользователю
  const dayRegular=useMemo(()=>tasks.filter(t=>t.kind!=="irregular"&&isToday(t,ds)),[tasks,ds]);
  const dayClosed=dayRegular.length>0&&dayRegular.every(t=>isDone(history[`${t.id}::${ds}`]));
  // нерегулярные задачи (бэклог «требует внимания»)
  const irregularTasks=useMemo(()=>tasks.filter(t=>t.kind==="irregular"),[tasks]);
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
      const reg=tasks.filter(x=>x.kind!=="irregular"&&isToday(x,ds));
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
  const delTask=id=>{setTasks(p=>p.filter(t=>t.id!==id));setModal(null);};
  const issueCard=(name,type,comment,isPrivate)=>{setCards(prev=>{const r=processCard(prev,name,type,comment,isPrivate,accountLabel(who));logEvent("card_issued",`${name}: ${r.finalType}${isPrivate?" (конфид.)":""}`);return r.cards;});};
  const addHandover=(forDate,text,createTask,taskTitle)=>{
    setHandovers(prev=>({...prev,[forDate]:[...(prev[forDate]||[]),{id:uid(),text,by:accountLabel(who),ts:nowISO()}]}));
    if(createTask&&taskTitle){const nt={id:uid(),title:`[Перенос] ${taskTitle}`,repeat:"once",date:forDate,time:"",assignee:"смена",notes:text,isReport:false};setTasks(p=>[...p,nt]);}
    logEvent("handover",`на ${fmtDate(forDate)}: ${text.slice(0,40)}`);
  };
  const doLogin=name=>{setWho(name);sv("currentUser",name);setPicking(false);setAuthPending(null);logEvent("login",accountLabel(name));};
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

  if(loading)return (<div className="app" style={{display:"flex",alignItems:"center",justifyContent:"center",height:"100vh"}}><style>{FONTS}{CSS}</style><span className="mono" style={{color:"var(--mt)"}}>Загрузка…</span></div>);

  if(picking)return (
    <div className="app"><style>{FONTS}{CSS}</style>
      <div className="login">
        <div style={{marginBottom:16}}><Mascot size={56} color="var(--cu)"/></div>
        <div className="login-title">Работяга</div>
        <div className="login-sub">Выбери себя и войди по паролю</div>
        {DEFAULT_MEMBERS.map(m=>{const ss=SHIFT_STATUSES[getShiftStatus(m,ds,schedule,statusOverrides,now)];
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
    <div className="app"><style>{FONTS}{CSS}</style>
      <div className="nav"><div className="nav-row">
        <button onClick={()=>setViewingDay(null)} style={{background:"transparent",border:"none",color:"var(--cu)",cursor:"pointer",display:"flex",alignItems:"center",gap:6,fontSize:14,fontWeight:600}}><ChevronLeft size={16}/>Календарь</button>
      </div><div className="nav-date" style={{paddingTop:6}}>День</div></div>
      <DayDetail date={viewingDay} schedule={schedule} events={events} tasks={tasks} history={history}
        revenue={revenue} handovers={handovers} isManager={isManager}
        onAddTask={canAddTasks?()=>setModal({_new:true,_date:viewingDay}):null}
        onEditTask={isManager?t=>setModal(t):null}
        onSetRevenue={isManager?(plan,fact)=>setRevenue(prev=>({...prev,[viewingDay]:{plan,fact}})):null}/>
    </div>);

  if(viewingEmployee&&isManager)return (
    <div className="app"><style>{FONTS}{CSS}</style>
      <div className="nav"><div className="nav-row">
        <button onClick={()=>setViewingEmployee(null)} style={{background:"transparent",border:"none",color:"var(--cu)",cursor:"pointer",display:"flex",alignItems:"center",gap:6,fontSize:14,fontWeight:600}}><ChevronLeft size={16}/>Назад</button>
      </div><div className="nav-date" style={{paddingTop:6}}>Кабинет сотрудника</div></div>
      <PersonalCabinet name={viewingEmployee} isOwnCabinet={false} tasks={tasks} history={history}
        schedule={schedule} cards={cards} profiles={profiles} ds={ds} now={now} statusOverrides={statusOverrides}
        onIssueCard={issueCard} onUpdateProfile={p=>setProfiles(prev=>prev.map(x=>x.name===p.name?p:x))}
        onAddOverride={o=>setStatusOverrides(prev=>[...prev.filter(x=>x.name!==o.name),o])} setCardModal={v=>setModal(v)}/>
    </div>);

  const tabs=[
    {id:"today",label:"Сегодня"},{id:"cabinet",label:"Кабинет"},
    ...(hasPerm(who,profiles,"view_all_tasks")||hasPerm(who,profiles,"view_own_tasks")?[{id:"tasks",label:"Задачи"}]:[]),
    ...(hasPerm(who,profiles,"view_schedule")?[{id:"calendar",label:"Календарь"},{id:"hours",label:"Часы"}]:[]),
    {id:"logs",label:"Журнал"},
    ...(hasPerm(who,profiles,"view_team_stats")||isManager?[{id:"stats",label:"Команда"}]:[]),
    ...(isManager?[{id:"cards",label:"Карточки"},{id:"team",label:"Права"}]:[]),
  ];

  return (
    <div className="app"><style>{FONTS}{CSS}</style>
      <div className="nav">
        <div className="nav-row">
          <div className="nav-title"><Mascot size={26} color="var(--cu)"/>Работяга</div>
          <div style={{display:"flex",gap:8,alignItems:"center"}}>
            {!isManager&&<button onClick={openInbox} style={{position:"relative",background:"transparent",border:"none",cursor:"pointer",color:inboxUnread>0?"var(--am)":"var(--mt)",display:"flex",alignItems:"center"}} title="Мои задачи (упоминания)">
              <Inbox size={19}/>{inboxUnread>0&&<span style={{position:"absolute",top:-5,right:-7,background:"var(--rs)",color:"#fff",fontSize:9,fontWeight:700,borderRadius:8,minWidth:15,height:15,display:"flex",alignItems:"center",justifyContent:"center",padding:"0 3px"}}>{inboxUnread}</span>}
            </button>}
            {myStatus&&<span className="sb" style={{background:SHIFT_STATUSES[myStatus]?.bg,color:SHIFT_STATUSES[myStatus]?.color}}>{SHIFT_STATUSES[myStatus]?.label}</span>}
            <button className="nav-who" onClick={()=>setPicking(true)}><User size={12}/>{accountLabel(who)}</button>
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
        pushGateOk={afterPushGate(now)} onSummary={openSummary}
        onToggle={toggle} onEdit={isManager?t=>setModal(t):null} onViewEmployee={isManager?n=>setViewingEmployee(n):null}
        onHandover={t=>setModal({_handover:true,task:t})}/>}

      {tab==="cabinet"&&<PersonalCabinet name={who==="manager"||who==="developer"?who:who} account={who} isOwnCabinet={true} tasks={tasks} history={history}
        schedule={schedule} cards={cards} profiles={profiles} ds={ds} now={now} statusOverrides={statusOverrides}
        onIssueCard={isManager?issueCard:null} onUpdateProfile={isManager?p=>setProfiles(prev=>prev.map(x=>x.name===p.name?p:x)):null}
        onAddOverride={isManager?o=>setStatusOverrides(prev=>[...prev.filter(x=>x.name!==o.name),o]):null} setCardModal={v=>setModal(v)} onToggle={toggle}
        onChangePassword={pwd=>changePassword(who,pwd)}/>}

      {tab==="tasks"&&<TasksTab tasks={tasks} doneMap={doneToday} onToggle={toggle} onEdit={isManager?t=>setModal(t):null}/>}
      {tab==="calendar"&&<CalendarTab schedule={schedule} events={events} revenue={revenue} ds={ds} onOpenDay={d=>setViewingDay(d)}/>}
      {tab==="hours"&&<HoursTab schedule={schedule} members={DEFAULT_MEMBERS} ds={ds}/>}
      {tab==="logs"&&<LogsTab tasks={tasks} history={history} members={DEFAULT_MEMBERS} who={who} isManager={isManager} ds={ds} eventsLog={eventsLog}/>}
      {tab==="stats"&&<StatsTab tasks={tasks} history={history} ds={ds} members={DEFAULT_MEMBERS} schedule={schedule} cards={cards} onView={isManager?n=>setViewingEmployee(n):null}/>}
      {tab==="cards"&&isManager&&<CardsTab cards={cards} members={DEFAULT_MEMBERS} setCardModal={v=>setModal(v)} onRevoke={id=>setCards(prev=>prev.map(c=>c.id===id?{...c,active:false}:c))}/>}
      {tab==="team"&&isManager&&<TeamTab profiles={profiles} members={DEFAULT_MEMBERS} statusOverrides={statusOverrides}
        account={who} isDeveloper={isDeveloper} auth={auth} acl={acl}
        onResetPassword={resetPassword} onToggleAclPwd={setManagerCanViewPasswords}
        onUpdateProfile={p=>setProfiles(prev=>prev.map(x=>x.name===p.name?p:x))}
        onAddOverride={o=>setStatusOverrides(prev=>[...prev.filter(x=>x.name!==o.name),o])}
        onRemoveOverride={name=>setStatusOverrides(prev=>prev.filter(x=>x.name!==name))}/>}

      {canAddTasks&&!["calendar","logs","hours","stats","team","cards"].includes(tab)&&<button className="fab" onClick={()=>setModal({_new:true})}><Plus size={24} color="var(--bg)"/></button>}
      {modal&&!modal._card&&!modal._handover&&!modal._inbox&&!modal._closing&&<TaskModal task={modal._new?null:modal} ds={modal._date||ds} members={DEFAULT_MEMBERS} onClose={()=>setModal(null)} onSave={saveTask} onDelete={delTask}/>}
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

function TodayTab({who,isManager,ds,todayTasks,doneMap,pct,doneTodayCount,todayShifts,myStatus,myAssigned,schedule,events,statusOverrides,now,revenue,handovers,dayClosed,dayRegularCount,irregular,irregularDoneMap,pushGateOk,onSummary,onToggle,onEdit,onViewEmployee,onHandover}){
  const GROUPS=["opening","closing","daily","workday","weekly","once"];
  const LABELS={opening:"Открытие",closing:"Закрытие",daily:"Каждый день",workday:"Будни",weekly:"Еженедельно",once:"Разовые / перенос"};
  const check=staffCheck(ds,schedule,events);
  const todayHandovers=handovers[ds]||[];
  const regularTasks=todayTasks.filter(t=>t.kind!=="irregular");
  const irregularOpen=(irregular||[]).filter(t=>!irregularDoneMap[t.id]);
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

    {GROUPS.map(g=>{const list=regularTasks.filter(t=>t.repeat===g);if(!list.length)return null;
      return(<div className="sec" key={g}>
        <div className="sec-head"><span className="sec-lbl">{LABELS[g]}</span><span className="sec-cnt">{list.filter(t=>doneMap[t.id]).length}/{list.length}</span></div>
        {list.map(t=><TaskCard key={t.id} task={t} done={!!doneMap[t.id]} onToggle={()=>onToggle(t.id)} onEdit={onEdit?()=>onEdit(t):null} onHandover={!doneMap[t.id]&&onHandover?()=>onHandover(t):null}/>)}
      </div>);})}

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

function PersonalCabinet({name,account,isOwnCabinet,tasks,history,schedule,cards,profiles,ds,now,statusOverrides,onIssueCard,onUpdateProfile,onAddOverride,setCardModal,onToggle,onChangePassword}){
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
        {["overview","tasks","stats","recs","cards"].map(s=><button key={s} className={`tab${subtab===s?" on":""}`} onClick={()=>setSubtab(s)} style={{flex:1,textAlign:"center"}}>{s==="overview"?"Обзор":s==="tasks"?"Задачи":s==="stats"?"Цифры":s==="recs"?"Советы":"Карточки"}</button>)}
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
    <div className="info-box" style={{fontSize:12}}>Нормы: пн/вт/чт/вс — 2 чел., ср/пт/сб — 3 (третий с 18:00). Вс со «Стерео 55» и праздники — тоже 3 с 18:00. Красный фон = недобор. Нажми день, чтобы открыть.</div>
    <div className="cal-grid" style={{marginBottom:5}}>{["пн","вт","ср","чт","пт","сб","вс"].map(d=><div className="cal-dow" key={d}>{d}</div>)}</div>
    <div className="cal-grid">
      {cells.map((c,i)=>{
        if(!c)return (<div key={i}/>);
        const check=staffCheck(c,schedule,events);
        const dnum=Number(c.slice(-2));
        const hasRev=revenue[c]&&revenue[c].plan!=null&&revenue[c].plan!=="";
        return(<div key={i} className={`cal-cell${c===ds?" today":""}${!check.ok?" short":""}`} onClick={()=>onOpenDay(c)}>
          <div style={{display:"flex",justifyContent:"space-between",alignItems:"center"}}>
            <span className="cal-num">{dnum}</span>
            {hasRev&&<DollarSign size={9} color="var(--am)"/>}
          </div>
          <span className="cal-staff" style={{color:check.ok?"var(--mt)":"#e07a60"}}>{check.actual}/{check.norm.count}</span>
          {events[c]&&<span className="cal-ev">{events[c]}</span>}
        </div>);
      })}
    </div>
  </div>);
}

function DayDetail({date,schedule,events,tasks,history,revenue,handovers,isManager,onAddTask,onEditTask,onSetRevenue}){
  const dObj=new Date(date);
  const check=staffCheck(date,schedule,events);
  const shifts=(schedule[date]||[]);
  const dayTasks=tasks.filter(t=>isToday(t,date));
  const r=revenue[date]||{};
  const[plan,setPlan]=useState(r.plan??"");
  const[fact,setFact]=useState(r.fact??"");
  const ho=handovers[date]||[];
  return(<div className="sec">
    <div className="cab-hero">
      <div className="cab-name">{dObj.getDate()} {MONTHS_RU[dObj.getMonth()]}</div>
      <div className="cab-role">{DOW_FULL[dObj.getDay()]}{events[date]?` · ${events[date]}`:""}</div>
      <div className="mono" style={{fontSize:12,color:"var(--mt)",marginTop:8}}>Норма штата: {check.norm.count} чел. ({check.norm.reason}){check.norm.thirdFrom?`, третий с ${check.norm.thirdFrom}`:""}</div>
    </div>

    {!check.ok&&<div className="alert danger"><AlertTriangle size={16} style={{flexShrink:0,marginTop:1}}/><span>{check.msg}</span></div>}
    {check.ok&&check.msg&&<div className="alert warn"><AlertTriangle size={16} style={{flexShrink:0,marginTop:1}}/><span>{check.msg}</span></div>}
    {check.ok&&!check.msg&&<div className="alert ok"><CheckCircle size={16} style={{flexShrink:0,marginTop:1}}/><span>Штат укомплектован по норме ({check.actual}/{check.norm.count})</span></div>}

    <div className="sec-lbl" style={{margin:"14px 0 8px"}}><DollarSign size={12} style={{display:"inline"}}/> План выручки</div>
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
    </div>
    {shifts.length===0&&<div className="empty" style={{padding:"14px 0"}}>Смен нет</div>}
    {shifts.map((s,i)=><div className="sc" key={i}><div className="sr">
      <div><div className="sn"><User size={13} color="var(--cu)"/>{s.name}{s.guest?" (гость)":""}</div>{s.start&&<div className="st">{s.start}{s.end?` · ${s.end}ч`:""}</div>}</div>
      {s.report&&<span style={{fontSize:10,fontWeight:700,padding:"3px 8px",borderRadius:8,background:"rgba(232,160,48,.18)",color:"var(--am)"}}>отчёт</span>}
    </div></div>)}

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

function TasksTab({tasks,doneMap,onToggle,onEdit}){
  return(<div className="sec">
    <div className="sec-head"><span className="sec-lbl">Все задачи ({tasks.length})</span></div>
    {tasks.length===0&&<div className="empty">Нет задач</div>}
    {tasks.map(t=><TaskCard key={t.id} task={t} done={!!doneMap[t.id]} onToggle={()=>onToggle(t.id)} onEdit={onEdit?()=>onEdit(t):null}/>)}
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
  const EV_LABELS={task_done:"✅ Задача выполнена",task_undone:"↩️ Задача снята",card_issued:"🟥 Карточка",handover:"📨 Передача смене",task_added:"➕ Новая задача",assigned:"@ Назначен ответственный",shift_closed:"🎉 Смена закрыта",login:"🔑 Вход в систему",password_set:"🔐 Пароль задан",password_changed:"🔐 Пароль изменён",password_reset:"♻️ Пароль сброшен",acl_changed:"🛡️ Изменены доступы"};
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

function TeamTab({profiles,members,statusOverrides,account,isDeveloper,auth,acl,onResetPassword,onToggleAclPwd,onUpdateProfile,onAddOverride,onRemoveOverride}){
  const[editing,setEditing]=useState(null);
  const seePwd=canViewPasswords(account,acl||{});
  const ACCOUNTS=[...members,"manager","developer"];
  return(<div className="sec">
    <div className="sec-head"><span className="sec-lbl"><Users size={12}/>Права доступа</span></div>
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

function TaskCard({task,done,onToggle,onEdit,onHandover,highlight}){
  const rl=REPEAT_OPTS.find(r=>r.id===task.repeat)?.label;
  return(<div className={`task${done?" done":""}`} style={highlight&&!done?{borderColor:"rgba(232,160,48,.45)",borderLeftWidth:3}:undefined}>
    <div className="task-top">
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
