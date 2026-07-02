"""Benchmark runs: create, list, detail, aggregated results, live SSE stream, cancel."""
from __future__ import annotations

from fastapi import APIRouter, Depends, HTTPException, Query, status
from pydantic import BaseModel, Field
from sqlalchemy import func, select
from sqlalchemy.ext.asyncio import AsyncSession

from app.api.deps import get_current_user, is_registered
from app.api.serialize import run_out
from app.api.sqlutil import bool_num
from app.api.sse import event_stream
from app.core.config import settings
from app.core.db import SessionLocal, get_session
from app.engine.dispatch import cancel as cancel_task
from app.engine.dispatch import start_run
from app.models import Result, Run, User

router = APIRouter(prefix="/runs", tags=["runs"])


class RunIn(BaseModel):
    name: str = ""
    models: list[str] = Field(default_factory=list, max_length=50)
    benchmarks: list[str] = Field(default_factory=list, max_length=50)
    limit: int = Field(default=10, ge=1, le=200)
    temperature: float = Field(default=0.2, ge=0.0, le=2.0)
    max_tokens: int = Field(default=1024, ge=1, le=32768)
    judge_model: str | None = None
    concurrency: int | None = Field(default=None, ge=1, le=64)
    budget: float | None = Field(default=None, ge=0.0)


@router.post("")
async def create_run(
    body: RunIn,
    user: User | None = Depends(get_current_user),
    session: AsyncSession = Depends(get_session),
) -> dict:
    if not body.models:
        raise HTTPException(status.HTTP_400_BAD_REQUEST, "Select at least one model")
    if not body.benchmarks:
        raise HTTPException(status.HTTP_400_BAD_REQUEST, "Select at least one benchmark")
    config = {
        "models": body.models,
        "benchmarks": body.benchmarks,
        "limit": max(1, min(body.limit, 200)),
        "temperature": body.temperature,
        "max_tokens": body.max_tokens,
        "judge_model": body.judge_model or settings.judge_model,
        "concurrency": body.concurrency or settings.max_concurrency,
        "budget": body.budget if body.budget is not None else settings.global_run_budget_usd,
    }
    run = Run(
        name=body.name or f"Run · {', '.join(body.benchmarks[:2])}",
        kind="benchmark",
        status="pending",
        config=config,
        user_id=user.id if user else None,
    )
    session.add(run)
    await session.commit()
    await start_run(run.id)
    return run_out(run)


@router.get("")
async def list_runs(
    kind: str | None = None,
    limit: int = Query(default=50, ge=1, le=200),
    scope: str = "own",
    user: User | None = Depends(get_current_user),
    session: AsyncSession = Depends(get_session),
) -> list[dict]:
    stmt = select(Run).order_by(Run.created_at.desc()).limit(limit)
    if kind:
        stmt = stmt.where(Run.kind == kind)
    # Everyone sees their own runs; registered users can request the community feed.
    if scope == "community" and is_registered(user):
        pass
    else:
        stmt = stmt.where(Run.user_id == (user.id if user else None))
    rows = (await session.scalars(stmt)).all()
    return [run_out(r) for r in rows]


def _can_view(run: Run, user: User | None) -> bool:
    if user and run.user_id == user.id:
        return True
    return is_registered(user)  # registered accounts can view any run


@router.get("/{run_id}")
async def get_run(
    run_id: str,
    user: User | None = Depends(get_current_user),
    session: AsyncSession = Depends(get_session),
) -> dict:
    run = await session.get(Run, run_id)
    if not run:
        raise HTTPException(status.HTTP_404_NOT_FOUND, "Run not found")
    if not _can_view(run, user):
        raise HTTPException(status.HTTP_403_FORBIDDEN, "This run is private — sign in to view community runs")
    return run_out(run)


