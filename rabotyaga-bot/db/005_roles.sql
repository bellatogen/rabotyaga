-- 005_roles.sql — P0 «Привилегии/ACL» Ф1: конструктор ролей с деревом прав.
-- Заменяет хардкод-аккаунты manager/developer ролевой моделью per-tenant.
-- Идемпотентна (IF NOT EXISTS / ON CONFLICT DO NOTHING) — безопасна для повторного прогона.
--
-- Наследование ADDITIVE-ONLY: эффективные права роли = свои гранты ∪ права предков.
-- role_permissions хранит ТОЛЬКО собственные гранты роли; унаследованные вычисляются в коде.
--
-- ВАЖНО (Ф1): роли developer/manager получают '*' (суперправо) — в Ф1 ни один маршрут
-- не меняет «кто что может». Дерево неадминских ролей засевается для будущих фаз.
--
-- ──────────────────────────────────────────────────────────────────────────────
-- БЛОК ОТКАТА (только после pg_dump):
--   DROP TABLE IF EXISTS role_permissions;
--   DROP TABLE IF EXISTS users;
--   DROP TABLE IF EXISTS roles;
-- ──────────────────────────────────────────────────────────────────────────────

-- ── 1. Таблицы ───────────────────────────────────────────────────────────────
CREATE TABLE IF NOT EXISTS roles (
  id             UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  tenant_id      VARCHAR(100) NOT NULL REFERENCES tenants(tenant_id) ON DELETE CASCADE,
  name           TEXT NOT NULL,
  parent_role_id UUID REFERENCES roles(id) ON DELETE RESTRICT,
  is_system      BOOLEAN NOT NULL DEFAULT false,
  created_at     TIMESTAMP DEFAULT NOW(),
  UNIQUE (tenant_id, name)
);
CREATE INDEX IF NOT EXISTS idx_roles_tenant ON roles(tenant_id);
CREATE INDEX IF NOT EXISTS idx_roles_parent ON roles(parent_role_id);

CREATE TABLE IF NOT EXISTS role_permissions (
  role_id        UUID NOT NULL REFERENCES roles(id) ON DELETE CASCADE,
  permission_key TEXT NOT NULL,
  PRIMARY KEY (role_id, permission_key)
);

CREATE TABLE IF NOT EXISTS users (
  id          UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  tenant_id   VARCHAR(100) NOT NULL REFERENCES tenants(tenant_id) ON DELETE CASCADE,
  account     VARCHAR(255) NOT NULL,
  telegram_id BIGINT,
  role_id     UUID NOT NULL REFERENCES roles(id) ON DELETE RESTRICT,
  active      BOOLEAN NOT NULL DEFAULT true,
  created_at  TIMESTAMP DEFAULT NOW(),
  UNIQUE (tenant_id, account)
);
CREATE INDEX IF NOT EXISTS idx_users_tenant ON users(tenant_id);

-- ── 2. Seed-дерево ролей для pivnaya_karta ───────────────────────────────────
-- Корень
INSERT INTO roles (tenant_id, name, parent_role_id, is_system)
VALUES ('pivnaya_karta', 'Персонал', NULL, false)
ON CONFLICT (tenant_id, name) DO NOTHING;

-- Ветки первого уровня (parent = Персонал)
INSERT INTO roles (tenant_id, name, parent_role_id, is_system)
SELECT 'pivnaya_karta', v.name, p.id, false
FROM (VALUES ('Кухня'), ('Бар'), ('Зал'), ('Управление')) AS v(name)
JOIN roles p ON p.tenant_id = 'pivnaya_karta' AND p.name = 'Персонал'
ON CONFLICT (tenant_id, name) DO NOTHING;

-- Кухня → Повар
INSERT INTO roles (tenant_id, name, parent_role_id, is_system)
SELECT 'pivnaya_karta', 'Повар', p.id, false
FROM roles p WHERE p.tenant_id = 'pivnaya_karta' AND p.name = 'Кухня'
ON CONFLICT (tenant_id, name) DO NOTHING;
-- Повар → Су-шеф
INSERT INTO roles (tenant_id, name, parent_role_id, is_system)
SELECT 'pivnaya_karta', 'Су-шеф', p.id, false
FROM roles p WHERE p.tenant_id = 'pivnaya_karta' AND p.name = 'Повар'
ON CONFLICT (tenant_id, name) DO NOTHING;
-- Су-шеф → Шеф-повар
INSERT INTO roles (tenant_id, name, parent_role_id, is_system)
SELECT 'pivnaya_karta', 'Шеф-повар', p.id, false
FROM roles p WHERE p.tenant_id = 'pivnaya_karta' AND p.name = 'Су-шеф'
ON CONFLICT (tenant_id, name) DO NOTHING;

