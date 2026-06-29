# Кокпит кранов — API (бэкенд)

Маржинальный калькулятор по розливу (21 кран). Срез 1. ВНЕ скоупа: остатки кегов,
заказы поставщикам, аналитика поставщиков (Срезы 2–3).

## Хранение
Версионные ключи в **`data.kv`** (PG-backed store, синкается в PostgreSQL — переживает редеплой):
- `taps:v1` — массив кранов;
- `tap_config:v1` — пороги/скидка `{ greenThreshold, yellowThreshold, discountRate }`.

`tap_config:v1` инициализируется автоматически при старте (`ensureTapModel`).
`taps:v1` сеется миграцией:

```bash
cd rabotyaga-bot
node scripts/migrate-taps.js     # идемпотентно, делает резервную копию data.json.bak
```

## Модель крана
```jsonc
{
  "id": "t1",
  "position": 1,                 // 1..21, порядок крана
  "name": "Дримтим Локал Лагер",
  "ownership": "own",            // "own" | "external"
  "price": 430,                  // цена в меню, ₽
  "cost": 110,                   // себестоимость, ₽
  "discountApplies": true,       // применять ли эквайринг/скидку к факт-цене
  "salesPerMonth": 1393,         // продаж/мес (или null — нет данных)
  "iikoProductId": null,         // имя блюда (DishName) в IIKO для refresh-sales, или null
  "isAnchor": false,             // якорная позиция
  "isStrategicHold": false,      // осознанно держим низкую маржу
  "newPrice": null               // симулятор: новая цена, ₽ (или null)
}
```

## Формулы (`computeTap`, канон — `src/taps/compute.js`)
```
factPrice      = discountApplies ? round(price*(1-discountRate)) : price
marginMenuRub  = price - cost;        marginMenuPct  = (price-cost)/price*100
marginFactRub  = factPrice - cost;    marginFactPct  = (factPrice-cost)/factPrice*100
marginPerMonth = salesPerMonth==null ? null : marginFactRub*salesPerMonth
newFactPrice   = discountApplies ? round(newPrice*(1-discountRate)) : newPrice   (если newPrice задан)
deltaYear      = ((newFactPrice-cost) - marginFactRub) * (salesPerMonth||0) * 12  (иначе 0)
```
Бейдж/рекомендация по `marginFactPct`: `>=green` 🟢, `>=yellow` 🟡, иначе 🔴.
`computeTap` возвращает исходные поля + вычисления + `recommendation` + `badge`.

## Авторизация
JWT в httpOnly cookie `rab_token`. Логин: `POST /api/auth/login`.
- **GET** — `requireAuth` (любой авторизованный).
- **Мутации** — тоже `requireAuth` (НЕ `requireManager`): шеф-бармен должен иметь запись
  по кранам, а `requireManager` пускает только аккаунты `manager`/`developer`.
- В примерах: `-b cookies.txt` — файл с cookie после логина.

```bash
# Логин (получить cookie)
curl -s -c cookies.txt -X POST http://localhost:3001/api/auth/login \
  -H 'Content-Type: application/json' \
  -d '{"account":"manager","password":"<пароль>"}'
```

## Эндпоинты

### GET /api/taps — список кранов с вычисленными полями + конфиг
```bash
curl -s -b cookies.txt http://localhost:3001/api/taps
```
Ответ: `{ success, taps:[{...кран, factPrice, marginFactPct, marginPerMonth, deltaYear, recommendation, badge}], config }`

### POST /api/taps — создать кран
```bash
curl -s -b cookies.txt -X POST http://localhost:3001/api/taps \
  -H 'Content-Type: application/json' \
  -d '{"name":"Новый кран","ownership":"external","price":600,"cost":200,"discountApplies":true,"salesPerMonth":100}'
```
Обязательны: `name`, `ownership`, `price`, `cost`. Остальное — дефолты (`discountApplies=true`,
`salesPerMonth=null`, `position`=следующая, `isAnchor/isStrategicHold=false`, `newPrice/iikoProductId=null`).

### PUT /api/taps/:id — обновить кран (частичный патч)
```bash
curl -s -b cookies.txt -X PUT http://localhost:3001/api/taps/t1 \
  -H 'Content-Type: application/json' \
  -d '{"newPrice":450,"isAnchor":true}'
```
Любое подмножество полей модели (кроме `id`). Возвращает пересчитанный кран.

### DELETE /api/taps/:id — удалить кран
```bash
curl -s -b cookies.txt -X DELETE http://localhost:3001/api/taps/t1
```
Ответ: `{ success, removed:"t1" }`

### GET /api/taps/config — пороги/скидка
```bash
curl -s -b cookies.txt http://localhost:3001/api/taps/config
```
Ответ: `{ success, config:{ greenThreshold:70, yellowThreshold:60, discountRate:0.055 } }`

### PUT /api/taps/config — обновить пороги/скидку
```bash
curl -s -b cookies.txt -X PUT http://localhost:3001/api/taps/config \
  -H 'Content-Type: application/json' \
  -d '{"greenThreshold":72,"yellowThreshold":62,"discountRate":0.06}'
```
Валидация: пороги в `0..100`, `discountRate` в `[0..1)`, `yellowThreshold <= greenThreshold`.

### POST /api/taps/refresh-sales — подтянуть продажи из IIKO (30 дней)
```bash
curl -s -b cookies.txt -X POST http://localhost:3001/api/taps/refresh-sales
```
Для кранов с заданным `iikoProductId` тянет количество продаж за 30 дней из IIKO OLAP
(сопоставление по `DishName`) и пишет в `salesPerMonth`. Краны без маппинга НЕ трогаются.
Ответ: `{ success, updated, from, to, details:[{id,name,matched,salesPerMonth?}] }`.
Если IIKO не настроен (`IIKO_URL`/`IIKO_LOGIN`) — `503`.
