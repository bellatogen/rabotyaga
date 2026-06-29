# Квест-система — API (бэкенд)

Геймификация для барменов: квесты смены, XP, стрики, магазин наград.

## Хранение
Версионные ключи в **`data.kv`** (PG-backed store, синкается в PostgreSQL — переживает редеплой):
`quests:v1`, `rewards:v1`, `xp_ledger:v1`, `streaks:v1`, `reward_log:v1`.
Защищены в `MANAGER_ONLY_KV` — через открытый `PUT /api/kv/:key` их меняет только менеджер
(сотрудники начисляют/тратят XP только через валидируемые роуты ниже).
Инициализируются автоматически при старте сервера (`ensureQuestModel`) и/или вручную:

```bash
cd rabotyaga-bot
node scripts/migrate-quests.js     # идемпотентно, делает резервную копию data.json.bak
```

> **`bartenderId`** во всей системе — это **имя сотрудника** (ключ из `profiles:v1`), как и везде в приложении.

## Авторизация
JWT в httpOnly cookie `rab_token` (как и весь остальной API). Логин: `POST /api/auth/login`.
- **Админ** = `manager` или `developer`.
- В примерах ниже: `-b cookies.txt` — файл с cookie после логина.

```bash
# Логин (получить cookie)
curl -s -c cookies.txt -X POST http://localhost:3001/api/auth/login \
  -H 'Content-Type: application/json' \
  -d '{"account":"manager","password":"<пароль>"}'
```

---

## Квесты — `/api/quests`

### GET /pool  (админ)
Весь пул квестов.
```bash
curl -s -b cookies.txt http://localhost:3001/api/quests/pool
```

### PUT /:id  (админ)
Обновить поля квеста (`name`, `threshold`, `xp`, `active`). Валидация: `threshold > 0`, `xp > 0`.
```bash
curl -s -b cookies.txt -X PUT http://localhost:3001/api/quests/q1 \
  -H 'Content-Type: application/json' \
  -d '{"xp":600,"threshold":105,"active":true}'
```

### POST /weekly  (админ)
Создать/заменить недельный челлендж.
```bash
curl -s -b cookies.txt -X POST http://localhost:3001/api/quests/weekly \
  -H 'Content-Type: application/json' \
  -d '{"description":"Продать 50 шотов за неделю","xp":1000,"deadline":"2026-07-05"}'
```

### GET /weekly/progress
Челлендж + сумма недельного XP (`reward_log` с `rewardId="weekly"` за текущую ISO-неделю).
```bash
curl -s -b cookies.txt http://localhost:3001/api/quests/weekly/progress
```

### GET /shift/:shiftId
Квесты смены. При первом обращении авто-назначает 3 активных квеста из пула.
```bash
curl -s -b cookies.txt http://localhost:3001/api/quests/shift/2026-06-28
```

### POST /complete
Отметить квест выполненным, начислить XP (делится поровну, остаток теряется), обновить стрики.
Стрик-бонус: если `current >= 5` — +150 XP сверху (один раз за новый день стрика).
```bash
curl -s -b cookies.txt -X POST http://localhost:3001/api/quests/complete \
  -H 'Content-Type: application/json' \
  -d '{"shiftId":"2026-06-28","questId":"q1","bartenderIds":["Аня","Петя"],"shiftDate":"2026-06-28"}'
# → { success, xp_awarded_each, streak_bonus, new_totals: { "Аня": {...}, "Петя": {...} } }
```

---

## Награды — `/api/rewards`

### GET /  (?active=true)
Все награды; с `?active=true` — только активные.
```bash
curl -s -b cookies.txt 'http://localhost:3001/api/rewards?active=true'
```

### PUT /:id  (админ)
Обновить награду (`name`, `xp_cost`, `active`, `type`). Валидация: `xp_cost > 0`.
```bash
curl -s -b cookies.txt -X PUT http://localhost:3001/api/rewards/r1 \
  -H 'Content-Type: application/json' \
  -d '{"xp_cost":900,"active":true}'
```

### POST /redeem
Потратить XP на награду. Списывает в `spent` (total не уменьшается). Доступно = `total - spent`.
```bash
curl -s -b cookies.txt -X POST http://localhost:3001/api/rewards/redeem \
  -H 'Content-Type: application/json' \
  -d '{"bartenderId":"Аня","rewardId":"r1"}'
# → { success, remaining_xp, reward: { id, status:"pending", ... } }
```

### GET /pending  (менеджер)
Невыданные награды — что нужно выплатить.
```bash
curl -s -b cookies.txt http://localhost:3001/api/rewards/pending
```

### POST /fulfill/:logId  (менеджер)
Отметить награду выданной.
```bash
curl -s -b cookies.txt -X POST http://localhost:3001/api/rewards/fulfill/rl_<uuid>
```

---

## XP — `/api/xp`

### GET /leaderboard
Все бармены, сортировка по `per_shift_avg` DESC (не по total — не штрафует за малое число смен).
```bash
curl -s -b cookies.txt http://localhost:3001/api/xp/leaderboard
```

### GET /:bartenderId
Полный XP-профиль: `total`, `spent`, `available`, `per_shift_avg`, `streak`, `per_shift_history` (последние 30).
```bash
curl -s -b cookies.txt http://localhost:3001/api/xp/Аня
```

---

## Бизнес-правила
- **Деление XP:** `Math.floor(quest.xp / bartenderIds.length)` каждому; остаток теряется.
- **Available XP:** `total - spent`, не ниже 0.
- **Стрик:** календарные дни с ≥1 выполненным квестом. Два квеста в один день = 1 день стрика. Разрыв >1 дня → стрик с 1.
- **Стрик-бонус:** `current >= 5` → +150 XP (один раз за новый день стрика, не дублируется при повторном квесте).
- **weekly/progress:** сумма XP из `reward_log` с `rewardId="weekly"` за текущую ISO-неделю.
- Все изменения пишутся через `saveData()` (debounced flush в data.json + PostgreSQL для kv).
