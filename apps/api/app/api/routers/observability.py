"""Observability: cost, tokens, latency, traces."""
from __future__ import annotations

from fastapi import APIRouter, Depends
from sqlalchemy import Float, cast, func, select
from sqlalchemy.ext.asyncio import AsyncSession

from app.core.db import get_session
from app.models import Generation, ModelCatalog, Result, Run

router = APIRouter(prefix="/observability", tags=["observability"])


@router.get("/overview")
async def overview(session: AsyncSession = Depends(get_session)) -> dict:
    n_runs = await session.scalar(select(func.count(Run.id))) or 0
    n_gens = await session.scalar(select(func.count(Generation.id))) or 0
    total_cost = await session.scalar(select(func.sum(Generation.cost))) or 0.0
    prompt_tokens = await session.scalar(select(func.sum(Generation.prompt_tokens))) or 0
    completion_tokens = await session.scalar(select(func.sum(Generation.completion_tokens))) or 0
    avg_latency = await session.scalar(select(func.avg(Generation.latency_ms))) or 0.0
    errors = await session.scalar(select(func.count(Generation.id)).where(Generation.status == "error")) or 0
    active_runs = await session.scalar(select(func.count(Run.id)).where(Run.status == "running")) or 0
    n_results = await session.scalar(select(func.count(Result.id))) or 0
    return {
        "runs": int(n_runs),
        "active_runs": int(active_runs),
        "generations": int(n_gens),
        "results": int(n_results),
        "total_cost": round(float(total_cost), 4),
        "prompt_tokens": int(prompt_tokens),
        "completion_tokens": int(completion_tokens),
        "total_tokens": int(prompt_tokens + completion_tokens),
        "avg_latency_ms": round(float(avg_latency), 1),
        "error_rate": round(errors / n_gens, 4) if n_gens else 0.0,
    }


@router.get("/costs")
async def costs(session: AsyncSession = Depends(get_session)) -> list[dict]:
    rows = (
        await session.execute(
            select(
                Generation.model_ref,
                func.count(Generation.id),
                func.sum(Generation.prompt_tokens),
                func.sum(Generation.completion_tokens),
                func.sum(Generation.cost),
                func.avg(Generation.latency_ms),
                func.avg(cast(Generation.status == "error", Float)),
            ).group_by(Generation.model_ref)
        )
    ).all()
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
    run_id: str | None = None, limit: int = 100, session: AsyncSession = Depends(get_session)
) -> list[dict]:
    stmt = select(Generation).order_by(Generation.created_at.desc()).limit(limit)
    if run_id:
        stmt = stmt.where(Generation.run_id == run_id)
    rows = (await session.scalars(stmt)).all()
    return [
        {
            "id": g.id,
            "run_id": g.run_id,
            "model_ref": g.model_ref,
            "provider": g.provider,
            "kind": g.kind,
            "prompt_tokens": g.prompt_tokens,
            "completion_tokens": g.completion_tokens,
            "latency_ms": g.latency_ms,
            "cost": g.cost,
            "status": g.status,
            "error": g.error[:200],
            "created_at": g.created_at.isoformat() if g.created_at else None,
        }
        for g in rows
    ]
