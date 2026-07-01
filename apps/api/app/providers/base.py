"""Provider abstraction: a uniform async chat interface over every model backend.

A `ModelRef` is `"<provider>/<model_id>"` where model_id may itself contain slashes
(e.g. `openrouter/anthropic/claude-3.5-sonnet`). The first path segment selects the
provider; the remainder is passed verbatim to that provider's API.
"""
from __future__ import annotations

import time
from dataclasses import dataclass, field


@dataclass
class ChatMessage:
    role: str  # system | user | assistant
    content: str


@dataclass
class ModelRef:
    provider: str
    model_id: str

    @classmethod
    def parse(cls, ref: str) -> ModelRef:
        ref = ref.strip()
        if "/" not in ref:
            # bare model id -> assume mock in dev, else openrouter
            return cls("mock", ref)
        provider, model_id = ref.split("/", 1)
        return cls(provider.lower(), model_id)

    def __str__(self) -> str:
        return f"{self.provider}/{self.model_id}"


@dataclass
class Completion:
    text: str
    model_ref: str
    prompt_tokens: int = 0
    completion_tokens: int = 0
    latency_ms: int = 0
    finish_reason: str = "stop"
    raw: dict = field(default_factory=dict)
    error: str | None = None

    @property
    def ok(self) -> bool:
        return self.error is None


class ProviderError(Exception):
    pass


class Provider:
    """Base class. Subclasses implement `_call`."""

    name: str = "base"
    #: If True, no API key is required (mock / local ollama).
    keyless: bool = False

    async def complete(
        self,
        model_id: str,
        messages: list[ChatMessage],
        *,
        temperature: float = 0.2,
        max_tokens: int = 1024,
        top_p: float = 1.0,
        stop: list[str] | None = None,
        api_key: str = "",
        timeout: float = 120.0,
        extra: dict | None = None,
    ) -> Completion:
        started = time.perf_counter()
        try:
            comp = await self._call(
                model_id,
                messages,
                temperature=temperature,
                max_tokens=max_tokens,
                top_p=top_p,
                stop=stop,
                api_key=api_key,
                timeout=timeout,
                extra=extra or {},
            )
        except Exception as exc:  # noqa: BLE001 — surface any backend failure as a Completion
            elapsed = int((time.perf_counter() - started) * 1000)
            return Completion(
                text="",
                model_ref=f"{self.name}/{model_id}",
                latency_ms=elapsed,
                error=f"{type(exc).__name__}: {exc}",
            )
        if not comp.latency_ms:
            comp.latency_ms = int((time.perf_counter() - started) * 1000)
        comp.model_ref = f"{self.name}/{model_id}"
        return comp

    async def _call(
        self,
        model_id: str,
        messages: list[ChatMessage],
        *,
        temperature: float,
        max_tokens: int,
        top_p: float,
        stop: list[str] | None,
        api_key: str,
        timeout: float,
        extra: dict,
    ) -> Completion:
        raise NotImplementedError

    @staticmethod
    def estimate_tokens(text: str) -> int:
        """Rough fallback token count when a provider omits usage (~4 chars/token)."""
        return max(1, len(text) // 4)
