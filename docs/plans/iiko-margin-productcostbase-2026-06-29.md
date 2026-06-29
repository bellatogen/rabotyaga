# Маржинальность меню: диагностика отсутствия ProductCostBase — план

## Goal
Разобраться, почему iiko не отдаёт себестоимость (`ProductCostBase`) для раздела «Маржинальность меню», и **довести авто-маржу из iiko до рабочего состояния** (приоритетный путь — решено с заказчиком). Ручной fallback-список оставляем как страховку, не как цель. Фича уже целиком построена — нужен диагностический разбор причины и точечные улучшения, а не новая функциональность.

**Зафиксировано с заказчиком:** доступ к админке iiko есть → диагностику можно делать напрямую. Среда, где видно предупреждение, пока не ясна (прод/локально) → определяется в Item 1.

## Background

### Фича уже существует целиком (бэк + фронт + хранилище)
Картинка в задаче — текущее рабочее состояние UI, не макет нового. Предупреждение про `ProductCostBase` — закодированное поведение fallback, а не баг рендера.

**Бэкенд — `rabotyaga-bot/src/api/iiko.js`:**
- `getMarginData(data, saveData)` — `iiko.js:514`. Анализ маржи за 30 дней по всем блюдам.
- OLAP-запрос: `aggregateFields: ['DishDiscountSumInt','DishAmountInt','ProductCostBase.ProductCostBase']`, `groupByRowFields: ['DishName']` — `iiko.js:538`.
- Детектор отсутствия поля — `iiko.js:550-556`: если `!res.ok` и текст ответа содержит `'ProductCostBase'` или `'Unknown OLAP field'` → `hasCost=false`, повтор запроса без cost-поля.
- Расчёт: `cost = ProductCostBase.ProductCostBase`; `margin = (hasCost && cost>0) ? round((revenue-cost)/revenue*100) : null` — `iiko.js:576-578`.
- Флаг результата: `hasMarginData = hasCost && items.some(i => i.margin != null)` — `iiko.js:590`. Кэш `margin_data:v1`, TTL 24ч.
- Тот же ProductCostBase + fallback в basket-анализе — `iiko.js:354-355, 367-368, 402-403`.
- Единственный iiko-эндпоинт во всём бэке — `POST /resto/api/v2/reports/olap`. Авторизация `sha1(password)` → Bearer-token.

**API-роут — `rabotyaga-bot/server.js`:**
- `GET /api/iiko/margin-data` (`requireAuth`) — `server.js:476`. `?force=1` чистит кэш (`server.js:477`) и пересчитывает.
- KV-ключи: `margin_data:v1` (авто-кэш), `margin_items:v1` (ручной список, только менеджер), `margin_threshold:v1` (порог %) — `server.js:51-53`.
- **Отдельного `/api/iiko/margin-sync` нет** — «Синхронизировать из iiko» = `GET /iiko/margin-data?force=1`.

**Фронт — `frontend/src/AdminTab.jsx`** (раздел `sub === 'menu'`, ~строки 565-700):
- Кнопка «Синхронизировать из iiko» → `iikoMarginData(force)` (`frontend/src/services/api.js:301` → `GET /iiko/margin-data?force=1`).
- Таблица блюд `margin% + выручка`, слайдер порога 30–90% (`saveThreshold`), ручной fallback-список (`margin_items:v1`).
- Текст предупреждения при `hasMarginData=false` — `AdminTab.jsx:655`.

**«Умные соты» (HoneycombGrid) потребляют маржу:**
- `getSalesABC` читает `margin_data:v1` (авто) либо `margin_items:v1` (ручной) → флаг `isMargin` (🟡) на блюде — `iiko.js:711-712`. То есть качество авто-маржи влияет не только на AdminTab, но и на подсветку сот в TodayTab.

### Ключевой нюанс: у предупреждения ДВА корня, логи их не различают
1. **iiko 4xx** «Unknown OLAP field / ProductCostBase» → лицензия/версия/конфиг OLAP не отдаёт поле → `hasCost=false`.
2. **iiko 200 OK, но `cost=0`** для всех блюд (нет техкарт / закупочных цен в номенклатуре) → все `margin=null` → `hasMarginData=false`.
Оба пути дают одинаковое UI-предупреждение. Сейчас нельзя по логам/ответу API понять, какой именно случай. Это главный диагностический пробел.

