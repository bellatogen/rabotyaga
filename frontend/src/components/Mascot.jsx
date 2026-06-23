// Маскот «Работяга» — кружка пива
export function Mascot({size=24,color="var(--cu)"}){
  return(
    <svg width={size} height={size} viewBox="0 0 64 64" fill="none" stroke={color} strokeWidth="2.5" strokeLinecap="round" strokeLinejoin="round">
      {/* Корпус кружки */}
      <path d="M16 23 L20 57 Q20 59 22 59 L42 59 Q44 59 44 57 L48 23 Z"/>
      {/* Ручка */}
      <path d="M48 31 C57 31 61 36 61 41 C61 46 57 51 48 51"/>
      {/* Пена сверху */}
      <path d="M16 23 C19 16 23 19 27 15 C30 19 34 15 37 18 C40 14 44 18 48 23"/>
    </svg>
  );
}
