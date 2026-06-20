const fs = require('fs');
const path = 'frontend/src/App.jsx';
let code = fs.readFileSync(path, 'utf8');

// 1. Заменить вкладки - объединить кабинет и админку
code = code.replace(
  /const tabs=\[\n\s*\{id:"today",label:"Сегодня"\},\{id:"cabinet",label:"Кабинет"\},\n\s*\.\.\.\(hasPerm\(who,profiles,"view_all_tasks"\)\|\|hasPerm\(who,profiles,"view_own_tasks"\)\?\[\{id:"tasks",label:"Задачи"\}\]:\[\]\),\n\s*\.\.\.\(hasPerm\(who,profiles,"view_schedule"\)\?\[\{id:"schedule",label:"График"\}\]:\[\]\),\n\s*\.\.\.\(canTeam\|\|canStats\?\[\{id:"team",label:"Команда"\}\]:\[\]\),\n\s*\.\.\.\(isManager\?\[\{id:"admin",label:"⚙️ Админка"\}\]:\[\]\),\n\s*\];/,
  `const tabs=[
    {id:"today",label:"Сегодня"},
    ...(hasPerm(who,profiles,"view_all_tasks")||hasPerm(who,profiles,"view_own_tasks")?[{id:"tasks",label:"Задачи"}]:[]),
    ...(hasPerm(who,profiles,"view_schedule")?[{id:"schedule",label:"График"}]:[]),
    ...(canTeam||canStats?[{id:"team",label:"Команда"}]:[]),
    {id:"settings",label:"️ Управление"},
  ];`
);

// 2. Заменить рендер кабинет и админка на одну вкладку settings
code = code.replace(
  /\{tab==="cabinet"&&<PersonalCabinet name=\{who==="manager"\|\|who==="developer"\?who:who\} account=\{who\} isOwnCabinet=\{true\} tasks=\{tasks\} history=\{history\}/,
  '{tab==="settings"&&isManager&&<AdminTab auth={auth} members={members} ds={ds}/>}\\n      {tab==="settings"&&!isManager&&<PersonalCabinet name={who==="manager"||who==="developer"?who:who} account={who} isOwnCabinet={true} tasks={tasks} history={history}'
);

fs.writeFileSync(path, code);
console.log('✅ Вкладки объединены!');
