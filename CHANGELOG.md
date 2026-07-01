# Журнал изменений — Работяга

## [Unreleased] — 2026-07-01 · Синк расписания: миграция на Google Sheets API v4

### 🐛 Инцидент и фикс: 401 при синке расписания из Google Sheets

**Симптом**: автосинк расписания (`scheduleSync.js`) стабильно ловил `Sheets HTTP 401`
на проде, план выручки (другой Google Sheet) синкался исправно.

**Ход расследования** (полный разбор — `docs/investigations/schedule-sync-401-2026-07-01.md`):
- Проверены и отклонены гипотезы: анти-бот на User-Agent, параллелизм запросов,
  сломанный публичный доступ к таблице, репутация IP дата-центра целиком.
- **Настоящая причина**: `.env` на проде указывал на чужой/устаревший `SCHEDULE_SHEET_ID` —
  приватную таблицу, требующую логина в Google. `REVENUE_PLAN_SHEET_ID` в `.env` при этом
  совпадал с рабочим ID — поэтому только расписание падало, а план выручки — нет.
- Попутно выяснилось: обе исходные таблицы были загруженными `.xlsx`-файлами в Drive —
  Sheets API v4 с таким форматом не работает (только с нативным Google Sheets).

**Восстановление данных**: Июль 2026 руками смержен в `schedule:v1`/`events:v1` через
легитимный whitelisted `PUT /api/kv/:key` (SEC-4) — без обхода работающего процесса.

### 🏗 Миграция на Google Sheets API v4 (устраняет причину, не только симптом)

- Обе таблицы (расписание, план выручки) конвертированы владельцем в нативный формат
  Google Sheets (новые ID, доступ «по ссылке» переоткрыт).
- `src/sync/sheetsFetch.js` — общий модуль фетча: **Sheets API v4 основной путь**
  (`GOOGLE_SHEETS_API_KEY`), анонимный **gviz CSV-экспорт — автоматический фолбэк**
  на любую ошибку API v4 (сеть, квота, Office-формат и т.п.). Статус синка теперь
  показывает `source: 'api-v4' | 'gviz-fallback'` по каждому листу.
- `src/sync/scheduleParse.js` — вынесена вся логика разбора строк расписания
  (`parseScheduleRows`) в общий модуль — не зависит от источника (CSV или JSON values).
- `src/sync/scheduleSync.js`, `src/sync/revenueSync.js` — переведены на общие модули.
- `server.js`: `scheduleSyncWithRetry` теперь ретраит, пока в статусе есть `error`,
  а не только пока `daysUpdated === 0` (частичный успех не маскировал соседний сбой).
- Пул конкурентности (`POOL=3`) + бэкофф с джиттером для бэкфилла — снижают риск
  самосозданного «залпа» запросов к Google.

### 🔧 Воспроизводимый ручной импорт

- `scripts/manual-schedule-import.js` — CLI-инструмент вместо разовых curl/JWT/ssh-манипуляций:
  логинится как обычный менеджер (`/api/auth/login`), тянет лист Google Sheets с любой рабочей
  машины (API v4 + gviz-фолбэк, тот же модуль, что и автосинк), мержит с текущими данными без
  потерь и заливает через штатный `PUT /api/kv/:key`. Пароль — только через `MANAGER_PASSWORD` env.

### 🔔 Напоминание управляющему

- `src/push/scheduleReminder.js` — раз управляющий теперь сам ведёт расписание в Google Sheets,
  за 5 дней до конца месяца бот ежедневно шлёт пуш в Telegram, если вкладка следующего месяца
  ещё не создана (нагом — пока не появится). Подключено в тик push-планировщика.

### 🧪 Тесты
- Все 14 тестов `rabotyaga-bot` — зелёные после каждого шага миграции.
- Живой прогон `syncSchedule`/`syncRevenuePlan` на реальных таблицах — Июль 2026 через
  `api-v4` (29 дней), план выручки — 211 дней без единой ошибки.
- Логика `scheduleReminder` проверена на подставных датах: срабатывание при отсутствующей
  вкладке, дедуп в тот же день, сброс при появлении вкладки.

---

## [Unreleased] — 2026-06-30 · Спринт B (SaaS мультитенантность + провайдеры)

### 🏗 Архитектура

#### SEC-8: shared-DB мультитенантность + изолированные провайдеры интеграций

**Миграция БД (`db/004_multitenancy.sql`)**
- Новая таблица `tenants(tenant_id, name, status, created_at)` + seed `pivnaya_karta`.
- Новая таблица `tenant_integrations(tenant_id, kind, enabled, config JSONB)` + 4 интеграции для дефолтного тенанта.
- `ALTER TABLE kv_store` — добавлен `tenant_id`, PK переделан на `(tenant_id, key)`.
- `ALTER TABLE employee_bindings` — добавлен `tenant_id`, уникальность по `(tenant_id, name)`.
- `ALTER TABLE push_log / push_schedule / data_sources` — добавлен `tenant_id` + индексы.
- Миграция идемпотентна (`IF NOT EXISTS`, `ON CONFLICT DO NOTHING`).

