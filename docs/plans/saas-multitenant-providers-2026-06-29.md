# Спринт B — Платформа: мультитенантность + провайдеры интеграций (SEC-8): План

## Goal
Снять «один бар на процесс»: ядро перестаёт зависеть от источника данных. Тенант определяется по боту (свой Telegram-токен), данные изолированы колонкой `tenant_id` (shared-DB), интеграции (iiko/mozg/sheets/manual) — взаимозаменяемые провайдеры за единым интерфейсом, включённость и несекретный конфиг — данные в БД на тенанта, секреты — env по схеме имён. Бар без iiko работает на `manual_revenue`.

## Решения (зафиксированы с заказчиком — не пересматривать)
- **shared-DB, `tenant_id` колонка.** Без RLS / отдельных схем / отдельных пулов.
- **Тенант резолвится по боту:** initData подписан токеном бота X → тенант X.
- **Один процесс, несколько Telegraf-ботов** (по активному тенанту).
- **Источники = провайдеры** за единым интерфейсом; реестр — простой объект-маппинг (НЕ динамическая загрузка, НЕ очереди).
- **server.js: шим `getTenantData(req)` + поэтапная миграция обработчиков** (не big-bang). Шим с fallback на дефолтного тенанта позволяет переводить обработчики группами, удерживая тест-гейт зелёным.
- **Выручка — композиция по полям:** sheets пишет `plan`, iiko/manual пишут `fact`, mozg — справочный дрифт; каждый провайдер пишет ТОЛЬКО свои поля в `revenue:v1[date]`, поле `origin` фиксирует источник факта.
- **`tenant_id` ограничен `[a-z0-9_]`** (без дефисов) — чтобы имена env-секретов были валидны. Канонический дефолтный тенант — **`pivnaya_karta`** (не `pivnaya-karta`: дефис в имени env-переменной недопустим). DEFAULT во всех ALTER — `'pivnaya_karta'`.
- **Секреты НИКОГДА не в БД и не в git.** Схема имён env: `<TENANT_ID_UPPER>_<NAME>` (напр. `PIVNAYA_KARTA_IIKO_PASSWORD`). Для дефолтного тенанта — fallback на старые глобальные (`IIKO_PASSWORD`, `MOZG_PASSWORD`), чтобы прод не сломался.
- **Приоритет: надёжность, изоляция, расширяемость.** Срезы запрещены. Ничего не запускать против прод-БД — только код + .sql + скрипты + инструкции.

## Background — карта швов (file:line, прочитано напрямую в этой сессии)

### Персистенция (server.js) — ядро риска
- `data` (in-memory) = `{ kv, bindings, pushSettings, adminUsers }` — server.js:134. **Станет** `data.tenants[tenantId] = { kv, bindings }` + хелпер `getTenantData(req)`.
- `saveData()` server.js:167 — debounce 300мс; всегда пишет `data.json` (резерв) + coalesced PG-flush через `flushChain`/`flushPending`.
- `flushToPG()` server.js:186 — dirty-tracking: сравнивает `data.kv[key]` с `lastFlushed.kv[key]`, пишет изменённые (`adapter.kvSet`), удаляет осиротевшие (`adapter.kvDelete`); bindings — дельта.
- `lastFlushed` server.js:165 — **единый глобальный снимок** `{ kv, bindings, bindingsJSON, pushSettingsJSON }`. **Станет** `lastFlushed[tenantId]`.
- `captureSnapshot()` server.js:223; `hydrateFromPG()` server.js:232 — PG-first загрузка, `PG_OK` гейтит запись; пустой PG → авто-миграция (saveData прогревает БД), server.js:247-252; `schedulePGRetry()` server.js:262-281 — реконсиляция памяти с PG при восстановлении соединения (фикс C1: снимок текущего PG в lastFlushed.kv, чтобы удаления долетали).
- Bootstrap IIFE server.js:842-866: `await hydrateFromPG()` → `migrateAuthPasswords()` → `ensurePushModel/ensureQuestModel/ensureTapModel` → `bot.launch()` → `pushScheduler.startScheduler(bot,data,pushSender,saveData)` → `app.listen`.

