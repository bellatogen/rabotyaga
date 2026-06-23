#!/bin/bash
set -euo pipefail

# Деплой НЕ коммитит сам — это убирало спам "auto: HH:MM" и затирало историю.
# Коммить вручную, потом запускай деплой.

branch=$(git rev-parse --abbrev-ref HEAD)
if [ "$branch" != "main" ]; then
  echo "⛔ Ветка '$branch', не main. Деплой отменён, чтобы не запушить её в main."
  echo "   git checkout main && git merge <твоя-ветка>"
  exit 1
fi

if [ -n "$(git status --porcelain)" ]; then
  echo "⛔ Есть незакоммиченные изменения — закоммить вручную перед деплоем:"
  git status --short
  exit 1
fi

echo "🔨 Локальная проверка сборки фронтенда..."
cd frontend && npm run build && cd ..

echo "📤 Пуш уже зафиксированного main..."
git push origin main

echo "🔑 Копируем .env на сервер..."
scp rabotyaga-bot/.env root@147.45.255.158:/root/rabotyaga/rabotyaga-bot/.env

echo "🚀 Деплой на сервер (образ пересобирается сам, фронт вшит внутрь)..."
ssh root@147.45.255.158 "cd /root/rabotyaga && git pull origin main && cd rabotyaga-bot && docker compose up -d --build && docker compose logs rabotyaga-bot --tail=5 && echo '✅ Деплой завершён!'"

echo "✅ Готово! Открой https://rabotyaga55.ru"
