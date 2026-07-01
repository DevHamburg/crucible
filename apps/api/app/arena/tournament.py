"""Single-elimination tournament executor. Each match is best-of-`m` prompts from the
tournament's domain pool; the model winning more prompts advances. Emits live events on
channel `tournament:{id}` and stores every prompt-level ArenaMatch."""
from __future__ import annotations

import math
from datetime import datetime, timezone

from app.core.config import settings
from app.core.db import SessionLocal
from app.engine.events import bus
from app.engine.runner import _load_user_keys
from app.arena.battle import run_match
from app.arena.prompts import get_prompts
from app.arena.service import load_meta, sim_for
from app.models import ArenaMatch, Tournament


def utcnow() -> datetime:
    return datetime.now(timezone.utc)


async def execute_tournament(tournament_id: str) -> None:
    async with SessionLocal() as s:
        t = await s.get(Tournament, tournament_id)
        if t is None:
            return
        models = list(t.models or [])
        domain = t.domain or "mixed"
        best_of = int((t.config or {}).get("best_of", 3))
        judge_model = (t.config or {}).get("judge_model") or settings.judge_model
        user_keys = await _load_user_keys(s, (t.config or {}).get("user_id"))
        meta = await load_meta(s, models)
        t.status = "running"
        await s.commit()

    channel = f"tournament:{tournament_id}"
    prompts = get_prompts(domain, best_of)
    await bus.publish(channel, {"type": "tournament_started", "id": tournament_id, "models": models})

    # build first-round pairs (byes auto-advance)
    size = 1 << (max(1, len(models) - 1)).bit_length()
    padded: list[str | None] = list(models) + [None] * (size - len(models))
    current = padded
    bracket_rounds: list[dict] = []
    round_no = 0

    while len([m for m in current if m]) > 1:
        pairs = [(current[i], current[i + 1]) for i in range(0, len(current), 2)]
        next_round: list[str | None] = []
        round_matches = []
        for a, b in pairs:
            if a and not b:
                next_round.append(a)
                round_matches.append({"a": a, "b": None, "winner": a, "bye": True})
                continue
            if b and not a:
                next_round.append(b)
                round_matches.append({"a": None, "b": b, "winner": b, "bye": True})
                continue
            wins_a = wins_b = 0
            total_cost = 0.0
            for pi, prompt in enumerate(prompts):
                res = await run_match(
                    prompt, a, b, judge_model, user_keys,
                    sim_a=sim_for(meta.get(a, {})), sim_b=sim_for(meta.get(b, {})),
                )
                total_cost += res.cost
                if res.winner == "a":
                    wins_a += 1
                elif res.winner == "b":
                    wins_b += 1
                async with SessionLocal() as s:
                    s.add(ArenaMatch(
                        kind="tournament", tournament_id=tournament_id, round_no=round_no,
                        domain=domain, prompt=prompt, model_a=a, model_b=b,
                        response_a=res.response_a[:4000], response_b=res.response_b[:4000],
                        winner=res.winner, judge_model=judge_model, rationale=res.rationale[:1000],
                        cost=res.cost,
                    ))
                    await s.commit()
                await bus.publish(channel, {
                    "type": "match_progress", "round": round_no, "a": a, "b": b,
                    "prompt_index": pi, "winner": res.winner, "wins_a": wins_a, "wins_b": wins_b,
                })
            winner = a if wins_a >= wins_b else b
            next_round.append(winner)
            round_matches.append({"a": a, "b": b, "winner": winner, "wins_a": wins_a, "wins_b": wins_b})
            await bus.publish(channel, {
                "type": "match_completed", "round": round_no, "a": a, "b": b, "winner": winner,
            })
        bracket_rounds.append({"round": round_no, "matches": round_matches})
        current = next_round
        round_no += 1

    champion = next((m for m in current if m), "")
    async with SessionLocal() as s:
        t = await s.get(Tournament, tournament_id)
        t.status = "completed"
        t.champion = champion
        t.bracket = {"rounds": bracket_rounds}
        await s.commit()
    await bus.publish(channel, {"type": "tournament_completed", "id": tournament_id, "champion": champion})


__all__ = ["execute_tournament"]
