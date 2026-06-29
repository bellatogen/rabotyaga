# Срез 1: «Кокпит кранов» — план

Маржинальный калькулятор по розливу (21 кран). Full-stack срез. ВНЕ скоупа: остатки кегов, заказы поставщикам, переговоры, аналитика поставщиков (Срезы 2–3). Auth не трогаем.

## Соглашения репозитория (изучено)
- **Бэк-роуты**: `module.exports = function makeXRouter(data, saveData)` (см. `src/api/quests.js`). Монтируются в `server.js` ~L318 рядом с quests/rewards/xp.
- **Хранилище**: всё в `data.kv['ключ:v1']` как JSON-строки (PG-backed). Никаких top-level `data.*`. См. `src/quests/model.js`: `readKV/writeKV`, `ensure*Model`, один `saveData()` после всех мутаций.
- **Middleware**: `requireAuth`, `requireManager` из `src/middleware/auth.js`.
- **IIKO**: OLAP группирует по `DishName` (GUID продукта в коде нет). Хелпер `fetchDishCounts(from,to,token)` → `{counts:{dishName:count}, cats}`. Окно 30 дней — см. `getMarginData` (`nowMs = Date.now()+3ч`, from = now-30д).
- **Фронт**: монолит `App.jsx`. Массив `tabs` (~L443) + блоки `{tab==="x" && <Comp/>}`. `setTab(id)`. Страницы в `frontend/src/pages/`. Гейты: `isManager` (manager/developer), `isChef` (head_barman role). API-клиент `services/api.js` (fetch + `credentials:'include'`).

## Модель данных
KEYS: `taps:v1` (массив), `tap_config:v1` (объект).
```
tap: { id, position(1..21), name, ownership:"own"|"external", price, cost,
       discountApplies:bool, salesPerMonth:number|null, iikoProductId:string|null,
       isAnchor:bool, isStrategicHold:bool, newPrice:number|null }
config: { greenThreshold:70, yellowThreshold:60, discountRate:0.055 }
```

## computeTap(tap, config) — ЕДИНЫЙ источник формул (бэк + фронт)
```
factPrice    = discountApplies ? round(price*(1-discountRate)) : price
marginMenuRub= price - cost;            marginMenuPct = (price-cost)/price*100
marginFactRub= factPrice - cost;        marginFactPct = (factPrice-cost)/factPrice*100
marginPerMonth = marginFactRub * salesPerMonth   (salesPerMonth==null → 0/null)
если newPrice задан:
  newFactPrice = discountApplies ? round(newPrice*(1-discountRate)) : newPrice
  newMarginFactPct, newMarginFactRub
  deltaYear  = ((newFactPrice-cost) - marginFactRub) * salesPerMonth * 12
иначе deltaYear = 0
```
**Канон**: создать в `rabotyaga-bot/src/taps/compute.js` (CommonJS, `module.exports`). На фронте — `frontend/src/utils/tapCompute.js` ЗЕРКАЛО (ESM export) с шапкой-комментарием «Держать синхронно с rabotyaga-bot/src/taps/compute.js». Логика байт-в-байт. (Раздельные npm-пакеты frontend/ и rabotyaga-bot/ — прямой импорт через границу не делаем.)

## Рекомендация (по marginFactPct)
- `>= green(70)`: «Держать, искать объёмную сделку»
- `>= yellow(60) и < green`: «Норма — можно тихо поднять»
- `< yellow(60)`: «Низко — поднять цену / сбить С/С»
  - `+ ownership=own`  → " (через трансфертную цену)"
  - `+ ownership=external` → " (цена за объём / 10+1 / ретробонус)"
- Модификаторы:
  - `isAnchor` → добавить " · якорь: малый шаг, следить 2 нед"
  - `isStrategicHold && marginFactPct<60` → ЗАМЕНИТЬ нудж на «Стратегический холд — маржа ниже нормы осознанно»
- Цвет бейджа 🟢/🟡/🔴 по тем же порогам. computeTap возвращает `{...вычисления, recommendation, badge}`.

- [x] Item 2 завершён — tapCompute.js (зеркало), api.js (7 функций), TapsTab.jsx, App.jsx (вкладка+гейт+рендер). vite build зелёный.

