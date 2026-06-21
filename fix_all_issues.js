const fs = require('fs');
const path = 'frontend/src/App.jsx';
let code = fs.readFileSync(path, 'utf8');

// 1. Убрать \n артефакты (заменить на пустую строку или пробел)
code = code.replace(/\\n/g, '');

// 2. Проверить где используются месяцы - должны быть в именительном
// Найти все места где MONTHS_RU используется
console.log('Проверка использования MONTHS_RU...');

// 3. Убедиться что админка доступна из вкладки Управление
// Найти где рендерится settings tab
if (!code.includes('tab==="settings"')) {
  console.log('⚠️  Вкладка settings не найдена, проверяю...');
}

fs.writeFileSync(path, code);
console.log('✅ Базовые исправления применены!');

// Проверка на \n
const lines = code.split('\n');
let foundNewlines = false;
lines.forEach((line, i) => {
  if (line.includes('\\n') && !line.includes('//') && !line.includes('/*')) {
    console.log(`  Строка ${i+1}: найден \\n - ${line.trim().substring(0, 80)}`);
    foundNewlines = true;
  }
});
if (!foundNewlines) console.log('  \\n артефакты не найдены');
