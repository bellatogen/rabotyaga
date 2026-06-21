.PHONY: build push deploy status logs help

help:
	@echo "🚀 Работяга - команды:"
	@echo "  make build    - собрать фронтенд"
	@echo "  make push     - закоммитить и запушить"
	@echo "  make deploy   - полный деплой (build + push + server)"
	@echo "  make status   - статус на сервере"
	@echo "  make logs     - логи контейнера"

build:
	cd frontend && npm run build

push:
	@test -z "$$(git status --porcelain)" || { echo "⛔ Незакоммиченные изменения — закоммить вручную"; git status --short; exit 1; }
	@test "$$(git rev-parse --abbrev-ref HEAD)" = main || { echo "⛔ Не на main"; exit 1; }
	git push origin main

deploy: build push
	@echo "🚀 Деплой на сервер (self-contained образ, фронт вшит)..."
	ssh root@147.45.255.158 "cd /root/rabotyaga && git pull origin main && cd rabotyaga-bot && docker compose up -d --build && docker compose logs rabotyaga-bot --tail=5"

status:
	ssh root@147.45.255.158 "cd /root/rabotyaga && git log --oneline -3 && cd rabotyaga-bot && docker compose ps"

logs:
	ssh root@147.45.255.158 "cd rabotyaga-bot && docker compose logs rabotyaga-bot --tail=30"
