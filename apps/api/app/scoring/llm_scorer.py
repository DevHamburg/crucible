"""Registers the judge-backed scorers into the scorer registry."""
from __future__ import annotations

from app.scoring.base import ScoreResult, ScoringContext, register_scorer
from app.scoring.judge import judge_pointwise


@register_scorer("llm_judge")
@register_scorer("rubric")
@register_scorer("g_eval")
async def llm_judge(response: str, reference: dict, config: dict, ctx: ScoringContext) -> ScoreResult:
    task = ctx.item.get("prompt", "")
    res = await judge_pointwise(task, response, reference, config, ctx)
    return res
