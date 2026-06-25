# Миграция Работяги с data.json на PostgreSQL: План

## Goal

Подключить PostgreSQL как primary store для KV-данных и привязок сотрудников, сохранив in-memory объект `data` как горячий кеш, а `data.json` — как disaster-recovery fallback. API-контракт `/api/kv/:key` не меняется, frontend не трогаем.

## Background (находки разведки, file:line)

### Текущее состояние — код опередил исходную задачу
- `src/push/sender.js` **уже** factory: `module.exports = function makeSender(data, saveData)` (sender.js:198). 0 вызовов `loadData()`. Логи пушей → отдельный `push-log.json` через `fs.writeFileSync` (sender.js:8 `LOG_FILE`, запись sender.js:44). `saveData()` вызывается 1 раз (sender.js:170, в `updatePushSettings`).
- `src/push/scheduler.js` **уже** factory-стиль: `startScheduler(bot, data, sender, saveData)` (scheduler.js:237, экспорт scheduler.js:306). 0 `loadData()`. `saveData()` 1 вызов (scheduler.js:125, в `tickMacros`).
- **Решение пользователя**: фазы 3–4 исходной задачи (рефакторинг sender/scheduler) — НЕ переписывать заново, только проверить и довести недоделки (в частности перенос пуш-логов в PG).

### saveData() — server.js
- Объявление server.js:138: `function saveData()` — sync `fs.writeFileSync` внутри `setTimeout` (debounce 300мс). **Аргументов не принимает.**
- **35 вызовов** в server.js, все без аргументов (примеры: 159, 375 PUT /api/kv, 387 POST /api/bind). Передаётся как колбэк в makeSender/makeAdminApi/startScheduler (166, 170–171, 708).
- **Решение пользователя**: запись в PG через **dirty-tracking** — автоматически отслеживать изменённые ключи `data.kv` (не переписывать 35 вызовов на `saveData(changedKey)`).

### Загрузка при старте — server.js
- `DATA_FILE` server.js:26: `process.env.DATA_FILE || path.join(__dirname, 'data.json')`.
- Старт server.js:122–132: одноразовый `fs.readFileSync(DATA_FILE)` → `data = { kv, bindings, pushSettings, adminUsers }`. Отдельной функции `loadData()` нет.
- `KV_BLACKLIST` server.js:31: `new Set(['auth:v1'])`. Используется в `GET /api/kv/:key` (server.js:358) и `PUT` (server.js:367) → 403. `auth:v1` никогда не отдаётся/принимается через общий KV-эндпоинт, но в PG писаться должен (через saveData→adapter напрямую).

### db/adapter.js — уже написан, нигде не импортируется
- Singleton `new DataAdapter()`, все методы **async**.
- `kvGet(key)` → читает `kv_store.value` (TEXT as-is). `kvSet(key, value)` → upsert в `kv_store(key, value, updated_at)`, сериализация `typeof value === 'string' ? value : JSON.stringify(value)`.
- `getBindings()`, `bindEmployee(name, telegramId)` → `employee_bindings(name, telegram_id, ...)`.
- `logPush(...)` → таблица `push_log(employee_name, recipient_telegram_id, text, status, error_message, sent_at)`. `getPushLog(date)`.
- Также: getTasks/saveTask/task_completion/push_schedule — для будущего, в этой миграции не используем (KV остаётся сырым).

### db/pool.js
- pool.js:1–11: `new Pool({ connectionString: process.env.DATABASE_URL || 'postgresql://rabotyaga:changeme123@localhost:5432/rabotyaga' })`. DATABASE_URL используется, fallback — хардкод. **SSL-конфига нет. Обработки отсутствия переменной нет** (молча fallback). `pool.on('error')` только логирует.