### Что НЕ покрыто
- `getMarginData` / ветка ProductCostBase **не покрыты тестами** — `rabotyaga-bot/tests/iiko.test.js` тестирует только fallback `GuestNum` (`iiko.test.js:165-167, 302-304`).
- Нет документа «поддерживает ли наша версия/лицензия iiko поле ProductCostBase в OLAP».
- АПИ `margin-data` не возвращает причину отсутствия маржи (4xx-поле vs нулевая себестоимость vs нет продаж) — фронт не может показать точную подсказку.

### Сверено критикой (важные граничные случаи)
- `iiko.js:577` `if (!name || revenue <= 0) continue;` выкидывает строки без выручки ДО расчёта маржи. При 200 OK исходов три, не два: (а) блюда есть, у всех `cost=0` → действительно нет техкарт; (б) `items=[]` (нет продаж за 30д) — ЭТО НЕ «нет техкарт». Нельзя схлопывать их в один `reason`.
- `iiko.js:590` `items.some(margin != null)` → одно блюдо с cost даёт `hasMarginData=true`, хотя таблица полупустая (частичная себестоимость вероятна для бара). Без счётчика покрытия Item 5 не имеет сигнала «сколько блюд осталось завести».
- `server.js:475` коммент говорит `requireManager`, код — `requireAuth`. Рассинхрон всплывёт при правке Item 2 — решить явно.

## Approach
Фича построена — работаем **диагностикой, не стройкой**. Новый UI не нужен. Порядок продиктован тем, что стратегия (авто-маржа vs ручной список) зависит от ответа на один вопрос: способна ли наша iiko в принципе отдать себестоимость.

1. **Сначала различить два корня** предупреждения (4xx «поле недоступно» vs 200 с `cost=0`). Это разблокирующий шаг — всё ниже зависит от результата.
2. **Инструментировать бэк**, чтобы он сам различал причину и отдавал её в API (`reason`), а не только булев `hasMarginData`.
3. **Прокинуть причину в UI** — предупреждение должно называть точную причину и конкретное действие.
4. **Закрыть тестами** непокрытую ветку `getMarginData`.
5. **Зафиксировать стратегию** по результату шага 1: если cost доступен — довести данные в iiko и оставить авто первичным; если нет — сделать ручной список первичным путём.

## Work Items

### Item 1 — Диагностика корня (развилка, делать первым)
**Goal:** точно определить, какой из двух случаев у нас — iiko не поддерживает поле, или поддерживает но себестоимость не заведена; и в какой среде вообще воспроизводится предупреждение.
**Done when:** зафиксировано (в `docs/investigations/`):
- среда воспроизведения: смотрит ли наблюдаемый сервер на живую iiko или на `data.json`-fallback (проверить наличие/валидность iiko-кредов в env, см. авторизацию `iiko.js`);
- на живой iiko запрос с `ProductCostBase.ProductCostBase` возвращает либо 4xx «Unknown OLAP field», либо 200 OK с нулевым `cost`;
- в админке iiko (доступ есть) проверено: а) отдаёт ли OLAP-лицензия поле себестоимости; б) заведены ли закупочные цены/техкарты у блюд.
**Key files:** ручной `curl` к `POST /resto/api/v2/reports/olap` по образцу тела из `iiko.js:537-539`; греп прод-логов на `'[iiko/margin] ProductCostBase не поддерживается'` (`iiko.js:555`).
**Dependencies:** нет — доступ к админке iiko подтверждён.
**Size:** S.

### Item 2 — Инструментировать getMarginData причиной
**Goal:** бэк различает «поле не поддерживается» / «себестоимость не заведена» / «ок» и сообщает это.
**Done when:** `getMarginData` возвращает детерминированный `reason` рядом с `hasMarginData`, по чётким критериям (чтобы UI не соврал):
- `field_unsupported` — iiko ответил 4xx «Unknown OLAP field / ProductCostBase» (`iiko.js:553`);
- `no_sales` — 200 OK, но `items.length === 0` (нет продаж за 30д, после фильтра `revenue<=0` на `iiko.js:577`);
- `no_cost_data` — `hasCost && items.length > 0 && items.every(i => i.margin == null)` (блюда есть, ни у одного нет cost → не заведены техкарты);
- `partial` — часть блюд с маржой, часть без;
- `ok` — у всех блюд есть маржа.
Дополнительно в result: `coveredCount` (сколько блюд с `margin != null`) и `totalCount` — сигнал покрытия для `partial`/Item 5. `GET /api/iiko/margin-data` пробрасывает `reason` + счётчики в JSON. Лог различает случаи.
**Key files:** `iiko.js:550-591` (ветка fallback + сборка result, особенно фильтр `:577` и флаг `:590`), `server.js:476-483`. Попутно исправить рассинхрон коммента `requireManager` vs кода `requireAuth` на `server.js:475` (выбрать верный гейт явно).
**Dependencies:** нет (кодить можно параллельно Item 1; Item 1 валидирует, что reason соответствует реальности).
**Size:** M.

