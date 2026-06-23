#!/bin/bash
set -e

# Функция r — выполнить + скопировать вывод в буфер
r() {
  echo ""
  echo "▶ $@"
  echo "────────────────────────────────────────"
  OUTPUT=$("$@" 2>&1) || { echo "❌ Ошибка"; echo "$OUTPUT"; return 1; }
  echo "$OUTPUT"
  echo "$OUTPUT" | pbcopy
  echo "────────────────────────────────────────"
  echo "✅ Скопировано в буфер"
}

cd "/Users/pavelfrolov/Desktop/Пивная карта/Софт/rabotyaga"

echo "🚀 Деплой Работяги"
echo "📅 $(date)"
echo ""

# 1. Коммит и пуш
r git add -A
r git commit -m "feat: система тем с 6 пресетами и редактором цветов" || echo "⚠️  Нечего коммитить"
r git push

# 2. SSH на сервер → git pull → docker restart
r ssh root@147.45.255.158 "cd /root/rabotyaga && git pull"
r ssh root@147.45.255.158 "docker restart rabotyaga-bot"

# 3. Проверка статуса
r ssh root@147.45.255.158 "docker ps --filter name=rabotyaga-bot --format 'table {{.Names}}\t{{.Status}}'"

# 4. Логи (последние 20 строк)
echo ""
echo "📋 Последние логи:"
ssh root@147.45.255.158 "docker logs rabotyaga-bot --tail 20" 2>&1 | pbcopy

echo ""
echo "✅ ДЕПЛОЙ ЗАВЕРШЁН"
echo "🌐 https://rabotyaga55.ru/admin.html"
echo "📋 Логи скопированы в буфер"
