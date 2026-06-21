const fs = require('fs');
const path = 'frontend/src/App.jsx';
let code = fs.readFileSync(path, 'utf8');

// 1. Добавляем getRevenueColor (уже есть, но проверим)
if (!code.includes('function getRevenueColor')) {
  const func = `
function getRevenueColor(pct) {
  if (pct >= 110) return '#5b8b9b';
  if (pct >= 100) return '#8bc47a';
  if (pct >= 90) return '#e8a030';
  return '#e85535';
}
`;
  code = code.replace('function CalendarTab(', func + '\nfunction CalendarTab(');
  console.log('✅ getRevenueColor added');
}

// 2. Добавляем tooltip state (если ещё нет)
if (!code.includes('tooltip, setTooltip')) {
  code = code.replace(
    /function CalendarTab\([^)]*\)\s*{/,
    'function CalendarTab({schedule,events,revenue,ds,onOpenDay}){\n  const [tooltip, setTooltip] = React.useState({ show: false, x: 0, y: 0, data: null });'
  );
  console.log('✅ tooltip state added');
}

// 3. Добавляем обработчики hover на ячейки календаря
const oldCell = 'className={`cal-cell${c===ds?" today":""}`}';
const newCell = `className={\`cal-cell\${c===ds?" today":""}\`}
          onMouseEnter={(e)=>{
            const rect = e.currentTarget.getBoundingClientRect();
            const revData = revenue[c] || {};
            const shifts = schedule[c] || [];
            const eventText = events[c] || null;
            
            // Формируем данные для тултипа
            const tooltipData = {
              date: c,
              shifts: shifts,
              event: eventText,
              revenue: revData,
              status: getRevenueColor(
                revData.plan && revData.fact ? (revData.fact/revData.plan)*100 : null
              )
            };
            
            setTooltip({
              show: true,
              x: rect.left + rect.width/2,
              y: rect.top - 10,
              data: tooltipData
            });
          }}
          onMouseLeave={() => setTooltip({show: false, x: 0, y: 0, data: null})}`;

if (code.includes(oldCell)) {
  code = code.replace(oldCell, newCell);
  console.log('✅ cal-cell hover handlers added');
}

// 4. Добавляем вычисление bgColor
if (!code.includes('const bgColor')) {
  code = code.replace(
    /const hasRev=revenue\[c\]&&revenue\[c\]\.plan!=null&&revenue\[c\]\.plan!=="";/,
    `const hasRev = revenue[c] && revenue[c].plan != null && revenue[c].plan !== "";
        const rev = revenue[c] || {};
        const pct = rev.plan && rev.fact ? (rev.fact / rev.plan) * 100 : null;
        const bgColor = pct ? getRevenueColor(pct) : (!check.ok ? "rgba(224,122,96,.15)" : "transparent");`
  );
  console.log('✅ bgColor calculation added');
}

// 5. Добавляем style с bgColor к ячейке
code = code.replace(
  /onMouseLeave={\(\)=>setTooltip\(\{show:false,x:0,y:0,data:null\}\)}/,
  'onMouseLeave={()=>setTooltip({show:false,x:0,y:0,data:null})} style={{background:bgColor}}'
);
console.log('✅ bgColor style added');

