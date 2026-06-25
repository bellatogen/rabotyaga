# Runbook: первый деплой PostgreSQL на прод (rabotyaga55.ru)

Сервер: `root@147.45.255.158`, путь `/root/rabotyaga`. Деплой через `./deploy.sh` (с локали).

> ⚠️ Это **первый** деплой с PostgreSQL. Обычные деплои после него — просто `./deploy.sh`.
> Три места, где можно молча сломать прод — отмечены 🔴. Не пропускать.

---

## 0. Перед началом (локально)

- [ ] Ты на ветке `main`, дерево чистое (`git status` пустой) — иначе `deploy.sh` откажет.
- [ ] Фронт собирается: `cd frontend && npm run build` (deploy.sh делает это сам, но проверь заранее).
- [ ] Тесты зелёные: `cd rabotyaga-bot && npm test` (48/48).

## 1. 🔴 Задать пароль БД в .env (ДО первого старта postgres)

Пароль PostgreSQL фиксируется в volume при **первом** запуске контейнера. Сменить
позже = пересоздавать volume (потеря БД). Поэтому задаём сейчас, до деплоя.

```bash
# локально, в rabotyaga-bot/.env (deploy.sh сам scp-нет его на сервер)
echo "POSTGRES_PASSWORD=$(openssl rand -hex 16)" >> rabotyaga-bot/.env
```

Проверь что в `.env` появилась строка `POSTGRES_PASSWORD=...` и она НЕ `changeme`.
`DATABASE_URL` отдельно задавать не нужно — docker-compose соберёт его из пароля.

## 2. 🔴 Удалить orphan-контейнер postgres на сервере (one-time)

На сервере с прошлых попыток висит контейнер `rabotyaga-postgres`. Наш compose
объявляет контейнер с тем же именем → `docker compose up` упадёт «name already in use».

```bash
ssh root@147.45.255.158 '
  docker rm -f rabotyaga-postgres 2>/dev/null || true
  # старый том (если был) — чтобы init-схемы и новый пароль применились на чистом томе:
  docker volume ls | grep postgres_data    # посмотреть точное имя тома
  docker volume rm rabotyaga-bot_postgres_data 2>/dev/null || true
'
```

> Если orphan-контейнера нет — команды просто ничего не сделают, это безопасно.

## 3. 🔴 Проверить data.json на сервере (источник авто-миграции)

При первом старте сервер видит пустой PG + непустой `data.json` и **автоматически
переносит данные** в БД. Значит на сервере должен лежать актуальный `data.json`.

```bash
ssh root@147.45.255.158 '
  ls -la /root/rabotyaga/rabotyaga-bot/data.json
  # быстрый смоук: число kv-ключей и привязок
  node -e "const d=require(\"/root/rabotyaga/rabotyaga-bot/data.json\");console.log(\"kv:\",Object.keys(d.kv||{}).length,\"bindings:\",Object.keys(d.bindings||{}).length)"
'
```

Запомни эти числа — сверим после миграции.

## 4. Деплой

```bash
./deploy.sh
```

Что произойдёт: build образа (с db/ и migrate-скриптом внутри) → push main →
scp .env → на сервере `git pull` + `docker compose build` + `docker compose up -d`.
Compose поднимет `postgres` (применит схемы db/*.sql на чистом томе), дождётся
healthcheck, затем стартует `rabotyaga-bot`. Сервер при пустом PG прогреет БД из data.json.

## 5. Проверка после деплоя

```bash
ssh root@147.45.255.158 'cd /root/rabotyaga/rabotyaga-bot && \
  docker compose ps && \
  docker compose logs rabotyaga-bot --tail=15 | grep -E "PostgreSQL|primary" && \
  docker compose exec -T postgres psql -U rabotyaga -tAc "SELECT COUNT(*) FROM kv_store" && \
  docker compose exec -T postgres psql -U rabotyaga -tAc "SELECT COUNT(*) FROM employee_bindings"'
```

Ожидаем:
- [ ] оба контейнера `Up` / `healthy`
- [ ] в логах: `📂 Загружено N kv-ключей из PostgreSQL` (или авто-миграция при первом старте)
- [ ] `kv_store` ≈ числу kv-ключей из шага 3 **+1** (`pushSettings:v1`)
- [ ] `employee_bindings` = числу привязок из шага 3
- [ ] `https://rabotyaga55.ru/api/health` → `{"ok":true,...,"pg":true}`
- [ ] приложение открывается, данные на месте
- [ ] **persistence-тест:** `docker compose restart rabotyaga-bot` → данные на месте

## 6. Откат (если что-то пошло не так)

PostgreSQL — аддитивное изменение: старый `data.json` остался нетронутым.

```bash
# вернуть прошлую версию кода и поднять без зависимости на PG-логику
ssh root@147.45.255.158 'cd /root/rabotyaga && git checkout <предыдущий-commit> && \
  cd rabotyaga-bot && docker compose up -d --build'
```

Даже без отката: если PG недоступен, сервер сам падает в fallback на `data.json`
и продолжает работать (проверено) — катастрофической потери данных нет.

---

## Остаточные задачи (бэклог, НЕ блокируют деплой)

- **C1** — частично закрыт (синхронизация при реконнекте); можно довести до полного диффа снимка.
- **C3** — `flushToPG` не транзакционен (самозалечивается при следующем flush) — приемлемо.
- **adminUsers** — легаси-поле, в PG не переносится (не используется).
- Мониторинг: повесить uptime-чек на `/api/health` и алерт при `pg:false` (деградация).
