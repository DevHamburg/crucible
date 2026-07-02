"""Job dispatch: run work in-process (asyncio) for zero-setup dev, or enqueue onto the arq
worker when USE_TASK_QUEUE is on (Docker/production)."""
from __future__ import annotations

import asyncio
import logging

from app.core.config import settings

log = logging.getLogger("crucible.dispatch")

# keep references so tasks aren't garbage-collected mid-flight + allow cancellation
_TASKS: dict[str, asyncio.Task] = {}


def _on_done(key: str, task: asyncio.Task) -> None:
    _TASKS.pop(key, None)
    if task.cancelled():
        return
    exc = task.exception()
    if exc is not None:
        # The runner is expected to record failures on the Run row itself; surfacing the
        # traceback here makes an otherwise-invisible in-process crash debuggable.
        log.error("background task %s crashed: %r", key, exc, exc_info=exc)


async def _enqueue(function: str, arg: str) -> None:
    from arq import create_pool
    from arq.connections import RedisSettings

    pool = await create_pool(RedisSettings.from_dsn(settings.redis_url))
    await pool.enqueue_job(function, arg)
    await pool.close()


def _spawn(key: str, coro) -> None:
    task = asyncio.create_task(coro)
    _TASKS[key] = task
    task.add_done_callback(lambda t: _on_done(key, t))


async def start_run(run_id: str) -> None:
    if settings.use_task_queue and settings.redis_url:
        await _enqueue("run_benchmark", run_id)
    else:
        from app.engine.runner import execute_run

        _spawn(f"run:{run_id}", execute_run(run_id))


async def start_tournament(tournament_id: str) -> None:
    if settings.use_task_queue and settings.redis_url:
        await _enqueue("run_tournament", tournament_id)
    else:
        from app.arena.tournament import execute_tournament

        _spawn(f"tour:{tournament_id}", execute_tournament(tournament_id))


def cancel(key: str) -> bool:
    task = _TASKS.get(key)
    if task and not task.done():
        task.cancel()
        return True
    return False
