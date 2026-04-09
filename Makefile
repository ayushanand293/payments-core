COMPOSE_FILE := infra/docker-compose.yml
COMPOSE := docker compose -f $(COMPOSE_FILE)
API_BASE ?= http://localhost:18000
DEMO_SECRET ?= change-me

.PHONY: up migrate reset-db seed smoke down

up:
	$(COMPOSE) up --build -d

migrate:
	$(COMPOSE) run --rm backend alembic upgrade head

reset-db:
	$(COMPOSE) down -v --remove-orphans
	$(COMPOSE) up --build -d

seed:
	curl -sS -X POST $(API_BASE)/demo/reset \
		-H "X-DEMO-SECRET: $(DEMO_SECRET)" \
		-H "Content-Type: application/json"

smoke:
	bash ./scripts/smoke_demo.sh

down:
	$(COMPOSE) down --remove-orphans
