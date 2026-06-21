const fs = require('fs');
const path = 'frontend/src/App.jsx';
let code = fs.readFileSync(path, 'utf8');

// 1. Заменить DollarSign в календаре (строка 649)
code = code.replace(
  /\{hasRev&&<DollarSign size=\{9\} color="var\(--am\)"\/>\}/,
  '{hasRev&&<span style={{fontSize:11,color:"var(--am)",fontWeight:700}}>₽</span>}'
);

// 2. Заменить DollarSign в секции "План выручки" (строка 682)
code = code.replace(
  /<DollarSign size=\{12\} style=\{\{display:"inline"\}\}\/>/,
  '<span style={{fontSize:14,fontWeight:700,color:"var(--am)"}}>₽</span>'
);

fs.writeFileSync(path, code);
console.log('✅ DollarSign заменён на ₽!');

// Проверка
const lines = code.split('\n');
lines.forEach((line, i) => {
  if (line.includes('₽') && !line.includes('//')) {
    console.log(`  Строка ${i+1}: ${line.trim().substring(0, 80)}`);
  }
});
