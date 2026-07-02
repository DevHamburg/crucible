"""In-process pub/sub event bus for live run streaming over SSE.

Single-process dev/self-host uses this directly. For a multi-worker deployment, swap the
backing store for Redis pub/sub (the interface stays the same); the SSE route also polls the
DB as a fallback so progress is never lost even without live events.
"""
from __future__ import annotations

import asyncio
from collections import defaultdict
from collections.abc import AsyncGenerator


class EventBus:
    def __init__(self) -> None:
        self._subs: dict[str, set[asyncio.Queue]] = defaultdict(set)

    async def publish(self, channel: str, event: dict) -> None:
        for q in list(self._subs.get(channel, ())):
            try:
                q.put_nowait(event)
            except asyncio.QueueFull:
                pass

    def publish_nowait(self, channel: str, event: dict) -> None:
        for q in list(self._subs.get(channel, ())):
            try:
                q.put_nowait(event)
            except asyncio.QueueFull:
                pass

    async def subscribe(self, channel: str) -> AsyncGenerator[dict, None]:
        q: asyncio.Queue = asyncio.Queue(maxsize=1000)
        self._subs[channel].add(q)
        try:
            while True:
                event = await q.get()
                yield event
                # Terminal events close the subscription. Note: `match_completed`
                # fires per bracket match on a tournament channel and is NOT terminal —
                # only the whole-run/whole-tournament terminators end the stream.
                if event.get("type") in ("run_completed", "run_error", "tournament_completed"):
                    break
        finally:
            self._subs[channel].discard(q)
            if not self._subs[channel]:
                self._subs.pop(channel, None)

    def has_subscribers(self, channel: str) -> bool:
        return bool(self._subs.get(channel))


bus = EventBus()
