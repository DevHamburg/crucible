"""Populate the platform with a clean SHOWCASE dataset so the dashboard, leaderboard, arena
and safety views are full on first look. Uses the simulated fleet — no API keys needed.

Run:  python -m app.seeds.demo
"""
from __future__ import annotations

import asyncio
import itertools

from sqlalchemy import func, select

from app.arena.battle import run_debate, run_match
from app.arena.prompts import get_prompts
from app.arena.service import load_meta, sim_for
from app.core.db import SessionLocal, init_db
from app.engine.runner import execute_run
from app.models import ArenaMatch, Benchmark, ModelCatalog, Run
from app.safety.runner import execute_safety_run

FLEET = ["mock/sage-70b", "mock/atlas-34b", "mock/nova-8b", "mock/pixie-3b", "mock/rogue-13b"]
JUDGE = "mock/judge-pro"


async def _ensure_seeded() -> None:
    async with SessionLocal() as s:
        n = await s.scalar(select(func.count(ModelCatalog.id)))
    if not n:
        from app.seeds.seed import seed_admin, seed_benchmarks, seed_models

        async with SessionLocal() as s:
            await seed_models(s)
            await seed_benchmarks(s)
            await seed_admin(s)
            await s.commit()


async def _benchmark_showcase() -> None:
    async with SessionLocal() as s:
        slugs = [
            b.slug
            for b in (await s.scalars(select(Benchmark).where(Benchmark.is_active))).all()
        ][:8]
        run = Run(
            name="Showcase · multi-domain sweep",
            kind="benchmark",
            status="pending",
            config={"models": FLEET, "benchmarks": slugs, "limit": 8, "judge_model": JUDGE},
        )
        s.add(run)
        await s.commit()
        rid = run.id
    print(f"  running benchmark sweep ({len(FLEET)} models × 8 suites)…")
    await execute_run(rid)


async def _arena_showcase() -> None:
    async with SessionLocal() as s:
        meta = await load_meta(s, FLEET)
    print("  running arena round-robin…")
    for a, b in itertools.combinations(FLEET, 2):
        for prompt in get_prompts("mixed", 2):
            res = await run_match(
                prompt, a, b, JUDGE, {},
                sim_a=sim_for(meta.get(a, {})), sim_b=sim_for(meta.get(b, {})),
            )
            async with SessionLocal() as s:
                s.add(ArenaMatch(
                    kind="elo", domain="mixed", prompt=prompt, model_a=a, model_b=b,
                    response_a=res.response_a[:3000], response_b=res.response_b[:3000],
                    winner=res.winner, judge_model=JUDGE, rationale=res.rationale[:800], cost=res.cost,
                ))
                await s.commit()
    # a couple of debates
    for a, b in [("mock/sage-70b", "mock/atlas-34b"), ("mock/nova-8b", "mock/pixie-3b")]:
        async with SessionLocal() as s:
            meta = await load_meta(s, [a, b])
        res = await run_debate(
            "Resolved: Open-weight models will win enterprise AI.", a, b, JUDGE, {}, rounds=2,
            sim_a=sim_for(meta.get(a, {})), sim_b=sim_for(meta.get(b, {})),
        )
        async with SessionLocal() as s:
            s.add(ArenaMatch(
                kind="debate", domain="mixed", topic="Open-weight vs closed for enterprise",
                model_a=a, model_b=b, winner=res.winner, judge_model=JUDGE,
                rationale=res.rationale[:800], rounds=res.rounds, cost=res.cost,
            ))
            await s.commit()


async def _safety_showcase() -> None:
    async with SessionLocal() as s:
        run = Run(
            name="Showcase · adaptive red-team",
            kind="safety",
            status="pending",
            config={"models": FLEET, "adaptive": True, "attacker_model": "mock/redteam-adaptive", "max_rounds": 4},
        )
        s.add(run)
        await s.commit()
        rid = run.id
    print("  running adaptive safety scan…")
    await execute_safety_run(rid)


async def main() -> None:
    print("→ preparing showcase data")
    await init_db()
    await _ensure_seeded()
    await _benchmark_showcase()
    await _arena_showcase()
    await _safety_showcase()
    print("✓ demo data ready — open the dashboard")


if __name__ == "__main__":
    asyncio.run(main())