### Adapter (db/adapter.js) — все методы без tenant
- `kvGet/kvSet/kvGetAll/kvDelete` (adapter.js:5-32) — `kv_store(key,value)`, upsert `ON CONFLICT(key)`.
- `getBindings/bindEmployee/unbindEmployee/getEmployeeByTelegramId` (adapter.js:35-74) — `employee_bindings`, `getBindings` фильтрует `active=true`, нормализует `telegram_id`→Number.
- `logPush` adapter.js:77 — вызывается из push/sender.js (fire-and-forget).
- **Станет:** `tenant_id` первым аргументом, каждый SQL с `tenant_id`; новые: `listActiveTenants/getTenant/createTenant/getTenantIntegrations/setTenantIntegration`.

### Схема (db/*.sql)
- `kv_store(key VARCHAR PK, value TEXT, created_at, updated_at)` — db/001_initial_schema.sql (PK `kv_store_pkey` на `key`).
- `employee_bindings(name … UNIQUE(name), telegram_id BIGINT, active, …)`.
- Миграции нумерованные: 001…003. **Новая:** `db/004_multitenancy.sql` (идемпотентная + блок отката).

### Auth / Telegram (Спринт A уже влит)
- `src/middleware/auth.js`: `signToken(account,opts)` payload `{account, tgVerified?}`; `requireAuth` ставит `req.account`+`req.tgVerified`; `requireManager`, `requireTgVerified`. **Станет:** payload + `tenantId`; `requireAuth` → `req.tenantId` (нет в токене → `'pivnaya_karta'`, старые cookie живут); новый `requireTenant` (tenant active, иначе 403).
- `src/middleware/telegram.js`: `verifyInitData(initData, botToken)` — HMAC по конкретному токену. **Резолв тенанта:** перебрать токены активных тенантов, чей валидирует — того tenantId.
- `/api/auth/telegram` (src/api/auth.js): сейчас один `TG_BOT_TOKEN` из env, lookup в `data.bindings`. **Станет:** резолв тенанта по токену → JWT с tenantId+tgVerified.

### Sync-модули → параметризовать в провайдеры (логику выгрузки НЕ менять)
- `src/sync/revenueSync.js` — `REVENUE_PLAN_SHEET_ID` module-const (env), `syncRevenuePlan(data,saveData,opts)` пишет `revenue:v1` (plan/planGuests).
- `src/sync/scheduleSync.js` — `SCHEDULE_SHEET_ID` env + **захардкоженный ростер `COL_NAME` (5 имён, scheduleSync.js:8)** — это специфика pivnaya_karta.
- `src/sync/mozgSync.js` — `MOZG_LOGIN/MOZG_PASSWORD` module-const; **⚠️ module-global cookie-jar `_jar`/`_sessionExp` (mozgSync.js:21) — состояние сессии разделяется между вызовами → при мультитенанте утечёт между тенантами.** Провайдер обязан держать сессию per-tenant (инстанс/замыкание), не модуль-глобал.
- `src/api/iiko.js` — `syncRevenue(data,saveData)` читает `IIKO_URL/IIKO_LOGIN` (+пароль) из env; пишет `revenue:v1.fact`/гостей (контракт OLAP — см. CLAUDE.md, GuestNum-регрессия). **⚠️ вероятен module-global кэш токена iiko — тоже сделать per-tenant.** Файл сейчас с незакоммиченным чужим WIP — не трогать по сути, только параметризовать вход.

### Планировщики синков (server.js)
- `setInterval`-блоки server.js:345-414 (schedule/revenuePlan каждые 12ч; mozg + дрифт-ресинк каждые 2ч, server.js:363-401; iiko.syncRevenue каждые 2ч) — **глобальные, читают env**. **Станет:** цикл по активным тенантам → `getTenantIntegrations` → запуск ТОЛЬКО enabled-провайдеров с config+secrets через реестр.