### Item 3 — Прокинуть причину в UI
**Goal:** предупреждение говорит точную причину и действие вместо общей фразы.
**Done when:** AdminTab показывает разный текст под каждый `reason` (`field_unsupported` / `no_sales` / `no_cost_data` / `partial` / `ok`), с конкретным действием для каждого (точные формулировки — на усмотрение исполнителя); для `partial` показать `coveredCount/totalCount`. Ручной список остаётся доступен во всех случаях.
**Key files:** `AdminTab.jsx:655` и блок `sub === 'menu'` (~`565-700`), `api.js:301`.
**Dependencies:** Item 2 (поле `reason` в ответе API).
**Size:** S–M.

### Item 4 — Тесты на getMarginData
**Goal:** закрыть совсем непокрытую ветку маржи.
**Done when:** `tests/iiko.test.js` покрывает все ветки `reason`: happy path (`cost>0` → `margin`, `reason='ok'`), 4xx `ProductCostBase` → `hasCost=false` + `reason='field_unsupported'`, 200 OK с `cost=0` → `reason='no_cost_data'`, пустой `items` → `reason='no_sales'`, часть блюд с cost → `reason='partial'` + верный `coveredCount`.
**Key files:** `tests/iiko.test.js` (паттерн мока OLAP-ответа из `iiko.test.js:165-167, 302-304`).
**Dependencies:** Item 2 (форма `reason`).
**Size:** M.

### Item 5 — Довести авто-маржу (приоритет) либо принять ручной fallback
**Goal:** реализовать приоритетный путь — рабочую авто-маржу из iiko; ручной список остаётся страховкой только если iiko объективно не может отдать cost.
**Done when (по результату Item 1):**
- `no_cost_data` (поле есть, цены не заведены) → завести закупочные цены/техкарты в iiko, повторить sync, убедиться что `hasMarginData=true` и таблица заполнилась. **Это основной ожидаемый путь к авто-марже.**
- `field_unsupported` (лицензия/версия OLAP не отдаёт поле) → проверить в админке/у iiko-вендора возможность включить поле; если нельзя — зафиксировать ограничение и сделать ручной список (`margin_items:v1`) первичным, авто-блок свернуть, подсветку «Умных сот» (`isMargin`) кормить из ручного списка.
**Key files:** админка iiko (закупочные цены); `iiko.js:711-712` (выбор источника в `getSalesABC`), `AdminTab.jsx` блок menu — только если падаем в ручную ветку.
**Dependencies:** Item 1.
**Size:** S (решение) + переменная реализация по ветке.

## Open Questions
- **Среда воспроизведения** предупреждения (прод с живой iiko / локально на `data.json`) — пока неизвестна, закрывается в Item 1. Это определяет, реальна ли проблема в проде или артефакт локальной среды без iiko-коннекта.
- _(Решено)_ Доступ к админке iiko — **есть**, диагностика прямая.
- _(Решено)_ Цель — **починить авто-маржу из iiko**; ручной список первичным делаем только если поле объективно недоступно на лицензии.

## References
- `rabotyaga-bot/src/api/iiko.js:514-595` — `getMarginData` + fallback
- `rabotyaga-bot/server.js:476-483` — `GET /api/iiko/margin-data`
- `frontend/src/AdminTab.jsx:565-700` — раздел «Маржинальность меню»
- `frontend/src/services/api.js:301` — `iikoMarginData`
- `rabotyaga-bot/tests/iiko.test.js` — текущие iiko-тесты (без margin)
- iiko OLAP API: поле `ProductCostBase.ProductCostBase` (себестоимость)
