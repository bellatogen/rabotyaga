const fs = require('fs');
const path = 'frontend/src/styles/app.css';
let code = fs.readFileSync(path, 'utf8');

// 1. Увеличить шрифты навигации
code = code.replace(/font-size:12px;font-weight:500/, 'font-size:14px;font-weight:600');

// 2. Убрать border с неактивных вкладок, добавить padding
code = code.replace(
  '.tab{flex-shrink:0;padding:6px 11px;font-size:14px;font-weight:600;color:var(--mt);background:transparent;border:1px solid var(--bd);border-radius:7px;cursor:pointer;white-space:nowrap;}',
  '.tab{flex-shrink:0;padding:8px 14px;font-size:14px;font-weight:600;color:var(--mt);background:transparent;border:none;border-radius:8px;cursor:pointer;white-space:nowrap;transition:all .2s ease;}'
);

// 3. Улучшить активную вкладку
code = code.replace(
  '.tab.on{background:var(--cu);color:var(--bg);border-color:var(--cu);font-weight:600;}',
  '.tab.on{background:var(--cu);color:var(--bg);font-weight:600;box-shadow:0 2px 8px rgba(91,139,155,.25);}'
);

// 4. Улучшить hover
code = code.replace(
  '.tab:hover{border-color:var(--cu);color:var(--pp);background:rgba(91,139,155,.08);transform:translateY(-1px);}',
  '.tab:hover{background:rgba(91,139,155,.12);color:var(--pp);transform:translateY(-2px);}'
);

// 5. Улучшить hover активной
code = code.replace(
  '.tab.on:hover{filter:brightness(1.12);transform:translateY(-1px);box-shadow:0 4px 12px rgba(91,139,155,.25);}',
  '.tab.on:hover{filter:brightness(1.15);transform:translateY(-2px);box-shadow:0 6px 16px rgba(91,139,155,.35);}'
);

fs.writeFileSync(path, code);
console.log('✅ UX/UI улучшения применены!');
console.log('  - Шрифты увеличены (12px → 14px)');
console.log('  - Border убраны (визуальный шум ↓)');
console.log('  - Padding увеличен (воздух ↑)');
console.log('  - Hover усилены (фидбек ↑)');