### SQL-схемы (db/*.sql) — формы совпадают с adapter
- `kv_store` (001:3–8): `key VARCHAR(255) PK`, `value TEXT`, `created_at`, `updated_at`. ✅ совпадает с adapter (key/value).
- `employee_bindings` (001:37–46): `id UUID PK`, `name VARCHAR UNIQUE NOT NULL`, `phone`, `telegram_id BIGINT UNIQUE`, `telegram_username`, `role`, `active`, timestamps. ✅ adapter пишет name/telegram_id/active.
- Прочие 001: `tasks`, `task_completion`, `push_log`, `push_schedule`, `revenue_plan`, `shift_schedule`. 002: `data_sources`. 003: `user_theme_presets`, `global_theme_presets` (JSONB).
- ⚠️ `push_schedule` UNIQUE(schedule_date, scheduled_time, employee_id) (001:74) — adapter.js:77 вставляет `employee_name`, не `employee_id`. Потенциальный конфликт UNIQUE. В скоупе этой миграции push_schedule не используется — отметить как риск на будущее.

### admin.js — эталон factory-паттерна
- admin.js:7: `module.exports = function makeAdminRouter(data, saveData)`. Подключение server.js:171: `app.use('/api/admin', requireManager, makeAdminApi(data, saveData))`.

### Окружение / деплой
- На сервере есть orphan-контейнер `rabotyaga-postgres` (из прошлых попыток, уже не в compose). **Решение пользователя**: стартуем с чистого PG — в план включить шаг удаления orphan-контейнера/volume перед миграцией.
- Деплой: Timeweb Cloud, Docker, домен rabotyaga55.ru. Dockerfile двухстадийный (frontend + rabotyaga-bot).

### Решения пользователя (Up-front интервью)
1. sender/scheduler — проверить и довести (logPush в PG), не переписывать.
2. saveData → PG через **dirty-tracking** изменённых ключей.
3. Пуш-логи перенести из push-log.json в таблицу `push_log` через `adapter.logPush()`.
4. Чистый PG + удаление orphan-контейнера/volume в плане.

## Approach

PostgreSQL — primary store, in-memory `data` — горячий кеш, `data.json` — fallback. Минимум изменений в server.js, API-контракт неизменен.

### Dirty-tracking (ключевое решение)
Значения `data.kv[key]` — JSON-строки, мутация ключа = переприсваивание строки, поэтому deep-diff не нужен — достаточно **снимок-сравнения при flush**. (Имплементатор волен выбрать конкретную форму снимка; Proxy переусложнит, т.к. вложенных мутаций нет.)

- Держим `lastFlushed = { kv: {...снимок строк...}, bindingsJSON, pushSettingsJSON }` — что уже в PG.
- В debounce-колбэке (после записи файла) диффаем текущие `data.kv` со снимком → список изменённых **и удалённых** ключей. Изменённые → `adapter.kvSet(key, value)`. `auth:v1` попадает в dirty-set автоматически и пишется в PG напрямую (минуя /api/kv) — это и требуется.
- bindings → дельта через `adapter.bindEmployee()`; pushSettings → `adapter.kvSet('pushSettings:v1', ...)`.
- После успешного flush обновляем `lastFlushed`.

**Удаление (пред-требование к adapter).** Сейчас adapter.js НЕ умеет удалять: `kvSet(key, undefined)` запишет NULL, строка останется и «воскреснет» после рестарта; `DELETE /api/bind` не деактивирует binding (adapter фильтрует `active=true`, но никто не ставит `false`). Поэтому Item 5 включает пред-шаг: добавить `adapter.kvDelete(key)` и деактивацию/удаление binding. Имплементатор решает: реально ли ключи/привязки удаляются в рантайме (см. Open Questions) — если нет, удаление можно отложить, но dirty-tracking «включая удалённые» без этого нереализуем.

### Запись в PG — async, сериализованная, не блокирующая
`saveData()` остаётся sync (debounce, 0 правок в 35 вызовах). PG-запись идёт **внутри** debounce-колбэка как async с try/catch — ошибка PG логируется, файловый flush не падает.

**Сериализация флашей (обязательно).** Параллельные flush'и гоняются за `lastFlushed`: второй тик диффает против устаревшего снимка. Нужна одна in-flight PG-транзакция за раз — простой паттерн: `flushPromise = flushPromise.then(doFlush)` (цепочка промисов) либо флаг `flushing` с «грязным» повтором. `lastFlushed` обновляется только после подтверждённой записи.

