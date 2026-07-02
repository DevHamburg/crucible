"""Human-in-the-loop review of scored results."""
from __future__ import annotations

from fastapi import APIRouter, Depends, HTTPException, Query, status
from pydantic import BaseModel
from sqlalchemy import select
from sqlalchemy.ext.asyncio import AsyncSession

from app.api.deps import get_current_user
from app.core.db import get_session
from app.models import HumanReview, Result, User

router = APIRouter(prefix="/reviews", tags=["reviews"])


class ReviewIn(BaseModel):
    result_id: str
    score: float
    passed: bool
    notes: str = ""


@router.get("/queue")
async def review_queue(
    limit: int = Query(default=50, ge=1, le=200), session: AsyncSession = Depends(get_session)
) -> list[dict]:
    rows = (
        await session.scalars(
            select(Result).where(Result.needs_review.is_(True)).order_by(Result.created_at.desc()).limit(limit)
        )
    ).all()
    return [
        {
            "result_id": r.id,
            "run_id": r.run_id,
            "model_ref": r.model_ref,
            "benchmark": r.benchmark_slug,
            "domain": r.domain,
            "prompt": r.prompt[:500],
            "response": r.response[:1500],
            "score": r.score,
            "passed": r.passed,
            "rationale": r.rationale[:300],
        }
        for r in rows
    ]


@router.post("")
async def submit_review(
    body: ReviewIn,
    user: User | None = Depends(get_current_user),
    session: AsyncSession = Depends(get_session),
) -> dict:
    result = await session.get(Result, body.result_id)
    if not result:
        raise HTTPException(status.HTTP_404_NOT_FOUND, "Result not found")
    session.add(
        HumanReview(
            result_id=body.result_id,
            reviewer_id=user.id if user else None,
            score=body.score,
            passed=body.passed,
            notes=body.notes,
        )
    )
    result.score = body.score
    result.passed = body.passed
    result.needs_review = False
    result.judge_model = "human"
    await session.commit()
    return {"ok": True, "result_id": body.result_id}
