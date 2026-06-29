# Редактор пушей: единый механизм управления уведомлениями

## Статус оркестрации (чеклист)
- [x] **Чанк A** — Items 1+2+3: `src/push/model.js`, `src/shift/status.js`, `src/shift/isToday.js`, `tests/shift.test.js`; server.js+scheduler.js переведены на модульный isToday; `ensurePushModel` в bootstrap после hydrateFromPG. Тесты зелёные.
- [x] **Чанк B** — Item 4: sender.js+scheduler.js переписаны на `push:v1`, `resolveAudienceNames`/`renderPush`/гейтинг, push-log несёт pushId+name, sendShiftClosedToManagers мимо гейта, мёртвый код удалён. `tests/push.test.js` (23). Легаси get/update/getAllPushSettings оставлены для Items 5/9.
- [x] **Чанк C** — Item 5: роуты `/api/push/defs` (CRUD+защита system), `/api/push/recipients/:name` (edge-trigger mute мимо гейта), `/api/push/stats` +byName; удалены `/admin/schedule`+`/admin/push-logs`; `api.js` переведён на push:v1; `tests/pushApi.test.js` (13). NB для Item 7: ослабить PUT recipients до requireAuth+self-check (by:'self' готов). NB Item 6: `public/admin.html` зовёт удалённый роут.
- [x] **Чанк D** — Items 6+7+8: всё в живой AdminTab.jsx (AdminPanel.jsx — orphan, не использовался). Вкладки Пуши(CRUD defs)/Логи(getPushStats byName)/Чаты/Макросы; колокольчик в TeamHubTab + self-toggle в PersonalCabinet; PUT recipients ослаблен до requireAuth+self-check. admin.html почищен. Тесты: фронт 33, бэк все зелёные.
- [x] **Чанк E** — Item 9: `/toggle_*` удалены; `/startpush`+`/stoppush`+`/pushsettings` переписаны на `push:v1.recipients`; тесты зелёные.
- [x] **Доуборка** — удалены мёртвые `get/update/getAllPushSettings` (sender.js), роуты `/api/push/settings|all` + глобальный `/api/push-settings` (server.js), фронт-вызовы `getPushLog/Schedule/Settings/savePushSettings` (api.js), orphan `AdminPanel.jsx` + смоук-кейс. Бэк 137/137, фронт 32/32. Оставлено живым: `admin.js → /push-settings` (для legacy `admin.html`), KV-ключи `push_settings:v1`/`data.pushSettings` (disaster-recovery).

Решения по открытым вопросам (зафиксированы для реализации): `/startpush`+`/stoppush` оставляем тонким fallback, пишущим в `recipients[name]`; `/toggle_*` удаляем. Items 3 и 8 остаются в скоупе этого спринта.

## Цель

Пересобрать разрозненную систему push-уведомлений в один механизм, которым управляющий рулит из UI: трекинг «кому что прилетало», создание/редактирование/удаление пушей как единой сущности (текст + расписание + получатели + правила по статусам), назначение пушей сотрудникам, макросы, отключение пушей у сотрудника (с уведомлением управляющему и значком-колокольчиком в карточках). Убрать рудименты.

## Контекст (карта текущего состояния)

### Где что лежит сейчас
Бэкенд: `rabotyaga-bot/`. Фронтенд: почти весь в `frontend/src` (модульная разбивка по pages/components/modals/utils).

**Слой отправки** — `rabotyaga-bot/src/push/sender.js`:
- `sendDayBeforeShiftPush` (`sender.js:90`) — задачи на завтра, дефолт 20:00.
- `sendPersonalTasksPush` (`sender.js:102`) — задачи сегодня по `task.assignedTo`, матч через `data.bindings[name]`, 09:00.
- `sendCloseShiftPush` (`sender.js:116`) — чек-лист закрытия, 23:00.
- `sendSetsPush` (`sender.js:127`) — топ-3 пары напиток+закуска из iiko, 16:00, opt-out (`setRecommendations !== false`).
- `sendIndividualPush` (`sender.js:142`) — **МЁРТВАЯ**: экспортируется, нигде не вызывается, бот-команды нет. → удалить.
- `sendShiftClosedToManagers` (`sender.js:158`) — сводка менеджерам по `POST /api/push/shift-closed` (`server.js:543`), шлёт напрямую мимо `pushSettings.enabled`.
- `sendPush()` — единый чокпоинт: 3 ретрая с линейным backoff, пропуск ретрая на 403, лог каждой попытки в `push-log.json`.

