-- 004_multitenancy.sql — Спринт B (SEC-8): shared-DB multi-tenancy.
-- Добавляет tenant_id во все живые таблицы; создаёт tenants + tenant_integrations.
-- Идемпотентна: безопасна для повторного прогона (IF NOT EXISTS / ON CONFLICT).
-- Мёртвые таблицы (tasks/task_completion/revenue_plan/shift_schedule) НЕ трогаем.
--
-- ──────────────────────────────────────────────────────────────────────────────
-- БЛОК ОТКАТА (только после pg_dump — НЕ выполнять без резервной копии):
--
--   ALTER TABLE kv_store DROP CONSTRAINT IF EXISTS kv_store_pkey_v2;
--   ALTER TABLE kv_store ADD CONSTRAINT kv_store_pkey PRIMARY KEY (key);
--   ALTER TABLE kv_store DROP COLUMN IF EXISTS tenant_id;
--
--   ALTER TABLE employee_bindings DROP CONSTRAINT IF EXISTS employee_bindings_tenant_name_key;
--   ALTER TABLE employee_bindings ADD CONSTRAINT employee_bindings_name_key UNIQUE (name);
--   ALTER TABLE employee_bindings DROP COLUMN IF EXISTS tenant_id;
--
--   ALTER TABLE data_sources DROP CONSTRAINT IF EXISTS data_sources_tenant_source_key;
--   ALTER TABLE data_sources ADD CONSTRAINT data_sources_source_type_key UNIQUE (source_type);
--   ALTER TABLE data_sources DROP COLUMN IF EXISTS tenant_id;
--
--   ALTER TABLE push_log DROP COLUMN IF EXISTS tenant_id;
--   ALTER TABLE push_schedule DROP COLUMN IF EXISTS tenant_id;
--
--   DROP TABLE IF EXISTS tenant_integrations;
--   DROP TABLE IF EXISTS tenants;
-- ──────────────────────────────────────────────────────────────────────────────

-- ── 1. Таблица тенантов ──────────────────────────────────────────────────────
CREATE TABLE IF NOT EXISTS tenants (
  tenant_id  VARCHAR(100) PRIMARY KEY CHECK (tenant_id ~ '^[a-z0-9_]+$'),
  name       TEXT         NOT NULL,
  status     VARCHAR(20)  NOT NULL DEFAULT 'active',
  created_at TIMESTAMP    DEFAULT NOW()
);

-- Дефолтный тенант — подчёркивание, не дефис (env-имена должны быть валидны)
INSERT INTO tenants (tenant_id, name, status)
VALUES ('pivnaya_karta', 'Пивная карта', 'active')
ON CONFLICT (tenant_id) DO NOTHING;

-- ── 2. Интеграции тенанта ────────────────────────────────────────────────────
-- config — только несекретное (sheetId, url, login, маппинг).
-- Секреты (пароли, токены) — ТОЛЬКО в env по схеме <TID_UPPER>_<NAME>.
CREATE TABLE IF NOT EXISTS tenant_integrations (
  tenant_id VARCHAR(100)  NOT NULL REFERENCES tenants(tenant_id) ON DELETE CASCADE,
  kind      VARCHAR(50)   NOT NULL,
  enabled   BOOLEAN       NOT NULL DEFAULT false,
  config    JSONB,
  PRIMARY KEY (tenant_id, kind)
);

-- Дефолтные интеграции для pivnaya_karta — включаем все (env уже настроен)
INSERT INTO tenant_integrations (tenant_id, kind, enabled)
VALUES
  ('pivnaya_karta', 'iiko',           true),
  ('pivnaya_karta', 'mozg',           true),
  ('pivnaya_karta', 'sheets',         true),
  ('pivnaya_karta', 'manual_revenue', true)
ON CONFLICT (tenant_id, kind) DO NOTHING;

-- ── 3. kv_store: tenant_id + составной PK ───────────────────────────────────
ALTER TABLE kv_store
  ADD COLUMN IF NOT EXISTS tenant_id VARCHAR(100) NOT NULL DEFAULT 'pivnaya_karta';

UPDATE kv_store SET tenant_id = 'pivnaya_karta' WHERE tenant_id IS NULL OR tenant_id = '';

-- Идемпотентная смена PK: сначала дропаем оба (старый и новый), затем создаём
ALTER TABLE kv_store DROP CONSTRAINT IF EXISTS kv_store_pkey;
ALTER TABLE kv_store DROP CONSTRAINT IF EXISTS kv_store_pkey_v2;
ALTER TABLE kv_store ADD CONSTRAINT kv_store_pkey_v2 PRIMARY KEY (tenant_id, key);

-- ── 4. employee_bindings: tenant_id + составной UNIQUE ──────────────────────
ALTER TABLE employee_bindings
  ADD COLUMN IF NOT EXISTS tenant_id VARCHAR(100) NOT NULL DEFAULT 'pivnaya_karta';

UPDATE employee_bindings SET tenant_id = 'pivnaya_karta' WHERE tenant_id IS NULL OR tenant_id = '';

ALTER TABLE employee_bindings DROP CONSTRAINT IF EXISTS employee_bindings_name_key;
ALTER TABLE employee_bindings DROP CONSTRAINT IF EXISTS employee_bindings_tenant_name_key;
ALTER TABLE employee_bindings ADD CONSTRAINT employee_bindings_tenant_name_key UNIQUE (tenant_id, name);

-- ── 5. data_sources: tenant_id + составной UNIQUE ───────────────────────────
ALTER TABLE data_sources
  ADD COLUMN IF NOT EXISTS tenant_id VARCHAR(100) NOT NULL DEFAULT 'pivnaya_karta';

UPDATE data_sources SET tenant_id = 'pivnaya_karta' WHERE tenant_id IS NULL OR tenant_id = '';

ALTER TABLE data_sources DROP CONSTRAINT IF EXISTS data_sources_source_type_key;
ALTER TABLE data_sources DROP CONSTRAINT IF EXISTS data_sources_tenant_source_key;
ALTER TABLE data_sources ADD CONSTRAINT data_sources_tenant_source_key UNIQUE (tenant_id, source_type);

-- ── 6. push_log: tenant_id + индекс ─────────────────────────────────────────
ALTER TABLE push_log
  ADD COLUMN IF NOT EXISTS tenant_id VARCHAR(100) NOT NULL DEFAULT 'pivnaya_karta';

UPDATE push_log SET tenant_id = 'pivnaya_karta' WHERE tenant_id IS NULL OR tenant_id = '';

CREATE INDEX IF NOT EXISTS idx_push_log_tenant ON push_log(tenant_id);

-- ── 7. push_schedule: tenant_id + индекс ────────────────────────────────────
ALTER TABLE push_schedule
  ADD COLUMN IF NOT EXISTS tenant_id VARCHAR(100) NOT NULL DEFAULT 'pivnaya_karta';

UPDATE push_schedule SET tenant_id = 'pivnaya_karta' WHERE tenant_id IS NULL OR tenant_id = '';

CREATE INDEX IF NOT EXISTS idx_push_schedule_tenant ON push_schedule(tenant_id);
