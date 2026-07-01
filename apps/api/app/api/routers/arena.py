"""Arena: pairwise match, multi-round debate, and single-elim tournaments."""
from __future__ import annotations

from fastapi import APIRouter, Depends, HTTPException, status
from pydantic import BaseModel, Field
from sqlalchemy import select
from sqlalchemy.ext.asyncio import AsyncSession

from app.api.deps import get_current_user
from app.api.sse import event_stream
from app.arena.battle import run_debate, run_match
from app.arena.prompts import get_prompts, get_topics
from app.arena.service import load_meta, sim_for
from app.core.config import settings
from app.core.db import get_session
from app.engine.dispatch import start_tournament
from app.engine.runner import _load_user_keys
from app.models import ArenaMatch, Tournament, User

router = APIRouter(prefix="/arena", tags=["arena"])


class MatchIn(BaseModel):
    model_a: str
    model_b: str
    domain: str = "mixed"
    prompt: str | None = None
    judge_model: str | None = None


class DebateIn(BaseModel):
    model_a: str
    model_b: str
    domain: str = "mixed"
    topic: str | None = None
    rounds: int = 3
    judge_model: str | None = None


class TournamentIn(BaseModel):
    name: str = ""
    models: list[str] = Field(default_factory=list)
    domain: str = "mixed"
    best_of: int = 3
    judge_model: str | None = None


def _match_out(m: ArenaMatch) -> dict:
    return {
        "id": m.id,
        "kind": m.kind,
        "domain": m.domain,
        "topic": m.topic,
        "prompt": m.prompt,
        "model_a": m.model_a,
        "model_b": m.model_b,
        "response_a": m.response_a,
        "response_b": m.response_b,
        "winner": m.winner,
        "judge_model": m.judge_model,
        "rationale": m.rationale,
        "rounds": m.rounds or [],
        "cost": m.cost,
        "created_at": m.created_at.isoformat() if m.created_at else None,
    }


@router.get("/prompts")
async def prompts(domain: str = "mixed") -> dict:
    return {"domain": domain, "prompts": get_prompts(domain, 5), "topics": get_topics(domain)}


@router.post("/match")
async def create_match(
    body: MatchIn,
    user: User | None = Depends(get_current_user),
    session: AsyncSession = Depends(get_session),
) -> dict:
    prompt = body.prompt or get_prompts(body.domain, 1)[0]
    user_keys = await _load_user_keys(session, user.id if user else None)
    meta = await load_meta(session, [body.model_a, body.model_b])
    judge = body.judge_model or settings.judge_model
    res = await run_match(
        prompt, body.model_a, body.model_b, judge, user_keys,
        sim_a=sim_for(meta.get(body.model_a, {})), sim_b=sim_for(meta.get(body.model_b, {})),
    )
    m = ArenaMatch(
        kind="elo", domain=body.domain, prompt=prompt, model_a=body.model_a, model_b=body.model_b,
        response_a=res.response_a[:6000], response_b=res.response_b[:6000], winner=res.winner,
        judge_model=judge, rationale=res.rationale[:1500], scores=res.scores, cost=res.cost,
        user_id=user.id if user else None,
    )
    session.add(m)
    await session.commit()
    return _match_out(m)


@router.post("/debate")
async def create_debate(
    body: DebateIn,
    user: User | None = Depends(get_current_user),
    session: AsyncSession = Depends(get_session),
) -> dict:
    topic = body.topic or get_topics(body.domain)[0]
    user_keys = await _load_user_keys(session, user.id if user else None)
    meta = await load_meta(session, [body.model_a, body.model_b])
    judge = body.judge_model or settings.judge_model
    res = await run_debate(
        topic, body.model_a, body.model_b, judge, user_keys, rounds=max(1, min(body.rounds, 5)),
        sim_a=sim_for(meta.get(body.model_a, {})), sim_b=sim_for(meta.get(body.model_b, {})),
    )
    m = ArenaMatch(
        kind="debate", domain=body.domain, topic=topic, model_a=body.model_a, model_b=body.model_b,
        winner=res.winner, judge_model=judge, rationale=res.rationale[:1500], rounds=res.rounds,
        cost=res.cost, user_id=user.id if user else None,
    )
    session.add(m)
    await session.commit()
    return _match_out(m)


