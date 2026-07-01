"""Crucible API entrypoint."""
from __future__ import annotations

from contextlib import asynccontextmanager

from fastapi import FastAPI
from fastapi.middleware.cors import CORSMiddleware
from sqlalchemy import func, select

from app import __version__
from app.api.routers import (
    arena,
    auth,
    benchmarks,
    keys,
    leaderboard,
    models,
    observability,
    reviews,
    runs,
    safety,
)
from app.core.config import settings
from app.core.db import SessionLocal, init_db
from app.models import ModelCatalog


@asynccontextmanager
async def lifespan(app: FastAPI):
    await init_db()
    # zero-config first run: auto-seed if the catalog is empty
    async with SessionLocal() as session:
        n = await session.scalar(select(func.count(ModelCatalog.id)))
    if not n:
        try:
            from app.seeds.seed import seed_admin, seed_benchmarks, seed_models

            async with SessionLocal() as session:
                await seed_models(session)
                await seed_benchmarks(session)
                await seed_admin(session)
                await session.commit()
            print("✓ auto-seeded database (first run)")
        except Exception as exc:  # noqa: BLE001
            print(f"! auto-seed skipped: {exc}")
    yield


app = FastAPI(
    title="Crucible API",
    version=__version__,
    description="SOTA multi-model LLM benchmarking, red-team & arena platform.",
    lifespan=lifespan,
)

app.add_middleware(
    CORSMiddleware,
    allow_origins=settings.cors_origins,
    allow_origin_regex=r"http://localhost:\d+|http://127\.0\.0\.1:\d+",
    allow_credentials=True,
    allow_methods=["*"],
    allow_headers=["*"],
)

for r in (auth, keys, models, benchmarks, runs, leaderboard, arena, safety, observability, reviews):
    app.include_router(r.router)


@app.get("/", tags=["meta"])
async def root() -> dict:
    return {
        "name": "Crucible",
        "tagline": "Benchmark · Battle · Red-Team · Observe",
        "version": __version__,
        "env": settings.crucible_env,
        "docs": "/docs",
    }


@app.get("/health", tags=["meta"])
async def health() -> dict:
    return {"status": "ok"}
