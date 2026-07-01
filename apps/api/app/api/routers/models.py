"""Model catalog + providers."""
from __future__ import annotations

from fastapi import APIRouter, Depends, HTTPException, status
from pydantic import BaseModel
from sqlalchemy import select
from sqlalchemy.ext.asyncio import AsyncSession

from app.api.deps import get_current_user, require_admin
from app.api.serialize import model_out
from app.core.config import settings
from app.core.db import get_session
from app.models import ApiKey, ModelCatalog, User
from app.observability.cost import PRICING
from app.providers.base import ModelRef
from app.providers.registry import list_providers

router = APIRouter(tags=["models"])


async def _user_providers_with_keys(session: AsyncSession, user: User | None) -> set[str]:
    provs: set[str] = set()
    # server-level keys
    for p in ("openrouter", "openai", "anthropic", "google", "mistral", "groq"):
        if settings.server_key_for(p):
            provs.add(p)
    if user:
        rows = (await session.scalars(select(ApiKey.provider).where(ApiKey.user_id == user.id))).all()
        provs.update(rows)
    return provs


@router.get("/models")
async def list_models(
    active: bool = True,
    user: User | None = Depends(get_current_user),
    session: AsyncSession = Depends(get_session),
) -> list[dict]:
    stmt = select(ModelCatalog)
    if active:
        stmt = stmt.where(ModelCatalog.is_active)
    rows = (await session.scalars(stmt.order_by(ModelCatalog.provider, ModelCatalog.display_name))).all()
    keyed = await _user_providers_with_keys(session, user)
    return [model_out(m, has_key=(m.provider in keyed)) for m in rows]


@router.get("/providers")
async def providers(
    user: User | None = Depends(get_current_user), session: AsyncSession = Depends(get_session)
) -> list[dict]:
    keyed = await _user_providers_with_keys(session, user)
    out = []
    for p in list_providers():
        out.append({**p, "has_key": p["keyless"] or p["name"] in keyed})
    return out


class ModelIn(BaseModel):
    ref: str
    display_name: str = ""
    family: str = ""
    context_window: int = 8192
    input_price: float = 0.0
    output_price: float = 0.0
    is_open_weight: bool = False
    meta: dict = {}


@router.post("/models")
async def add_model(
    body: ModelIn, _: User = Depends(require_admin), session: AsyncSession = Depends(get_session)
) -> dict:
    parsed = ModelRef.parse(body.ref)
    exists = await session.scalar(select(ModelCatalog).where(ModelCatalog.ref == body.ref))
    if exists:
        raise HTTPException(status.HTTP_409_CONFLICT, "Model already exists")
    ip, op, ctx = PRICING.get(body.ref, (body.input_price, body.output_price, body.context_window))
    row = ModelCatalog(
        ref=body.ref,
        provider=parsed.provider,
        model_id=parsed.model_id,
        display_name=body.display_name or body.ref,
        family=body.family,
        context_window=body.context_window or ctx,
        input_price=body.input_price or ip,
        output_price=body.output_price or op,
        is_open_weight=body.is_open_weight,
        meta=body.meta,
    )
    session.add(row)
    await session.commit()
    return model_out(row)
