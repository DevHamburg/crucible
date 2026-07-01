<div align="center">

# 🧪 Crucible

### The AI Model Proving Ground

**Benchmark · Battle · Red-Team · Observe**

A state-of-the-art, self-hostable platform to run **any** LLM against curated benchmarks,
pit models against each other in an **Elo arena**, **red-team** them for jailbreak robustness,
and get full **cost / latency observability** — with a modern, animated UI.

</div>

---

## ✨ What it does

| Pillar | Description |
|---|---|
| **Benchmarks** | 18 curated suites (184+ items) across **psychology, trading/finance, software, business, marketing, logic/reasoning, general knowledge**. Hybrid scoring: exact-match, numeric/symbolic (SymPy), sandboxed **code execution (pass@k)**, and **LLM-as-judge** with rubrics + a human-review queue. |
| **Arena** | Model-vs-model **duels** (dual-swap judged), multi-round **debates**, single-elim **tournaments** with live brackets, and a **Bradley-Terry / Elo** leaderboard with bootstrap CIs. |
| **Safety & Red-Team** | Defensive jailbreak-robustness suite across 7 attack categories (prompt-injection, system-prompt-leak, persona-override, obfuscation, payload-splitting, indirect-injection, hypothetical-framing) with an **adaptive PAIR-style red-team agent**. |
| **Observability** | Every model call traced: tokens, latency (incl. TTFT-ready), cost from a LiteLLM-derived pricing table, error rates — with per-model dashboards. |
| **Any model** | **OpenRouter** (one key, hundreds of models) + direct **OpenAI / Anthropic / Google / Mistral / Groq / DeepSeek / Together** + local **Ollama** — plus a built-in **simulated fleet** so everything runs offline with zero keys. |

Design & methodology are distilled from Inspect AI, lm-evaluation-harness, HELM, OpenCompass,
LMArena, garak/JailbreakBench and Langfuse — see [`docs/BUILD_REFERENCE.md`](docs/BUILD_REFERENCE.md).

## 🚀 Quick start (zero config, no Docker, no keys)

The stack falls back to **SQLite + an in-process worker + a simulated model fleet**, so it runs
immediately. Two terminals:

```bash
# 1) Backend  → http://localhost:8000  (docs at /docs)
cd apps/api
python3 -m venv .venv && . .venv/bin/activate
pip install -e ".[dev]"
uvicorn app.main:app --reload --port 8000      # auto-seeds on first run

# 2) Frontend → http://localhost:3000
cd apps/web
pnpm install
pnpm dev
```

Open **http://localhost:3000**, hit **New Run**, pick a few `*(sim)` models + benchmarks, and
launch — you'll see live scoring, a leaderboard, arena and safety reports without any API key.

> **Want full dashboards immediately?** Run `make seed-demo` (or
> `cd apps/api && python -m app.seeds.demo`) to populate a showcase: a multi-domain benchmark
> sweep, an arena round-robin + debates, and an adaptive red-team scan — all on the simulated fleet.

> Prefer `make`: `make install`, then `make api` and `make web` (see `make help`).

## 🐳 Production (Docker Compose)

Brings up Postgres + Redis + API + arq worker + web:

```bash
cp .env.example .env        # add real API keys (optional) + a strong SECRET_KEY/ENCRYPTION_KEY
docker compose up --build
# web → http://localhost:3000 · api → http://localhost:8000
```

**Hosted deploy** (GitHub Actions → GHCR → Hetzner, behind a shared Caddy at
`bench.hypexio.com`): CI in `.github/workflows/ci.yml`, deploy in `deploy.yml`,
full runbook in [`docs/DEPLOYMENT.md`](docs/DEPLOYMENT.md).

## 🔑 Using real models

- **Server-wide:** set provider keys in `.env` (`OPENAI_API_KEY`, `ANTHROPIC_API_KEY`, `OPENROUTER_API_KEY`, …).
- **Per-user:** sign in and add keys in **Models & Keys** — stored **encrypted at rest** (Fernet),
  never returned in plaintext, testable with one click.

## 🏗️ Architecture

```
apps/
  api/   FastAPI · SQLAlchemy(async) · providers · engine · scoring · safety · arena · observability
  web/   Next.js 15 · React 19 · Tailwind · Framer Motion · TanStack Query · Recharts
docs/    build reference · architecture · datasets
```

- **Providers** — a uniform async chat interface over every backend (`provider/model_id` refs).
- **Engine** — concurrent model calls, sequential SQLite-safe writes, budget guard, live SSE.
- **Scoring** — decorator registry (`exact_match`, `multiple_choice`, `numeric`, `math_equal`,
  `code_exec`, `llm_judge`, `keyword_overlap`, …) inspired by Inspect AI's `Solver → Scorer`.
- **Dev vs prod** — SQLite + in-process asyncio worker for dev; Postgres + Redis + arq for scale.

See [`docs/ARCHITECTURE.md`](docs/ARCHITECTURE.md) and [`docs/DATASETS.md`](docs/DATASETS.md).

## 🧭 API

Interactive OpenAPI docs at **`/docs`**. Highlights: `/runs` (+ `/runs/{id}/stream` SSE),
`/leaderboard` & `/leaderboard/elo`, `/arena/{match,debate,tournament}`, `/safety/{run,report}`,
`/observability/{overview,costs}`.

## 🔒 Safety note

The red-team suite is **defensive**: probes use benign proxy goals and a harmless canary
(e.g. must-not-emit `PWNED`) or a planted secret it must not leak. It measures *robustness*,
never elicits real harmful content.

## 📜 License

MIT (code). Third-party benchmark datasets keep their own licenses — only permissive
(MIT/Apache/CC-BY) sample data is embedded; the rest is fetched at runtime. See `docs/DATASETS.md`.
