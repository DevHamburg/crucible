# Crucible — developer shortcuts
.DEFAULT_GOAL := help
.PHONY: help install api web worker seed dev up down fmt lint test

help: ## Show this help
	@grep -E '^[a-zA-Z_-]+:.*?## .*$$' $(MAKEFILE_LIST) | \
		awk 'BEGIN {FS = ":.*?## "}; {printf "  \033[36m%-12s\033[0m %s\n", $$1, $$2}'

install: ## Install backend + frontend deps
	cd apps/api && python3 -m venv .venv && . .venv/bin/activate && pip install -e ".[dev]"
	cd apps/web && pnpm install

seed: ## Seed the database with models + benchmark suites
	cd apps/api && . .venv/bin/activate && python -m app.seeds.seed

seed-demo: ## Populate showcase data (runs, arena, safety) so dashboards are full
	cd apps/api && . .venv/bin/activate && python -m app.seeds.demo

api: ## Run the FastAPI backend (http://localhost:8000)
	cd apps/api && . .venv/bin/activate && uvicorn app.main:app --reload --port 8000

worker: ## Run the arq worker (needs Redis + USE_TASK_QUEUE=true)
	cd apps/api && . .venv/bin/activate && arq app.worker.arq_worker.WorkerSettings

web: ## Run the Next.js frontend (http://localhost:3000)
	cd apps/web && pnpm dev

dev: ## Print the two commands to run the dev stack
	@echo "Terminal 1:  make api"
	@echo "Terminal 2:  make web"

up: ## Full stack via Docker Compose
	docker compose up --build

down: ## Stop Docker Compose
	docker compose down

fmt: ## Format code
	cd apps/api && . .venv/bin/activate && ruff format . && ruff check --fix .
	cd apps/web && pnpm format

lint: ## Lint
	cd apps/api && . .venv/bin/activate && ruff check .
	cd apps/web && pnpm lint

test: ## Run backend tests
	cd apps/api && . .venv/bin/activate && pytest -q
