"""Integration tests for the run engine against the mock provider + a throwaway SQLite DB.

Covers the two behaviours that previously had zero coverage and are the real-money /
liveness safety net: the USD budget guard, and clean terminal status on success.
(DB is isolated by tests/conftest.py.)
"""
from __future__ import annotations

import pytest
from sqlalchemy import select

from app.core.db import SessionLocal, init_db
from app.engine.runner import execute_run
from app.models import Benchmark, BenchmarkItem, ModelCatalog, Result, Run


async def _seed_min() -> None:
    """Idempotent minimal seed (tests share one SQLite file)."""
    await init_db()
    async with SessionLocal() as s:
        if await s.scalar(select(Benchmark).where(Benchmark.slug == "t-kw")):
            return
        s.add(
            ModelCatalog(
                ref="mock/alpha", provider="mock", model_id="alpha", display_name="Alpha",
                input_price=1.0, output_price=1.0, meta={"skill": 0.8, "safety": 0.9},
            )
        )
        b = Benchmark(
            slug="t-kw", name="Keyword suite", domain="general",
            task_type="open", scoring_type="keyword_overlap",
        )
        s.add(b)
        await s.flush()
        for i in range(6):
            s.add(
                BenchmarkItem(
                    benchmark_id=b.id, prompt=f"Explain topic {i} in detail.",
                    reference={"keywords": ["topic", "detail"]},
                )
            )
        await s.commit()


async def _make_run(budget: float) -> str:
    async with SessionLocal() as s:
        run = Run(
            name="t", kind="benchmark", status="pending",
            config={"models": ["mock/alpha"], "benchmarks": ["t-kw"], "limit": 6, "budget": budget},
        )
        s.add(run)
        await s.commit()
        return run.id


@pytest.mark.asyncio
async def test_run_completes_and_records_results():
    await _seed_min()
    run_id = await _make_run(budget=100.0)
    await execute_run(run_id)
    async with SessionLocal() as s:
        run = await s.get(Run, run_id)
        results = (await s.scalars(select(Result).where(Result.run_id == run_id))).all()
    assert run.status == "completed"
    assert run.finished_at is not None
    assert run.done_items == 6
    assert len(results) == 6


@pytest.mark.asyncio
async def test_run_ends_error_on_scorer_crash():
    """A crashing scorer must terminate the run as 'error' — not leave it stuck 'running'."""
    await _seed_min()
    async with SessionLocal() as s:
        b = Benchmark(
            slug="t-badre", name="Bad regex", domain="general",
            task_type="open", scoring_type="regex_match",
        )
        s.add(b)
        await s.flush()
        s.add(BenchmarkItem(benchmark_id=b.id, prompt="anything", reference={"pattern": "("}))
        await s.commit()
        run = Run(
            name="t", kind="benchmark", status="pending",
            config={"models": ["mock/alpha"], "benchmarks": ["t-badre"], "limit": 1},
        )
        s.add(run)
        await s.commit()
        run_id = run.id
    await execute_run(run_id)
    async with SessionLocal() as s:
        run = await s.get(Run, run_id)
    assert run.status == "error"
    assert run.finished_at is not None
    assert run.error


@pytest.mark.asyncio
async def test_budget_guard_stops_run_early():
    await _seed_min()
    run_id = await _make_run(budget=0.0)  # first item's spend already exceeds a 0 budget
    await execute_run(run_id)
    async with SessionLocal() as s:
        run = await s.get(Run, run_id)
    # A budget stop is a clean terminal state (not stuck 'running'), flagged in .error,
    # and must not have processed the whole worklist.
    assert run.status == "completed"
    assert "budget" in run.error
    assert run.done_items < 6
