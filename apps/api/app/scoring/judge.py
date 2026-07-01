"""LLM-as-judge: pointwise rubric scoring + pairwise comparison with dual-game swap to
cancel position bias. Falls back to a deterministic heuristic when the judge model is the
mock provider, so demo mode produces sensible, reproducible verdicts offline."""
from __future__ import annotations

import json
import re
from dataclasses import dataclass

from app.observability.cost import compute_cost, price_for
from app.providers.base import ChatMessage, ModelRef
from app.providers.registry import call_model
from app.scoring.base import ScoreResult, ScoringContext, normalize_text

DEFAULT_DIMS = ["correctness", "completeness", "clarity", "reasoning"]

_POINTWISE_TMPL = """You are a strict, fair evaluator. Score the RESPONSE to the TASK.
Rate each dimension from 1 (poor) to 5 (excellent). Base scores only on quality, not length.
{reference_block}
TASK:
{task}

RESPONSE:
{response}

Return ONLY minified JSON: {{{dims_json}, "overall": <1-5>, "rationale": "<=25 words"}}"""

_PAIRWISE_TMPL = """You are a strict, impartial judge. Two assistants answered the same TASK.
Decide which answer is better on correctness, reasoning, and helpfulness. Do not favor
length or position.
{reference_block}
TASK:
{task}

[ASSISTANT A]
{a}

[ASSISTANT B]
{b}

Return ONLY minified JSON: {{"winner": "A"|"B"|"tie", "rationale": "<=25 words"}}"""


def _extract_json(text: str) -> dict | None:
    m = re.search(r"\{.*\}", text, re.S)
    if not m:
        return None
    try:
        return json.loads(m.group(0))
    except json.JSONDecodeError:
        # tolerate trailing commas / single quotes
        cleaned = re.sub(r",\s*}", "}", m.group(0)).replace("'", '"')
        try:
            return json.loads(cleaned)
        except json.JSONDecodeError:
            return None


def _quality_proxy(text: str, keywords: list[str] | None = None) -> float:
    """Deterministic response-quality heuristic for the mock judge (0..1)."""
    if not text:
        return 0.0
    words = normalize_text(text).split()
    n = len(words)
    distinct = len(set(words))
    structure = text.count("\n-") + text.count("\n1.") + text.count("\n2.")
    kw = 0.0
    if keywords:
        norm = normalize_text(text)
        kw = sum(1 for k in keywords if normalize_text(str(k)) in norm) / max(len(keywords), 1)
    length_score = min(n / 200.0, 1.0)
    diversity = min(distinct / max(n, 1) * 1.5, 1.0)
    struct_score = min(structure / 12.0, 1.0)
    if keywords:
        return round(0.4 * kw + 0.25 * length_score + 0.15 * diversity + 0.2 * struct_score, 4)
    # no reference keywords (e.g. open arena prompts): lean on depth + structure
    return round(0.5 * length_score + 0.2 * diversity + 0.3 * struct_score, 4)


def _bill(ctx: ScoringContext, model_ref: str, comp) -> None:
    inp, out, _ = price_for(model_ref)
    ctx.judge_cost += compute_cost(comp.prompt_tokens, comp.completion_tokens, inp, out)


async def judge_pointwise(
    task: str,
    response: str,
    reference: dict,
    config: dict,
    ctx: ScoringContext,
) -> ScoreResult:
    dims = config.get("dimensions") or DEFAULT_DIMS
    keywords = reference.get("keywords") or reference.get("rubric_keywords") or []

    if ModelRef.parse(ctx.judge_model).provider == "mock":
        q = _quality_proxy(response, keywords)
        # spread a bit across dims deterministically
        scores = {d: round(1 + 4 * q, 2) for d in dims}
        return ScoreResult(q, q >= float(config.get("threshold", 0.5)),
                           f"[mock judge] quality={q}", raw={"dims": scores})

    ref_block = ""
    if reference.get("answer") or reference.get("rubric"):
        ref_block = f"REFERENCE / RUBRIC:\n{reference.get('rubric') or reference.get('answer')}\n"
    dims_json = ", ".join(f'"{d}": <1-5>' for d in dims)
    prompt = _POINTWISE_TMPL.format(
        reference_block=ref_block, task=task, response=response, dims_json=dims_json
    )
    comp = await call_model(
        ctx.judge_model, [ChatMessage("user", prompt)], user_keys=ctx.user_keys,
        temperature=0.0, max_tokens=400,
    )
    _bill(ctx, ctx.judge_model, comp)
    data = _extract_json(comp.text) or {}
    vals = [float(data[d]) for d in dims if isinstance(data.get(d), (int, float))]
    if not vals:
        return ScoreResult(0.0, False, "judge parse error", needs_review=True, raw={"raw": comp.text[:300]})
    norm = (sum(vals) / len(vals) - 1) / 4  # map 1..5 -> 0..1
    return ScoreResult(round(norm, 4), norm >= float(config.get("threshold", 0.6)),
                       data.get("rationale", ""), raw=data)


@dataclass
class PairVerdict:
    winner: str            # 'a' | 'b' | 'tie'
    rationale: str
    cost: float
    raw: dict


async def judge_pairwise(
    task: str,
    response_a: str,
    response_b: str,
    ctx: ScoringContext,
    reference: dict | None = None,
) -> PairVerdict:
    """Dual-game swap: judge (A,B) and (B,A); agree -> winner, disagree -> tie."""
    reference = reference or {}
    if ModelRef.parse(ctx.judge_model).provider == "mock":
        keywords = reference.get("keywords") or []
        qa, qb = _quality_proxy(response_a, keywords), _quality_proxy(response_b, keywords)
        if abs(qa - qb) < 0.03:
            winner = "tie"
        else:
            winner = "a" if qa > qb else "b"
        return PairVerdict(winner, f"[mock judge] qa={qa} qb={qb}", 0.0, {"qa": qa, "qb": qb})

    ref_block = f"REFERENCE:\n{reference.get('answer')}\n" if reference.get("answer") else ""
    cost = 0.0
    verdicts = []
    for a_text, b_text, mapping in [
        (response_a, response_b, {"A": "a", "B": "b"}),
        (response_b, response_a, {"A": "b", "B": "a"}),
    ]:
        prompt = _PAIRWISE_TMPL.format(reference_block=ref_block, task=task, a=a_text, b=b_text)
        comp = await call_model(
            ctx.judge_model, [ChatMessage("user", prompt)], user_keys=ctx.user_keys,
            temperature=0.0, max_tokens=200,
        )
        inp, out, _ = price_for(ctx.judge_model)
        cost += compute_cost(comp.prompt_tokens, comp.completion_tokens, inp, out)
        data = _extract_json(comp.text) or {}
        w = str(data.get("winner", "tie")).strip().upper()
        verdicts.append(mapping.get(w, "tie"))

    if verdicts[0] == verdicts[1] and verdicts[0] in ("a", "b"):
        winner = verdicts[0]
    else:
        winner = "tie"
    return PairVerdict(winner, f"dual-swap verdicts={verdicts}", cost, {"verdicts": verdicts})
