"""Shared arena helpers: model-meta loading and mock skill simulation."""
from __future__ import annotations

from sqlalchemy import select

from app.models import ModelCatalog


async def load_meta(session, refs: list[str]) -> dict[str, dict]:
    rows = (await session.scalars(select(ModelCatalog).where(ModelCatalog.ref.in_(refs)))).all()
    meta = {r.ref: (r.meta or {}) for r in rows}
    for r in refs:
        meta.setdefault(r, {})
    return meta


def sim_for(meta: dict) -> dict:
    return {"skill": float(meta.get("skill", 0.6))}
