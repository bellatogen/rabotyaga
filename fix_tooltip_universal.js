const fs = require('fs');
const path = require('path');

// Ищем все .jsx файлы, содержащие "cal-cell"
function findFiles(dir, pattern) {
  const files = fs.readdirSync(dir);
  let result = [];
  for (const file of files) {
    const fullPath = path.join(dir, file);
    const stat = fs.statSync(fullPath);
    if (stat.isDirectory()) {
      result = result.concat(findFiles(fullPath, pattern));
    } else if (file.endsWith('.jsx') || file.endsWith('.js')) {
      const content = fs.readFileSync(fullPath, 'utf8');
      if (content.includes(pattern)) {
        result.push(fullPath);
      }
    }
  }
  return result;
}

// Находим файлы с календарём
const calendarFiles = findFiles('frontend/src', 'cal-cell');
console.log('📁 Найдены файлы с календарём:');
calendarFiles.forEach(f => console.log('  -', f));

if (calendarFiles.length === 0) {
  console.log('❌ Календарь не найден. Покажи содержимое pages/');
  process.exit(1);
}

// Берём первый найденный файл
const targetFile = calendarFiles[0];
console.log(`\n🔧 Работаем с файлом: ${targetFile}`);
console.log('📝 Содержимое (первые 50 строк):');
console.log(fs.readFileSync(targetFile, 'utf8').split('\n').slice(0, 50).join('\n'));
