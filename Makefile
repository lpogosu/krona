.DEFAULT_GOAL := help
.PHONY: help up down dev check test lint bench cli demo

help: ## Список команд
	@grep -E '^[a-z-]+:.*## ' $(MAKEFILE_LIST) | awk 'BEGIN {FS = ":.*## "}; {printf "  %-8s %s\n", $$1, $$2}'

up: ## Собрать и поднять интерфейс на http://localhost:8080
	docker compose up --build -d
	@echo "КРОНА: http://localhost:8080"

down: ## Остановить контейнер
	docker compose down

dev: ## Интерфейс в режиме разработки
	npm ci && npm run dev

check: lint test ## Линтер, типы и тесты — то же, что в CI
	npm run typecheck

test: ## Тесты ядра, CLI и веба
	npm test

lint: ## ESLint со строгими правилами typescript-eslint
	npm run lint

bench: ## Замер анализа на примерах и на 300 задачах
	npm run bench

cli: ## Собрать образ CLI
	docker build --target cli -t krona-cli:local .

demo: cli ## Проверить пример crontab через контейнер CLI
	@# В примере намеренно есть перегрузка: ожидаемый код выхода — 1.
	docker run --rm -v "$(CURDIR)/examples:/work:ro" krona-cli:local check /work/prod-db-01.crontab; 	code=$$?; echo "код выхода $$code (0 — чисто, 1 — перегрузки, 2 — ошибка разбора)"; test $$code -eq 1
