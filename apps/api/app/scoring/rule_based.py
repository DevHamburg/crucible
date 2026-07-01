"""Deterministic, cheap, reproducible scorers. Run these first; they need no judge."""
from __future__ import annotations

import json
import re

from app.scoring.base import (
    ScoreResult,
    ScoringContext,
    extract_choice,
    extract_number,
    normalize_text,
    register_scorer,
)


@register_scorer("exact_match")
async def exact_match(response: str, reference: dict, config: dict, ctx: ScoringContext) -> ScoreResult:
    gold = reference.get("answer", "")
    golds = gold if isinstance(gold, list) else [gold]
    resp = normalize_text(response)
    hit = any(normalize_text(str(g)) == resp for g in golds) or any(
        normalize_text(str(g)) in resp for g in golds
    )
    return ScoreResult(1.0 if hit else 0.0, hit, f"gold={gold!r}")


@register_scorer("multiple_choice")
async def multiple_choice(response: str, reference: dict, config: dict, ctx: ScoringContext) -> ScoreResult:
    choices = (ctx.item.get("input") or {}).get("choices") or []
    n = max(len(choices), 2)
    gold = str(reference.get("answer", "")).strip().upper()
    # gold may be a letter or the full choice text
    if len(gold) != 1 and choices:
        for i, c in enumerate(choices):
            if normalize_text(str(c)) == normalize_text(gold):
                gold = chr(ord("A") + i)
                break
    pred = extract_choice(response, n)
    ok = pred is not None and pred == gold
    return ScoreResult(1.0 if ok else 0.0, ok, f"pred={pred} gold={gold}")


@register_scorer("numeric")
@register_scorer("numeric_match")
async def numeric_match(response: str, reference: dict, config: dict, ctx: ScoringContext) -> ScoreResult:
    gold = reference.get("answer")
    pred = extract_number(response)
    if pred is None or gold is None:
        return ScoreResult(0.0, False, f"pred={pred} gold={gold}")
    try:
        goldf = float(str(gold).replace(",", "").replace("$", ""))
    except ValueError:
        return ScoreResult(0.0, False, f"unparseable gold={gold}")
    rel_tol = float(config.get("rel_tol", 1e-3))
    abs_tol = float(config.get("abs_tol", 1e-6))
    ok = abs(pred - goldf) <= max(abs_tol, rel_tol * abs(goldf))
    return ScoreResult(1.0 if ok else 0.0, ok, f"pred={pred} gold={goldf}")


@register_scorer("math_equal")
async def math_equal(response: str, reference: dict, config: dict, ctx: ScoringContext) -> ScoreResult:
    gold = reference.get("answer")
    from app.scoring.base import extract_boxed

    pred_raw = extract_boxed(response)
    try:
        import sympy
        from sympy.parsing.sympy_parser import parse_expr

        def norm(x):
            return parse_expr(str(x).replace("\\", "").replace("$", ""), evaluate=True)

        cand = pred_raw if pred_raw is not None else str(extract_number(response))
        ok = sympy.simplify(norm(cand) - norm(gold)) == 0
        return ScoreResult(1.0 if ok else 0.0, ok, f"sympy pred={cand} gold={gold}")
    except Exception:  # noqa: BLE001 — sympy missing or unparseable -> numeric fallback
        return await numeric_match(response, reference, config, ctx)


@register_scorer("includes")
@register_scorer("contains")
async def includes(response: str, reference: dict, config: dict, ctx: ScoringContext) -> ScoreResult:
    targets = reference.get("answer") or reference.get("contains") or []
    if isinstance(targets, str):
        targets = [targets]
    resp = normalize_text(response)
    hits = [t for t in targets if normalize_text(str(t)) in resp]
    mode = config.get("mode", "any")
    ok = bool(hits) if mode == "any" else len(hits) == len(targets)
    score = len(hits) / len(targets) if targets else 0.0
    return ScoreResult(1.0 if ok else score, ok, f"{len(hits)}/{len(targets)} matched")


@register_scorer("regex_match")
async def regex_match(response: str, reference: dict, config: dict, ctx: ScoringContext) -> ScoreResult:
    pat = reference.get("pattern") or config.get("pattern", "")
    ok = bool(re.search(pat, response, re.I | re.S)) if pat else False
    return ScoreResult(1.0 if ok else 0.0, ok, f"pattern={pat!r}")


@register_scorer("json_match")
async def json_match(response: str, reference: dict, config: dict, ctx: ScoringContext) -> ScoreResult:
    gold = reference.get("answer", {})
    m = re.search(r"\{.*\}", response, re.S)
    if not m:
        return ScoreResult(0.0, False, "no json object found")
    try:
        pred = json.loads(m.group(0))
    except json.JSONDecodeError:
        return ScoreResult(0.0, False, "invalid json")
    keys = config.get("keys") or (list(gold.keys()) if isinstance(gold, dict) else [])
    if not keys:
        ok = pred == gold
        return ScoreResult(1.0 if ok else 0.0, ok, "full-object compare")
    hits = [k for k in keys if str(pred.get(k)) == str(gold.get(k))]
    score = len(hits) / len(keys)
    return ScoreResult(score, score == 1.0, f"{len(hits)}/{len(keys)} keys correct")


@register_scorer("keyword_overlap")
async def keyword_overlap(response: str, reference: dict, config: dict, ctx: ScoringContext) -> ScoreResult:
    keywords = reference.get("keywords") or reference.get("rubric_keywords") or []
    if not keywords:
        return ScoreResult(0.0, False, "no keywords", needs_review=True)
    resp = normalize_text(response)
    hits = [k for k in keywords if normalize_text(str(k)) in resp]
    score = len(hits) / len(keywords)
    threshold = float(config.get("threshold", 0.5))
    return ScoreResult(round(score, 4), score >= threshold, f"{len(hits)}/{len(keywords)} keywords")