**Планировщик** — `rabotyaga-bot/src/push/scheduler.js`:
- Тикает каждые 30с (`scheduler.js:259`), дедуп `sentToday[job]=today` в памяти, сброс в полночь МСК.
- `tickMacros` (`scheduler.js:101`) — отдельная рассылка в чаты по `bot_macros:v1` (once/daily/weekly/every_n).
- **НЕ читает `schedule:v1`** и **не учитывает статусы сотрудников** — все `enabled` получают всё. Привязки к болезни/отпуску нет.
- Локальная копия `isToday()` (`scheduler.js:52`) — одна из 4 дублей (UI `taskUtils`, `server.js`, scheduler, + упоминание в CLAUDE.md). → вынести в один модуль.

**API** — `rabotyaga-bot/src/api/push.js`, `rabotyaga-bot/src/api/admin.js`, `server.js`:
- `GET /api/push/stats` (`push.js:36`) — читает `push-log.json` напрямую, total/sent/failed/skipped + по юзерам. **Рабочий** источник логов.
- `admin.js:65/76` — `GET/POST /admin/schedule` пишет в устаревший `data.schedule` (хардкод 22:00). **Фронт (`api.js:183`) читает именно его** → устаревшие данные. → удалить.
- `admin.js:81` — `pushSender.getPushLogs` не существует → всегда `[]`. Фронт `getPushLog` (`api.js:177`) бьёт в `/admin/push-logs` → всегда пусто. → удалить.
- `GET/PUT /api/push-settings` (`server.js:676/680`) — глобальное расписание+шаблоны (`push_settings:v1`), кэш 60с в scheduler. **Правильный** источник.
- `POST /api/bind` / `DELETE /api/bind/:name` / `GET /api/bindings` (`server.js:507/517/527`) — привязка имя→telegramId в `data.bindings`.
- Бот-команды: `/startpush` (`server.js:749`, ставит все `notifications:true`), `/stoppush`, `/toggle_daybefore|personal|closeshift|individual`. → `/toggle_*` убрать (всё через UI).

### Два хранилища настроек (требуется слить)
- **`data.pushSettings`** — per-user, ключ = `telegramUserId`: `{ enabled, chatId, notifications:{...}, templates:{...} }`. Настраивается только бот-командами. PG-ключ `pushSettings:v1` (`server.js:185`).
- **`push_settings:v1`** (KV) — глобально: `{ jobs:{ dayBefore:{enabled,time}, ... }, templates:{...} }`.
- Эти два источника пересекаются по смыслу (шаблоны, включённость) и должны стать одной моделью.

### Модель сотрудников и статусов (для гейтинга по статусу)
- `getShiftStatus()` (`frontend/src/utils/staffUtils.js:36`) → статусы: вычисляемые `on_shift / today_shift / worked / tomorrow_shift / day_off` и override `sick / vacation / business_trip` (`frontend/src/constants/shifts.js:11`).
- `statusOverrides` — KV `status_overrides:v1`, `Array<{name,status,from,until}>` (грузится `App.jsx:108`, один override на имя).
- Профиль `profiles:v1`: `{ name, role, perms }` (`constants/locale.js:17`). Имя — ключ во всей системе. Связь с Telegram — отдельно в `data.bindings`.
- Роли/права: `roles.js`, `hasPerm` (`authUtils.js:16`); `isManager = who==="manager"||"developer"` (`App.jsx:169`).

### UI сейчас
- `AdminPanel.jsx` (только manager): вкладки «Логи пушей» (читает сломанный роут → пусто), «График пушей» (старый `/admin/schedule`), «Пуши» (push-editor, **правильно** пишет `push_settings:v1`), «Привязки», «Чаты бота», «Макросы» (`bot_macros:v1` CRUD).
- `PersonalCabinet.jsx` — про пуши **ничего**: сотрудник управляет только бот-командами.
- `TeamHubTab.jsx` — карточки сотрудников (состав, статусы, права, сброс пароля); сюда же просится значок-колокольчик вкл/выкл пушей.

