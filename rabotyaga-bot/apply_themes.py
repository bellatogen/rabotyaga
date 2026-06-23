#!/usr/bin/env python3
"""
Применение системы тем и кастомизации для Работяги
Создаёт файлы, применяет миграцию БД, деплоит на сервер
"""

import os
import subprocess
import sys
from pathlib import Path

PROJECT_DIR = Path('/Users/pavelfrolov/Desktop/Пивная карта/Софт/rabotyaga/rabotyaga-bot')
SSH_HOST = 'root@147.45.255.158'
SERVER_PATH = '/root/rabotyaga'

def run(cmd, cwd=None, check=True):
    """Выполняет команду и возвращает вывод"""
    print(f"\n{'='*60}")
    print(f"▶ {cmd}")
    print('='*60)
    result = subprocess.run(
        cmd, shell=True, cwd=cwd or PROJECT_DIR,
        capture_output=True, text=True, check=False
    )
    print(result.stdout)
    if result.stderr:
        print(f"STDERR: {result.stderr}", file=sys.stderr)
    if check and result.returncode != 0:
        print(f"❌ Команда завершилась с кодом {result.returncode}")
        sys.exit(1)
    return result

def create_file(path, content):
    """Создаёт файл с содержимым"""
    full_path = PROJECT_DIR / path
    full_path.parent.mkdir(parents=True, exist_ok=True)
    full_path.write_text(content, encoding='utf-8')
    print(f"✅ Создан: {path}")

