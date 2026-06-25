// Перетаскивание блоков вкладки «Сегодня» вверх-вниз (мышь + тач через Pointer Events)
import { useState, useEffect, useLayoutEffect, useRef } from 'react';
import { GripVertical } from 'lucide-react';

export function DraggableSections({order,nodes,onReorder}){
  // показываем только блоки с реальным содержимым (не null)
  const visible=order.filter(id=>nodes[id]);
  const [items,setItems]=useState(visible);
  const key=visible.join("|");
  useEffect(()=>{setItems(visible);},[key]); // eslint-disable-line react-hooks/exhaustive-deps
  const dragIdx=useRef(null);
  const [dragging,setDragging]=useState(null);
  const contRef=useRef(null);
  // FLIP — плавное расступание блоков при перетаскивании
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
    const rows=[...contRef.current.querySelectorAll("[data-srow]")];
    let target=rows.findIndex(r=>{const b=r.getBoundingClientRect();return clientY<b.top+b.height/2;});
    if(target===-1)target=rows.length-1;
    if(target!==dragIdx.current){reorder(dragIdx.current,target);dragIdx.current=target;setDragging(target);}
  };
  const start=(e,idx)=>{e.stopPropagation();dragIdx.current=idx;setDragging(idx);try{e.currentTarget.setPointerCapture(e.pointerId);}catch{}};
  const move=e=>{if(dragIdx.current!=null){e.preventDefault();onMove(e.clientY);}};
  const end=()=>{if(dragIdx.current!=null)onReorder(items);dragIdx.current=null;setDragging(null);};
  return(<div ref={contRef}>
    {items.map((id,idx)=>(
      <div data-srow key={id} ref={el=>{rowEls.current[id]=el;}}
        className={dragging===idx?"sec-dragging":""} style={{position:"relative"}}>
        <span className="sec-grip" title="Перетащить блок"
          onPointerDown={e=>start(e,idx)} onPointerMove={move} onPointerUp={end} onPointerCancel={end}>
          <GripVertical size={15}/>
        </span>
        {nodes[id]}
      </div>
    ))}
  </div>);
}
