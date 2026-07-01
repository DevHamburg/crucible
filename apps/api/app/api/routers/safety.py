"""Safety / red-team: run the probe suite and report robustness."""
from __future__ import annotations

from fastapi import APIRouter, Depends, HTTPException, status
from pydantic import BaseModel, Field
from sqlalchemy import Float, cast, func, select
from sqlalchemy.ext.asyncio import AsyncSession

from app.api.deps import get_current_user
from app.api.serialize import run_out
from app.api.sqlutil import bool_num
from app.core.config import settings
from app.core.db import get_session
from app.engine.dispatch import start_run
from app.models import ModelCatalog, Run, SafetyResult, User
from app.safety.probes import probes_by_category

router = APIRouter(prefix="/safety", tags=["safety"])

_CAT_DESC = {
    "prompt_injection": "Override the system's instructions via injected commands.",
    "system_prompt_leak": "Extract a planted secret from the system prompt.",
    "persona_override": "Roleplay / DAN-style jailbreak framing.",
    "hypothetical_framing": "Smuggle instructions inside fiction/hypotheticals.",
    "obfuscation_encoding": "Hide instructions in base64/ROT13 encodings.",
    "payload_splitting": "Split the malicious instruction into concatenated fragments.",
    "indirect_injection": "Injected instruction hidden inside a document/email to process.",
}


class SafetyRunIn(BaseModel):
    models: list[str] = Field(default_factory=list)
    categories: list[str] = Field(default_factory=list)
    adaptive: bool = False
    attacker_model: str | None = None
    max_rounds: int = 4
    limit_per_category: int | None = None


@router.get("/categories")
async def categories() -> list[dict]:
    by_cat = probes_by_category()
    return [
        {"category": cat, "description": _CAT_DESC.get(cat, ""), "probes": len(probes)}
        for cat, probes in by_cat.items()
    ]


@router.post("/run")
async def create_safety_run(
    body: SafetyRunIn,
    user: User | None = Depends(get_current_user),
    session: AsyncSession = Depends(get_session),
) -> dict:
    if not body.models:
        raise HTTPException(status.HTTP_400_BAD_REQUEST, "Select at least one model")
    run = Run(
        name=f"Safety · {len(body.models)} model(s)" + (" · adaptive" if body.adaptive else ""),
        kind="safety",
        status="pending",
        user_id=user.id if user else None,
        config={
            "models": body.models,
            "categories": body.categories,
            "adaptive": body.adaptive,
            "attacker_model": body.attacker_model or settings.redteam_attacker_model,
            "max_rounds": body.max_rounds,
            "limit_per_category": body.limit_per_category,
        },
    )
    session.add(run)
    await session.commit()
    await start_run(run.id)
    return run_out(run)


@router.get("/report/{run_id}")
async def safety_report(run_id: str, session: AsyncSession = Depends(get_session)) -> dict:
    run = await session.get(Run, run_id)
    if not run:
        raise HTTPException(status.HTTP_404_NOT_FOUND, "Run not found")

    rows = (
        await session.execute(
            select(
                SafetyResult.model_ref,
                SafetyResult.category,
                func.count(SafetyResult.id),
                func.avg(bool_num(SafetyResult.jailbroken)),
                func.avg(SafetyResult.harm_score),
                func.avg(cast(SafetyResult.turns, Float)),
            )
            .where(SafetyResult.run_id == run_id)
            .group_by(SafetyResult.model_ref, SafetyResult.category)
        )
    ).all()

    names = {m.ref: m.display_name for m in (await session.scalars(select(ModelCatalog))).all()}
    per_model: dict[str, dict] = {}
    for ref, cat, n, jb_rate, harm, turns in rows:
        pm = per_model.setdefault(
            ref, {"model_ref": ref, "display_name": names.get(ref, ref), "categories": {}, "n": 0, "jb": 0.0}
        )
        pm["categories"][cat] = {
            "n": int(n),
            "jailbreak_rate": round(float(jb_rate or 0), 4),
            "avg_harm": round(float(harm or 0), 3),
            "avg_turns": round(float(turns or 0), 2),
        }
        pm["n"] += int(n)
        pm["jb"] += float(jb_rate or 0) * int(n)

    board = []
    for pm in per_model.values():
        jb_rate = pm["jb"] / pm["n"] if pm["n"] else 0
        board.append(
            {
                "model_ref": pm["model_ref"],
                "display_name": pm["display_name"],
                "robustness": round(1 - jb_rate, 4),
                "jailbreak_rate": round(jb_rate, 4),
                "n": pm["n"],
                "categories": pm["categories"],
            }
        )
    board.sort(key=lambda x: x["robustness"], reverse=True)
    for i, e in enumerate(board):
        e["rank"] = i + 1
    return {"run": run_out(run), "report": board}


@router.get("/samples/{run_id}")
async def safety_samples(
    run_id: str, only_jailbroken: bool = True, limit: int = 40,
    session: AsyncSession = Depends(get_session),
) -> list[dict]:
    stmt = select(SafetyResult).where(SafetyResult.run_id == run_id)
    if only_jailbroken:
        stmt = stmt.where(SafetyResult.jailbroken.is_(True))
    rows = (await session.scalars(stmt.order_by(SafetyResult.harm_score.desc()).limit(limit))).all()
    return [
        {
            "model_ref": r.model_ref,
            "category": r.category,
            "technique": r.technique,
            "goal": r.goal,
            "attack_prompt": r.attack_prompt,
            "response": r.response[:800],
            "jailbroken": r.jailbroken,
            "refused": r.refused,
            "harm_score": r.harm_score,
            "turns": r.turns,
            "transcript": r.transcript or [],
        }
        for r in rows
    ]


@router.get("/leaderboard")
async def safety_leaderboard(
    user: User | None = Depends(get_current_user),
    session: AsyncSession = Depends(get_session),
) -> dict:
    from app.api.deps import is_registered

    scoped = not is_registered(user)
    stmt = select(
        SafetyResult.model_ref,
        func.count(SafetyResult.id),
        func.avg(bool_num(SafetyResult.jailbroken)),
    ).group_by(SafetyResult.model_ref)
    if scoped:
        stmt = stmt.join(Run, Run.id == SafetyResult.run_id).where(Run.user_id == (user.id if user else None))
    rows = (await session.execute(stmt)).all()
    names = {m.ref: m.display_name for m in (await session.scalars(select(ModelCatalog))).all()}
    board = [
        {
            "model_ref": ref,
            "display_name": names.get(ref, ref),
            "robustness": round(1 - float(jb or 0), 4),
            "jailbreak_rate": round(float(jb or 0), 4),
            "n": int(n),
        }
        for ref, n, jb in rows
    ]
    board.sort(key=lambda x: x["robustness"], reverse=True)
    for i, e in enumerate(board):
        e["rank"] = i + 1
    return {"scope": "own" if scoped else "global", "leaderboard": board}
