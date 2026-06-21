const fs = require('fs');
const path = 'frontend/src/constants/locale.js';
let code = fs.readFileSync(path, 'utf8');

// Замени родительный падеж на именительный
code = code.replace(
  /export const MONTHS_RU = \["Января","Февраля","Марта","Апреля","Мая","Июня","Июля","Августа","Сентября","Октября","Ноября","Декабря"\];/,
  'export const MONTHS_RU = ["Январь","Февраль","Март","Апрель","Май","Июнь","Июль","Август","Сентябрь","Октябрь","Ноябрь","Декабрь"];'
);

fs.writeFileSync(path, code);
console.log('✅ Месяцы исправлены на именительный падеж!');

// Проверка
const lines = code.split('\n');
lines.forEach((line, i) => {
  if (line.includes('MONTHS_RU')) {
    console.log(`  Строка ${i+1}: ${line.trim()}`);
  }
});
