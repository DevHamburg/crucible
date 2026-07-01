"""Anthropic Messages API provider."""
from __future__ import annotations

import httpx

from app.providers.base import ChatMessage, Completion, Provider, ProviderError


class AnthropicProvider(Provider):
    name = "anthropic"
    base_url = "https://api.anthropic.com/v1"
    version = "2023-06-01"

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
        if not api_key:
            raise ProviderError("No API key for provider 'anthropic'")

        system = "\n\n".join(m.content for m in messages if m.role == "system")
        turns = [
            {"role": m.role, "content": m.content}
            for m in messages
            if m.role in ("user", "assistant")
        ]
        payload = {
            "model": model_id,
            "max_tokens": max_tokens,
            "temperature": temperature,
            "top_p": top_p,
            "messages": turns,
        }
        if system:
            payload["system"] = system
        if stop:
            payload["stop_sequences"] = stop
        payload.update(extra.get("provider_params", {}))

        headers = {
            "x-api-key": api_key,
            "anthropic-version": self.version,
            "content-type": "application/json",
        }
        async with httpx.AsyncClient(timeout=timeout) as client:
            resp = await client.post(f"{self.base_url}/messages", json=payload, headers=headers)
        if resp.status_code >= 400:
            raise ProviderError(f"anthropic {resp.status_code}: {resp.text[:400]}")
        data = resp.json()
        blocks = data.get("content") or []
        text = "".join(b.get("text", "") for b in blocks if b.get("type") == "text")
        usage = data.get("usage") or {}
        return Completion(
            text=text,
            model_ref=f"{self.name}/{model_id}",
            prompt_tokens=usage.get("input_tokens", 0),
            completion_tokens=usage.get("output_tokens", self.estimate_tokens(text)),
            finish_reason=data.get("stop_reason", "stop"),
            raw=data,
        )
