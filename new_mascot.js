const fs = require('fs');
const path = 'frontend/src/App.jsx';
let code = fs.readFileSync(path, 'utf8');

// Новый детализированный маскот (смешной бармен)
const newMascot = `function Mascot({size=24,color="var(--cu)"}){
  const skinColor="#F5E6D3";
  const hairColor="#8B6F47";
  const uniformColor="#5B8B9B";
  
  return(
    <svg width={size} height={size} viewBox="0 0 100 100" fill="none" stroke="none">
      {/* Голова */}
      <circle cx="50" cy="40" r="25" fill={skinColor} stroke={hairColor} strokeWidth="2"/>
      
      {/* Волосы */}
      <path d="M25 35 Q30 20 50 18 Q70 20 75 35 Q78 30 75 25 Q70 10 50 12 Q30 10 25 25 Q22 30 25 35" fill={hairColor}/>
      
      {/* Глаза (весёлые) */}
      <circle cx="42" cy="38" r="4" fill="white" stroke="#333" strokeWidth="1.5"/>
      <circle cx="43" cy="37" r="2" fill="#333"/>
      <circle cx="44" cy="36" r="1" fill="white"/>
      
      <circle cx="58" cy="38" r="4" fill="white" stroke="#333" strokeWidth="1.5"/>
      <circle cx="59" cy="37" r="2" fill="#333"/>
      <circle cx="60" cy="36" r="1" fill="white"/>
      
      {/* Брови */}
      <path d="M38 32 Q42 30 46 32" fill="none" stroke={hairColor} strokeWidth="2" strokeLinecap="round"/>
      <path d="M54 32 Q58 30 62 32" fill="none" stroke={hairColor} strokeWidth="2" strokeLinecap="round"/>
      
      {/* Нос */}
      <path d="M50 42 Q48 46 50 48 Q52 46 50 42" fill="#E8C4A8" stroke="#C9A88A" strokeWidth="1"/>
      
      {/* Рот (широкая улыбка) */}
      <path d="M40 52 Q50 62 60 52" fill="white" stroke="#333" strokeWidth="1.5" strokeLinecap="round"/>
      <path d="M42 52 L44 56 M46 53 L48 57 M50 53 L52 57 M54 53 L56 57 M58 52 L60 56" stroke="#DDD" strokeWidth="1" strokeLinecap="round"/>
      
      {/* Щёки */}
      <ellipse cx="35" cy="46" rx="4" ry="3" fill="#FFB6C1" opacity="0.6"/>
      <ellipse cx="65" cy="46" rx="4" ry="3" fill="#FFB6C1" opacity="0.6"/>
      
      {/* Тело */}
      <path d="M25 65 Q50 90 75 65 L75 70 Q50 95 25 70 Z" fill={uniformColor}/>
      
      {/* Фартук */}
      <rect x="40" y="65" width="20" height="25" fill={skinColor} stroke={hairColor} strokeWidth="1.5" rx="2"/>
      
      {/* Руки */}
      <path d="M25 68 Q20 60 25 55" fill="none" stroke={skinColor} strokeWidth="6" strokeLinecap="round"/>
      <path d="M75 68 Q80 60 75 55" fill="none" stroke={skinColor} strokeWidth="6" strokeLinecap="round"/>
      
      {/* Кепка */}
      <ellipse cx="50" cy="18" rx="22" ry="6" fill={uniformColor} stroke="#3D5F6F" strokeWidth="1.5"/>
      <rect x="28" y="12" width="44" height="8" fill={uniformColor} stroke="#3D5F6F" strokeWidth="1.5" rx="2"/>
    </svg>
  );
}`;

// Заменить функцию Mascot
const oldMascotMatch = code.match(/function Mascot\(\{size=24,color="var\(--cu\)"\}\)\{[\s\S]*?\n\}/);
if (oldMascotMatch) {
  code = code.replace(oldMascotMatch[0], newMascot);
  console.log('✅ Маскот заменён на детализированного бармена!');
} else {
  console.log('❌ Не нашёл функцию Mascot');
}

fs.writeFileSync(path, code);
