// Локализация и справочники UI

import { ROLES } from './roles.js';

export const DAYS_RU = ["вс","пн","вт","ср","чт","пт","сб"];
export const DOW_FULL = ["Воскресенье","Понедельник","Вторник","Среда","Четверг","Пятница","Суббота"];
export const MONTHS_RU = ["Января","Февраля","Марта","Апреля","Мая","Июня","Июля","Августа","Сентября","Октября","Ноября","Декабря"];
export const REPEAT_OPTS = [
  {id:"opening",label:"Открытие смены"},
  {id:"closing",label:"Закрытие смены"},
  {id:"daily",label:"Каждый день"},
  {id:"workday",label:"По будням"},
  {id:"weekly",label:"Еженедельно"},
  {id:"once",label:"Разово"},
];
export const DEFAULT_MEMBERS = ["Александр","Павел","Евгений","Тимофей","Ярослав","Антон","Андрей"];
export const DEFAULT_PROFILES = DEFAULT_MEMBERS.map((name, i) => ({
  name,
  role: i === 0 ? "head_barman" : "barman",
  perms: i === 0 ? ROLES.head_barman.perms : ROLES.barman.perms,
}));
