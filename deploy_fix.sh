#!/bin/bash
set -e

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

echo "🚀 Исправленный деплой"
echo "📅 $(date)"

# 1. Коммит и пуш
r git add -A
r git commit -m "fix: система тем — исправлен деплой" || echo "⚠️ Нечего коммитить"
r git push

# 2. SSH на сервер — явное указание ветки
r ssh root@147.45.255.158 "cd /root/rabotyaga && git pull origin main"

# 3. Проверка, что admin.html обновлён
echo ""
echo "🔍 Проверка admin.html на сервере:"
ssh root@147.45.255.158 "cd /root/rabotyaga/rabotyaga-bot && grep -c 'data-theme=\"neon\"' public/admin.html" | pbcopy

# 4. Перезапуск
r ssh root@147.45.255.158 "docker restart rabotyaga-bot"

# 5. Логи
echo ""
echo "📋 Логи:"
ssh root@147.45.255.158 "docker logs rabotyaga-bot --tail 10" 2>&1 | pbcopy

echo ""
echo "✅ ГОТОВО"
echo "🌐 https://rabotyaga55.ru/admin.html"
