const fs = require('fs');
const path = 'frontend/src/App.jsx';
let code = fs.readFileSync(path, 'utf8');

// 1. Добавь функцию для определения цвета светофора
const trafficLightFunc = `
  const getRevenueColor = (pct) => {
    if (pct >= 110) return '#5b8b9b';
    if (pct >= 100) return '#8bc47a';
    if (pct >= 90) return '#e8a030';
    return '#e85535';
  };
`;

// Вставь перед функцией Calendar
const calendarFuncMatch = code.match(/function Calendar\(\{/);
if (calendarFuncMatch) {
  code = code.replace(calendarFuncMatch[0], trafficLightFunc + '\n' + calendarFuncMatch[0]);
  console.log('✅ Добавил функцию getRevenueColor');
}

// 2. Модифицируй рендер cal-cell
const oldCalCell = `return(<div key={i} className={\`cal-cell\${c===ds?" today":""}\${!check.ok?" short":""}\`} onClick={()=>onOpenDay(c)}>
          <div style={{display:"flex",justifyContent:"space-between",alignItems:"center"}}>
            <span className="cal-num">{dnum}</span>
            {hasRev&&<span style={{fontSize:11,color:"var(--am)",fontWeight:700}}>₽</span>}
          </div>
          <span className="cal-staff" style={{color:check.ok?"var(--mt)":"#e07a60"}}>{check.actual}/{check.norm.count}</span>
          {events[c]&&<span className="cal-ev">{events[c]}</span>}
        </div>);`;

const newCalCell = `const rev = revenue[c] || {};
          const pct = rev.plan && rev.fact ? (rev.fact / rev.plan) * 100 : null;
          const bgColor = pct ? getRevenueColor(pct) : (!check.ok ? 'rgba(224,122,96,.15)' : 'transparent');
          return(<div key={i} className={\`cal-cell\${c===ds?" today":""}\`} style={{background: bgColor}} onClick={()=>onOpenDay(c)}>
          <div style={{display:"flex",justifyContent:"space-between",alignItems:"center"}}>
            <span className="cal-num">{dnum}</span>
            {hasRev&&<span style={{fontSize:11,color:"var(--am)",fontWeight:700}}>₽</span>}
          </div>
          <span className="cal-staff" style={{color:check.ok?"var(--mt)":"#e07a60"}}>{check.actual}/{check.norm.count}</span>
          {pct!=null&&<span style={{fontSize:10,fontWeight:600,color:getRevenueColor(pct)}}>{Math.round(pct)}%</span>}
          {events[c]&&<span className="cal-ev">{events[c]}</span>}
        </div>);`;

code = code.replace(oldCalCell, newCalCell);
console.log('✅ Модифицировал рендер cal-cell');

// 3. Обнови текст в info-box
const oldInfo = 'Красный фон = недобор. Нажми день, чтобы открыть.';
const newInfo = 'Цвета: 🔴<90% 🟡90-100% 🟢100-110% 🔵>110%. Нажми день, чтобы открыть.';
code = code.replace(oldInfo, newInfo);
console.log('✅ Обновил info-box');

fs.writeFileSync(path, code);
console.log('✅ Светофор на календаре добавлен!');