### Тест-харнесс (обязательный гейт)
- Кастомный node-раннер (НЕ jest-framework despite «jest» в задаче): `tests/*.test.js`, поднимают express + `http` + `cookie-parser`, ходят `global fetch` с cookie от `signToken` (см. tests/quests.test.js, tests/telegram.test.js). `package.json` `test` — цепочка `node tests/*.js`.
- Изоляция тенантов в adapter тестируется с **mock-pool** (db.test.js — проверить, мок ли `pg` pool; если бьёт реальный PG — изоляц.-тесты делать на мок-пуле, против прод-БД НЕ гонять).

## Approach

Поэтапная миграция через шим, **не big-bang**. Дефолтный тенант `pivnaya_karta` — fallback везде: старые cookie без `tenantId`, старые env-секреты без префикса, пустая БД сидится из `data.json`. Тест-гейт зелёный после каждого слоя.

Слои снизу вверх:
1. **Схема** (`004`) — `tenant_id DEFAULT 'pivnaya_karta'` во все таблицы, PK/UNIQUE → префикс `tenant_id`, новые `tenants` + `tenant_integrations`. Идемпотентна, с блоком отката.
2. **Adapter** — `tenantId` первым аргументом каждого метода, `WHERE tenant_id=$1`; новые tenant/integration-методы. Защищён mock-pool изоляц.-тестами ДО правки server.js.
3. **Secrets** (`src/config/secrets.js`) — `getTenantSecret(tid,name)=env[TID_NAME]`, fallback `env[NAME]` для `pivnaya_karta`. `tid ∈ [a-z0-9_]` ⇒ имя env валидно.
4. **Провайдеры** (`src/providers/*`) — интерфейс `{kind, isConfigured(ctx), fetchRevenue(ctx)}`; реестр-объект; **module-global состояние iiko-токена и mozg-jar инкапсулируется в инстанс** (замыкание/класс). Каждый провайдер пишет ТОЛЬКО свои поля в `revenue:v1[date]` + `origin`.
5. **Auth/резолв** — карта `[botToken→tenantId]` строится на boot из `listActiveTenants()` + `getTenantSecret(tid,'TELEGRAM_TOKEN')`; `/api/auth/telegram` перебирает токены; JWT несёт `tenantId`; `requireAuth`→`req.tenantId`; `requireTenant` гейтит active.
6. **server.js** — `data.tenants[tid]={kv,bindings}` + шим `getTenantData`; `lastFlushed[tid]`; per-tenant планировщики синков и пушей через `listActiveTenants()`. **Multibot отложён (Спринт B2)** — пока один бот для `pivnaya_karta`, как сейчас.
7. **API** — `integrations.js` (CRUD enabled/config), `revenue/manual.js` (ручной факт), `dataSources.js` + `tenant_id`.
8. **Tooling** — `scripts/create-tenant.js`, runbook, CHANGELOG.

**Инварианты не нарушаем:** iiko OLAP-контракт (GuestNum gated by `rowFact>0`), иерархия источников выручки (iiko/manual→`fact`, sheets→`plan`, mozg→дрифт), persistence dirty-track + C1-реконсиляция (теперь per-tenant), русский в коде/комментах.
**Секрет НЕ в БД:** `tenants` хранит `tenant_id`+`status`+`name`, НЕ `bot_token`. Токен — из env через `getTenantSecret`; карта `[token→tid]` живёт только в памяти процесса.

## Work Items