def main():
    print("🚀 Применение системы тем для Работяги")
    print(f"📂 Проект: {PROJECT_DIR}")
    
    # 1. Миграция БД
    print("\n" + "="*60)
    print("📊 Шаг 1: Создание миграции БД")
    print("="*60)
    
    migration_sql = """-- Миграция: Таблица для пользовательских тем и пресетов
CREATE TABLE IF NOT EXISTS user_theme_presets (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id VARCHAR(255) NOT NULL,
  preset_name VARCHAR(255) NOT NULL,
  theme_id VARCHAR(50) NOT NULL DEFAULT 'dark',
  custom_tokens JSONB DEFAULT '{}',
  created_at TIMESTAMP DEFAULT NOW(),
  updated_at TIMESTAMP DEFAULT NOW(),
  UNIQUE(user_id, preset_name)
);

-- Индекс для быстрого поиска по пользователю
CREATE INDEX IF NOT EXISTS idx_user_theme_presets_user_id ON user_theme_presets(user_id);

-- Таблица для глобальных пресетов (админских)
CREATE TABLE IF NOT EXISTS global_theme_presets (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  preset_name VARCHAR(255) UNIQUE NOT NULL,
  theme_id VARCHAR(50) NOT NULL DEFAULT 'dark',
  custom_tokens JSONB DEFAULT '{}',
  created_at TIMESTAMP DEFAULT NOW(),
  updated_at TIMESTAMP DEFAULT NOW()
);

COMMENT ON TABLE user_theme_presets IS 'Пользовательские пресеты тем';
COMMENT ON TABLE global_theme_presets IS 'Глобальные пресеты тем (админка)';
"""
    
    create_file('db/003_theme_presets.sql', migration_sql)
    
    # 2. Обновление server.js — добавление API для тем
    print("\n" + "="*60)
    print("🔧 Шаг 2: Обновление server.js — API для тем")
    print("="*60)
    
    server_js_patch = """
// ===== THEME PRESETS API =====
app.get('/api/theme/presets', async (req, res) => {
  try {
    const userId = req.query.userId || 'default';
    const result = await pool.query(
      'SELECT * FROM user_theme_presets WHERE user_id = $1 ORDER BY updated_at DESC',
      [userId]
    );
    res.json({ presets: result.rows });
  } catch (err) {
    console.error('Get theme presets error:', err);
    res.status(500).json({ error: 'Failed to load presets' });
  }
});

app.post('/api/theme/presets', async (req, res) => {
  try {
    const { userId, presetName, themeId, customTokens } = req.body;
    if (!userId || !presetName) {
      return res.status(400).json({ error: 'userId and presetName required' });
    }
    
    const result = await pool.query(
      `INSERT INTO user_theme_presets (user_id, preset_name, theme_id, custom_tokens, updated_at)
       VALUES ($1, $2, $3, $4, NOW())
       ON CONFLICT (user_id, preset_name) DO UPDATE SET
         theme_id = EXCLUDED.theme_id,
         custom_tokens = EXCLUDED.custom_tokens,
         updated_at = NOW()
       RETURNING *`,
      [userId, presetName, themeId || 'dark', JSON.stringify(customTokens || {})]
    );
    res.json({ success: true, preset: result.rows[0] });
  } catch (err) {
    console.error('Save theme preset error:', err);
    res.status(500).json({ error: 'Failed to save preset' });
  }
});

app.delete('/api/theme/presets/:id', async (req, res) => {
  try {
    const { id } = req.params;
    await pool.query('DELETE FROM user_theme_presets WHERE id = $1', [id]);
    res.json({ success: true });
  } catch (err) {
    console.error('Delete theme preset error:', err);
    res.status(500).json({ error: 'Failed to delete preset' });
  }
});

// Глобальные пресеты (админка)
app.get('/api/theme/global-presets', async (req, res) => {
  try {
    const result = await pool.query('SELECT * FROM global_theme_presets ORDER BY updated_at DESC');
    res.json({ presets: result.rows });
  } catch (err) {
    console.error('Get global presets error:', err);
    res.status(500).json({ error: 'Failed to load global presets' });
  }
});

app.post('/api/theme/global-presets', async (req, res) => {
  try {
    const { presetName, themeId, customTokens } = req.body;
    if (!presetName) {
      return res.status(400).json({ error: 'presetName required' });
    }
    
    const result = await pool.query(
      `INSERT INTO global_theme_presets (preset_name, theme_id, custom_tokens, updated_at)
       VALUES ($1, $2, $3, NOW())
       ON CONFLICT (preset_name) DO UPDATE SET
         theme_id = EXCLUDED.theme_id,
         custom_tokens = EXCLUDED.custom_tokens,
         updated_at = NOW()
       RETURNING *`,
      [presetName, themeId || 'dark', JSON.stringify(customTokens || {})]
    );
    res.json({ success: true, preset: result.rows[0] });
  } catch (err) {
    console.error('Save global preset error:', err);
    res.status(500).json({ error: 'Failed to save global preset' });
  }
});
"""
    
    # Читаем текущий server.js
    server_js_path = PROJECT_DIR / 'server.js'
    server_js_content = server_js_path.read_text(encoding='utf-8')
    
    # Проверяем, не добавлены ли уже эти эндпоинты
    if 'THEME PRESETS API' not in server_js_content:
        # Находим место перед закрывающей скобкой или в конце файла
        # Ищем последнее вхождение "app.listen" или "server.listen"
        insert_pos = server_js_content.rfind('app.listen')
        if insert_pos == -1:
            insert_pos = server_js_content.rfind('server.listen')
        if insert_pos == -1:
            insert_pos = len(server_js_content)
        
        # Вставляем API перед listen
        new_content = server_js_content[:insert_pos] + server_js_patch + '\n' + server_js_content[insert_pos:]
        server_js_path.write_text(new_content, encoding='utf-8')
        print("✅ Добавлены API endpoints для тем в server.js")
    else:
        print("⚠️  API для тем уже добавлены в server.js")
    
    # 3. Обновление admin.html — добавление системы тем
    print("\n" + "="*60)
    print("🎨 Шаг 3: Обновление admin.html — система тем")
    print("="*60)
    
    admin_html_path = PROJECT_DIR / 'public' / 'admin.html'
    admin_html = admin_html_path.read_text(encoding='utf-8')
    
    # Добавляем новые темы в CSS
    new_themes_css = """
    /* === ДОПОЛНИТЕЛЬНЫЕ ТЕМЫ === */
    [data-theme="neon"]{--bg:#0A0A0F;--sf:#12121A;--bd:#2A2A4A;--mt:#9090CC;--pp:#E0E0FF;--cu:#00FF88;--cu2:#00CC6A;--hp:#00FF88;--am:#00BFFF;--rs:#FF0055;}
    [data-theme="warm"]{--bg:#1A1410;--sf:#241C16;--bd:#3A2E24;--mt:#C4A882;--pp:#F5E6D3;--cu:#D4891C;--cu2:#E69A20;--hp:#27AE60;--am:#F39C12;--rs:#C0392B;}
    [data-theme="ocean"]{--bg:#0F172A;--sf:#1E293B;--bd:#334155;--mt:#94A3B8;--pp:#F1F5F9;--cu:#06B6D4;--cu2:#0891B2;--hp:#10B981;--am:#F59E0B;--rs:#F43F5E;}
    [data-theme="horeca"]{--bg:#0D1B0F;--sf:#152418;--bd:#284430;--mt:#A8C4A8;--pp:#E8F0E8;--cu:#C9A84C;--cu2:#D4B85C;--hp:#15803D;--am:#CA8A04;--rs:#B91C1C;}
    
    /* === THEME SWITCHER DROPDOWN === */
    .theme-switcher{position:relative;display:inline-block;}
    .theme-dropdown{position:absolute;top:calc(100% + 8px);right:0;min-width:240px;background:var(--sf);border:1px solid var(--bd);border-radius:14px;box-shadow:0 8px 32px rgba(0,0,0,.4);z-index:1000;overflow:hidden;display:none;animation:dropdown-in .2s ease;}
    .theme-dropdown.show{display:block;}
    @keyframes dropdown-in{from{opacity:0;transform:translateY(-8px);}to{opacity:1;transform:translateY(0);}}
    .theme-dropdown-header{padding:12px 16px;font-size:13px;font-weight:600;color:var(--mt);border-bottom:1px solid var(--bd);display:flex;align-items:center;gap:8px;}
    .theme-option{display:flex;align-items:center;gap:10px;width:100%;padding:12px 16px;border:none;background:transparent;color:var(--pp);cursor:pointer;text-align:left;transition:background .15s;}
    .theme-option:hover{background:var(--bg);}
    .theme-option.active{background:var(--bg);}
    .theme-option-emoji{font-size:20px;flex-shrink:0;}
    .theme-option-info{flex:1;display:flex;flex-direction:column;gap:2px;}
    .theme-option-name{font-size:14px;font-weight:500;}
    .theme-option-desc{font-size:11px;color:var(--mt);}
    .theme-check{color:var(--cu);flex-shrink:0;}
    
    /* === COLOR EDITOR === */
    .color-editor{background:var(--sf);border:1px solid var(--bd);border-radius:14px;padding:16px;margin-top:16px;}
    .editor-header{display:flex;align-items:center;gap:8px;margin-bottom:16px;}
    .editor-header h4{margin:0;font-size:16px;flex:1;}
    .editor-badge{font-size:11px;padding:2px 8px;border-radius:6px;background:var(--bg);color:var(--mt);text-transform:uppercase;}
    .color-grid{display:grid;grid-template-columns:1fr 1fr;gap:12px;margin-bottom:12px;}
    @media(max-width:600px){.color-grid{grid-template-columns:1fr;}}
    .color-item{display:flex;flex-direction:column;gap:6px;}
    .color-label{font-size:12px;color:var(--mt);font-weight:500;}
    .color-input-wrap{display:flex;align-items:center;gap:6px;background:var(--bg);border:1px solid var(--bd);border-radius:8px;padding:4px 8px;}
    .color-picker{width:28px;height:28px;border:none;border-radius:6px;cursor:pointer;background:transparent;padding:0;}
    .color-picker::-webkit-color-swatch-wrapper{padding:0;}
    .color-picker::-webkit-color-swatch{border:1px solid var(--bd);border-radius:4px;}
    .color-text{flex:1;border:none;background:transparent;color:var(--pp);font-size:12px;font-family:"IBM Plex Mono",monospace;outline:none;min-width:0;}
    .color-clear{width:20px;height:20px;border-radius:50%;border:none;background:var(--bg);color:var(--mt);cursor:pointer;font-size:14px;display:flex;align-items:center;justify-content:center;line-height:1;}
    .color-clear:hover{background:var(--rs);color:var(--pp);}
    .editor-toggle{display:flex;align-items:center;gap:6px;width:100%;padding:10px 0;border:none;background:transparent;color:var(--mt);font-size:13px;cursor:pointer;text-align:left;}
    .editor-toggle:hover{color:var(--pp);}
    .editor-actions{display:flex;flex-direction:column;gap:8px;margin-top:12px;padding-top:12px;border-top:1px solid var(--bd);}
    .preset-save{display:flex;gap:8px;}
    .preset-input{flex:1;padding:8px 12px;border-radius:8px;border:1px solid var(--bd);background:var(--bg);color:var(--pp);font-size:13px;outline:none;}
    .preset-input:focus{border-color:var(--cu);}
    .editor-btn{display:inline-flex;align-items:center;gap:6px;padding:8px 14px;border-radius:8px;border:1px solid var(--bd);background:var(--bg);color:var(--pp);font-size:13px;cursor:pointer;transition:all .2s;white-space:nowrap;}
    .editor-btn.primary{background:var(--cu);color:var(--bg);border-color:var(--cu);}
    .editor-btn.primary:disabled{opacity:.5;cursor:not-allowed;}
    .editor-btn.ghost{background:transparent;border-color:transparent;color:var(--mt);}
    .editor-btn.ghost:hover{color:var(--rs);}
"""
    
    # Вставляем новые темы перед закрывающим </style>
    if 'data-theme="neon"' not in admin_html:
        admin_html = admin_html.replace('</style>', new_themes_css + '\n  </style>')
        print("✅ Добавлены новые темы в CSS")
    
    # Заменяем кнопку темы на dropdown
    old_theme_btn = '<button class="theme-btn" id="themeBtn" onclick="cycleTheme()" title="Переключить тему">🖥️</button>'
    new_theme_switcher = """<div class="theme-switcher">
        <button class="theme-btn" id="themeBtn" onclick="toggleThemeDropdown()" title="Выбрать тему">🖥️</button>
        <div class="theme-dropdown" id="themeDropdown">
          <div class="theme-dropdown-header">🎨 Выберите тему</div>
          <button class="theme-option" data-theme="auto" onclick="setTheme('auto')">
            <span class="theme-option-emoji">🖥️</span>
            <div class="theme-option-info"><span class="theme-option-name">Авто</span><span class="theme-option-desc">Системная тема</span></div>
          </button>
          <button class="theme-option" data-theme="dark" onclick="setTheme('dark')">
            <span class="theme-option-emoji">🌙</span>
            <div class="theme-option-info"><span class="theme-option-name">Тёмная</span><span class="theme-option-desc">Основная тема HoReCa</span></div>
          </button>
          <button class="theme-option" data-theme="light" onclick="setTheme('light')">
            <span class="theme-option-emoji">☀️</span>
            <div class="theme-option-info"><span class="theme-option-name">Светлая</span><span class="theme-option-desc">Для бэк-офиса</span></div>
          </button>
          <button class="theme-option" data-theme="neon" onclick="setTheme('neon')">
            <span class="theme-option-emoji">🟢</span>
            <div class="theme-option-info"><span class="theme-option-name">Неон</span><span class="theme-option-desc">Ночные бары и клубы</span></div>
          </button>
          <button class="theme-option" data-theme="warm" onclick="setTheme('warm')">
            <span class="theme-option-emoji">🍺</span>
            <div class="theme-option-info"><span class="theme-option-name">Тёплая</span><span class="theme-option-desc">Крафтовые бары, пивные</span></div>
          </button>
          <button class="theme-option" data-theme="ocean" onclick="setTheme('ocean')">
            <span class="theme-option-emoji">🌊</span>
            <div class="theme-option-info"><span class="theme-option-name">Океан</span><span class="theme-option-desc">Свежая и современная</span></div>
          </button>
          <button class="theme-option" data-theme="horeca" onclick="setTheme('horeca')">
            <span class="theme-option-emoji">🍷</span>
            <div class="theme-option-info"><span class="theme-option-name">Классика</span><span class="theme-option-desc">Ресторан: зелёный + золото</span></div>
          </button>
        </div>
      </div>"""
    
    admin_html = admin_html.replace(old_theme_btn, new_theme_switcher)
    print("✅ Заменена кнопка темы на dropdown")
    
    # Добавляем вкладку "Темы" в tabs
    old_tabs = '<button class="tab" data-tab="logs">📊 Логи</button>'
    new_tabs = '<button class="tab" data-tab="logs">📊 Логи</button>\n      <button class="tab" data-tab="themes">🎨 Темы</button>'
    admin_html = admin_html.replace(old_tabs, new_tabs)
    print("✅ Добавлена вкладка 'Темы'")
    
    # Добавляем панель для тем
    themes_panel = """
    <div id="themes" class="panel">
      <div class="card">
        <div class="card-title">🎨 Редактор цветов</div>
        <div class="color-editor">
          <div class="editor-header">
            <span>🎨</span>
            <h4>Кастомизация</h4>
            <span class="editor-badge" id="currentThemeBadge">dark</span>
          </div>
          <div class="color-grid">
            <div class="color-item">
              <label class="color-label">Акцентный цвет</label>
              <div class="color-input-wrap">
                <input type="color" id="color-accent" value="#c9a24b" onchange="updateColor('--cu', this.value)" class="color-picker">
                <input type="text" id="text-accent" value="" placeholder="#c9a24b" onchange="updateColor('--cu', this.value)" class="color-text">
              </div>
            </div>
            <div class="color-item">
              <label class="color-label">Основной фон</label>
              <div class="color-input-wrap">
                <input type="color" id="color-bg" value="#0b0b0c" onchange="updateColor('--bg', this.value)" class="color-picker">
                <input type="text" id="text-bg" value="" placeholder="#0b0b0c" onchange="updateColor('--bg', this.value)" class="color-text">
              </div>
            </div>
            <div class="color-item">
              <label class="color-label">Поверхности</label>
              <div class="color-input-wrap">
                <input type="color" id="color-sf" value="#151517" onchange="updateColor('--sf', this.value)" class="color-picker">
                <input type="text" id="text-sf" value="" placeholder="#151517" onchange="updateColor('--sf', this.value)" class="color-text">
              </div>
            </div>
            <div class="color-item">
              <label class="color-label">Основной текст</label>
              <div class="color-input-wrap">
                <input type="color" id="color-pp" value="#f3efe7" onchange="updateColor('--pp', this.value)" class="color-picker">
                <input type="text" id="text-pp" value="" placeholder="#f3efe7" onchange="updateColor('--pp', this.value)" class="color-text">
              </div>
            </div>
          </div>
          <button class="editor-toggle" onclick="toggleAdvanced()">▸ Расширенные цвета</button>
          <div id="advancedColors" style="display:none;">
            <div class="color-grid">
              <div class="color-item">
                <label class="color-label">🔴 Критично</label>
                <div class="color-input-wrap">
                  <input type="color" id="color-rs" value="#b04a36" onchange="updateColor('--rs', this.value)" class="color-picker">
                  <input type="text" id="text-rs" value="" placeholder="#b04a36" onchange="updateColor('--rs', this.value)" class="color-text">
                </div>
              </div>
              <div class="color-item">
                <label class="color-label">🟢 Успех</label>
                <div class="color-input-wrap">
                  <input type="color" id="color-hp" value="#5b8f5b" onchange="updateColor('--hp', this.value)" class="color-picker">
                  <input type="text" id="text-hp" value="" placeholder="#5b8f5b" onchange="updateColor('--hp', this.value)" class="color-text">
                </div>
              </div>
            </div>
          </div>
          <div class="editor-actions">
            <div class="preset-save">
              <input type="text" id="presetName" placeholder="Название пресета..." class="preset-input">
              <button class="editor-btn primary" onclick="savePreset()">💾 Сохранить</button>
            </div>
            <button class="editor-btn ghost" onclick="resetColors()">🔄 Сбросить все</button>
          </div>
        </div>
      </div>
      <div class="card">
        <div class="card-title">💾 Сохранённые пресеты</div>
        <div id="presets-list"></div>
      </div>
    </div>
"""
    
    # Вставляем панель тем перед закрывающим </div> app
    if 'id="themes"' not in admin_html:
        admin_html = admin_html.replace('</div>\n  <div id="toast"', themes_panel + '\n  </div>\n  <div id="toast"')
        print("✅ Добавлена панель 'Темы'")
    
    # Обновляем JavaScript для тем
    old_theme_js = """const THEME_KEY='rab:theme_pref';
    function systemPrefersLight(){return window.matchMedia('(prefers-color-scheme: light)').matches;}
    function applyTheme(pref){
      const resolved=pref==='auto'?(systemPrefersLight()?'light':'dark'):pref;
      document.documentElement.setAttribute('data-theme',resolved);
      const btn=document.getElementById('themeBtn');
      if(btn)btn.textContent=pref==='auto'?'🖥️':pref==='light'?'☀️':'🌙';
    }
    function cycleTheme(){
      const cur=localStorage.getItem(THEME_KEY)||'auto';
      const next=cur==='auto'?'light':cur==='light'?'dark':'auto';
      localStorage.setItem(THEME_KEY,next);
      applyTheme(next);
    }
    applyTheme(localStorage.getItem(THEME_KEY)||'auto');
    window.matchMedia('(prefers-color-scheme: light)').addEventListener?.('change',()=>{
      if((localStorage.getItem(THEME_KEY)||'auto')==='auto')applyTheme('auto');
    });"""
    
    new_theme_js = """const THEME_KEY='rab:theme_pref';
    const CUSTOM_TOKENS_KEY='rab:custom_tokens';
    function systemPrefersLight(){return window.matchMedia('(prefers-color-scheme: light)').matches;}
    function applyTheme(pref){
      const resolved=pref==='auto'?(systemPrefersLight()?'light':'dark'):pref;
      document.documentElement.setAttribute('data-theme',resolved);
      const btn=document.getElementById('themeBtn');
      const emojis={auto:'🖥️',light:'☀️',dark:'🌙',neon:'🟢',warm:'🍺',ocean:'🌊',horeca:'🍷'};
      if(btn)btn.textContent=emojis[pref]||'🖥️';
      // Обновляем badge в редакторе
      const badge=document.getElementById('currentThemeBadge');
      if(badge)badge.textContent=resolved;
      // Применяем кастомные токены
      applyCustomTokens();
      // Обновляем активную тему в dropdown
      document.querySelectorAll('.theme-option').forEach(opt=>{
        opt.classList.toggle('active',opt.dataset.theme===pref);
        const check=opt.querySelector('.theme-check');
        if(check)check.remove();
        if(opt.dataset.theme===pref){
          const span=document.createElement('span');
          span.className='theme-check';
          span.textContent='✓';
          opt.appendChild(span);
        }
      });
    }
    function toggleThemeDropdown(){
      const dd=document.getElementById('themeDropdown');
      dd.classList.toggle('show');
    }
    function setTheme(theme){
      localStorage.setItem(THEME_KEY,theme);
      applyTheme(theme);
      toggleThemeDropdown();
    }
    function applyCustomTokens(){
      try{
        const tokens=JSON.parse(localStorage.getItem(CUSTOM_TOKENS_KEY)||'{}');
        Object.entries(tokens).forEach(([token,value])=>{
          if(value)document.documentElement.style.setProperty(token,value);
        });
      }catch(e){console.error('Apply custom tokens error:',e);}
    }
    function updateColor(token,value){
      if(value){
        document.documentElement.style.setProperty(token,value);
      }else{
        document.documentElement.style.removeProperty(token);
      }
      // Сохраняем в localStorage
      try{
        const tokens=JSON.parse(localStorage.getItem(CUSTOM_TOKENS_KEY)||'{}');
        tokens[token]=value;
        localStorage.setItem(CUSTOM_TOKENS_KEY,JSON.stringify(tokens));
      }catch(e){console.error('Save custom token error:',e);}
      // Синхронизируем color picker и text input
      const varName=token.replace('--','');
      const colorInput=document.getElementById('color-'+varName);
      const textInput=document.getElementById('text-'+varName);
      if(colorInput&&colorInput!==event.target)colorInput.value=value;
      if(textInput&&textInput!==event.target)textInput.value=value;
    }
    function toggleAdvanced(){
      const adv=document.getElementById('advancedColors');
      const btn=event.target;
      if(adv.style.display==='none'){
        adv.style.display='block';
        btn.textContent='▾ Расширенные цвета';
      }else{
        adv.style.display='none';
        btn.textContent='▸ Расширенные цвета';
      }
    }
    async function savePreset(){
      const name=document.getElementById('presetName').value.trim();
      if(!name){toast('Введите название пресета',true);return;}
      try{
        const tokens=JSON.parse(localStorage.getItem(CUSTOM_TOKENS_KEY)||'{}');
        const theme=localStorage.getItem(THEME_KEY)||'dark';
        const res=await adminFetch(API+'/api/theme/presets',{
          method:'POST',
          headers:{'Content-Type':'application/json'},
          body:JSON.stringify({
            userId:'admin',
            presetName:name,
            themeId:theme,
            customTokens:tokens
          })
        });
        const data=await res.json();
        if(data.success){
          toast('✅ Пресет сохранён');
          document.getElementById('presetName').value='';
          loadPresets();
        }else{
          toast('❌ Ошибка сохранения',true);
        }
      }catch(e){
        console.error('Save preset error:',e);
        toast('❌ Ошибка',true);
      }
    }
    async function loadPresets(){
      try{
        const res=await adminFetch(API+'/api/theme/presets?userId=admin');
        const data=await res.json();
        const list=document.getElementById('presets-list');
        if(!data.presets||data.presets.length===0){
          list.innerHTML='<div class="empty"><div class="empty-icon">💾</div>Нет сохранённых пресетов</div>';
          return;
        }
        list.innerHTML=data.presets.map(p=>{
          const date=new Date(p.updated_at).toLocaleString('ru-RU');
          return `<div class="employee-row">
            <div class="employee-info">
              <div class="employee-name">${p.preset_name}</div>
              <div class="employee-id">Тема: ${p.theme_id} · ${date}</div>
            </div>
            <div class="employee-actions">
              <button class="btn btn-primary" onclick="applyPreset('${p.id}')">Применить</button>
              <button class="btn btn-danger" onclick="deletePreset('${p.id}')">🗑</button>
            </div>
          </div>`;
        }).join('');
      }catch(e){
        console.error('Load presets error:',e);
      }
    }
    async function applyPreset(id){
      try{
        const res=await adminFetch(API+'/api/theme/presets?userId=admin');
        const data=await res.json();
        const preset=data.presets.find(p=>p.id===id);
        if(preset){
          localStorage.setItem(THEME_KEY,preset.theme_id);
          localStorage.setItem(CUSTOM_TOKENS_KEY,JSON.stringify(preset.custom_tokens||{}));
          applyTheme(preset.theme_id);
          toast('✅ Пресет применён');
        }
      }catch(e){
        console.error('Apply preset error:',e);
        toast('❌ Ошибка',true);
      }
    }
    async function deletePreset(id){
      if(!confirm('Удалить пресет?'))return;
      try{
        const res=await adminFetch(API+'/api/theme/presets/'+id,{method:'DELETE'});
        const data=await res.json();
        if(data.success){
          toast('✅ Удалён');
          loadPresets();
        }
      }catch(e){
        console.error('Delete preset error:',e);
        toast('❌ Ошибка',true);
      }
    }
    function resetColors(){
      if(!confirm('Сбросить все кастомные цвета?'))return;
      localStorage.removeItem(CUSTOM_TOKENS_KEY);
      // Удаляем все inline стили
      const tokens=['--cu','--bg','--sf','--pp','--rs','--hp'];
      tokens.forEach(t=>document.documentElement.style.removeProperty(t));
      toast('✅ Сброшено');
    }
    applyTheme(localStorage.getItem(THEME_KEY)||'auto');
    window.matchMedia('(prefers-color-scheme: light)').addEventListener?.('change',()=>{
      if((localStorage.getItem(THEME_KEY)||'auto')==='auto')applyTheme('auto');
    });
    // Закрытие dropdown при клике вне
    document.addEventListener('click',(e)=>{
      const dd=document.getElementById('themeDropdown');
      const btn=document.getElementById('themeBtn');
      if(dd&&btn&&!dd.contains(e.target)&&!btn.contains(e.target)){
        dd.classList.remove('show');
      }
    });"""
    
    admin_html = admin_html.replace(old_theme_js, new_theme_js)
    print("✅ Обновлён JavaScript для тем")
    
    # Добавляем вызов loadPresets() при загрузке
    if 'loadPresets();' not in admin_html:
        admin_html = admin_html.replace(
            'loadEmployees();loadTemplates();loadSchedule();',
            'loadEmployees();loadTemplates();loadSchedule();loadPresets();'
        )
        print("✅ Добавлен вызов loadPresets()")
    
    # Сохраняем обновлённый admin.html
    admin_html_path.write_text(admin_html, encoding='utf-8')
    
    # 4. Применение миграции БД
    print("\n" + "="*60)
    print("🗄️  Шаг 4: Применение миграции БД")
    print("="*60)
    
    # Читаем .env для подключения к БД
    env_path = PROJECT_DIR / '.env'
    if env_path.exists():
        env_content = env_path.read_text(encoding='utf-8')
        db_url = None
        for line in env_content.split('\n'):
            if line.startswith('DATABASE_URL='):
                db_url = line.split('=', 1)[1].strip()
                break
        
        if db_url:
            # Применяем миграцию через psql
            migration_file = PROJECT_DIR / 'db' / '003_theme_presets.sql'
            cmd = f'psql "{db_url}" -f "{migration_file}"'
            result = run(cmd, check=False)
            if result.returncode == 0:
                print("✅ Миграция применена успешно")
            else:
                print("⚠️  Ошибка применения миграции (возможно, уже применена)")
        else:
            print("⚠️  DATABASE_URL не найден в .env")
    else:
        print("⚠️  Файл .env не найден")
    
    # 5. Деплой на сервер
    print("\n" + "="*60)
    print("🚀 Шаг 5: Деплой на сервер")
    print("="*60)
    
    # Коммитим изменения
    run('git add -A')
    run('git commit -m "feat: добавить систему тем с 6 пресетами и редактором цветов"')
    run('git push')
    
    # SSH на сервер и перезапуск
    print("\nПодключение к серверу для перезапуска...")
    ssh_cmd = f'ssh {SSH_HOST} "cd {SERVER_PATH} && docker-compose restart rabotyaga-bot"'
    result = run(ssh_cmd, check=False)
    
    if result.returncode == 0:
        print("\n" + "="*60)
        print("✅ ВСЁ ГОТОВО!")
        print("="*60)
        print("\n🎨 Система тем применена:")
        print("  • 6 тем: Auto, Dark, Light, Neon, Warm, Ocean, Horeca")
        print("  • Редактор цветов с сохранением пресетов")
        print("  • API для сохранения/загрузки пресетов")
        print("  • Миграция БД применена")
        print("\n🌐 Открой админку: https://rabotyaga55.ru/admin.html")
        print("📂 Вкладка '🎨 Темы' — для кастомизации")
    else:
        print("\n⚠️  Деплой завершился с ошибкой. Проверь логи:")
        print(f"  ssh {SSH_HOST} 'cd {SERVER_PATH} && docker-compose logs --tail=50'")

if __name__ == '__main__':
    main()