### Требования из интервью (зафиксировано с пользователем)
1. **Единая модель пуша**: любой пуш = текст/шаблон + расписание + получатели + правила по статусам. 4 старых джоба → предустановленные записи той же модели (динамика `{tasks}`/`{sets}` через плейсхолдеры).
2. **Гейтинг по статусу — по-пушно**: каждый пуш задаёт, при каких статусах его НЕ слать. Контрольные кейсы: сотрудник на выходном (`day_off`) ВСЁ РАВНО получает личные пуши с @упоминанием и «за день до смены»; «закрытие смены» — только работающим.
3. **Отключение пушей сотрудником**: сотрудник сам вкл/выкл. При выключении — уведомление управляющему + значок-колокольчик во ВСЕХ карточках сотрудника по системе.
4. **Макросы** в чаты — оставить механизм, нужен рабочий редактор создания/редактирования.
5. **Зачистка рудиментов**: `sendIndividualPush`; сломанные роуты `admin.js`; слить `data.pushSettings`+`push_settings:v1`; дедуп `isToday()`; убрать бот-команды `/toggle_*`.

## Подход

Заменить две пересекающиеся структуры (`data.pushSettings` per-user + `push_settings:v1` глобально) и набор захардкоженных джобов **одной моделью** `push:v1`, где пуш — это декларативная запись (определение), а планировщик становится универсальным исполнителем этих записей. Динамика (списки задач, сеты) остаётся в коде как «источники контента», на которые ссылается запись через поле `contentSource` + плейсхолдеры. Гейтинг по статусу и адресация — данные внутри записи, а не ветвления в коде.

Главные опоры:
- **Единый KV-ключ `push:v1`** (новый суффикс), объект `{ defs, recipients }`. `defs` — массив определений пушей (CRUD из UI). `recipients` — per-сотрудник состояние вкл/выкл (ключ = `name`, не `telegramUserId`), чтобы управляющий рулил по имени и колокольчик читался по имени. Доставка резолвится через существующий `data.bindings` (`name → telegramId`).
- **Бэкенд-копия `getShiftStatus`** — планировщик должен вычислять статус получателя на дату из `schedule:v1` + `status_overrides:v1` (сейчас это только во фронте `staffUtils.js`). Логика статусов переносится на бэкенд как переиспользуемый модуль.
- **Per-push `suppressStatuses`** — массив статусов, при которых пуш данному человеку не уходит. Контрольные кейсы становятся данными: «личные @-задачи» и «за день до смены» имеют пустой/узкий `suppressStatuses` (доходят и на `day_off`), «закрытие смены» подавляется на `day_off/sick/vacation/business_trip`.
- **push-log как источник трекинга** — `push-log.json` уже пишет каждую попытку через `sendPush()`. Обогащаем записи `pushId` + `name`, отдаём срез «кому что прилетало» через рабочий `/api/push/stats`; сломанные `/admin/push-logs` и `/admin/schedule` удаляем.

Tradeoff (меняет путь): фронт и бэкенд — раздельные npm-пакеты с разными системами модулей (ESM vs CommonJS), поэтому **физически один файл `isToday()` на оба слоя невозможен**. «Дедуп» реализуем как: один канонический модуль на бэкенде (`server.js` + `scheduler.js` + `sender.js` импортируют его), фронт сохраняет свою копию, идентичность фиксируется общим тестом и комментарием-якорем. Это убирает 2 из 3 дублей и страхует от расхождения четвёртого.

### Контракт модели `push:v1`
```
{
  defs: [{
    id: string,                 // стабильный slug, у предустановленных — фиксированный
    title: string,
    enabled: boolean,
    system: boolean,            // предустановленные нельзя удалить, только править/выключить
    template: string,           // текст с плейсхолдерами {{имя}} {{дата}} {{день_недели}} {tasks} {sets}
    contentSource: "static" | "tasks_tomorrow" | "tasks_today_personal" | "sets" | "close_checklist",
    schedule: { time: "HH:MM", days: "daily" | number[] },  // days = индексы недели; пусто = ежедневно
    audience: "all" | { roles: string[] } | { names: string[] } | "assigned",
    suppressStatuses: string[]  // напр. ["sick","vacation","business_trip","day_off"]
  }],
  recipients: {                 // ключ = name
    [name]: { enabled: boolean, mutedAt: string|null, mutedBy: "self"|"manager"|null }
  }
}
```
Предустановленные `defs` (миграция 4 джобов): `day_before` (contentSource tasks_tomorrow, suppress пусто), `personal_tasks` (audience `assigned` + contentSource tasks_today_personal, suppress пусто), `close_shift` (close_checklist, suppress day_off+sick+vacation+business_trip), `sets` (sets, suppress по вкусу).

