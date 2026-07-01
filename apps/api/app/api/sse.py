"""Server-Sent Events helper. Streams live events from the in-process bus and falls back to
DB polling so progress is delivered even when work runs in a separate worker process."""
from __future__ import annotations

import asyncio
import json
from typing import Awaitable, Callable

from fastapi.responses import StreamingResponse

from app.engine.events import bus


def _format(event: dict) -> str:
    return f"data: {json.dumps(event)}\n\n"


async def event_stream(
    channel: str,
    *,
    initial: dict | None = None,
    poll: Callable[[], Awaitable[dict | None]] | None = None,
    poll_interval: float = 1.0,
    done_types: tuple[str, ...] = ("run_completed", "run_error", "tournament_completed"),
) -> StreamingResponse:
    async def gen():
        if initial is not None:
            yield _format({"type": "init", **initial})

        queue: asyncio.Queue = asyncio.Queue(maxsize=1000)

        async def pump_bus():
            async for ev in bus.subscribe(channel):
                await queue.put(ev)
            await queue.put({"type": "_bus_closed"})

        async def pump_poll():
            last = None
            while True:
                await asyncio.sleep(poll_interval)
                if poll is None:
                    continue
                snap = await poll()
                if snap and snap != last:
                    last = snap
                    await queue.put({"type": "poll", **snap})
                    if snap.get("status") in ("completed", "error", "cancelled"):
                        await queue.put({"type": "run_completed", **snap})
                        return

        tasks = [asyncio.create_task(pump_bus())]
        if poll is not None:
            tasks.append(asyncio.create_task(pump_poll()))
        try:
            # keepalive + event relay
            while True:
                try:
                    ev = await asyncio.wait_for(queue.get(), timeout=15.0)
                except asyncio.TimeoutError:
                    yield ": keepalive\n\n"
                    continue
                if ev.get("type") == "_bus_closed":
                    continue
                yield _format(ev)
                if ev.get("type") in done_types:
                    break
        finally:
            for t in tasks:
                t.cancel()

    return StreamingResponse(
        gen(),
        media_type="text/event-stream",
        headers={"Cache-Control": "no-cache", "X-Accel-Buffering": "no", "Connection": "keep-alive"},
    )
