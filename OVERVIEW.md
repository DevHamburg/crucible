# Crucible — Kurzüberblick

**Crucible** ist eine self-hostbare Plattform, um LLMs zu benchmarken, gegeneinander
antreten zu lassen, auf Jailbreak-Robustheit zu testen und dabei Kosten/Latenz zu beobachten.

## Was es kann
- **Benchmarks** — 18 Suiten / 184 Items über **Psychologie, Trading/Finanzen, Software,
  Business, Marketing, Logik, Allgemeinwissen**. Bewertung hybrid: exakt, numerisch/symbolisch
  (SymPy), **sandboxed Code-Ausführung (pass@k)**, **LLM-as-Judge (Rubrik)** + Human-Review.
- **Arena** — Modell-gegen-Modell **Duelle** (Dual-Swap-Judging), **Debatten**, **K.o.-Turniere**
  mit Live-Bracket, **Elo/Bradley-Terry-Leaderboard** (mit Konfidenzintervall).
- **Safety / Red-Team** (defensiv) — 7 Angriffskategorien + **adaptiver PAIR-Angreifer**,
  Robustheits-Score. Nutzt harmlose Canary-Proben, erzeugt nie schädliche Inhalte.
- **Observability** — jeder Modell-Call getrackt: Tokens, Latenz, **Kosten**, Fehlerrate.
- **Beliebige Modelle** — OpenRouter + OpenAI/Anthropic/Google/Mistral/Groq/DeepSeek + lokal
  (Ollama) **plus ein simuliertes Modell-Fleet**, das komplett offline ohne API-Keys läuft.

## Gibt es ein Frontend? → Ja
Ein modernes, animiertes Next.js-15-Frontend (React 19, Tailwind, Framer Motion, Recharts) mit
**12 Seiten**: Dashboard, Models & Keys, Benchmarks, Run-Builder, **Live-Run-Ansicht (SSE)**,
Leaderboard (Capability/Elo/Safety), **Arena** (Duell/Debatte/Turnier), Safety-Report,
Observability, Login. Dark-Mode, Plasma-Design, alles animiert.

## Welche Tests laufen
**Backend-Unit-Tests** (`pytest`, 8 Tests, grün):
Antwort-Extraktion, Multiple-Choice- & Numerik-Scorer, **sandboxed Code-Ausführung**, `pass@k`,
Refusal-/Jailbreak-Erkennung, Bradley-Terry-/Elo-Rangordnung.

**Integrations-/Smoke-Tests** (verifiziert, laufen in CI):
- Seed lädt **21 Modelle / 18 Benchmarks / 184 Items**.
- End-to-End-Benchmark-Run: **180/180 Items** bewertet, plausible Rangfolge.
- Adaptiver Safety-Run (Robustheit sage 0.85 → rogue 0.00).
- Arena: Match, Debatte, Turnier; Bradley-Terry-Rating.
- **SSE-Live-Stream** über echtes HTTP; CORS für das Frontend.

**Frontend**: `tsc` strict sauber + `next build` sauber (**14 Routen**).

CI (`.github/workflows/ci.yml`) führt Backend-Tests + Frontend-Build bei jedem Push/PR aus.

## Wie man es nutzt (lokal, ohne Docker, ohne Keys)
```bash
# Backend  → http://localhost:8000  (OpenAPI-Docs unter /docs)
cd apps/api && python3 -m venv .venv && . .venv/bin/activate && pip install -e ".[dev]"
python -m app.seeds.demo          # optional: Dashboards sofort gefüllt
uvicorn app.main:app --port 8000

# Frontend → http://localhost:3000
cd apps/web && pnpm install && pnpm dev
```
Dann **http://localhost:3000** öffnen → „New Run" → ein paar `*(sim)`-Modelle + Benchmarks →
Live-Scoring, Leaderboard, Arena, Safety — alles ohne API-Key.

**Produktion:** `.env` ausfüllen → `docker compose up --build` (Postgres + Redis + API + Worker +
Web). Login-Admin: `admin@crucible.local` / `admin`.

Vollständige Doku: [`README.md`](README.md), [`docs/ARCHITECTURE.md`](docs/ARCHITECTURE.md),
[`docs/BUILD_REFERENCE.md`](docs/BUILD_REFERENCE.md), [`docs/DATASETS.md`](docs/DATASETS.md),
[`docs/DEPLOYMENT.md`](docs/DEPLOYMENT.md).
