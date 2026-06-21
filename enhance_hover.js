const fs = require('fs');
const path = 'frontend/src/styles/app.css';
let code = fs.readFileSync(path, 'utf8');

// Усилю hover для .tab
code = code.replace(
  /\.tab:hover\{border-color:var\(--cu\);color:var\(--pp\);\}/,
  '.tab:hover{border-color:var(--cu);color:var(--pp);background:rgba(91,139,155,.08);transform:translateY(-1px);}'
);

// Усилю hover для .tab.on (активная вкладка)
code = code.replace(
  /\.tab\.on:hover\{filter:brightness\(1\.08\);\}/,
  '.tab.on:hover{filter:brightness(1.12);transform:translateY(-1px);box-shadow:0 4px 12px rgba(91,139,155,.25);}'
);

fs.writeFileSync(path, code);
console.log('✅ Hover эффекты усилены!');
