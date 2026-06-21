// Модалка итогов дня / закрытия смены
import { useState } from 'react';
import { ArrowRight, FileText, ChevronLeft, ChevronRight } from 'lucide-react';
import { fmtDate } from '../utils/dateUtils.js';

export function ClosingSummaryModal({summary,auto,onClose,onCarryOver}){
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