### Старт сервера — PG-first с fallback
1. Инициализировать pool (pool.js: добавить понятный лог при отсутствии DATABASE_URL и опц. SSL для прод).
2. `try`: загрузить все KV-ключи + bindings + pushSettings из PG через adapter → лог `📂 Загружено N kv-ключей из PostgreSQL`. Заполнить `data` и `lastFlushed`.
3. `catch` (PG недоступен): откат на текущий `fs.readFileSync(DATA_FILE)` → лог `⚠️ PostgreSQL недоступен, работаю на data.json`. `lastFlushed` пустой → следующий flush «прогреет» PG когда поднимется (best-effort).
4. Флаг `PG_OK` гейтит PG-запись. **Должен быть двусторонним**, иначе «прогрев когда PG поднимется» невозможен: при PG_OK=false периодическая ретрай-проба (лёгкий `SELECT 1` раз в N сек) — при успехе PG_OK=true и следующий flush выльет весь текущий `data.kv` (lastFlushed пуст → все ключи «грязные»). Без ретрая прогрев не сработает — это не опция, а часть контракта fallback.

**Гонка на старте (bcrypt-IIFE).** server.js:147 — IIFE миграции auth дёргает `saveData()` рано. Если PG-загрузка станет async, этот flush может выполниться до того как `data` заполнится из PG → пустой data перезатрёт PG. Item 5 должен гарантировать: PG-загрузка и заполнение `lastFlushed` завершаются **до** любого saveData (включая bcrypt-IIFE) — либо завернуть стартовую последовательность в async-bootstrap, либо держать `data` загрузку синхронно-первой.

### Пуш-логи → PG
sender.js пишет лог в push-log.json (sender.js:44). Добавить `adapter.logPush(...)` рядом; передать `adapter` в `makeSender(data, saveData, adapter)`. Файл push-log.json остаётся как fallback (согласовано с принципом «файл = резерв»). Не плодить сложность переключателями «файл/PG/оба» — просто оба вызова подряд, оба в try/catch.

### Порядок развёртывания (критично)
Миграция данных (`migrate-from-json.js`) выполняется **до** первого старта сервера с включённым PG — иначе пустой PG перезатрёт data.json через flush. README фиксирует: deploy → `docker compose exec rabotyaga-bot node db/migrate-from-json.js` → restart.

## Work Items

