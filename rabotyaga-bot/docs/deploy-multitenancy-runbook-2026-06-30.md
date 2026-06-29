# Runbook: Применение миграции 004_multitenancy.sql на прод-БД

**SEC-8 / Sprint B** · Дата: 2026-06-30  
**Целевая БД**: PostgreSQL на Timeweb (rabotyaga55.ru)  
**ЗАПРЕЩЕНО**: выполнять этот runbook автоматически. Только вручную по шагам.

---

## Предусловия

- [ ] Резервная копия БД сделана (`pg_dump`) и загружена на локальный диск
- [ ] Сервис `rabotyaga-bot` остановлен или переведён в maintenance-режим
- [ ] Есть подключение к прод-БД через psql или Timeweb Dashboard
- [ ] Прочитан и понят каждый шаг ниже

---

## Шаг 1 — Создать резервную копию

```bash
pg_dump "$DATABASE_URL" -Fc -f backup_before_004_$(date +%Y%m%d_%H%M%S).dump
```

Убедиться: файл не пустой (`ls -lh backup_before_004_*.dump`).

---

## Шаг 2 — Применить миграцию (идемпотентна)

```bash
psql "$DATABASE_URL" -f rabotyaga-bot/db/004_multitenancy.sql
```

Ожидаемый вывод при первом применении:
```
CREATE TABLE   -- tenants
INSERT 0 1     -- seed pivnaya_karta
CREATE TABLE   -- tenant_integrations
INSERT 0 4     -- seed 4 интеграции для pivnaya_karta
ALTER TABLE    -- kv_store: tenant_id + новый PK
ALTER TABLE    -- employee_bindings: tenant_id + UNIQUE
ALTER TABLE    -- data_sources: tenant_id + UNIQUE
ALTER TABLE    -- push_log: tenant_id + индекс
ALTER TABLE    -- push_schedule: tenant_id + индекс
```

Ожидаемый вывод при повторном применении (идемпотентность):
```
-- все шаги проходят без ошибок, INSERT ON CONFLICT ничего не перезаписывает
```

---

## Шаг 3 — Проверить структуру таблиц

```sql
-- Проверяем таблицу tenants
SELECT * FROM tenants;
-- Ожидаем: одна строка, tenant_id='pivnaya_karta', status='active'

-- Проверяем tenant_integrations
SELECT * FROM tenant_integrations WHERE tenant_id = 'pivnaya_karta';
-- Ожидаем: 4 строки (iiko, mozg, sheets, manual_revenue), enabled=true

-- Проверяем kv_store
SELECT column_name FROM information_schema.columns
  WHERE table_name = 'kv_store' ORDER BY ordinal_position;
-- Должен присутствовать столбец tenant_id

-- Проверяем существующие данные
SELECT COUNT(*) FROM kv_store WHERE tenant_id = 'pivnaya_karta';
-- Должно быть столько же строк, сколько было до миграции
```

---

## Шаг 4 — Обновить код сервера

```bash
# Деплоить новую версию rabotyaga-bot (с изменениями SEC-8)
# Убедиться что в .env заданы переменные:
#   DATABASE_URL (или PG*)
#   TELEGRAM_TOKEN        -- для pivnaya_karta (back-compat)
#   IIKO_URL, IIKO_LOGIN, IIKO_PASSWORD
#   MOZG_LOGIN, MOZG_PASSWORD
# При добавлении второго тенанта — добавить с префиксом:
#   SECOND_BAR_TELEGRAM_TOKEN=...
#   SECOND_BAR_IIKO_URL=...
```

---

## Шаг 5 — Запустить сервер и проверить лог

```
📂 Загружено N kv-ключей из PostgreSQL, M привязок
[tokenMap] построен: 1 тенантов
🚀 Сервер запущен на порту 3001
```

Если `[tokenMap] построен: 0 тенантов` — таблица tenants ещё не заполнена. Проверить Шаг 3.

---

## Шаг 6 — Smoke-тест

```bash
# Проверить health
curl https://rabotyaga55.ru/api/health
# Ожидаем: {"ok":true,"ts":...,"pg":true}

# Проверить интеграции (с auth-cookie)
curl -b "rab_token=<JWT>" https://rabotyaga55.ru/api/integrations
# Ожидаем: {"ok":true,"integrations":[...4 штуки...]}
```

---

## Откат (если что-то пошло не так)

Миграция имеет блок rollback в комментариях файла `db/004_multitenancy.sql`.  
Выполнить вручную из комментариев (секция `-- ROLLBACK`):

```sql
-- Восстановить PK kv_store
ALTER TABLE kv_store DROP CONSTRAINT IF EXISTS kv_store_pkey_v2;
ALTER TABLE kv_store ADD CONSTRAINT kv_store_pkey PRIMARY KEY (key);
ALTER TABLE kv_store DROP COLUMN IF EXISTS tenant_id;
-- ... (полный список в db/004_multitenancy.sql, секция ROLLBACK)
```

Затем откатить код сервера на предыдущую версию.

---

## Создание второго тенанта (после успешного деплоя)

```bash
node rabotyaga-bot/scripts/create-tenant.js second_bar "Второй бар"
# Затем добавить env-переменные с префиксом SECOND_BAR_ и перезапустить сервер
```

---

*Runbook составлен для ручного выполнения. Автоматический запуск запрещён.*
