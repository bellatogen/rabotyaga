// Гоу-лист: общий список команды + компактный блок для «Сегодня»
import { useState } from 'react';
import { CheckCircle, Plus, FileText, ChevronUp, ChevronDown } from 'lucide-react';

/* ---------- Гоу-лист: общий список команды ---------- */
export function GoRow({item,onToggle,onRemove}){
  return(<div className="task" style={{display:"flex",alignItems:"center",gap:10,marginBottom:6}}>
    <button className={`chk${item.done?" done":""}`} onClick={()=>onToggle(item.id)}>{item.done&&<CheckCircle size={14} color="#fff"/>}</button>
    <span style={{flex:1,fontSize:14,textDecoration:item.done?"line-through":"none",color:item.done?"var(--mt)":"var(--pp)"}}>{item.text}</span>
    {item.by&&<span style={{fontSize:10,color:"var(--mt)"}}>{item.by}</span>}
    <button onClick={()=>onRemove(item.id)} style={{background:"transparent",border:"none",color:"var(--mt)",cursor:"pointer",fontSize:20,lineHeight:1,padding:"0 2px"}}>×</button>
  </div>);
}

export function GoListInput({onAdd}){
  const[txt,setTxt]=useState("");
  const add=()=>{if(txt.trim()){onAdd(txt);setTxt("");}};
  return(<div style={{display:"flex",gap:8,marginBottom:12}}>
    <input value={txt} onChange={e=>setTxt(e.target.value)} onKeyDown={e=>e.key==="Enter"&&add()} placeholder="Добавить пункт…"
      style={{flex:1,background:"var(--bg)",border:"1px solid var(--bd)",borderRadius:8,padding:"10px 12px",color:"var(--pp)",fontSize:14,fontFamily:"inherit"}}/>
    <button className="btn btn-p" style={{width:"auto",padding:"0 16px",margin:0}} onClick={add}><Plus size={16}/></button>
  </div>);
}

/* Компактный гоу-лист на «Сегодня» — всегда под рукой, сворачивается */
export function GoListBlock({items,onAdd,onToggle,onRemove,defaultOpen=false}){
  const[open,setOpen]=useState(defaultOpen);
  const openCnt=items.filter(i=>!i.done).length;
  return(<div style={{border:"1px solid var(--bd)",borderRadius:10,overflow:"hidden",background:"var(--sf)"}}>
    <button onClick={()=>setOpen(o=>!o)} className="acc-head">
      <span style={{display:"flex",alignItems:"center",gap:6}}><FileText size={13} color="var(--cu)"/>Гоу-лист · {openCnt}</span>
      {open?<ChevronUp size={16}/>:<ChevronDown size={16}/>}
    </button>
    {open&&<div style={{padding:"4px 12px 12px"}}>
      <GoListInput onAdd={onAdd}/>
      {items.length===0&&<div style={{fontSize:12,color:"var(--mt)",padding:"4px 0"}}>Пусто. Добавь, что купить или занести.</div>}
      {items.filter(i=>!i.done).map(i=><GoRow key={i.id} item={i} onToggle={onToggle} onRemove={onRemove}/>)}
      {items.some(i=>i.done)&&<div style={{fontSize:11,color:"var(--mt)",margin:"8px 0 4px",opacity:.7}}>Куплено</div>}
      {items.filter(i=>i.done).map(i=><GoRow key={i.id} item={i} onToggle={onToggle} onRemove={onRemove}/>)}
    </div>}
  </div>);
}
