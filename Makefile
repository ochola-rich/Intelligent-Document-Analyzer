SHELL := /bin/bash

.PHONY: up down restart reset pgvector status logs test

COMPOSE ?= docker-compose

up:
	$(COMPOSE) up -d --build
	$(COMPOSE) exec -T postgres psql -U blaq -d filesanalyzer_db -c "CREATE EXTENSION IF NOT EXISTS vector;"

down:
	$(COMPOSE) down

restart: down up

reset:
	$(COMPOSE) down -v
	$(COMPOSE) up -d --build
	$(COMPOSE) exec -T postgres psql -U blaq -d filesanalyzer_db -c "CREATE EXTENSION IF NOT EXISTS vector;"

pgvector:
	$(COMPOSE) up -d postgres
	$(COMPOSE) exec -T postgres psql -U blaq -d filesanalyzer_db -c "CREATE EXTENSION IF NOT EXISTS vector;"

status:
	$(COMPOSE) ps

logs:
	$(COMPOSE) logs -f

test:
	bash scripts/test-stack.sh