**Secrets resolver (`src/config/secrets.js`)**
- `getTenantSecret(tenantId, name)` → `env[TID_UPPER_NAME]` → fallback `env[NAME]` только для `pivnaya_karta`.
- Валидация tenantId: только `[a-z0-9_]`, иначе throw — предотвращает prototype pollution через имена тенантов.

**DataAdapter (`db/adapter.js`)**
- Все методы kv/bindings/push теперь принимают `tenantId` первым аргументом.
- Новые методы: `listActiveTenants`, `getTenant`, `createTenant`, `getTenantIntegrations`, `setTenantIntegration`.

**Провайдеры интеграций (`src/providers/`)**
- `makeIikoClient({url,login,password})` — фабрика с замкнутым `_token/_tokenExpiry/_tokenPromise`.
- `makeMozgSyncClient({login,password})` — фабрика с замкнутым `_jar/_sessionExp`.
- `src/providers/{iiko,mozg,sheets,manualRevenue,index}.js` — реестр провайдеров; `createProviderRegistry(ctx)` создаёт изолированные инстансы по тенанту.
- Два тенанта не делят token-состояние и cookie-jar (гарантировано тестами).

**server.js — per-tenant persistence**
- `data = { tenants: {}, pushSettings: {}, adminUsers: [] }` + `getTenantData(tid)`.
- `data.kv` / `data.bindings` — шимы через `Object.defineProperty` → `pivnaya_karta` (back-compat для всех существующих роутов).
- `lastFlushed[tid]` — per-tenant dirty-tracking снимок.
- `flushToPG()` итерирует все тенанты; `hydrateFromPG()` загружает все активные тенанты из `listActiveTenants`.
- C1-реконсиляция при восстановлении PG: снимок загружается per-tenant.
- `buildTokenMap()` → `{ botToken → tenantId }` в памяти; пересчитывается при старте.

**JWT + middleware**
- `signToken` добавляет `tenantId` в payload.
- `requireAuth` извлекает `req.tenantId` (fallback `'pivnaya_karta'` для старых токенов без поля).
- Новый `requireTenant(tid)` — гейт на конкретный тенант в маршруте.
- `resolveTenantByInitData(initData, tokenMap, fallbackToken)` — определяет тенант по подписи Telegram initData.
- `/api/auth/telegram` использует `getTokenMap()` для мультибот-резолвинга тенанта.

**Новые API-роуты (WI-7)**
- `GET/PUT /api/integrations[/:kind]` — просмотр/редактирование интеграций тенанта; секреты не возвращаются и не принимаются.
- `POST /api/revenue/manual` — ручной ввод plan/fact/note; iiko-факт не перезаписывается.
- `GET/POST/POST /api/admin/data-sources[/sync]` — фильтрация по `tenant_id` из JWT.
- `GET /api/push/stats` — фильтрация лога по `tenantId` (back-compat: старые записи → `pivnaya_karta`).

**Скрипты и документация**
- `scripts/create-tenant.js` — CLI создания тенанта с инструкциями по env-переменным.
- `docs/deploy-multitenancy-runbook-2026-06-30.md` — пошаговый runbook применения 004 на прод (только ручное выполнение).

### 🧪 Тесты
- `tests/secrets.test.js` — 10 тестов resolver'а секретов.
- `tests/db.test.js` — 18 тестов адаптера с mock-pool (изоляция по tenantId).
- `tests/providers.test.js` — 19 тестов: изоляция iiko/mozg инстансов, контракт registry.
- `tests/integrations.test.js` — 12 тестов: GET/PUT интеграций, фильтрация, отсутствие секретов.
- Общий счёт: **176+ тестов, все зелёные**.

---

## [Unreleased] — 2026-06-29 · Спринт A (аутентификация и личность)

### 🔒 Безопасность

#### SEC-7: верификация Telegram identity + усиление паролей
- **Telegram initData verification** — новый `src/middleware/telegram.js` с
  `verifyInitData(initData, botToken)`: проверка подписи (HMAC-SHA256, секрет =
  `HMAC_SHA256("WebAppData", botToken)`) + свежесть `auth_date` (≤24ч, анти-replay).
- **POST /api/auth/telegram** — вход по подписанному initData: извлекает tg id,
  ищет привязку в `data.bindings`, выдаёт JWT с флагом `tgVerified:true`.
  Битая подпись / просрочено / непривязанный id → 403. Старый `/api/auth/login`
  оставлен как fallback для браузера.