### Две ортогональные оси: `audience` (КОМУ) и `contentSource` (ЧТО)
Чтобы убрать дублирующую семантику `audience:"assigned"` vs `contentSource`:
- `audience` решает **состав получателей**: `all` = все имена из `profiles:v1` (ростер истины; `recipients` сидируется отсюда же), `{roles}` = по роли, `{names}` = явный список, `assigned` = только те, у кого сегодня есть задачи с `assignedTo === name`.
- `contentSource` решает **что подставить в `template`** для каждого получателя; «личный» источник вычисляется per-recipient.

**Таблица диспетчеризации `contentSource` (Item 4):**
| contentSource | fetch | плейсхолдер | per-recipient |
|---|---|---|---|
| `static` | — | — (только `{{имя}}/{{дата}}/{{день_недели}}`) | нет |
| `tasks_tomorrow` | `tasks:v4` ∩ `isToday(t, завтра)` | `{tasks}` | нет (общий список) |
| `tasks_today_personal` | `tasks:v4` где `assignedTo===name` ∩ `isToday(t, сегодня)` | `{tasks}` | да |
| `sets` | `iiko.pickDailySets` | `{sets}` | нет |
| `close_checklist` | статический чек-лист | — | нет |

### Служебные (не-модельные) пуши
`sendShiftClosedToManagers` (сводка закрытия) и уведомление управляющему «X отключил пуши» — **триггерные, не по расписанию, в `defs` не входят**. Оба идут **мимо** `recipients[name].enabled` и `suppressStatuses` (управляющий не должен mute’ить служебку). Адресацию managers+bindings выносим в общий резолвер `{roles}`, чтобы не плодить дубль.

### Сидирование `recipients` и миграция (контракт Item 1)
- `recipients` сидируется по всем именам из `profiles:v1`, дефолт `enabled:true`.
- Per-сотрудник — **один глобальный флаг** (а не карта по типам). Старые 4 тумблера `notifications.*` и opt-out `setRecommendations` при миграции **схлопываются осознанно**: `recipients[name].enabled = (старый pushSettings.enabled !== false)`. Гранулярность по типам намеренно выпадает вместе с бот-командами `/toggle_*` — таргетинг теперь делает `audience`/`suppressStatuses`, а не персональные тумблеры.
- Обратный матч `id→name` (`sender.js:63`): нет привязки для имени → запись остаётся с дефолтом `enabled:true` (доставки всё равно не будет без bind — это не потеря); один `telegramId` на два имени → берётся первое, факт логируется. Старый `pushSettings[userId]` без резолва в имя → лог + дроп.

### Упрощение исполнителя (рекомендуемый путь)
Полная «декларативность контента» иллюзорна: `contentSource` — enum из 5 значений, перекодирующий 4 зашитых джоба + static; у `system`-defs он фиксирован, switch остаётся. Реальная новизна продукта — `suppressStatuses` + `recipients` + статус-гейтинг, **не** генеричность контента. Поэтому Item 4 строит **общий слой гейтинга/расписания/аудитории** поверх существующих 4 хэндлеров контента (выбор через switch по `contentSource`), а CRUD правит только `enabled/template/schedule/audience/suppressStatuses`. Не переписываем сборку контента в «движок шаблонов».

## Work Items

### Item 1 — Модель `push:v1` + миграция хранилищ
**Цель:** ввести единый KV-ключ `push:v1` и одноразовую миграцию из `data.pushSettings` + `push_settings:v1`.
**Готово когда:** при старте сервера, если `push:v1` отсутствует, он собирается по правилам из раздела «Сидирование `recipients` и миграция» (ростер из `profiles:v1`; `enabled` схлопывается из старого `pushSettings.enabled`; политика обратного матча `bindings` соблюдена с логом дропов); расписание/шаблоны → 4 предустановленных `defs`; старые ключи больше не читаются кодом доставки; новый ключ читается/пишется через KV-адаптер (data.json и PG).
**Ключевые файлы:** `rabotyaga-bot/server.js` (загрузка KV, ~`:185`), `rabotyaga-bot/db/adapter.js`, новый `rabotyaga-bot/src/push/model.js` (схема + дефолты + миграция).
**Зависимости:** нет (первый).
**Размер:** M.

