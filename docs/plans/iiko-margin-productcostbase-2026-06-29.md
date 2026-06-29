# Маржинальность меню: диагностика отсутствия ProductCostBase — план

## Goal
Разобраться, почему iiko не отдаёт себестоимость (`ProductCostBase`) для раздела «Маржинальность меню», и решить стратегию: довести авто-маржу из iiko до рабочего состояния либо сделать ручной fallback-список первичным путём. Фича уже целиком построена — нужен диагностический разбор причины и улучшения, а не новая функциональность.

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
- Нет мониторинга случая «iiko молча вернул нули вместо 4xx».
- API `margin-data` не возвращает причину отсутствия маржи (4xx-поле vs нулевая себестоимость) — фронт не может показать точную подсказку.

## Open Questions
- Предупреждение видно в **проде с живой iiko** или в локальной среде на `data.json` без живого iiko-коннекта? (определяет, реальна ли проблема вообще)
- Есть ли доступ к админке iiko, чтобы проверить: а) включено ли поле себестоимости в OLAP-лицензии; б) заведены ли закупочные цены/техкарты у блюд?
- Цель — **починить авто-маржу из iiko** (если поле/данные в принципе доступны) или **сделать ручной список первичным** и довести его UX (если iiko cost недоступен на нашей лицензии)?

## References
- `rabotyaga-bot/src/api/iiko.js:514-595` — `getMarginData` + fallback
- `rabotyaga-bot/server.js:476-483` — `GET /api/iiko/margin-data`
- `frontend/src/AdminTab.jsx:565-700` — раздел «Маржинальность меню»
- `frontend/src/services/api.js:301` — `iikoMarginData`
- `rabotyaga-bot/tests/iiko.test.js` — текущие iiko-тесты (без margin)
- iiko OLAP API: поле `ProductCostBase.ProductCostBase` (себестоимость)