- **Минимум пароля 3 → 8 символов** во всех точках (первый вход, смена пароля).
- **Гейт XP-операций**: начисление (`POST /api/quests/complete`) и списание
  (`POST /api/rewards/redeem`) теперь требуют `tgVerified` (новый middleware
  `requireTgVerified`) — пароль-вход из браузера их не получает.
- **IPv6-bypass лимита входа** закрыт: `loginLimiter` использует `ipKeyGenerator`
  (нормализация IPv6 /56) — раньше IPv6-юзер обходил лимит сменой младших бит.

### ✅ Тесты
- Новый `tests/telegram.test.js` (14): verifyInitData (валид/битый/чужой токен/
  просрочен/без hash), `/api/auth/telegram` (200/403×3/400), парольный fallback + min8.
- `tests/quests.test.js`: BAR-кука теперь `tgVerified`, добавлены негативные SEC-7
  (complete/redeem без tgVerified → 403). Прогон: 31 + 14 зелёные.

## [Unreleased] — 2026-06-23

### 🔒 Безопасность

#### SEC-1: JWT_SECRET — аварийная остановка в проде
**Проблема:** Если на сервере не задан `JWT_SECRET`, приложение запускалось с
публичным дефолтным ключом. Любой знающий этот ключ мог создать валидный токен
и войти под любым аккаунтом.

**Пример атаки:** `jwt.sign({ account: "manager" }, "dev-secret-CHANGE-IN-PROD...")` →
токен принимался сервером как настоящий.

**Фикс:** Добавлен `process.exit(1)` в `src/middleware/auth.js` при
`NODE_ENV=production` без `JWT_SECRET`.

---

#### SEC-2: Brute-force пароля — усилен rate-limit логина
**Проблема:** 5 попыток / 1 минута = до 7200 попыток/сутки с одного IP.
Для 3-значных паролей (мин. 3 символа) это реальный риск перебора.

**Пример:** `POST /api/auth/login` 5 раз → ждёшь 60с → ещё 5 → и так 24ч.

**Фикс:** Лимит изменён на 10 попыток / 15 минут (`src/api/auth.js`).
Итого: ~960 попыток/сутки — существенно меньше.

---

#### SEC-3: CSP заголовок
**Проблема:** `contentSecurityPolicy: false` — браузер не получал CSP.
При XSS атакующий мог загрузить внешний скрипт или сделать clickjacking.

**Фикс:** Включён базовый CSP в `server.js`:
- `object-src 'none'` — блокирует Flash/Java-плагины
- `base-uri 'self'` — блокирует инъекцию тега `<base>` (редиректы)
- `frame-ancestors` — только Telegram может встраивать приложение

---

#### SEC-4: KV PUT — whitelist чувствительных ключей
**Проблема:** Любой авторизованный барман мог `PUT /api/kv/tasks:v4` и
перезаписать все задачи, расписание, карточки нарушений.

**Пример:** `fetch('/api/kv/schedule:v1', {method:'PUT', body:'{"value":"[]"}'})` —
удаляет всё расписание на месяц.

**Фикс:** Добавлен `MANAGER_ONLY_KV` в `server.js`. Ключи `tasks:v4`,
`schedule:v1`, `cards:v1` и ещё 4 — только менеджер.

---

### 🎨 Интерфейс / Визуал

#### UI-1: Дашборд — убраны три громоздких чипа
**Было:** Три равнозначных кнопки «Часы / По дням / Кольца» занимали всю ширину
под заголовком — выглядело как вторая навигация.

**Стало:** Компактный переключатель «Список / Дни / Кольца» справа в заголовке.
Основное содержимое сразу видно, режим — вторичен.

---

#### UI-2: prefers-reduced-motion
**Проблема:** Все анимации (progress bar, ring, bar-fill) играли даже у
пользователей с настройкой «Уменьшить движение» (iOS: Настройки → Универсальный
доступ).

**Фикс:** Добавлен `@media (prefers-reduced-motion: reduce)` в `app.css` —
все `transition` и `animation` отключаются.

---

#### UI-3: Focus-visible стили
**Проблема:** Кнопки не имели видимого фокуса при навигации Tab/клавиатурой.
Для пользователей скринридеров и внешних клавиатур (iPad+BT) — интерфейс
был неприступен.

**Фикс:** Добавлен `focus-visible` outline в `app.css`.

---

#### UI-4: Ring — доступность (aria-label)
**Проблема:** SVG-кольца в дашборде не имели текстового описания.
Скринридер читал «изображение» без контекста.

**Фикс:** `Ring` принимает проп `label`, добавляет `role="img"` + `aria-label`.

---