### Item 2 — Бэкенд-модуль статусов сотрудников
**Цель:** перенести расчёт `getShiftStatus(name, date)` на бэкенд для гейтинга по статусу.
**Готово когда:** есть модуль, читающий `schedule:v1` + `status_overrides:v1` и возвращающий тот же набор статусов, что фронтовый `staffUtils.js` (`on_shift/today_shift/worked/tomorrow_shift/day_off/sick/vacation/business_trip`); покрыт тестом на ключевые кейсы (override перекрывает расписание, day_off, today/tomorrow).
**Ключевые файлы:** новый `rabotyaga-bot/src/shift/status.js`; эталон — `frontend/src/utils/staffUtils.js:36`, `frontend/src/constants/shifts.js:11`.
**Зависимости:** нет (параллельно Item 1).
**Размер:** M (перепроверить до старта: тянет ли `getShiftStatus` времена смен/`HOLIDAYS`/`EMBEDDED_EVENTS` из фронт-констант — если да, добавить порт констант, оценка растёт до L). Примечание: сам `getShiftStatus` опирается на `schedule`+`overrides`, праздники нужны для `staffNorm`, не для статуса — но проверить транзитивные импорты.

### Item 3 — Единый модуль `isToday` на бэкенде
**Цель:** убрать дубли `isToday()` в `server.js` и `scheduler.js`.
**Готово когда:** один модуль импортируется в `server.js`, `scheduler.js`, `sender.js`; поведение бот-команд `/today`/`/mytasks` и планировщика не изменилось; фронтовая копия помечена комментарием-якорем и покрыта общим по смыслу тестом на идентичность правил.
**Ключевые файлы:** новый `rabotyaga-bot/src/shift/isToday.js`; `server.js`, `src/push/scheduler.js:52`; эталон `frontend/src/utils/taskUtils.js`.
**Зависимости:** нет; желательно до Item 4.
**Размер:** S.

### Item 4 — Универсальный исполнитель пушей (sender + scheduler)
**Цель:** переписать доставку под единую модель с per-push статус-гейтингом; удалить мёртвый код.
**Готово когда:** планировщик итерирует `defs`, по `schedule` определяет «пора ли», строит аудиторию по `audience`, для каждого получателя резолвит `bindings` + проверяет `recipients[name].enabled` и `getShiftStatus ∉ suppressStatuses`, рендерит `template` по таблице диспетчеризации `contentSource` (см. Подход); `sendIndividualPush` удалена; `isToday` из Item 3; запись в `push-log.json` содержит `pushId` и `name`; `sendShiftClosedToManagers` сохранён и переведён на общий резолвер `{roles}`, идёт мимо гейта `recipients/suppressStatuses` (служебный). Контент НЕ переписываем в движок шаблонов — общий слой гейтинга поверх существующих 4 хэндлеров (см. «Упрощение исполнителя»).
**Ключевые файлы:** `rabotyaga-bot/src/push/sender.js`, `rabotyaga-bot/src/push/scheduler.js`.
**Зависимости:** Items 1, 2, 3.
**Размер:** L.

### Item 5 — API редактора + уведомление об отключении
**Цель:** REST для CRUD пушей и переключения получателей; удаление сломанных роутов; пуш управляющему при mute.
**Готово когда:** есть `GET/PUT /api/push/defs` (CRUD `defs`, запрет удаления `system`), `PUT /api/push/recipients/:name` (вкл/выкл, проставляет `mutedAt/mutedBy`); уведомление управляющему — **edge-trigger прямо в обработчике этого эндпоинта** при смене `enabled` true→false (request-driven, без хранения «последнего состояния», переживает рестарты), шлёт всем `role=manager` с `bindings` мимо общего гейта; `GET /api/push/stats` отдаёт срез по сотруднику; роуты `/admin/schedule` и `/admin/push-logs` и зависящий мёртвый код в `admin.js` удалены.
**Ключевые файлы:** `rabotyaga-bot/src/api/push.js`, `rabotyaga-bot/src/api/admin.js`, `rabotyaga-bot/server.js`, `frontend/src/services/api.js` (перевод вызовов на новые роуты).
**Зависимости:** Item 1; для уведомления — Item 4 (`sendPush`).
**Размер:** M.

