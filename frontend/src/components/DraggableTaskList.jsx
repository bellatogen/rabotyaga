// Перетаскивание задач (работает на мыши и на тач — через Pointer Events)
import { useState, useEffect, useLayoutEffect, useRef } from 'react';
import { GripVertical } from 'lucide-react';
import { TaskCard } from './TaskCard.jsx';
import { SwipeRow } from './SwipeRow.jsx';

export function DraggableTaskList({tasks,onReorder,onToggle,onEdit,onHandover,doneMap,onDelete,onArchive}){
  const [items,setItems]=useState(tasks);
  const key=tasks.map(t=>t.id).join("|");
  useEffect(()=>{setItems(tasks);},[key]);
  const dragIdx=useRef(null);
  const [dragging,setDragging]=useState(null);
  const contRef=useRef(null);
  // FLIP — плавное расступание карточек
  const rowEls=useRef({});
  const prevRects=useRef({});
  useLayoutEffect(()=>{
    Object.entries(rowEls.current).forEach(([id,el])=>{
      if(!el)return;
      const nr=el.getBoundingClientRect();
      const pr=prevRects.current[id];
      if(pr){
        const dy=pr.top-nr.top;
        if(dy){
          el.style.transition="none";
          el.style.transform=`translateY(${dy}px)`;
          requestAnimationFrame(()=>{el.style.transition="transform .2s cubic-bezier(.2,.7,.3,1)";el.style.transform="";});
        }
      }
      prevRects.current[id]=nr;
    });
  });
  const reorder=(from,to)=>setItems(prev=>{const a=[...prev];const[m]=a.splice(from,1);a.splice(to,0,m);return a;});
  const onMove=(clientY)=>{
    if(dragIdx.current==null||!contRef.current)return;
    const rows=[...contRef.current.querySelectorAll("[data-row]")];
    let target=rows.findIndex(r=>{const b=r.getBoundingClientRect();return clientY<b.top+b.height/2;});
    if(target===-1)target=rows.length-1;
    if(target!==dragIdx.current){reorder(dragIdx.current,target);dragIdx.current=target;setDragging(target);}
  };
  const start=(e,idx)=>{e.stopPropagation();dragIdx.current=idx;setDragging(idx);try{e.currentTarget.setPointerCapture(e.pointerId);}catch{}};
  const move=e=>{if(dragIdx.current!=null){e.preventDefault();onMove(e.clientY);}};
  const end=()=>{if(dragIdx.current!=null)onReorder(items.map(i=>i.id));dragIdx.current=null;setDragging(null);};
  return(<div ref={contRef}>
    {items.map((t,idx)=>(
      <div data-row key={t.id} ref={el=>{rowEls.current[t.id]=el;}}>
        <SwipeRow onDelete={onDelete?()=>onDelete(t.id):null} onArchive={onArchive?()=>onArchive(t.id):null}>
          <TaskCard task={t} done={!!doneMap[t.id]} dragging={dragging===idx}
            onToggle={()=>onToggle(t.id)} onEdit={onEdit?()=>onEdit(t):null} onHandover={onHandover?()=>onHandover(t):null}
            dragHandle={items.length>1?<span className="grip" onPointerDown={e=>start(e,idx)} onPointerMove={move} onPointerUp={end} onPointerCancel={end}><GripVertical size={16}/></span>:null}/>
        </SwipeRow>
      </div>
    ))}
  </div>);
}
