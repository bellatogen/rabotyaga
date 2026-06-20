const fs = require('fs');
const path = 'frontend/src/App.jsx';
let code = fs.readFileSync(path, 'utf8');

// Заменить все месяцы на с заглавной буквы
code = code.replace(
  /const MONTHS_RU=\["января","февраля","марта","апреля","мая","июня","июля","августа","сентября","октября","ноября","декабря"\];/,
  'const MONTHS_RU=["Января","Февраля","Марта","Апреля","Мая","Июня","Июля","Августа","Сентября","Октября","Ноября","Декабря"];'
);

fs.writeFileSync(path, code);
console.log('✅ Месяцы исправлены!');