### Item 6 — UI: редактор пушей в AdminPanel
**Цель:** заменить разрозненные push-вкладки одним редактором единой модели.
**Готово когда:** список `defs` с CRUD (создать/править/удалить не-system), редактирование `template`/`schedule`/`audience`/`suppressStatuses`/`enabled` с подсказкой плейсхолдеров; вкладка логов читает рабочий `/api/push/stats` (а не пустой `/admin/push-logs`); вкладка «График пушей» (`/admin/schedule`) убрана; «Привязки» и «Чаты бота» сохранены.
**Ключевые файлы:** `frontend/src/pages/AdminPanel.jsx`, `frontend/src/services/api.js`.
**Зависимости:** Item 5.
**Размер:** L.

### Item 7 — UI: колокольчик в карточках + self-toggle
**Цель:** видимость и управление вкл/выкл пушей по сотруднику.
**Готово когда:** значок-колокольчик (вкл/выкл) рендерится во всех карточках сотрудника (как минимум `TeamHubTab`), читая `recipients[name].enabled`; управляющий может переключать; в `PersonalCabinet` сотрудник сам вкл/выкл свои пуши (замена бот-команд как основного пути).
**Ключевые файлы:** `frontend/src/pages/TeamHubTab.jsx`, `frontend/src/pages/PersonalCabinet.jsx`, `frontend/src/services/api.js`.
**Зависимости:** Item 5.
**Размер:** M.

### Item 8 — Редактор макросов в чаты
**Цель:** рабочий UI создания/редактирования макросов (`bot_macros:v1`), механизм рассылки не трогаем.
**Готово когда:** в AdminPanel можно создать/править/удалить макрос (текст + чат + расписание once/daily/weekly/every_n); `tickMacros` (`scheduler.js:101`) работает без изменений контракта.
**Ключевые файлы:** `frontend/src/pages/AdminPanel.jsx`, `rabotyaga-bot/src/push/scheduler.js` (только чтение контракта).
**Зависимости:** нет (можно параллельно).
**Размер:** S–M.

### Item 9 — Зачистка бот-команд и финал
**Цель:** убрать рудиментарные бот-команды настройки, синхронизировать клиент.
**Готово когда:** команды `/toggle_daybefore|personal|closeshift|individual` удалены; `/startpush`/`/stoppush` либо удалены, либо оставлены как тонкий fallback, пишущий в `recipients` (решение — в Открытых вопросах); `frontend/src/services/api.js` не содержит вызовов удалённых роутов; тесты бэкенда зелёные (`cd rabotyaga-bot && npm test`), фронт-смоук зелёный.
**Ключевые файлы:** `rabotyaga-bot/server.js`, `frontend/src/services/api.js`, `rabotyaga-bot/tests/`.
**Зависимости:** Items 4, 5, 6, 7.
**Размер:** S.

## Открытые вопросы
- **Судьба `/startpush`/`/stoppush`** (блокирует только Item 9): удалить полностью или оставить тонким fallback, пишущим в `recipients[name]`. Остальные команды настройки (`/toggle_*`) удаляются однозначно.
- **Откладываемые без ущерба для основного скоупа** (можно вынести в отдельный мини-план): Item 8 (редактор макросов — независим от единой модели) и Item 3 (дедуп `isToday` — страховка тестом, не блокирует Item 4 если оставить временный локальный `isToday`). Решение — резать ли их из этого спринта.

_Разрешено по итогам критики (зафиксировано в Подходе, не открыто): сидирование `recipients` из `profiles:v1`; схлопывание per-тип тумблеров в один флаг; политика обратного матча `bindings`; `audience:"all"` = ростер `profiles:v1`; служебные пуши мимо гейта; дебаунс mute-уведомления = edge-trigger в эндпоинте._

## Ссылки
- CLAUDE.md — разделы «Push notifications», «Roles & permissions», «Shift status & staffing rules».
- `rabotyaga-bot/src/push/sender.js`, `scheduler.js`; `src/api/push.js`, `admin.js`; `server.js`.
- `frontend/src/pages/AdminPanel.jsx`, `TeamHubTab.jsx`, `PersonalCabinet.jsx`; `utils/staffUtils.js`; `constants/shifts.js`, `roles.js`.
