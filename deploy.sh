#!/bin/bash
set -e

echo "🔨 Сборка фронтенда..."
cd frontend && npm run build && cd ..

echo "📦 Коммит и пуш..."
git add .
git commit -m "auto: $(date '+%H:%M')" || echo "Нечего коммитить"
git push origin main

echo "🚀 Деплой на сервер..."
ssh root@147.45.255.158 "cd /root/rabotyaga && git pull origin main && cd frontend && npm run build && cd ../rabotyaga-bot && docker compose restart rabotyaga-bot && echo '✅ Деплой завершён!'"

echo "✅ Готово! Открой https://rabotyaga55.ru"
