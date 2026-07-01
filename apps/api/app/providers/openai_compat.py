"""OpenAI-compatible providers. A single implementation covers every backend that speaks
the `/chat/completions` schema: OpenAI, OpenRouter, Groq, Mistral, DeepSeek, Together and
local Ollama (via its OpenAI-compatible endpoint)."""
from __future__ import annotations

import httpx

from app.core.config import settings
from app.providers.base import ChatMessage, Completion, Provider, ProviderError


class OpenAICompatProvider(Provider):
    name = "openai"
    base_url = "https://api.openai.com/v1"
    keyless = False
    #: send Authorization: Bearer; some backends (ollama) need no auth
    auth_header = "Authorization"
    extra_headers: dict = {}

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
        if not api_key and not self.keyless:
            raise ProviderError(f"No API key for provider '{self.name}'")

        payload = {
            "model": model_id,
            "messages": [{"role": m.role, "content": m.content} for m in messages],
            "temperature": temperature,
            "max_tokens": max_tokens,
            "top_p": top_p,
        }
        if stop:
            payload["stop"] = stop
        payload.update(extra.get("provider_params", {}))

        headers = dict(self.extra_headers)
        if api_key:
            if self.auth_header == "Authorization":
                headers["Authorization"] = f"Bearer {api_key}"
            else:
                headers[self.auth_header] = api_key

        async with httpx.AsyncClient(timeout=timeout) as client:
            resp = await client.post(
                f"{self.base_url}/chat/completions", json=payload, headers=headers
            )
        if resp.status_code >= 400:
            raise ProviderError(f"{self.name} {resp.status_code}: {resp.text[:400]}")
        data = resp.json()
        choice = (data.get("choices") or [{}])[0]
        text = (choice.get("message") or {}).get("content") or ""
        usage = data.get("usage") or {}
        return Completion(
            text=text,
            model_ref=f"{self.name}/{model_id}",
            prompt_tokens=usage.get("prompt_tokens", self.estimate_tokens(str(payload["messages"]))),
            completion_tokens=usage.get("completion_tokens", self.estimate_tokens(text)),
            finish_reason=choice.get("finish_reason", "stop"),
            raw=data,
        )


class OpenAIProvider(OpenAICompatProvider):
    name = "openai"
    base_url = "https://api.openai.com/v1"


class OpenRouterProvider(OpenAICompatProvider):
    name = "openrouter"
    base_url = "https://openrouter.ai/api/v1"
    extra_headers = {
        "HTTP-Referer": "https://crucible.local",
        "X-Title": "Crucible Benchmark",
    }


class GroqProvider(OpenAICompatProvider):
    name = "groq"
    base_url = "https://api.groq.com/openai/v1"


class MistralProvider(OpenAICompatProvider):
    name = "mistral"
    base_url = "https://api.mistral.ai/v1"


class DeepSeekProvider(OpenAICompatProvider):
    name = "deepseek"
    base_url = "https://api.deepseek.com/v1"


class TogetherProvider(OpenAICompatProvider):
    name = "together"
    base_url = "https://api.together.xyz/v1"


class OllamaProvider(OpenAICompatProvider):
    name = "ollama"
    keyless = True

    @property
    def base_url(self) -> str:  # type: ignore[override]
        return f"{settings.ollama_base_url.rstrip('/')}/v1"
