"""Observability: cost, tokens, latency, traces."""
from __future__ import annotations

from fastapi import APIRouter, Depends
from sqlalchemy import Float, cast, func, select
from sqlalchemy.ext.asyncio import AsyncSession

from app.api.deps import get_current_user, is_registered
from app.api.sqlutil import bool_num
from app.core.db import get_session
from app.models import Generation, ModelCatalog, Result, Run, User

router = APIRouter(prefix="/observability", tags=["observability"])


@router.get("/overview")
async def overview(
    user: User | None = Depends(get_current_user), session: AsyncSession = Depends(get_session)
) -> dict:
    scoped = not is_registered(user)
    uid = user.id if user else None

    def gen_q(agg):
        q = select(agg)
        if scoped:
            q = q.join(Run, Run.id == Generation.run_id).where(Run.user_id == uid)
        return q

    def run_q(agg, *where):
        q = select(agg).where(*where)
        if scoped:
            q = q.where(Run.user_id == uid)
        return q

    n_runs = await session.scalar(run_q(func.count(Run.id))) or 0
    n_gens = await session.scalar(gen_q(func.count(Generation.id))) or 0
    total_cost = await session.scalar(gen_q(func.sum(Generation.cost))) or 0.0
    prompt_tokens = await session.scalar(gen_q(func.sum(Generation.prompt_tokens))) or 0
    completion_tokens = await session.scalar(gen_q(func.sum(Generation.completion_tokens))) or 0
    avg_latency = await session.scalar(gen_q(func.avg(Generation.latency_ms))) or 0.0
    errors = await session.scalar(gen_q(func.count(Generation.id)).where(Generation.status == "error")) or 0
    active_runs = await session.scalar(run_q(func.count(Run.id), Run.status == "running")) or 0
    n_results = await session.scalar(
        (select(func.count(Result.id)).join(Run, Run.id == Result.run_id).where(Run.user_id == uid))
        if scoped else select(func.count(Result.id))
    ) or 0
    return {
        "scope": "own" if scoped else "global",
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
