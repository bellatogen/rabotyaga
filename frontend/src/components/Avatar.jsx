// Аватар сотрудника — круг с инициалами, цвет детерминирован по имени
const COLORS=['#5b8b9b','#7a9b5b','#c97d3c','#9b5b7a','#5b7a9b','#8b7a5b','#6b9b7a'];

export function Avatar({name,size=36,style={}}){
  const hash=[...(name||"?")].reduce((a,c)=>a+c.charCodeAt(0),0);
  const bg=COLORS[hash%COLORS.length];
  const initials=(name||"?").trim().split(/\s+/).map(w=>w[0]||"").join("").slice(0,2).toUpperCase()||"?";
  return(
    <div style={{width:size,height:size,borderRadius:"50%",background:bg,
      display:"flex",alignItems:"center",justifyContent:"center",
      color:"#fff",fontWeight:700,fontSize:Math.round(size*.38),
      flexShrink:0,letterSpacing:"-.02em",userSelect:"none",...style}}>
      {initials}
    </div>
  );
}