// 6. Добавляем рендер тултипа (улучшенная версия)
const tooltipHTML = `
      {tooltip.show && tooltip.data && (
        <div style={{
          position: 'fixed',
          left: tooltip.x,
          top: tooltip.y,
          transform: 'translate(-50%, -100%)',
          background: 'var(--bg)',
          border: '1px solid var(--bd)',
          borderRadius: '12px',
          padding: '16px 20px',
          boxShadow: '0 12px 40px rgba(0,0,0,0.25)',
          zIndex: 1000,
          maxWidth: 320,
          minWidth: 250,
          fontSize: 13,
          pointerEvents: 'none',
          animation: 'tooltipFade 0.15s ease-out',
          color: 'var(--tx)'
        }}>
          {/* Дата */}
          <div style={{
            display: 'flex',
            justifyContent: 'space-between',
            alignItems: 'baseline',
            borderBottom: '1px solid var(--bd)',
            paddingBottom: 8,
            marginBottom: 8,
            fontWeight: 600,
            color: 'var(--pp)'
          }}>
            <span>{new Date(tooltip.data.date).toLocaleDateString('ru-RU', { day: 'numeric', month: 'long', year: 'numeric' })}</span>
            <span style={{ fontSize: 11, color: 'var(--mt)', fontWeight: 'normal' }}>
              {new Date(tooltip.data.date).toLocaleDateString('ru-RU', { weekday: 'short' })}
            </span>
          </div>

          {/* Статус дня */}
          {tooltip.data.revenue && tooltip.data.revenue.plan && (
            <div style={{
              fontSize: 14,
              fontWeight: 500,
              marginBottom: 10,
              padding: '4px 0',
              color: tooltip.data.status || 'var(--tx)'
            }}>
              {tooltip.data.revenue.fact && tooltip.data.revenue.plan
                ? (tooltip.data.revenue.fact / tooltip.data.revenue.plan >= 1.1
                  ? '🔥 Отличный день!'
                  : tooltip.data.revenue.fact / tooltip.data.revenue.plan >= 1
                  ? '👍 Хороший день'
                  : tooltip.data.revenue.fact / tooltip.data.revenue.plan >= 0.9
                  ? '📊 Средний день'
                  : '📉 Тихий день')
                : '📅 День'}
            </div>
          )}

          {/* Смены */}
          {tooltip.data.shifts && tooltip.data.shifts.length > 0 && (
            <div style={{ marginBottom: 8 }}>
              <div style={{ fontSize: 11, color: 'var(--mt)', marginBottom: 4, fontWeight: 500 }}>
                👥 Смены ({tooltip.data.shifts.length})
              </div>
              {tooltip.data.shifts.map((s, i) => (
                <div key={i} style={{
                  fontSize: 12,
                  padding: '2px 0',
                  display: 'flex',
                  justifyContent: 'space-between',
                  color: 'var(--tx)'
                }}>
                  <span>{s.name || 'Смена ' + (i+1)}</span>
                  <span style={{ color: 'var(--mt)' }}>
                    {s.start || ''}{s.end ? ' - ' + s.end : ''}
                  </span>
                </div>
              ))}
            </div>
          )}

          {/* Выручка */}
          {tooltip.data.revenue && tooltip.data.revenue.plan && (
            <div style={{
              marginTop: 6,
              paddingTop: 6,
              borderTop: '1px solid var(--bd)',
              fontSize: 12,
              display: 'flex',
              flexDirection: 'column',
              gap: 2
            }}>
              <div style={{ display: 'flex', justifyContent: 'space-between' }}>
                <span style={{ color: 'var(--mt)' }}>💰 План:</span>
                <span style={{ fontWeight: 500 }}>{tooltip.data.revenue.plan.toLocaleString('ru-RU')} ₽</span>
              </div>
              {tooltip.data.revenue.fact && (
                <div style={{ display: 'flex', justifyContent: 'space-between' }}>
                  <span style={{ color: 'var(--mt)' }}>📈 Факт:</span>
                  <span style={{ fontWeight: 500, color: 'var(--am)' }}>
                    {tooltip.data.revenue.fact.toLocaleString('ru-RU')} ₽
                  </span>
                </div>
              )}
            </div>
          )}

          {/* Событие */}
          {tooltip.data.event && (
            <div style={{
              marginTop: 8,
              paddingTop: 8,
              borderTop: '1px solid var(--bd)',
              fontSize: 12,
              color: 'var(--am)',
              fontStyle: 'italic'
            }}>
              📌 {tooltip.data.event}
            </div>
          )}
        </div>
      )}
`;

// Находим место для вставки тултипа (перед закрывающим div CalendarTab)
const lastDiv = code.lastIndexOf('</div>\n  );\n}', code.indexOf('function CalendarTab(') + 5000);
if (lastDiv > -1 && !code.includes('tooltip.show && tooltip.data')) {
  code = code.slice(0, lastDiv) + tooltipHTML + code.slice(lastDiv);
  console.log('✅ Enhanced tooltip render added');
} else if (code.includes('tooltip.show && tooltip.data')) {
  console.log('⚠️ Tooltip already exists, skipping render');
} else {
  console.log('❌ Could not find insertion point for tooltip');
}

// 7. Добавляем анимацию в CSS (если есть index.css)
try {
  const cssPath = 'frontend/src/index.css';
  let css = fs.readFileSync(cssPath, 'utf8');
  if (!css.includes('@keyframes tooltipFade')) {
    const anim = `
/* Tooltip animation */
@keyframes tooltipFade {
  from {
    opacity: 0;
    transform: translate(-50%, -100%) scale(0.96);
  }
  to {
    opacity: 1;
    transform: translate(-50%, -100%) scale(1);
  }
}
`;
    css = anim + css;
    fs.writeFileSync(cssPath, css);
    console.log('✅ Tooltip animation added to index.css');
  }
} catch (e) {
  console.log('⚠️ Could not update index.css, but it\'s not critical');
}

fs.writeFileSync(path, code);
console.log('✅ File saved successfully!');
console.log('🚀 Now run: npm run build && ./deploy.sh');
