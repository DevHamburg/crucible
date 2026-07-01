"""Benchmark catalog + domains."""
from __future__ import annotations

from fastapi import APIRouter, Depends, HTTPException, status
from sqlalchemy import func, select
from sqlalchemy.ext.asyncio import AsyncSession

from app.api.serialize import benchmark_out
from app.core.db import get_session
from app.models import Benchmark, BenchmarkItem

router = APIRouter(tags=["benchmarks"])

DOMAIN_META = {
    "logic": {"label": "Logic & Reasoning", "icon": "brain", "color": "#8b5cf6"},
    "software": {"label": "Software Development", "icon": "code", "color": "#06b6d4"},
    "psychology": {"label": "Psychology", "icon": "heart", "color": "#ec4899"},
    "trading": {"label": "Trading & Finance", "icon": "trending-up", "color": "#10b981"},
    "business": {"label": "Business", "icon": "briefcase", "color": "#f59e0b"},
    "marketing": {"label": "Marketing", "icon": "megaphone", "color": "#f43f5e"},
    "general": {"label": "General Knowledge", "icon": "globe", "color": "#3b82f6"},
    "safety": {"label": "Safety & Red-Team", "icon": "shield", "color": "#ef4444"},
}


@router.get("/benchmarks")
async def list_benchmarks(
    domain: str | None = None, session: AsyncSession = Depends(get_session)
) -> list[dict]:
    stmt = select(Benchmark).where(Benchmark.is_active)
    if domain:
        stmt = stmt.where(Benchmark.domain == domain)
    rows = (await session.scalars(stmt.order_by(Benchmark.domain, Benchmark.name))).all()
    return [benchmark_out(b) for b in rows]


@router.get("/domains")
async def list_domains(session: AsyncSession = Depends(get_session)) -> list[dict]:
    rows = (
        await session.execute(
            select(Benchmark.domain, func.count(Benchmark.id), func.sum(Benchmark.num_items))
            .where(Benchmark.is_active)
            .group_by(Benchmark.domain)
        )
    ).all()
    out = []
    for domain, n_bench, n_items in rows:
        meta = DOMAIN_META.get(domain, {"label": domain.title(), "icon": "layers", "color": "#64748b"})
        out.append({"domain": domain, "benchmarks": n_bench, "items": int(n_items or 0), **meta})
    # include safety as a virtual domain
    out.append({"domain": "safety", "benchmarks": 1, "items": 0, **DOMAIN_META["safety"]})
    return out


@router.get("/benchmarks/{slug}")
async def get_benchmark(slug: str, session: AsyncSession = Depends(get_session)) -> dict:
    b = await session.scalar(select(Benchmark).where(Benchmark.slug == slug))
    if not b:
        raise HTTPException(status.HTTP_404_NOT_FOUND, "Benchmark not found")
    items = (
        await session.scalars(
            select(BenchmarkItem).where(BenchmarkItem.benchmark_id == b.id).limit(3)
        )
    ).all()
    sample = [
        {"external_id": it.external_id, "prompt": it.prompt[:400], "difficulty": it.difficulty,
         "input": it.input or {}}
        for it in items
    ]
    return benchmark_out(b, sample=sample)
