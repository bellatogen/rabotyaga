// Карточка выручки — показывает план и факт, считает % плана
import { AlertTriangle } from 'lucide-react';
import { fmtDate } from '../utils/dateUtils.js';

export function RevenueCard({date,revenue}){
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