### Item 1 — postgres в docker-compose + pool hardening
**Goal:** поднять сервис PostgreSQL рядом с приложением, гейтить старт приложения на healthcheck.
**Done when:** `docker compose up` поднимает `postgres` (16-alpine) healthy; `rabotyaga-bot` стартует через `depends_on: condition: service_healthy`; init-скрипты db/*.sql применяются на чистом volume; `.env.example` содержит `DATABASE_URL`; pool.js логирует понятно при отсутствии DATABASE_URL.
**Key files:** `rabotyaga-bot/docker-compose.yml`, `rabotyaga-bot/.env.example`, `rabotyaga-bot/db/pool.js:1-11`, `rabotyaga-bot/Dockerfile`.
**Dependencies:** нет.
**Size:** S.
**Коммит:** `feat: add postgres service to docker-compose`.

### Item 2 — db/migrate-from-json.js (идемпотентный)
**Goal:** одноразовый перенос data.json → PG без дублей.
**Done when:** скрипт читает DATA_FILE; `data.bindings` → `employee_bindings` (ON CONFLICT (name) DO NOTHING); все `data.kv` → `kv_store` сырым TEXT (ON CONFLICT (key) DO NOTHING); `data.pushSettings` → `kv_store['pushSettings:v1']`; печатает статистику вставок по таблицам; повторный запуск не дублирует и не падает; число ключей в kv_store == числу ключей data.kv.
**Key files:** `rabotyaga-bot/db/migrate-from-json.js` (новый), `rabotyaga-bot/db/adapter.js`, `rabotyaga-bot/db/001_initial_schema.sql`.
**Dependencies:** Item 1 (схема/таблицы).
**Size:** M.
**Коммит:** `feat: add db/migrate-from-json.js migration script`.

### Item 3 — проверить и довести sender.js (logPush в PG)
**Goal:** убедиться что sender.js без loadData()/fs.readFileSync для data; добавить запись пуш-логов в таблицу push_log.
**Done when:** sender.js не содержит `loadData()`/`fs.readFileSync` для data (подтверждено grep); `adapter.logPush(...)` вызывается рядом с записью в push-log.json; `makeSender` принимает adapter; server.js передаёт adapter; `/api/push/test/:name` → `{ success: true }`; запись появляется в таблице push_log.
**Key files:** `rabotyaga-bot/src/push/sender.js:44,170,198`, `rabotyaga-bot/db/adapter.js` (logPush), `rabotyaga-bot/server.js:166`.
**Dependencies:** Item 1.
**Size:** S.
**Коммит:** `fix: sender.js logs pushes to postgres push_log`.

### Item 4 — проверить scheduler.js
**Goal:** подтвердить отсутствие loadData()/fs-чтения; убедиться что saveData()-вызов корректно триггерит dirty-flush.
**Done when:** scheduler.js не содержит `loadData()`/`fs.readFileSync`; `tickMacros` пишет `data.kv['bot_macros:v1']` и вызывает `saveData()` → ключ попадает в PG; никаких прямых файловых записей помимо saveData.
**Key files:** `rabotyaga-bot/src/push/scheduler.js:125,237,306`, `rabotyaga-bot/server.js:708`.
**Dependencies:** Item 5 (dirty-tracking, чтобы проверить сквозной путь в PG) — функционально независим, но валидируется после Item 5.
**Size:** S.
**Коммит:** `fix: verify scheduler.js writes through saveData to postgres`.

### Item 5 — подключить adapter к server.js (старт + dirty-tracking saveData)
**Goal:** PG-first загрузка на старте с fallback на файл; dirty-tracking запись в PG при каждом flush.
**Done when:** на старте данные грузятся из PG (`adapter.kvGet`/`getBindings`) с логом `📂 Загружено N kv-ключей из PostgreSQL`; при недоступном PG — fallback на `fs.readFileSync` + лог-предупреждение, сервер не падает; `saveData()` остаётся без аргументов, его debounce-колбэк диффает снимок и пишет только изменённые ключи + bindings + pushSettings:v1 через adapter; ошибка PG-записи логируется, файловый flush не ломается; `auth:v1` пишется в PG напрямую, но остаётся в KV_BLACKLIST для /api/kv; данные переживают `docker compose restart`.
**Key files:** `rabotyaga-bot/server.js:26,31,122-132,138,358,367`, `rabotyaga-bot/db/adapter.js`, `rabotyaga-bot/db/pool.js`.
**Dependencies:** Item 1, Item 2.
**Size:** L.
**Коммит:** `feat: connect adapter.js to server.js startup and saveData()`.

### Item 6 — README + деплой-процедура
**Goal:** задокументировать setup PG, шаг миграции, удаление orphan-контейнера.
**Done when:** README описывает: переменную DATABASE_URL, `docker compose up`, первый деплой `docker compose exec rabotyaga-bot node db/migrate-from-json.js` ДО рестарта с PG, шаг удаления orphan `rabotyaga-postgres` контейнера+volume (`docker rm -f rabotyaga-postgres && docker volume rm <vol>`), чеклист проверки (COUNT kv_store, employee_bindings, restart-persistence).
**Key files:** `rabotyaga-bot/README.md` или корневой `README.md`.
**Dependencies:** Items 1–5.
**Size:** S.
**Коммит:** `docs: update README with postgres setup and migration steps`.

## Open Questions
- Двойная запись пуш-логов (файл + PG) — оставляю на переходный период (файл = fallback). Если решим только-PG, убрать `fs.writeFileSync` в sender.js:44 отдельным коммитом после стабилизации.
- SSL для прод-подключения к PG: внутри docker-compose сети не нужен; нужен только если PG вынесут на отдельный managed-хост Timeweb. Отметить, не реализовывать сейчас.
- push_schedule UNIQUE(schedule_date, scheduled_time, employee_id) vs adapter пишет employee_name (adapter.js:77) — вне скоупа KV-миграции, но баг существует; зафиксировать как отдельную задачу.

## References
- Исходная задача (KV-ключи, фазы, чеклист) — в промпте сессии.
- CLAUDE.md — правила хранения (KV primary в data.json, localStorage кеш), KV_BLACKLIST, версионирование ключей.
