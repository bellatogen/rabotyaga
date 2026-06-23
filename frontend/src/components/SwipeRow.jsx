// Свайп влево → открываются «Архив» и «Удалить». Тач + мышь, не мешает вертикальному скроллу.
import { useState, useRef } from 'react';
import { Archive, Trash2 } from 'lucide-react';

export function SwipeRow({children,onArchive,onDelete}){
  const enabled=!!(onArchive||onDelete);
  const W=(onArchive?78:0)+(onDelete?78:0);
  const [x,setX]=useState(0);
  const fg=useRef(null);
  const st=useRef({down:false,sx:0,sy:0,base:0,axis:null});
  if(!enabled)return children;
  const set=(v,anim)=>{const el=fg.current;if(!el)return;el.style.transition=anim?"transform .22s cubic-bezier(.2,.7,.3,1)":"none";el.style.transform=`translateX(${v}px)`;};
  const down=e=>{st.current={down:true,sx:e.clientX,sy:e.clientY,base:x,axis:null};};
  const moveH=e=>{
    const s=st.current;if(!s.down)return;
    const dx=e.clientX-s.sx,dy=e.clientY-s.sy;
    if(s.axis==null){ if(Math.abs(dx)<6&&Math.abs(dy)<6)return; s.axis=Math.abs(dx)>Math.abs(dy)?"x":"y"; if(s.axis==="x"){try{e.currentTarget.setPointerCapture(e.pointerId);}catch{}} }
    if(s.axis!=="x")return;
    e.preventDefault();
    let v=s.base+dx; v=Math.max(-W,Math.min(0,v)); setX(v); set(v,false);
  };
  const up=()=>{
    const s=st.current;if(!s.down)return;s.down=false;
    const open=x<-W/2; const v=open?-W:0; setX(v); set(v,true);
  };
  return(<div className="swipe">
    <div className="swipe-actions">
      {onArchive&&<button className="sw-arch" onClick={()=>{set(0,true);setX(0);onArchive();}}><Archive size={16}/>Архив</button>}
      {onDelete&&<button className="sw-del" onClick={()=>{
        // UI-5: Подтверждение перед удалением — свайп может быть случайным
        if(!window.confirm('Удалить задачу? Это действие нельзя отменить.'))return;
        set(0,true);setX(0);onDelete();
      }}><Trash2 size={16}/>Удалить</button>}
    </div>
    <div className="swipe-fg" ref={fg} onPointerDown={down} onPointerMove={moveH} onPointerUp={up} onPointerCancel={up}>
      {children}
    </div>
  </div>);
}
