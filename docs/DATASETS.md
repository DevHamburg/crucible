# Datasets & Licensing

Crucible ships **original, in-style seed items** (clearly labeled `CC-BY-4.0 (original items)`)
so the platform runs fully offline. These are inspired by, but not copied from, the public
benchmarks below. For rigorous evaluation you can extend the loader to fetch the real datasets at
runtime (install the optional `datasets` extra: `pip install -e ".[datasets]"`).

## Embedded seed suites (this repo)

| Slug | Domain | Scoring | Items |
|---|---|---|---|
| `gsm8k-lite` | logic | numeric | grade-school math |
| `math-competition` | logic | math_equal (SymPy) | competition math |
| `logic-deduction` | logic | multiple_choice | knights & knaves |
| `humaneval-lite` | software | code_exec (pass@k) | function synthesis |
| `code-algorithms` | software | code_exec | algorithms |
| `code-output-prediction` | software | multiple_choice | code reasoning |
| `theory-of-mind` | psychology | multiple_choice | false-belief |
| `emotional-intelligence` | psychology | multiple_choice | EI situations |
| `empathy-support` | psychology | rubric (LLM-judge) | supportive replies |
| `cognitive-biases` | psychology | multiple_choice | bias ID |
| `finance-numeric` | trading | numeric | FinQA-style |
| `finance-concepts` | trading | multiple_choice | risk/derivatives |
| `market-reasoning` | trading | rubric | risk-aware reasoning |
| `business-knowledge` | business | multiple_choice | management/econ |
| `business-strategy` | business | rubric | case reasoning |
| `marketing-copy` | marketing | rubric | copy generation |
| `general-knowledge` | general | multiple_choice | broad MCQ |
| `truthfulqa-lite` | general | multiple_choice | misconceptions |

## Upstream benchmarks (fetch at runtime under their own license)

**Permissive (MIT / Apache-2.0 / CC-BY) — safe to embed or adapt:**
`openai/gsm8k`, `HuggingFaceH4/MATH-500`, `lukaemon/bbh`, `TIGER-Lab/MMLU-Pro`, `cais/mmlu`,
`truthfulqa/truthful_qa`, `google/IFEval`, `allenai/ai2_arc`, `TAUR-Lab/MuSR`,
`K-and-K/knights-and-knaves`, `WildEval/ZebraLogic`, `renma/ProofWriter`, `yale-nlp/FOLIO`,
`openai/openai_humaneval`, `evalplus/humanevalplus`, `evalplus/mbppplus`,
`google-research-datasets/mbpp`, `bigcode/bigcodebench`, `cruxeval-org/cruxeval`,
`nuprl/MultiPL-E`, `princeton-nlp/SWE-bench_Verified`, `allenai/social_i_qa`,
`SahandSab/EmoBench`, `ibm-research/finqa`, `next-tat/TAT-QA`, `PatronusAI/financebench`,
`kensho/bizbench`, `lmsys/mt_bench_human_judgments`, `lmarena-ai/arena-hard-auto`.

**Non-commercial / restricted — reference only, do NOT embed (gate behind runtime download):**
`lucasmccabe/logiqa` (CC-BY-NC), `tatsu-lab/alpaca_eval` (CC-BY-NC), `FudanSELab/ClassEval` data
(CC-BY-NC), `takala/financial_phrasebank` (CC-BY-NC-SA), `Anthropic/persuasion` (CC-BY-NC-SA),
`facebook/empathetic_dialogues` (CC-BY-NC), `Salesforce/CRMArenaPro` (CC-BY-NC),
`lmsys/chatbot_arena_conversations` (extra terms; contains toxic content).

## Pricing table

Per-model cost is computed from token usage × prices seeded in `app/observability/cost.py`, in the
spirit of LiteLLM's MIT-licensed `model_prices_and_context_window.json`. Override per model via the
model catalog. Unknown/mock/local models default to `$0`.

## Adding your own benchmark

Drop a JSON pack into `apps/api/app/seeds/data/` and re-run the seed (`python -m app.seeds.seed`):

```json
{
  "slug": "my-suite", "name": "My Suite", "domain": "logic",
  "task_type": "mcq", "scoring_type": "multiple_choice",
  "license": "CC-BY-4.0", "config": {},
  "items": [{
    "external_id": "q1",
    "prompt": "… Answer with the letter.",
    "input": { "choices": ["A opt", "B opt", "C opt", "D opt"] },
    "reference": { "answer": "B" },
    "difficulty": "easy"
  }]
}
```

Reference fields by `scoring_type`: `multiple_choice` → `{answer: "B"}` + `input.choices`;
`numeric` → `{answer: 42}`; `math_equal` → `{answer: "…"}`; `code_exec` →
`{entry_point, canonical_solution, test}`; `rubric`/`llm_judge` → `{keywords:[…]}` + `config.dimensions`.
