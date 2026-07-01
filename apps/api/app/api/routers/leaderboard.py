"""Leaderboards: capability (aggregated benchmark scores) and arena Elo/Bradley-Terry."""
from __future__ import annotations

from fastapi import APIRouter, Depends
from sqlalchemy import Float, cast, func, select
from sqlalchemy.ext.asyncio import AsyncSession

from app.api.deps import get_current_user, is_registered
from app.api.sqlutil import bool_num
from app.arena.rating import compute_bradley_terry, compute_elo
from app.core.db import get_session
from app.models import ArenaMatch, ModelCatalog, Result, Run, User

router = APIRouter(prefix="/leaderboard", tags=["leaderboard"])


async def _display_names(session: AsyncSession) -> dict[str, str]:
    rows = (await session.scalars(select(ModelCatalog))).all()
    return {m.ref: m.display_name for m in rows}


@router.get("")
async def capability_leaderboard(
    domain: str | None = None,
    user: User | None = Depends(get_current_user),
    session: AsyncSession = Depends(get_session),
) -> dict:
    scoped = not is_registered(user)  # anon/guests only see their own results
    uid = user.id if user else None
    stmt = select(
        Result.model_ref,
        func.count(Result.id),
        func.avg(Result.score),
        func.avg(bool_num(Result.passed)),
        func.avg(Result.latency_ms),
        func.sum(Result.cost),
    ).group_by(Result.model_ref)
    if domain:
        stmt = stmt.where(Result.domain == domain)
    if scoped:
        stmt = stmt.join(Run, Run.id == Result.run_id).where(Run.user_id == uid)
    rows = (await session.execute(stmt)).all()
    names = await _display_names(session)

    # per-domain matrix
    dstmt = select(Result.model_ref, Result.domain, func.avg(Result.score), func.count(Result.id)).group_by(
        Result.model_ref, Result.domain
    )
    if scoped:
        dstmt = dstmt.join(Run, Run.id == Result.run_id).where(Run.user_id == uid)
    dmatrix: dict[str, dict] = {}
    for ref, dom, sc, n in (await session.execute(dstmt)).all():
        dmatrix.setdefault(ref, {})[dom] = {"score": round(float(sc or 0), 4), "n": int(n)}

    board = []
    for ref, n, avg_score, pass_rate, avg_lat, cost in rows:
        board.append(
            {
                "model_ref": ref,
                "display_name": names.get(ref, ref),
                "score": round(float(avg_score or 0), 4),
                "pass_rate": round(float(pass_rate or 0), 4),
                "n": int(n),
                "avg_latency_ms": round(float(avg_lat or 0), 1),
                "cost": round(float(cost or 0), 6),
                "by_domain": dmatrix.get(ref, {}),
            }
        )
    board.sort(key=lambda x: x["score"], reverse=True)
    for i, e in enumerate(board):
        e["rank"] = i + 1
    return {"domain": domain, "scope": "own" if scoped else "global", "leaderboard": board}


@router.get("/elo")
async def elo_leaderboard(
    kind: str | None = None,
    user: User | None = Depends(get_current_user),
    session: AsyncSession = Depends(get_session),
) -> dict:
    scoped = not is_registered(user)
    stmt = select(ArenaMatch).where(ArenaMatch.winner != "")
    if kind:
        stmt = stmt.where(ArenaMatch.kind == kind)
    if scoped:
        stmt = stmt.where(ArenaMatch.user_id == (user.id if user else None))
    matches = (await session.scalars(stmt)).all()
    md = [{"model_a": m.model_a, "model_b": m.model_b, "winner": m.winner} for m in matches]
    bt = compute_bradley_terry(md)
    elo = compute_elo(md)
    names = await _display_names(session)

    board = []
    for ref, stats in bt.items():
        board.append(
            {
                "model_ref": ref,
                "display_name": names.get(ref, ref),
                "rating": stats["rating"],
                "ci_low": stats["ci_low"],
                "ci_high": stats["ci_high"],
                "elo_live": round(elo.get(ref, 1000.0), 1),
                "wins": stats["wins"],
                "losses": stats["losses"],
                "ties": stats["ties"],
                "games": stats["games"],
            }
        )
    board.sort(key=lambda x: x["rating"], reverse=True)
    for i, e in enumerate(board):
        e["rank"] = i + 1
    return {"n_matches": len(md), "scope": "own" if scoped else "global", "leaderboard": board}
