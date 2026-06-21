// Маскот «Работяга» — упрощённый контур (пучок-хвостик + точки-глаза + улыбка)
export function Mascot({size=24,color="var(--cu)"}){
  return(
    <svg width={size} height={size} viewBox="0 0 64 64" fill="none" stroke={color} strokeWidth="2.4" strokeLinecap="round" strokeLinejoin="round">
      <circle cx="32" cy="7" r="3.4"/>
      <path d="M18 28 C18 15 24 9 32 9 C40 9 46 15 46 28"/>
      <path d="M18 27 C16 38 20 47 32 49 C44 47 48 38 46 27"/>
      <path d="M28 35 Q32 38 36 35"/>
      <circle cx="27" cy="32" r="1.5"/>
      <circle cx="37" cy="32" r="1.5"/>
    </svg>
  );
}
