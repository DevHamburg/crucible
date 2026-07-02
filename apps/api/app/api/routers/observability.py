"""Observability: cost, tokens, latency, traces."""
from __future__ import annotations

import time

from fastapi import APIRouter, Depends, Query
from sqlalchemy import func, select
from sqlalchemy.ext.asyncio import AsyncSession

from app.api.deps import get_current_user, is_registered
from app.api.sqlutil import bool_num
from app.core.db import get_session
from app.models import Generation, ModelCatalog, Result, Run, User

router = APIRouter(prefix="/observability", tags=["observability"])

# The overview is polled every ~5s by both the dashboard and the observability page; cache it
# briefly per (scope, uid) so N open tabs don't each trigger full-table aggregates every tick.
_OVERVIEW_CACHE: dict[tuple, tuple[float, dict]] = {}
_OVERVIEW_TTL = 4.0


@router.get("/overview")
async def overview(
    user: User | None = Depends(get_current_user), session: AsyncSession = Depends(get_session)
) -> dict:
    scoped = not is_registered(user)
    uid = user.id if user else None
    cache_key = (scoped, uid)
    cached = _OVERVIEW_CACHE.get(cache_key)
    if cached and (time.monotonic() - cached[0]) < _OVERVIEW_TTL:
        return cached[1]

    # One pass over generations (the largest table) instead of six separate scans.
    gen_q = select(
        func.count(Generation.id),
        func.coalesce(func.sum(Generation.cost), 0.0),
        func.coalesce(func.sum(Generation.prompt_tokens), 0),
        func.coalesce(func.sum(Generation.completion_tokens), 0),
        func.coalesce(func.avg(Generation.latency_ms), 0.0),
        func.coalesce(func.sum(bool_num(Generation.status == "error")), 0.0),
    )
    if scoped:
        gen_q = gen_q.join(Run, Run.id == Generation.run_id).where(Run.user_id == uid)
    n_gens, total_cost, prompt_tokens, completion_tokens, avg_latency, errors = (
        await session.execute(gen_q)
    ).one()

    # One pass over runs (count + active count).
    run_q = select(func.count(Run.id), func.coalesce(func.sum(bool_num(Run.status == "running")), 0.0))
    if scoped:
        run_q = run_q.where(Run.user_id == uid)
    n_runs, active_runs = (await session.execute(run_q)).one()

    res_q = select(func.count(Result.id))
    if scoped:
        res_q = res_q.join(Run, Run.id == Result.run_id).where(Run.user_id == uid)
    n_results = await session.scalar(res_q) or 0

    n_gens = int(n_gens or 0)
    result = {
        "scope": "own" if scoped else "global",
        "runs": int(n_runs or 0),
        "active_runs": int(active_runs or 0),
        "generations": n_gens,
        "results": int(n_results),
        "total_cost": round(float(total_cost or 0), 4),
        "prompt_tokens": int(prompt_tokens or 0),
        "completion_tokens": int(completion_tokens or 0),
        "total_tokens": int((prompt_tokens or 0) + (completion_tokens or 0)),
        "avg_latency_ms": round(float(avg_latency or 0), 1),
        "error_rate": round(int(errors or 0) / n_gens, 4) if n_gens else 0.0,
    }
    _OVERVIEW_CACHE[cache_key] = (time.monotonic(), result)
    return result


@router.get("/costs")
async def costs(
    user: User | None = Depends(get_current_user), session: AsyncSession = Depends(get_session)
) -> list[dict]:
    scoped = not is_registered(user)
    stmt = select(
        Generation.model_ref,
        func.count(Generation.id),
        func.sum(Generation.prompt_tokens),
        func.sum(Generation.completion_tokens),
        func.sum(Generation.cost),
        func.avg(Generation.latency_ms),
        func.avg(bool_num(Generation.status == "error")),
    ).group_by(Generation.model_ref)
    if scoped:
        stmt = stmt.join(Run, Run.id == Generation.run_id).where(Run.user_id == (user.id if user else None))
    rows = (await session.execute(stmt)).all()
    names = {m.ref: m.display_name for m in (await session.scalars(select(ModelCatalog))).all()}
    out = []
    for ref, calls, pt, ct, cost, lat, err in rows:
        out.append(
            {
                "model_ref": ref,
                "display_name": names.get(ref, ref),
                "calls": int(calls),
                "prompt_tokens": int(pt or 0),
                "completion_tokens": int(ct or 0),
                "cost": round(float(cost or 0), 6),
                "avg_latency_ms": round(float(lat or 0), 1),
                "error_rate": round(float(err or 0), 4),
                "tokens_per_call": round((int(pt or 0) + int(ct or 0)) / calls, 1) if calls else 0,
            }
        )
    out.sort(key=lambda x: x["cost"], reverse=True)
    return out


@router.get("/generations")
async def generations(
    run_id: str | None = None,
    limit: int = Query(default=100, ge=1, le=200),
    session: AsyncSession = Depends(get_session),
) -> list[dict]:
    # Select only the columns the response uses — never response_text (up to 8000 chars) or
    # the request JSON, which the trace list doesn't show.
    G = Generation
    stmt = (
        select(
            G.id, G.run_id, G.model_ref, G.provider, G.kind, G.prompt_tokens,
            G.completion_tokens, G.latency_ms, G.cost, G.status, G.error, G.created_at,
        )
        .order_by(G.created_at.desc())
        .limit(limit)
    )
    if run_id:
        stmt = stmt.where(G.run_id == run_id)
    rows = (await session.execute(stmt)).all()
    return [
        {
            "id": r.id,
            "run_id": r.run_id,
            "model_ref": r.model_ref,
            "provider": r.provider,
            "kind": r.kind,
            "prompt_tokens": r.prompt_tokens,
            "completion_tokens": r.completion_tokens,
            "latency_ms": r.latency_ms,
            "cost": r.cost,
            "status": r.status,
            "error": (r.error or "")[:200],
            "created_at": r.created_at.isoformat() if r.created_at else None,
        }
        for r in rows
    ]