-- Бар → Бармен
INSERT INTO roles (tenant_id, name, parent_role_id, is_system)
SELECT 'pivnaya_karta', 'Бармен', p.id, false
FROM roles p WHERE p.tenant_id = 'pivnaya_karta' AND p.name = 'Бар'
ON CONFLICT (tenant_id, name) DO NOTHING;
-- Бармен → Шеф-бармен
INSERT INTO roles (tenant_id, name, parent_role_id, is_system)
SELECT 'pivnaya_karta', 'Шеф-бармен', p.id, false
FROM roles p WHERE p.tenant_id = 'pivnaya_karta' AND p.name = 'Бармен'
ON CONFLICT (tenant_id, name) DO NOTHING;

-- Зал → Официант / Хостес
INSERT INTO roles (tenant_id, name, parent_role_id, is_system)
SELECT 'pivnaya_karta', v.name, p.id, false
FROM (VALUES ('Официант'), ('Хостес')) AS v(name)
JOIN roles p ON p.tenant_id = 'pivnaya_karta' AND p.name = 'Зал'
ON CONFLICT (tenant_id, name) DO NOTHING;

-- Управление → Администратор → Менеджер → developer
INSERT INTO roles (tenant_id, name, parent_role_id, is_system)
SELECT 'pivnaya_karta', 'Администратор', p.id, false
FROM roles p WHERE p.tenant_id = 'pivnaya_karta' AND p.name = 'Управление'
ON CONFLICT (tenant_id, name) DO NOTHING;
INSERT INTO roles (tenant_id, name, parent_role_id, is_system)
SELECT 'pivnaya_karta', 'Менеджер', p.id, true
FROM roles p WHERE p.tenant_id = 'pivnaya_karta' AND p.name = 'Администратор'
ON CONFLICT (tenant_id, name) DO NOTHING;
INSERT INTO roles (tenant_id, name, parent_role_id, is_system)
SELECT 'pivnaya_karta', 'developer', p.id, true
FROM roles p WHERE p.tenant_id = 'pivnaya_karta' AND p.name = 'Менеджер'
ON CONFLICT (tenant_id, name) DO NOTHING;

-- ── 3. Собственные гранты ролей (ADDITIVE) ───────────────────────────────────
-- Хелпер-паттерн: разворачиваем массив ключей в строки role_permissions.

-- Персонал (база для всех)
INSERT INTO role_permissions (role_id, permission_key)
SELECT r.id, k FROM roles r
CROSS JOIN unnest(ARRAY['tasks.view.own','tasks.mark.own','schedule.view','xp.view.own']) AS k
WHERE r.tenant_id = 'pivnaya_karta' AND r.name = 'Персонал'
ON CONFLICT DO NOTHING;

-- Су-шеф
INSERT INTO role_permissions (role_id, permission_key)
SELECT r.id, k FROM roles r
CROSS JOIN unnest(ARRAY['tasks.create']) AS k
WHERE r.tenant_id = 'pivnaya_karta' AND r.name = 'Су-шеф'
ON CONFLICT DO NOTHING;

-- Шеф-повар
INSERT INTO role_permissions (role_id, permission_key)
SELECT r.id, k FROM roles r
CROSS JOIN unnest(ARRAY['tasks.view.all','staff.view','reports.margin.view']) AS k
WHERE r.tenant_id = 'pivnaya_karta' AND r.name = 'Шеф-повар'
ON CONFLICT DO NOTHING;

-- Бармен
INSERT INTO role_permissions (role_id, permission_key)
SELECT r.id, k FROM roles r
CROSS JOIN unnest(ARRAY['quests.complete','rewards.redeem']) AS k
WHERE r.tenant_id = 'pivnaya_karta' AND r.name = 'Бармен'
ON CONFLICT DO NOTHING;

-- Шеф-бармен
INSERT INTO role_permissions (role_id, permission_key)
SELECT r.id, k FROM roles r
CROSS JOIN unnest(ARRAY['tasks.view.all','tasks.create','taps.edit','reports.margin.view']) AS k
WHERE r.tenant_id = 'pivnaya_karta' AND r.name = 'Шеф-бармен'
ON CONFLICT DO NOTHING;

-- Администратор
INSERT INTO role_permissions (role_id, permission_key)
SELECT r.id, k FROM roles r
CROSS JOIN unnest(ARRAY[
  'staff.view','staff.manage','schedule.edit',
  'reports.revenue.view','reports.margin.view','reports.abc.view',
  'integrations.view'
]) AS k
WHERE r.tenant_id = 'pivnaya_karta' AND r.name = 'Администратор'
ON CONFLICT DO NOTHING;

-- Менеджер и developer — суперправо '*' (Ф1: сохранить текущее поведение admin-аккаунтов)
INSERT INTO role_permissions (role_id, permission_key)
SELECT r.id, '*' FROM roles r
WHERE r.tenant_id = 'pivnaya_karta' AND r.name IN ('Менеджер', 'developer')
ON CONFLICT DO NOTHING;
