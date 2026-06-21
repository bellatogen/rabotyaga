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
	git add .
	git commit -m "auto deploy"
	git push origin main

deploy: build push
	@echo "🚀 Деплой на сервер..."
	ssh root@147.45.255.158 "cd /root/rabotyaga && git pull origin main && cd frontend && npm run build && cd ../rabotyaga-bot && docker compose restart rabotyaga-bot && docker compose logs rabotyaga-bot --tail=5"

status:
	ssh root@147.45.255.158 "cd /root/rabotyaga && git log --oneline -3 && docker compose ps"

logs:
	ssh root@147.45.255.158 "docker compose logs rabotyaga-bot --tail=30"
