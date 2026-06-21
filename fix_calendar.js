const fs = require('fs');
const path = 'frontend/src/App.jsx';
let code = fs.readFileSync(path, 'utf8');

// 1. Добавляем getRevenueColor
if (!code.includes('getRevenueColor')) {
  const func = "\nfunction getRevenueColor(pct) {\n  if (pct >= 110) return '#5b8b9b';\n  if (pct >= 100) return '#8bc47a';\n  if (pct >= 90) return '#e8a030';\n  return '#e85535';\n}\n\n";
  code = code.replace('function CalendarTab(', func + 'function CalendarTab(');
  console.log('✅ getRevenueColor added');
}

// 2. Добавляем tooltip state
if (!code.includes('tooltip, setTooltip')) {
  code = code.replace(
    'function CalendarTab({schedule,events,revenue,ds,onOpenDay}){',
    'function CalendarTab({schedule,events,revenue,ds,onOpenDay}){\n  const [tooltip, setTooltip] = useState({ show: false, x: 0, y: 0, data: null });'
  );
  console.log('✅ tooltip state added');
}

// 3. Модифицируем cal-cell
const oldCell = 'className={`cal-cell${c===ds?" today":""}`}';
const newCell = 'className={`cal-cell${c===ds?" today":""}`}\n          onMouseEnter={(e)=>{\n            const rect=e.currentTarget.getBoundingClientRect();\n            setTooltip({show:true,x:rect.left+rect.width/2,y:rect.top-10,data:{date:c,shifts:schedule[c]||[],event:events[c],revenue:revenue[c]}});\n          }}\n          onMouseLeave={()=>setTooltip({show:false,x:0,y:0,data:null})}';

if (code.includes(oldCell)) {
  code = code.replace(oldCell, newCell);
  console.log('✅ cal-cell hover added');
}

// 4. Добавляем bgColor вычисление
if (!code.includes('const bgColor')) {
  code = code.replace(
    'const hasRev=revenue[c]&&revenue[c].plan!=null&&revenue[c].plan!=="";',
    'const hasRev=revenue[c]&&revenue[c].plan!=null&&revenue[c].plan!=="";\n        const rev=revenue[c]||{};const pct=rev.plan&&rev.fact?(rev.fact/rev.plan)*100:null;const bgColor=pct?getRevenueColor(pct):(!check.ok?"rgba(224,122,96,.15)":"transparent");'
  );
  console.log('✅ bgColor calculation added');
}

// 5. Добавляем style={{background:bgColor}} к cal-cell
code = code.replace(
  'onMouseLeave={()=>setTooltip({show:false,x:0,y:0,data:null})}',
  'onMouseLeave={()=>setTooltip({show:false,x:0,y:0,data:null})} style={{background:bgColor}}'
);
console.log('✅ bgColor style added');

// 6. Добавляем рендер tooltip (массив строк)
const tooltipLines = [
  "\n      {tooltip.show && tooltip.data && (",
  "        <div style={{position:'fixed',left:tooltip.x,top:tooltip.y,transform:'translate(-50%,-100%)',background:'var(--bg)',border:'1px solid var(--bd)',borderRadius:8,padding:'10px 14px',boxShadow:'0 4px 16px rgba(0,0,0,.15)',zIndex:1000,maxWidth:280,fontSize:13,pointerEvents:'none'}}>",
  "          <div style={{fontWeight:600,marginBottom:6,color:'var(--pp)'}}>",
  "            {new Date(tooltip.data.date).toLocaleDateString('ru-RU',{day:'numeric',month:'long',weekday:'short'})}",
  "          </div>",
  "          {tooltip.data.shifts.length>0&&(",
  "            <div style={{marginBottom:6}}>",
  "              <div style={{fontSize:11,color:'var(--mt)',marginBottom:3}}>Смены:</div>",
  "              {tooltip.data.shifts.map((s,i)=>(",
  "                <div key={i} style={{fontSize:12,color:'var(--tx)'}}>{s.name} {s.start}{s.end?(' - '+s.end):''}</div>",
  "              ))}",
  "            </div>",
  "          )}",
  "          {tooltip.data.event&&(<div style={{fontSize:12,color:'var(--am)',marginTop:4}}>{tooltip.data.event}</div>)}",
  "          {tooltip.data.revenue&&tooltip.data.revenue.plan&&(",
  "            <div style={{fontSize:12,marginTop:4}}>",
  "              План: {tooltip.data.revenue.plan} руб",
  "              {tooltip.data.revenue.fact?(' / Факт: '+tooltip.data.revenue.fact+' руб'):''}",
  "            </div>",
  "          )}",
  "        </div>",
  "      )}\n"
];
const tooltipRender = tooltipLines.join('\n');

if (!code.includes('tooltip.show && tooltip.data')) {
  const lastDiv = code.lastIndexOf('</div>\n  );\n}', code.indexOf('function CalendarTab(') + 2000);
  if (lastDiv > -1) {
    code = code.slice(0, lastDiv) + tooltipRender + code.slice(lastDiv);
    console.log('✅ tooltip render added');
  }
}

fs.writeFileSync(path, code);
console.log('✅ File saved!');