### WI-1 — Схема `db/004_multitenancy.sql`
**Goal:** `tenant_id` в реально используемые таблицы + `tenants` + `tenant_integrations`; идемпотентно; блок отката.
**Done when:** прогон дважды без ошибок (dev-БД); `tenant_id` добавлен ТОЛЬКО живым таблицам — `kv_store` (PK→`(tenant_id,key)`), `employee_bindings` (UNIQUE→`(tenant_id,name)`), `data_sources` (UNIQUE→`(tenant_id,source_type)`), `push_log`, `push_schedule`; **мёртвые таблицы `tasks`/`task_completion`/`revenue_plan`/`shift_schedule` НЕ трогаем** (приложение KV-first: `tasks:v4` лежит в `kv_store`; вызовов adapter-методов нет — подтвердить grep'ом перед миграцией); существующие строки получили `'pivnaya_karta'`; rollback-блок (в комментарии) восстанавливает прежние PK/UNIQUE и дропает новые таблицы.
**Key files:** `db/004_multitenancy.sql` (new). Паттерн миграций — `db/001..003`.
**Dependencies:** —. **Size:** M.

### WI-2 — Secrets `src/config/secrets.js`
**Goal:** `getTenantSecret(tenantId,name)` env-резолв с fallback.
**Done when:** `<TID_UPPER>_<NAME>` → если пусто и `tid='pivnaya_karta'` → `env[NAME]`; невалидный tid (`[^a-z0-9_]`) → throw; покрыт `tests/secrets.test.js`.
**Key files:** `src/config/secrets.js` (new). **Dependencies:** —. **Size:** S.

### WI-3 — Adapter `tenant_id` + tenants/integrations
**Goal:** `tenantId` первым аргументом всех методов; новые tenant/integration-методы.
**Done when:** 11 существующих методов принимают `tenantId`, SQL с `WHERE tenant_id=$1` / `ON CONFLICT (tenant_id,…)`; `listActiveTenants/getTenant/createTenant/getTenantIntegrations/setTenantIntegration` работают; `db.test.js` (mock-pool) расширен: `kvSet('A',…)` не виден `kvGetAll('B')`, bindings A↛B, createTenant идемпотентен, setTenantIntegration upsert.
**Key files:** `db/adapter.js`, `tests/db.test.js`. **Dependencies:** WI-1. **Size:** L.

### WI-4 — Провайдеры `src/providers/*` + реестр + manual
**Goal:** единый интерфейс, реестр, инкапсуляция module-global, новый `manual_revenue`.
**Done when:** `iiko/mozg/sheets/manual_revenue` экспортируют `create(ctx)→{kind,isConfigured,fetchRevenue}`; **iiko-token (`_token/_tokenExpiry/_tokenPromise`) и mozg-jar (`_jar/_sessionExp`) вынесены в инстанс — два инстанса с разными creds НЕ делят состояние (тест изоляции)**; `manual_revenue.applyManual` пишет `revenue:v1[date]={fact,guests,origin:'manual'}`; module-функции iiko/mozg остаются тонкими обёртками над env-клиентом (back-compat для `/api/iiko/*`); **`tests/iiko.test.js` зелёный — OLAP/GuestNum-контракт (CLAUDE.md) НЕ нарушен рефактором токен→инстанс**; `tests/providers.test.js`.
**Key files:** `src/providers/index.js`, `src/providers/{iiko,mozg,sheets,manualRevenue}.js` (new); рефактор `src/api/iiko.js`, `src/sync/mozgSync.js`, `src/sync/revenueSync.js` (параметризация, логику выгрузки НЕ менять); гейт `tests/iiko.test.js`.
**Dependencies:** WI-2. **Size:** XL.

### WI-5 — Auth + резолв тенанта по боту
**Goal:** JWT с `tenantId`; `/api/auth/telegram` резолвит тенанта по токену; `requireTenant`.
**Done when:** `signToken(account,{tenantId})` (дефолт `pivnaya_karta`); `requireAuth`→`req.tenantId`; `resolveTenantByInitData(initData, tokenMap)` перебирает токены активных тенантов; неактивный/чужой → 403; `telegram.test.js`: бот A → tenant A, чужой токен → 403, старый cookie без tenantId → `pivnaya_karta`.
**Key files:** `src/middleware/auth.js`, `src/middleware/telegram.js`, `src/api/auth.js`, `tests/telegram.test.js`. **Dependencies:** WI-3. **Size:** L.

### WI-6 — server.js per-tenant data/flush/планировщики (один бот)
**Goal:** `data.tenants[tid]`, `getTenantData`, `lastFlushed[tid]`, per-tenant sync+push циклы. **Multibot — НЕ в этом спринте** (см. §Отложено).
**Done when:** hydrate грузит все active-тенанты; flush per-tenant с C1-реконсиляцией; **бот один — для `pivnaya_karta` (как сейчас: `bot.launch()`/`bot.stop` без изменений, хендлеры читают `getTenantData('pivnaya_karta')`)**; sync-интервалы итерируют `listActiveTenants()`→`getTenantIntegrations()`→реестр (только enabled); **sheets-schedule (`scheduleSync`, COL_NAME) — отдельно ТОЛЬКО для `pivnaya_karta`, мимо реестра**; **seed-маппинг: legacy `data.json {kv,bindings,pushSettings,adminUsers}` → `data.tenants.pivnaya_karta={kv,bindings}` + глобальные `data.pushSettings/adminUsers`; `pushSettings` в памяти = top-level поле `data`, на flush — kv-ключ `pushSettings:v1` под `pivnaya_karta`, на hydrate — обратно в `data.pushSettings`**; локальный smoke: `pivnaya_karta` работает как раньше.
**Key files:** `server.js`, `src/push/scheduler.js`, `src/push/sender.js`, `src/push/model.js`. **Dependencies:** WI-3, WI-4, WI-5. **Size:** L.

### WI-7 — API integrations + manual revenue + dataSources tenant
**Goal:** CRUD включённости/конфига; ручной ввод факта; `tenant_id` в dataSources.
**Done when:** `GET/PUT /api/integrations` (requireManager+requireTenant) читает/пишет `tenant_integrations` (секретов в ответе НЕТ; `/test`-ping — отложен как спекулятивный); `POST /api/revenue/manual` (requireManager+requireTenant) пишет факт через manual-провайдер; `dataSources.js` обёрнут requireAuth+requireTenant, SQL с `tenant_id`; **`/api/push/stats` фильтрует по `req.tenantId` (записи push-log несут `tenantId` — пишется в WI-6 sender) → закрыта кросс-тенантная stats-утечка**; API-тесты: «GET /api/integrations НЕ возвращает секреты», «stats одного тенанта не видит другого».
**Key files:** `src/api/integrations.js`, `src/api/revenue/manual.js` (new); `src/api/dataSources.js`, `src/api/push.js` (stats-фильтр); монтаж в `server.js`. **Dependencies:** WI-3, WI-4, WI-5, WI-6. **Size:** L.

### WI-8 — `scripts/create-tenant.js`
**Goal:** онбординг бара из CLI, без ручного SQL (заводит ДАННЫЕ тенанта + интеграции; живой бот этого тенанта запускается в Спринте B2 — multibot).
**Done when:** создаёт строку `tenants` + дефолтные `tenant_integrations` (всё disabled, кроме `manual_revenue=true`); печатает требуемые env-имена (`<TID>_TELEGRAM_TOKEN` обязат., опц. `<TID>_IIKO_*`/`_MOZG_*`); валидирует tid `[a-z0-9_]`; идемпотентен (ON CONFLICT).
**Key files:** `scripts/create-tenant.js` (new). **Dependencies:** WI-3. **Size:** M.

### WI-9 — Кросс-каттинг тесты + зелёная цепочка
**Goal:** нетто-новые кросс-каттинг тесты + общий гейт. _Юнит-кейсы живут в своих WI: изоляция adapter→WI-3, резолв→WI-5, провайдеры→WI-4, secrets→WI-2 (не дублировать владение здесь)._
**Done when:** `tests/integrations.test.js` — CRUD + «GET не отдаёт секреты» + stats-фильтр двух тенантов; end-to-end «тенант без iiko: enabled только manual → iiko НЕ вызывается, manual пишет fact»; `createTenant` заводит изолированного (manual on, iiko off); вся цепочка `package.json` test зелёная.
**Key files:** `tests/integrations.test.js` (new), `package.json`. **Dependencies:** WI-2..WI-7. **Size:** M.

### WI-10 — Runbook прод-миграции + онбординг + CHANGELOG
**Goal:** деплой-инструкция миграции + создание бара.
**Done when:** runbook: `pg_dump` ДО → прогон `004` → рестарт нового кода (атомарно с WI-6) → verify (изоляция, дефолтный бар цел) → откат; онбординг бара пошагово (BotFather → env-токен → `create-tenant.js` → включить интеграции через API → menu button); CHANGELOG (SEC-8).
**Key files:** `docs/deploy-multitenancy-runbook-2026-06-29.md` (new), `CHANGELOG.md`. **Dependencies:** все. **Size:** M.

## Design notes (несущие решения)

- **Схема.** `tenants(tenant_id PK CHECK ~ '^[a-z0-9_]+$', name, status DEFAULT 'active', created_at)`; `tenant_integrations(tenant_id FK, kind, enabled, config JSONB, PK(tenant_id,kind))`. `config` — только НЕсекретное (`sheetId/url/login/маппинг`), пароли/токены — env. ALTER-паттерн идемпотентен: `ADD COLUMN IF NOT EXISTS tenant_id … DEFAULT 'pivnaya_karta'` → `DROP CONSTRAINT IF EXISTS <pk>` → `ADD CONSTRAINT … PRIMARY KEY (tenant_id, …)`. DEFAULT оставляем (не-мигрированные пути не падают на NOT NULL).
- **Секреты (`secrets.js`).** `getTenantSecret(tid,name)`: `env[`${tid.toUpperCase()}_${name}`]` → fallback `env[name]` только для `pivnaya_karta` → иначе `''`. Невалидный tid → throw.
- **Провайдеры — два рода.** `ctx={tenantId, config, getSecret}`. **Revenue-провайдеры** возвращают date-keyed дельту `{ 'YYYY-MM-DD': {fact?|plan?, guests?, origin} }`: `iikoRevenue`→`{date:{fact,guests,origin:'iiko'}}`, `sheets`→`{date:{plan,planGuests,origin:'sheets'}}`, `manualRevenue.applyManual(ctx,{date,fact,guests})`. **`mozg` — НЕ revenue-провайдер:** пишет свой ключ `mozg:dashboard:v1` (помесячный `{ym:{…}}`, справочный дрифт per CLAUDE.md), в `revenue:v1` НЕ мёржится — это снимает конфликт форм ключа (`date` vs `ym`).
- **`mergeRevenue(td, delta)`** — единый хелпер: `for date → Object.assign(rev[date] ||= {}, поля дельты)`, пишет `td.kv['revenue:v1']`. Выносит RMW-семантику текущих `iiko.syncRevenueRange`/`revenueSync.syncRevenuePlan` в ОДНУ функцию (не дублировать). Композиция по полям: источник перезаписывает только свои (`fact/guests/origin` ИЛИ `plan/planGuests`).
- **iiko рефактор:** `_token/_tokenExpiry/_tokenPromise` (`src/api/iiko.js:14-16`) → `makeIikoClient({url,login,password})` с замкнутым state; module-функции = обёртки над env-клиентом (back-compat OLAP-роутов). OLAP-контракт без изменений.
- **🔴 Блокер до прода:** module-global iiko-token и mozg-jar (`src/sync/mozgSync.js:20-21`) — без инкапсуляции в инстанс бар B получит выручку/сессию бара A. Тест изоляции инстансов (WI-4) — обязательный гейт. `flushChain` (глобальная сериализация) под N тенантов растит латентность flush линейно — приемлемо для десятков, при росте → per-tenant chain.
- **Auth.** JWT `{account, tenantId, tgVerified?}`. `requireTenant` — после `requireAuth`, проверяет active по in-memory `activeTenantSet`. `resolveTenantByInitData(initData, tokenMap)` — перебор O(N тенантов), HMAC дёшев; один initData валиден ровно одним токеном.
- **server.js.** `data={tenants:{}, pushSettings:{}, adminUsers:[]}`; `getTenantData(tid)` лениво создаёт `{kv,bindings}`; шим `tdReq(req)=getTenantData(req.tenantId)`. Фабрики роутов получают `{getTenantData}`-геттер + глобальный `data` для `pushSettings/adminUsers`. `flushChain`/`flushPending` остаются глобальными (одна транзакция за раз через все тенанты — проще, безопасно), dirty-track — per-tenant. `pushSettings:v1` PG-ключ пишется под дефолтным тенантом.
- **Sheets-schedule** (`scheduleSync`, COL_NAME) — только `pivnaya_karta`, отдельным вызовом, НЕ через реестр (не обобщаем в этом спринте).

## Implementation order
`004` → adapter → (secrets ∥) → провайдеры (iiko-token→инстанс, mozg-jar→инстанс, sheets-config, затем реестр+manual) → auth/резолв → **server.js+scheduler+sender+model (один коммит, один бот)** → API → create-tenant → добить тесты → runbook+CHANGELOG.
**Атомарные группы для деплоя:** {WI-1 схема, WI-6 код} — один деплой (старый код после `004` не работает). {server+scheduler+sender+model} — один коммит. Без multibot ядро WI-6 умеренное (Size L), деплой низкого риска.

## Отложено (Спринт B2 — подключение живого 2-го бара)
Принято заказчиком (Вариант 2): этот спринт — фундамент изоляции, без живого второго бара. Откладывается в B2:
- **Multibot:** несколько Telegraf в одном процессе (токен на тенанта), `registerBotCommands(bot,tid)` с замыканием tid для всех хендлеров (`/today`,`/mytasks`,`/startpush`,`/stoppush`,`/pushsettings`,`callback_query`), graceful-shutdown N ботов, per-tenant menu-button/`WEBAPP_URL`.
- **push-доставка по `bots[tid]`** (сейчас один бот → один тенант).
- **Запуск живого бота нового бара:** данные/интеграции заводит `create-tenant.js` (WI-8) уже в этом спринте, но его Telegram-бот поднимается в B2.
Резолв тенанта по токену (WI-5) и per-tenant данные/синки (WI-6) делаются forward-compatible: добавление multibot в B2 не трогает изоляцию.

## Open Questions (для реализации)
Зафиксировано в ходе планирования (НЕ переоткрывать):
- pushSettings/adminUsers — **глобальные** в этом спринте (per-tenant только `{kv,bindings}`).
- sheets-schedule — **только `pivnaya_karta`**; новые тенанты на него не подписываются.
- `data_sources` — оставить **параллельно** `tenant_integrations` (+`tenant_id`), миграцию отложить.
- db.test.js — **mock-pool** (подтверждено), изоляц.-тесты там же.

Решено заказчиком:
- **Число тенантов — Вариант 2 (фундамент).** В этом спринте — изоляция без живого 2-го бара. **Multibot отложён в Спринт B2** (см. §Отложено). WI-6 уменьшается до per-tenant данных/flush/планировщика при одном боте (`pivnaya_karta`); деплой дробится на малые шаги. Резолв тенанта (WI-5) и per-tenant ядро (WI-6) — forward-compatible под B2.

Закрыто в ходе планирования (НЕ переоткрывать):
- **push-log stats-утечка** — владелец WI-7 (`tenantId` в записях + фильтр `/api/push/stats`).
- **FK `push_log.employee_id→employee_bindings`** — неактуально: джойна на `employee_bindings` в коде нет (проверено grep в критике). Снято.
- **Мёртвые таблицы** (`tasks`/`task_completion`/`revenue_plan`/`shift_schedule`) — из миграции WI-1 исключены (KV-first, нет вызовов).

## References
- CLAUDE.md — контракт iiko OLAP (GuestNum-регрессия), иерархия источников выручки, persistence-инварианты.
- docs/plans/saas-readiness-2026-06-29.md — родительский roadmap (этот спринт = его П.1 мультитенант + П.4 конфиг-из-UI, частично).
- Спринт A (commit 3811fe6): src/middleware/telegram.js `verifyInitData` — фундамент резолва тенанта.
- Telegram WebApp initData: HMAC-SHA256, секрет = HMAC("WebAppData", botToken) — уже реализовано в telegram.js.