@router.get("/matches")
async def list_matches(
    kind: str | None = None,
    limit: int = 50,
    user: User | None = Depends(get_current_user),
    session: AsyncSession = Depends(get_session),
) -> list[dict]:
    from app.api.deps import is_registered

    stmt = select(ArenaMatch).where(ArenaMatch.tournament_id.is_(None)).order_by(ArenaMatch.created_at.desc()).limit(limit)
    if kind:
        stmt = stmt.where(ArenaMatch.kind == kind)
    if not is_registered(user):  # guests only see their own battles
        stmt = stmt.where(ArenaMatch.user_id == (user.id if user else None))
    rows = (await session.scalars(stmt)).all()
    return [_match_out(m) for m in rows]


@router.get("/matches/{match_id}")
async def get_match(match_id: str, session: AsyncSession = Depends(get_session)) -> dict:
    m = await session.get(ArenaMatch, match_id)
    if not m:
        raise HTTPException(status.HTTP_404_NOT_FOUND, "Match not found")
    return _match_out(m)


# ---- tournaments ----
def _tournament_out(t: Tournament) -> dict:
    return {
        "id": t.id,
        "name": t.name,
        "format": t.format,
        "status": t.status,
        "domain": t.domain,
        "models": t.models or [],
        "bracket": t.bracket or {},
        "champion": t.champion,
        "config": t.config or {},
        "created_at": t.created_at.isoformat() if t.created_at else None,
    }


@router.post("/tournament")
async def create_tournament(
    body: TournamentIn,
    user: User | None = Depends(get_current_user),
    session: AsyncSession = Depends(get_session),
) -> dict:
    if len(body.models) < 2:
        raise HTTPException(status.HTTP_400_BAD_REQUEST, "Need at least 2 models")
    t = Tournament(
        name=body.name or f"{body.domain.title()} Cup",
        domain=body.domain,
        models=body.models,
        status="pending",
        config={
            "best_of": max(1, min(body.best_of, 7)),
            "judge_model": body.judge_model or settings.judge_model,
            "user_id": user.id if user else None,
        },
    )
    session.add(t)
    await session.commit()
    await start_tournament(t.id)
    return _tournament_out(t)


@router.get("/tournaments")
async def list_tournaments(
    limit: int = 30,
    user: User | None = Depends(get_current_user),
    session: AsyncSession = Depends(get_session),
) -> list[dict]:
    from app.api.deps import is_registered

    rows = (await session.scalars(select(Tournament).order_by(Tournament.created_at.desc()).limit(limit))).all()
    if not is_registered(user):  # guests only see their own tournaments
        uid = user.id if user else None
        rows = [t for t in rows if (t.config or {}).get("user_id") == uid]
    return [_tournament_out(t) for t in rows]


@router.get("/tournaments/{tid}")
async def get_tournament(tid: str, session: AsyncSession = Depends(get_session)) -> dict:
    t = await session.get(Tournament, tid)
    if not t:
        raise HTTPException(status.HTTP_404_NOT_FOUND, "Tournament not found")
    matches = (
        await session.scalars(
            select(ArenaMatch).where(ArenaMatch.tournament_id == tid).order_by(ArenaMatch.round_no)
        )
    ).all()
    out = _tournament_out(t)
    out["matches"] = [_match_out(m) for m in matches]
    return out


@router.get("/tournaments/{tid}/stream")
async def stream_tournament(tid: str, session: AsyncSession = Depends(get_session)):
    t = await session.get(Tournament, tid)
    if not t:
        raise HTTPException(status.HTTP_404_NOT_FOUND, "Tournament not found")

    async def poll():
        from app.core.db import SessionLocal

        async with SessionLocal() as s:
            row = await s.get(Tournament, tid)
            return {"status": row.status, "champion": row.champion} if row else None

    return await event_stream(
        f"tournament:{tid}", initial=_tournament_out(t), poll=poll,
        done_types=("tournament_completed",),
    )