## Item 1 — Бэкенд (роут + модель + computeTap + миграция + TAPS_API.md)
**Файлы**: `src/taps/compute.js` (нов), `src/taps/model.js` (нов), `src/api/taps.js` (нов), `server.js` (монтаж), `scripts/migrate-taps.js` (нов), `TAPS_API.md` (нов).
**Эндпоинты** (роут `/api/taps`):
- `GET /taps` — список с вычисленными полями (computeTap) + рекомендация.
- `POST /taps` · `PUT /taps/:id` · `DELETE /taps/:id` — CRUD.
- `GET /taps/config` · `PUT /taps/config`.
- `POST /taps/refresh-sales` — для кранов с `iikoProductId` тянет продажи за 30 дней из IIKO в `salesPerMonth`; краны без маппинга НЕ трогает. Использовать `fetchDishCounts` (или экспортировать новый хелпер из `iiko.js`); `iikoProductId` сопоставлять с `DishName` (в коде iiko другого ключа нет — если решишь иначе, обоснуй).
**Гейт**: GET — `requireAuth`; мутации — `requireAuth` (шеф-бармен ДОЛЖЕН иметь запись; `requireManager` исключит шефа — НЕ использовать его на мутациях, либо проверь, что шеф проходит). Подтверди по `middleware/auth.js`.
**Модель**: `ensureTapModel(data, saveData)` сидирует `tap_config:v1` дефолтами; `taps:v1` сидируется миграцией (не авто-сид 21 позиции при старте — как в спринте 2 через скрипт). Решение по авто-сидированию config — на усмотрение, но безопасно/идемпотентно.
**Миграция** (`scripts/migrate-taps.js`, по образцу `scripts/migrate-quests.js`): засеять `tap_config:v1` дефолтами и `taps:v1` сидом из 21 позиции (id генерировать, `iikoProductId=null`, `isStrategicHold=false`, `newPrice=null`). Бэкап `.bak`, идемпотентно.
**Сид (21 кран)** — см. исходный промпт оркестратора (positions 1..21).
**TAPS_API.md**: curl-референс по всем эндпоинтам (как `QUEST_API.md`), на русском.
**Done when**: все 7 эндпоинтов работают, computeTap канон создан, роут смонтирован в server.js, миграция сидит 21 кран + config, TAPS_API.md есть. Тест миграции прогнать (node scripts/migrate-taps.js).

- [x] Item 1 завершён — compute.js/model.js/taps.js/migrate-taps.js/TAPS_API.md готовы, роут смонтирован, миграция села 21+config, тесты зелёные. Гейт: ВСЕ роуты requireAuth (requireManager исключил бы шефа — у head_barman нет своего auth-аккаунта, роль в profiles:v1). refresh-sales: новый экспорт getDishSalesCounts(from,to) в iiko.js, iikoProductId↔DishName, окно 30д.

## Item 2 — Фронтенд (экран «Краны»)
**Файлы**: `frontend/src/pages/TapsTab.jsx` (нов), `frontend/src/utils/tapCompute.js` (нов, ЗЕРКАЛО `rabotyaga-bot/src/taps/compute.js` — скопировать computeTap байт-в-байт, перевести в ESM `export`), `frontend/src/services/api.js` (доб. функции taps*), `frontend/src/App.jsx` (вкладка + гейт + рендер-блок).
**Гейт**: вкладка «Краны» видна только `isChef || isManager`. Добавить в массив `tabs` (~L443) условно, и рендер-блок `{tab==="taps" && (isChef||isManager) && <TapsTab .../>}`.
**API-клиент** (`services/api.js`): `getTaps`, `createTap`, `updateTap`, `deleteTap`, `getTapConfig`, `updateTapConfig`, `refreshTapSales` — fetch с `credentials:'include'`, паттерн как существующие push*/iiko* функции.
**Экран** (мобильный, КАРТОЧКИ, не широкая таблица):
- Шапка: суммарная Маржа/мес, счётчики 🟢/🟡/🔴, кнопка «Обновить продажи из IIKO» (вызывает refresh-sales, потом перезагрузка), иконка настроек.
- Сортировка по умолчанию 🔴→🟡→🟢 (что требует действия — наверху). Доп.: по Маржа/мес, свои/чужие.
- Карточка: № + название + бейдж свой/чужой + бейдж рекомендации (🟢/🟡/🔴). Крупно: % факт, Прод/мес, Маржа/мес. Бейдж 🔗IIKO если `iikoProductId` задан.
- Тап → детали: цена, С/С, факт цена/маржа; СИМУЛЯТОР: поле «Новая цена» (`inputMode="decimal"`) → live новая %факт и Δ/год; переключатели `isAnchor`/`isStrategicHold`/`discountApplies`; правка `price`/`cost`/`salesPerMonth` (если нет IIKO-маппинга)/`iikoProductId`.
- Числовая клавиатура на числовых полях, без горизонтального скролла, крупные тап-таргеты.
- Настройки: `greenThreshold`, `yellowThreshold`, `discountRate` — редактируемые (PUT /taps/config).
**Все вычисления на фронте — через `tapCompute.js` (computeTap)**, не дублировать формулы инлайн.
**Done when**: вкладка «Краны» под гейтом, карточки + сортировка + детали + симулятор + настройки работают, refresh-sales кнопка дёргает бэк, computeTap зеркало синхронно с бэком.

- [x] Item 2 завершён — tapCompute.js (зеркало байт-в-байт, ESM), api.js (getTaps/createTap/updateTap/deleteTap/getTapConfig/updateTapConfig/refreshTapSales), TapsTab.jsx (карточки + сортировка 🔴→🟡→🟢 + детали + симулятор + переключатели + настройки), App.jsx (вкладка «Краны» под isChef||isManager). Vite build зелёный.
