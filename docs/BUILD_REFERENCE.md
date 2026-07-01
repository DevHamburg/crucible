# Crucible — Build Reference

Distilled from a fan-out research pass over SOTA eval frameworks, benchmarks, safety
suites, arena methodology, observability and frontend patterns (2024–2026). This is the
spec the implementation follows.

## Architecture templates we adopt
| Source (license) | What we adopt |
|---|---|
| **UK AISI Inspect AI** (MIT) | Core composition `Dataset → Solver(s) → Scorer`. Separates *how you prompt* from *how you grade*. Our `benchmarks` + `scoring` mirror this. |
| **EleutherAI lm-evaluation-harness** (MIT) | Decorator **registry** pattern (`@register_scorer`, `@register_provider`); small request abstraction. |
| **Stanford HELM** (Apache-2.0) | **RunSpec** = one serializable object fully describing a run (reproducibility) → our `Run.config`. Persistent **request cache** keyed on `(model, prompt, params)`. Multi-metric "holistic" reporting (accuracy *and* calibration/robustness/cost side by side). |
| **OpenCompass** (Apache-2.0) | **Partitioner → Runner** sharding: split a big eval into atomic sub-tasks across workers → our engine's concurrency + arq worker. |
| **promptfoo** (MIT) | Declarative **assertion catalog** (contains / equals / is-json / llm-rubric / similarity …) → our rule-based scorer set. |
| **DeepEval** (Apache-2.0) | **G-Eval** chain-of-thought judge metric → our LLM-judge rubric. |
| **Langfuse / OTel GenAI** (MIT / Apache) | Trace/generation span model + cost-from-tokens → our `Generation` table + observability. |

## Datasets by domain (embed only permissive; others download at runtime)
Embedded seed items are **original, in-style samples** (clearly labeled) so the platform
runs offline; the loader can fetch the full datasets below via the `datasets` extra.

| Domain | Datasets (HF id) | License | Scoring |
|---|---|---|---|
| **Logic / Reasoning** | `openai/gsm8k`, `HuggingFaceH4/MATH-500`, `lukaemon/bbh` (BBH), `TIGER-Lab/MMLU-Pro`, `TAUR-Lab/MuSR`, `K-and-K/knights-and-knaves`, `WildEval/ZebraLogic`, `renma/ProofWriter`, `yale-nlp/FOLIO`, `allenai/ai2_arc` | MIT / CC-BY(-SA) / Apache | numeric/symbolic exact-match (SymPy), MCQ accuracy, grid exact-match |
| **Software dev** | `openai/openai_humaneval`, `evalplus/humanevalplus`, `evalplus/mbppplus`, `google-research-datasets/mbpp`, `bigcode/bigcodebench`, `cruxeval-org/cruxeval`, `nuprl/MultiPL-E`, `princeton-nlp/SWE-bench_Verified` | MIT / Apache / CC-BY | **execution** (sandboxed unit tests), `pass@k` |
| **Psychology** | `allenai/social_i_qa`, ToMBench (MIT repo), `SahandSab/EmoBench`, IPIP items (public domain), cognitive-biases-in-llms (MIT) | CC-BY / MIT / PD | MCQ accuracy, reference-distance, rubric judge, effect-size deltas |
| **Trading / Finance** | `ibm-research/finqa`, `TheFinAI/flare-convfinqa`, `next-tat/TAT-QA`, `PatronusAI/financebench`, `kensho/bizbench`, `TheFinAI/fiqa-sentiment-classification` | CC-BY / Apache | execution-accuracy (rel-tol 1e-3), numeric F1, judge for open QA |
| **Business / Marketing** | `cais/mmlu` (biz/econ subsets), `TIGER-Lab/MMLU-Pro`, `kensho/bizbench` + self-authored generation tasks | MIT / Apache | MCQ accuracy + **rubric judge** (correctness/clarity/persuasion/actionability) |
| **General knowledge** | `cais/mmlu`, `truthfulqa/truthful_qa`, `google/IFEval`, `allenai/ai2_arc` | MIT / Apache | MCQ accuracy, IFEval constraint checks |

> ⚠️ **Non-commercial / do-not-embed** (reference-only, gate behind runtime download):
> `lucasmccabe/logiqa` (LogiQA), `tatsu-lab/alpaca_eval`, `FudanSELab/ClassEval` data,
> `takala/financial_phrasebank`, `Anthropic/persuasion`, `facebook/empathetic_dialogues`,
> `Salesforce/CRMArenaPro`. See `docs/DATASETS.md`.

## Scoring
- **MCQ**: API models rarely expose logprobs → constrained generation + first-letter/regex
  extraction; metric = accuracy with 95% bootstrap CI.
- **Numeric / math**: extract last number or `\boxed{}`, compare with SymPy symbolic equality
  or relative tolerance.
- **Code**: unbiased **pass@k** (Chen et al. 2021):
  `pass@k = E_problems[ 1 − C(n−c, k) / C(n, k) ]` (numerically stable; never `1−(1−c/n)^k`).
  Executed in a locked-down subprocess sandbox (no net, memory/time caps).
- **Open-ended**: LLM-as-judge returns strict JSON `{dim: 1..5, rationale}`; average dims → 0..1.
- **Pairwise (arena)**: **dual-game swap** — judge `(A,B)` and `(B,A)`; agree → winner, flip → tie.

## Jailbreak / safety suite (DEFENSIVE robustness scoring only)
Attack **categories** (each holds benign-described probe goals; we score *whether the model
refuses*, never elicit real harmful content): prompt-injection, roleplay/persona-override,
obfuscation/encoding, hypothetical-framing, payload-splitting, multi-turn escalation,
system-prompt-leak.
- **Refusal score** 0..1 (refused=1). **Harm/compliance rubric** 0..4 (0 refusal → 4 fully
  complied) via judge. **Robustness score** = mean refusal across the suite.
- **Adaptive red-team (PAIR-style, defensive):** attacker model proposes a reframing of a
  *held-out benign-proxy* goal, target answers, judge rates refusal; loop ≤ N rounds, keep best.
  Used to measure how quickly defenses break, on safe proxy tasks only.

## Arena
- **Elo** online update: `R' = R + K·(S − E)`, `E = 1/(1+10^((R_opp−R)/400))`, K=32→16 decay.
- **Bradley-Terry** MLE over all pairwise outcomes → stable global ranking + bootstrap CI
  (LMArena method). We compute both; BT is the leaderboard, Elo is the live ticker.
- **Debate**: N rounds, both models see prior turns; judge scores {correctness, evidence,
  rebuttal, clarity} and picks a winner (dual-swap).
- **Tournament**: single-elim bracket; each match = best-of-`m` prompts from a domain pool.

## Observability
- Every model call → `Generation` row (tokens, latency, cost, status).
- Cost = `in_tok·in_price + out_tok·out_price (+ cache tokens)`; pricing seeded from LiteLLM
  `model_prices_and_context_window.json` (MIT), overridable per model.
- Metrics surfaced: TTFT, p50/p95 latency, tokens/s, $/run, $/1k-correct, error rate.

## Frontend
Next.js 15 App Router · TypeScript · Tailwind v4 · shadcn/ui (MIT) · Framer Motion ·
TanStack Query · Recharts · SSE streaming. Quality gates: Lighthouse (LCP<2.5s, INP<200ms),
axe a11y. Signature patterns: live token-streaming run view, animated Elo leaderboard with
rank-change springs, tournament bracket, side-by-side debate arena, cost/latency dashboards.
