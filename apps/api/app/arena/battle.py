"""Single battles: pairwise match (dual-swap judged) and multi-round debate."""
from __future__ import annotations

from dataclasses import dataclass, field

from app.observability.cost import compute_cost, price_for
from app.providers.base import ChatMessage, ModelRef
from app.providers.registry import call_model
from app.scoring.base import ScoringContext
from app.scoring.judge import judge_pairwise


async def get_answer(
    model_ref: str,
    prompt: str,
    user_keys: dict,
    *,
    sim: dict | None = None,
    system: str | None = None,
    temperature: float = 0.7,
    max_tokens: int = 700,
) -> tuple[str, float, int]:
    extra = {}
    if ModelRef.parse(model_ref).provider == "mock":
        extra["simulation"] = {"mode": "open", **(sim or {})}
    msgs = []
    if system:
        msgs.append(ChatMessage("system", system))
    msgs.append(ChatMessage("user", prompt))
    comp = await call_model(
        model_ref, msgs, user_keys=user_keys, temperature=temperature, max_tokens=max_tokens, extra=extra
    )
    inp, out, _ = price_for(model_ref)
    cost = compute_cost(comp.prompt_tokens, comp.completion_tokens, inp, out)
    return comp.text, cost, comp.latency_ms


@dataclass
class MatchResult:
    winner: str
    response_a: str
    response_b: str
    rationale: str
    cost: float
    scores: dict = field(default_factory=dict)


async def run_match(
    prompt: str,
    model_a: str,
    model_b: str,
    judge_model: str,
    user_keys: dict,
    *,
    sim_a: dict | None = None,
    sim_b: dict | None = None,
    reference: dict | None = None,
) -> MatchResult:
    ra, ca, _ = await get_answer(model_a, prompt, user_keys, sim=sim_a)
    rb, cb, _ = await get_answer(model_b, prompt, user_keys, sim=sim_b)
    ctx = ScoringContext(judge_model=judge_model, user_keys=user_keys)
    verdict = await judge_pairwise(prompt, ra, rb, ctx, reference=reference)
    return MatchResult(
        winner=verdict.winner,
        response_a=ra,
        response_b=rb,
        rationale=verdict.rationale,
        cost=round(ca + cb + verdict.cost, 6),
        scores=verdict.raw,
    )


@dataclass
class DebateResult:
    winner: str
    rounds: list[dict]
    rationale: str
    cost: float


_DEBATE_SYS_A = "You are Debater A. Argue FOR the resolution. Be concise, evidence-based, and rebut your opponent."
_DEBATE_SYS_B = "You are Debater B. Argue AGAINST the resolution. Be concise, evidence-based, and rebut your opponent."


async def run_debate(
    topic: str,
    model_a: str,
    model_b: str,
    judge_model: str,
    user_keys: dict,
    *,
    rounds: int = 3,
    sim_a: dict | None = None,
    sim_b: dict | None = None,
) -> DebateResult:
    transcript: list[dict] = []
    cost = 0.0
    history = ""
    for r in range(1, rounds + 1):
        prompt_a = f"Resolution: {topic}\n\nDebate so far:\n{history or '(opening)'}\n\nGive your round-{r} argument (FOR)."
        ta, cost_a, _ = await get_answer(model_a, prompt_a, user_keys, sim=sim_a, system=_DEBATE_SYS_A, max_tokens=450)
        history += f"\n[A r{r}]: {ta}"
        transcript.append({"round": r, "speaker": "a", "model": model_a, "text": ta})

        prompt_b = f"Resolution: {topic}\n\nDebate so far:\n{history}\n\nGive your round-{r} argument (AGAINST) and rebut A."
        tb, cost_b, _ = await get_answer(model_b, prompt_b, user_keys, sim=sim_b, system=_DEBATE_SYS_B, max_tokens=450)
        history += f"\n[B r{r}]: {tb}"
        transcript.append({"round": r, "speaker": "b", "model": model_b, "text": tb})
        cost += cost_a + cost_b

    # judge the whole debate (dual-swap)
    a_case = "\n".join(t["text"] for t in transcript if t["speaker"] == "a")
    b_case = "\n".join(t["text"] for t in transcript if t["speaker"] == "b")
    ctx = ScoringContext(judge_model=judge_model, user_keys=user_keys)
    verdict = await judge_pairwise(
        f"Debate resolution: {topic}. Which debater argued more persuasively and rigorously?",
        a_case, b_case, ctx,
    )
    return DebateResult(verdict.winner, transcript, verdict.rationale, round(cost + verdict.cost, 6))