@router.get("/{run_id}/results")
async def run_results(
    run_id: str,
    items: bool = Query(default=False),
    item_limit: int = Query(default=100, ge=1, le=200),
    user: User | None = Depends(get_current_user),
    session: AsyncSession = Depends(get_session),
) -> dict:
    run = await session.get(Run, run_id)
    if not run:
        raise HTTPException(status.HTTP_404_NOT_FOUND, "Run not found")
    if not _can_view(run, user):
        raise HTTPException(status.HTTP_403_FORBIDDEN, "This run is private — sign in to view community runs")

    # per model x benchmark aggregate
    rows = (
        await session.execute(
            select(
                Result.model_ref,
                Result.benchmark_slug,
                Result.domain,
                func.count(Result.id),
                func.avg(Result.score),
                func.avg(bool_num(Result.passed)),
                func.avg(Result.latency_ms),
                func.sum(Result.cost),
            )
            .where(Result.run_id == run_id)
            .group_by(Result.model_ref, Result.benchmark_slug, Result.domain)
        )
    ).all()

    by_bench = []
    per_model: dict[str, dict] = {}
    for model_ref, slug, domain, n, avg_score, pass_rate, avg_lat, cost in rows:
        entry = {
            "model_ref": model_ref,
            "benchmark": slug,
            "domain": domain,
            "n": int(n),
            "score": round(float(avg_score or 0), 4),
            "pass_rate": round(float(pass_rate or 0), 4),
            "avg_latency_ms": round(float(avg_lat or 0), 1),
            "cost": round(float(cost or 0), 6),
        }
        by_bench.append(entry)
        pm = per_model.setdefault(model_ref, {"model_ref": model_ref, "n": 0, "score_sum": 0.0, "cost": 0.0, "lat_sum": 0.0})
        pm["n"] += int(n)
        pm["score_sum"] += float(avg_score or 0) * int(n)
        pm["cost"] += float(cost or 0)
        pm["lat_sum"] += float(avg_lat or 0) * int(n)

    leaderboard = sorted(
        (
            {
                "model_ref": m["model_ref"],
                "score": round(m["score_sum"] / m["n"], 4) if m["n"] else 0,
                "n": m["n"],
                "cost": round(m["cost"], 6),
                "avg_latency_ms": round(m["lat_sum"] / m["n"], 1) if m["n"] else 0,
            }
            for m in per_model.values()
        ),
        key=lambda x: x["score"],
        reverse=True,
    )

    out = {"run": run_out(run), "leaderboard": leaderboard, "by_benchmark": by_bench}
    if items:
        rows2 = (
            await session.scalars(
                select(Result).where(Result.run_id == run_id).order_by(Result.created_at.desc()).limit(item_limit)
            )
        ).all()
        out["items"] = [
            {
                "model_ref": r.model_ref,
                "benchmark": r.benchmark_slug,
                "domain": r.domain,
                "prompt": r.prompt[:300],
                "response": r.response[:600],
                "score": r.score,
                "passed": r.passed,
                "latency_ms": r.latency_ms,
                "rationale": r.rationale[:300],
                "needs_review": r.needs_review,
            }
            for r in rows2
        ]
    return out


@router.get("/{run_id}/stream")
async def stream_run(run_id: str):
    # No request-scoped session: an SSE stream holds its dependencies open for its whole
    # lifetime, which would pin a pooled DB connection until the client disconnects.
    async with SessionLocal() as s:
        run = await s.get(Run, run_id)
        if not run:
            raise HTTPException(status.HTTP_404_NOT_FOUND, "Run not found")
        initial = run_out(run)

    async def poll():
        async with SessionLocal() as s:
            r = await s.get(Run, run_id)
            if not r:
                return None
            return {"status": r.status, "progress": r.progress, "done": r.done_items,
                    "total": r.total_items, "cost": r.total_cost}

    return await event_stream(run_id, initial=initial, poll=poll)


@router.post("/{run_id}/cancel")
async def cancel_run(run_id: str, session: AsyncSession = Depends(get_session)) -> dict:
    run = await session.get(Run, run_id)
    if not run:
        raise HTTPException(status.HTTP_404_NOT_FOUND, "Run not found")
    cancel_task(f"run:{run_id}")
    run.status = "cancelled"
    await session.commit()
    return run_out(run)
