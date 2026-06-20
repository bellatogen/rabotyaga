// Задачи-заготовки (seed tasks) с постоянными id — подмешиваются к сохранённым, не затирая кастомные.
// Cadence задач можно менять в редакторе задач.

import { uid } from '../utils/dateUtils.js';

// Задачи со стабильными id — не затираются при мёрдже
export const SEED_TASKS = [
  {id:"seed-nuts",   title:"Заказать орехи в Blackchops",          repeat:"weekly",dayOfWeek:1,time:"12:00",assignee:"смена",assignedTo:null,notes:"",isReport:false},
  {id:"seed-cheese", title:"Заказать сыры",                         repeat:"weekly",dayOfWeek:1,time:"12:00",assignee:"смена",assignedTo:null,notes:"",isReport:false},
  {id:"seed-meat",   title:"Заказать мясные закуски (Meatsiders)",  repeat:"weekly",dayOfWeek:2,time:"12:00",assignee:"смена",assignedTo:null,notes:"",isReport:false},
  {id:"seed-sandwiches",title:"Заказать сэндвичи",                  repeat:"weekly",dayOfWeek:4,time:"12:00",assignee:"смена",assignedTo:null,notes:"",isReport:false},
  {id:"seed-staff",  title:"Заказать стаф-питание",                 repeat:"weekly",dayOfWeek:1,time:"13:00",assignee:"смена",assignedTo:null,notes:"",isReport:false},
  {id:"seed-dust",   title:"Протереть полки от пыли",               repeat:"weekly",dayOfWeek:3,time:"11:30",assignee:"смена",assignedTo:null,notes:"",isReport:false},
  {id:"seed-cash",   title:"Разменять наличные",                    repeat:"opening",time:"11:00",assignee:"смена",assignedTo:null,notes:"",isReport:false},
];

/** Возвращает набор задач по умолчанию (вызывается при первом запуске) */
export function defaultTasks() {
  return [
    {id:uid(),title:"Проверить остатки пива",         repeat:"opening",time:"10:30",assignee:"смена",notes:"",isReport:false},
    {id:uid(),title:"Протереть краны, проверить давление",repeat:"opening",time:"11:00",assignee:"смена",notes:"",isReport:false},
    {id:uid(),title:"Выставить меню и карту пива",    repeat:"opening",time:"11:00",assignee:"смена",notes:"",isReport:false},
    {id:uid(),title:"Заполнить отчёт по смене",       repeat:"closing",time:"23:00",assignee:"смена",notes:"Выручка, инциденты, списания",isReport:true},
    {id:uid(),title:"Инвентаризация кассы",           repeat:"closing",time:"22:45",assignee:"смена",notes:"",isReport:true},
    {id:uid(),title:"Уборка зала и стойки",           repeat:"closing",time:"23:00",assignee:"смена",notes:"",isReport:false},
    {id:uid(),title:"Проверить поступления на завтра",repeat:"daily",  time:"15:00",assignee:"смена",notes:"",isReport:false},
    ...SEED_TASKS,
  ];
}

/** Добавляет отсутствующие seed-задачи к сохранённому списку, не затирая кастомные */
export function mergeSeeds(tasks) {
  const ids = new Set(tasks.map(t => t.id));
  const missing = SEED_TASKS.filter(s => !ids.has(s.id));
  return missing.length ? [...tasks, ...missing] : tasks;
}
