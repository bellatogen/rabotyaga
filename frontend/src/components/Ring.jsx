// SVG-кольцо (donut) для дашборда — показывает процент выполнения
// UI-4: role="img" + aria-label для доступности (скринридеры, Telegram accessibility)
export function Ring({pct,color,top,bottom,label}){
  const r=26,c=2*Math.PI*r,off=c*(1-Math.min(Math.max(pct,0),1));
  const ariaLabel=label||`${top}${bottom?` из ${bottom}`:''}`;
  return(<svg viewBox="0 0 64 64" width="74" height="74" role="img" aria-label={ariaLabel}>
    <circle cx="32" cy="32" r={r} fill="none" stroke="var(--bd)" strokeWidth="6"/>
    <circle cx="32" cy="32" r={r} fill="none" stroke={color} strokeWidth="6" strokeLinecap="round"
      strokeDasharray={c} strokeDashoffset={off} transform="rotate(-90 32 32)" style={{transition:"stroke-dashoffset .5s ease"}}/>
    <text x="32" y="30" textAnchor="middle" fontSize="15" fontWeight="700" fill="var(--pp)" fontFamily="'IBM Plex Mono',monospace">{top}</text>
    <text x="32" y="42" textAnchor="middle" fontSize="8" fill="var(--mt)">{bottom}</text>
  </svg>);
}
