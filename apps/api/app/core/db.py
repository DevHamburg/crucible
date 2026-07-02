"""Async SQLAlchemy engine + session management. Uses SQLite by default so the
API runs with zero external services; switches to Postgres via DATABASE_URL."""
from __future__ import annotations

import logging
from collections.abc import AsyncGenerator
from contextlib import asynccontextmanager
from datetime import UTC, datetime, timedelta

from sqlalchemy import text
from sqlalchemy.ext.asyncio import AsyncSession, async_sessionmaker, create_async_engine
from sqlalchemy.orm import DeclarativeBase

from app.core.config import settings

log = logging.getLogger("crucible.db")


class Base(DeclarativeBase):
    pass


_connect_args = {"check_same_thread": False} if settings.is_sqlite else {}

_engine_kwargs: dict = {
    "echo": False,
    "pool_pre_ping": not settings.is_sqlite,
    "connect_args": _connect_args,
}
if not settings.is_sqlite:
    # Give long-lived SSE streams headroom before the pool is exhausted.
    _engine_kwargs.update(pool_size=settings.db_pool_size, max_overflow=settings.db_max_overflow)

engine = create_async_engine(settings.effective_database_url, **_engine_kwargs)

SessionLocal = async_sessionmaker(engine, expire_on_commit=False, class_=AsyncSession)

# Indexes for the hot ORDER BY created_at DESC / needs_review query paths. Added with
# CREATE INDEX IF NOT EXISTS (portable across SQLite + PostgreSQL) so they also apply to an
# already-created production schema, which create_all never alters.
_HOT_INDEXES = (
    ("ix_gen_created_at", "generations", "(created_at)"),
    ("ix_run_created_at", "runs", "(created_at)"),
    ("ix_match_created_at", "arena_matches", "(created_at)"),
    ("ix_result_needs_review", "results", "(needs_review, created_at)"),
)


async def get_session() -> AsyncGenerator[AsyncSession, None]:
    async with SessionLocal() as session:
        yield session


# A fixed key for the startup advisory lock (arbitrary constant, shared by all API workers).
_STARTUP_LOCK_KEY = 728_271


@asynccontextmanager
async def startup_lock():
    """Serialize schema-create + auto-seed across concurrent API workers.

    With ``uvicorn --workers N`` every worker runs the lifespan, so two of them can race
    ``create_all`` (checkfirst isn't atomic on Postgres) or both auto-seed an empty catalog.
    A Postgres advisory lock makes the second worker wait, then find the work already done.
    No-op on SQLite (single process / single connection).
    """
    if settings.is_sqlite:
        yield
        return
    async with engine.connect() as conn:
        await conn.execute(text("SELECT pg_advisory_lock(:k)"), {"k": _STARTUP_LOCK_KEY})
        try:
            yield
        finally:
            await conn.execute(text("SELECT pg_advisory_unlock(:k)"), {"k": _STARTUP_LOCK_KEY})


async def ensure_indexes() -> None:
    """Idempotently create the hot-path indexes (works on fresh + existing DBs)."""
    async with engine.begin() as conn:
        for name, table, cols in _HOT_INDEXES:
            await conn.execute(text(f"CREATE INDEX IF NOT EXISTS {name} ON {table} {cols}"))


async def init_db() -> None:
    """Create all tables (dev bootstrap) + hot-path indexes.

    Real schema migrations (column changes) still need a proper tool; create_all only
    adds missing tables, never alters existing ones.
    """
    # Import models so they register on Base.metadata before create_all.
    import app.models  # noqa: F401

    async with engine.begin() as conn:
        await conn.run_sync(Base.metadata.create_all)
    await ensure_indexes()


async def reconcile_stale_runs(max_age_minutes: int = 60) -> int:
    """Reap runs left non-terminal by a crashed process / lost queue job.

    In-process mode: a 'running' run cannot survive a restart, so reap it immediately.
    Both modes: reap 'running'/'pending' rows older than max_age (covers a Redis restart
    that dropped an enqueued job, which would otherwise hang on 'pending' forever).
    """
    from app.models import Run  # local import: models depend on Base defined above

    now = datetime.now(UTC)
    cutoff = now - timedelta(minutes=max_age_minutes)
    reaped = 0
    async with SessionLocal() as s:
        from sqlalchemy import select

        rows = (await s.scalars(select(Run).where(Run.status.in_(("running", "pending"))))).all()
        for r in rows:
            created = r.created_at
            if created is not None and created.tzinfo is None:
                created = created.replace(tzinfo=UTC)
            orphaned = (not settings.use_task_queue) or (created is not None and created < cutoff)
            if orphaned:
                r.status = "error"
                r.error = "run did not complete (reconciled after a server restart)"
                r.finished_at = now
                reaped += 1
        if reaped:
            await s.commit()
    if reaped:
        log.warning("reconciled %d stale run(s) to 'error' on startup", reaped)
    return reaped
