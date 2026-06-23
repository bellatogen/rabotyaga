-- Миграция: Таблица для пользовательских тем и пресетов
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
