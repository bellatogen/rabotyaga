// Маскот «Работяга» — контурный скетч по фото (пучок-хвостик + широкая улыбка со щербинкой)
export function Mascot({size=24,color="var(--cu)"}){
  return(
    <svg width={size} height={size} viewBox="0 0 64 64" fill="none" stroke={color} strokeWidth="2.4" strokeLinecap="round" strokeLinejoin="round">
      <circle cx="32" cy="7" r="3.4"/>
      <path d="M18 28 C18 15 24 9 32 9 C40 9 46 15 46 28"/>
      <path d="M18 27 C16 38 20 47 32 49 C44 47 48 38 46 27"/>
      <path d="M21 23 C26 19 38 19 43 23"/>
      <path d="M23.5 30 q2.6 -3.2 5.2 0"/>
      <path d="M35.3 30 q2.6 -3.2 5.2 0"/>
      <path d="M23 37 C27 45 37 45 41 37"/>
      <path d="M23.5 37 L40.5 37"/>
      <path d="M28 37 L28 40.6"/>
      <path d="M36 37 L36 40.6"/>
      <path d="M29.5 13 C26 17 25 22 26 26"/>
      <path d="M16 61 C18 53 24 50 32 50 C40 50 46 53 48 61"/>
    </svg>
  );
}
