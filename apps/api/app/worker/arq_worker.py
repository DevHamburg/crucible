"""arq worker for production. Enable with USE_TASK_QUEUE=true + REDIS_URL, then run:
    arq app.worker.arq_worker.WorkerSettings
Long eval/tournament jobs run here instead of in the API process.
"""
from __future__ import annotations

from arq.connections import RedisSettings

from app.arena.tournament import execute_tournament
from app.core.config import settings
from app.engine.runner import execute_run


async def run_benchmark(ctx, run_id: str) -> None:
    await execute_run(run_id)


async def run_tournament(ctx, tournament_id: str) -> None:
    await execute_tournament(tournament_id)


class WorkerSettings:
    functions = [run_benchmark, run_tournament]
    redis_settings = RedisSettings.from_dsn(settings.redis_url or "redis://localhost:6379/0")
    max_jobs = 10
    job_timeout = 3600
    # Write a health record every 30s so `arq --check` (the container healthcheck) can tell
    # a hung/dead worker from a live one instead of leaving jobs silently stuck.
    health_check_interval = 30