#### UI-5: SwipeRow — подтверждение удаления
**Проблема:** Свайп влево → кнопка «Удалить» → задача удалялась мгновенно
без возможности отмены. Случайный свайп — потеря задачи.

**Фикс:** Добавлен `window.confirm` перед вызовом `onDelete`.

---

#### UI-6: CSS-токены пространства и типографики
**Проблема:** Магические числа (`gap:6`, `padding:"12px 16px"`, `fontSize:13.5`)
по всему коду — сложно поддерживать единый ритм.

**Фикс:** В `app.css` добавлены CSS-переменные:
- Пространство: `--sp-xs` (4px) → `--sp-xl` (24px)
- Типографика: `--fs-xs` (10px) → `--fs-xl` (24px)

---

### 🔍 Code Review — найдено и исправлено

#### REV-1: CSP connectSrc — убран wildcard `https:`
`connectSrc: ["'self'","wss:","https:"]` разрешал XSS экспортировать данные
на любой HTTPS-хост. Фронтенд обращается только к собственному /api/*,
поэтому `https:` заменён на `'self'`.

#### REV-2: BundleRecommendations — raw fetch → api.js
Компонент делал `fetch('/api/iiko/basket', {credentials:'include'})` напрямую,
минуя сервисный слой. Перенесено в `services/api.js` → `iikoBasket(force)`.
Теперь авторизация и base URL в одном месте.

#### REV-3: added Set не сбрасывался при force-reload
Кнопка «Обновить» пересчитывала пары, но старые «✓ В листе» оставались
для позиций с теми же именами. Фикс: `setAdded(new Set())` при `force=true`.

#### REV-4: totalOrders/totalChecks — путаница имён в iiko.js
Внутренняя переменная `totalOrders` (чеки с 2+ блюдами) и возвращаемое поле
`totalOrders: totalChecks` (все чеки) делили одно имя — разные денотаты.
API теперь возвращает `totalChecks`; UI обновлён.

#### REV-5: dishRevEstimate — мёртвый код удалён
Объект для «будущей маржинальности» строился но никуда не передавался.
Удалён из iiko.js вместе с комментарием.

#### REV-6: Ring — role="progressbar" вместо role="img"
`role="img"` давал скринридеру только текстовый label без числового значения.
`role="progressbar"` + `aria-valuenow/min/max` передаёт процент явно.

---

### 📊 Аналитика выручки — комплексный фикс

#### AN-1: Месячный % больше не врёт (был 336%)
**Проблема:** `factPct = totalFact / totalPlan`, где `totalFact` — сумма факта по
ВСЕМ дням (23 дня = 5 077 171₽), а `totalPlan` — сумма плана только по дням
С планом (6 дней = 1 509 000₽). Разные знаменатели → 336% бессмыслица.

**Фикс (apples-to-apples):** % считается по дням где есть И план И факт —
один и тот же набор в числителе и знаменателе. Пример: 6 дней, факт/план ≈ 92%.

#### AN-2: Месячная цель (новая модель `month_plan:v1`)
**Проблема:** план вводился вручную по каждому дню — на практике заполнено
6 из 30 дней. Аналитика плана нерабочая.

**Решение:** новый KV-ключ `month_plan:v1` = { "YYYY-MM": число } — единая цель
на месяц, менеджер задаёт один раз в блоке аналитики («🎯 Цель месяца»).
Если задана — % считается от неё; если нет — fallback на дни с планом.
Ключ добавлен в `MANAGER_ONLY_KV` (писать может только менеджер).

#### AN-3: Честный % в середине месяца
**Проблема:** `totalFact / monthPlan` в середине месяца занижает —
23 дня факта против цели на 30 дней выглядят как «недовыполнение».

**Фикс:** подпись «прошло 24 из 30 дней» рядом с %. Плоский прогноз
НЕ показываем — выручка бара зависит от дня недели (пт/сб ≫ пн).

#### AN-4: Выручка по дням видна в календаре
**Проблема:** ячейка показывала % только если есть И план И факт.
После бэкфилла большинство дней имеют факт без плана → пустой календарь.

**Фикс:** факт показывается ВСЕГДА когда есть (компактно: «127к»).
Цвет по % если план задан, нейтральный иначе. % — мелким сверху.

#### AN-5: Средний чек — тот же класс бага что AN-1
**Проблема:** `avgCheck = totalFact(все дни) / totalGuests(дни с гостями)` —
дни с фактом но без данных гостей завышали числитель → завышенный чек.

**Фикс:** средний чек считается по дням где есть И факт И гости (один набор).

---

### Предыдущие сессии

- `3b3c4a5` — TodayTab UI overhaul (carousel, accordion, display preferences)
- `0b450bf` — Previously deployed changes committed
- `77a738c` — Calendar UI cleanup
