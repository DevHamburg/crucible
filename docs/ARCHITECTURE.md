# Crucible — Architecture

## Overview

```
┌──────────────┐        REST + SSE        ┌───────────────────────────────────────────┐
│  Next.js 15  │  ───────────────────────▶│                 FastAPI                    │
│  (apps/web)  │◀──────  EventSource ──────│                (apps/api)                  │
└──────────────┘                          │                                            │
                                          │  providers → engine → scoring → results    │
                                          │             ↘ safety  ↘ arena              │
                                          └───────┬───────────────────────┬────────────┘
                                                  │                       │
                                        ┌─────────▼────────┐     ┌────────▼─────────┐
                                        │ Postgres / SQLite│     │  Redis (arq)     │
                                        └──────────────────┘     │  optional        │
                                                                 └──────────────────┘
```

## Backend layers (`apps/api/app`)

| Module | Responsibility |
|---|---|
| `core/` | config (zero-config defaults), async DB engine, security (PBKDF2 passwords, JWT, Fernet key encryption). |
| `models/` | SQLAlchemy 2.0 ORM: users, api_keys, model_catalog, benchmarks/items, runs, generations, results, safety_results, arena_matches, tournaments, human_reviews. |
| `providers/` | Uniform async `Provider.complete()` over mock, OpenAI-compatible (OpenAI/OpenRouter/Groq/Mistral/DeepSeek/Together/Ollama), Anthropic, Google. `ModelRef` parses `provider/model_id`. |
| `scoring/` | Decorator registry of scorers: rule-based (exact/mcq/numeric/math/json/regex/keyword), execution-based (`code_exec`, pass@k, sandboxed), and `judge` (pointwise rubric + pairwise dual-swap). |
| `engine/` | Run orchestrator (concurrent calls, sequential writes, budget guard), in-process pub/sub `EventBus` for SSE, and `dispatch` (asyncio in dev / arq in prod). |
| `safety/` | Probe catalog, refusal/jailbreak detection, adaptive PAIR-style red-team, safety run executor. |
| `arena/` | Elo + Bradley-Terry rating, pairwise battle, debate protocol, single-elim tournament executor. |
| `observability/` | Pricing table + cost computation. |
| `api/` | Routers, deps (optional auth), serializers, SSE helper. |
| `seeds/` | Model catalog + benchmark packs (JSON) + admin bootstrap; auto-runs on first start. |
| `worker/` | arq worker settings for production. |

## Key design decisions

1. **Zero-config first run.** No `DATABASE_URL` → SQLite; no `REDIS_URL` → in-process asyncio
   jobs; no API keys → the mock simulator fleet. `docker compose` flips all three to
   Postgres + Redis + arq without code changes.
2. **Concurrent calls, serial writes.** Model calls (I/O-bound) run under a semaphore; DB writes
   happen sequentially in the orchestrator loop — SQLite-safe and keeps `Run` counters consistent.
3. **Reproducible simulator.** The mock provider is seeded by `(model, prompt, reference)` and
   reads per-model `skill`/`safety` knobs, so leaderboards, arena and safety reports are varied
   *and* deterministic — the whole product is demoable offline.
4. **Position-bias-safe judging.** Pairwise judging uses the dual-game swap (judge A,B and B,A;
   agree → winner, disagree → tie), following Arena-Hard-Auto.
5. **Live everywhere.** Runs, tournaments and safety scans stream progress over SSE; the SSE route
   also polls the DB so progress survives even when work runs in a separate worker process.

## Data flow of a benchmark run

1. `POST /runs` creates a `Run(config)` and dispatches it.
2. The engine loads items × models into a worklist; each unit calls the model (mock gets a hidden
   `simulation` payload), computes cost, and scores the response.
3. Each result is persisted as a `Generation` (trace) + `Result` (score); `Run` counters update;
   an `item_done` event is published.
4. The frontend renders live progress, then `GET /runs/{id}/results` aggregates the leaderboard.

## Frontend (`apps/web`)

App Router client pages backed by TanStack Query hooks (`lib/hooks.ts`) over a typed API client
(`lib/api.ts`, incl. SSE `subscribe`). A cohesive design system (`components/ui`, `globals.css`,
`tailwind.config.ts`) with Framer Motion animations. State (auth token, cross-page model
selection) in a persisted Zustand store.
