"""Provider registry + key resolution + a thin `call_model` helper used everywhere
(engine, judge, arena, safety) to talk to any model by its `provider/model_id` ref."""
from __future__ import annotations

from app.core.config import settings
from app.providers.anthropic import AnthropicProvider
from app.providers.base import ChatMessage, Completion, ModelRef, Provider
from app.providers.google import GoogleProvider
from app.providers.mock import EchoProvider, MockProvider
from app.providers.openai_compat import (
    DeepSeekProvider,
    GroqProvider,
    MistralProvider,
    OllamaProvider,
    OpenAIProvider,
    OpenRouterProvider,
    TogetherProvider,
)

_PROVIDER_CLASSES: list[type[Provider]] = [
    MockProvider,
    EchoProvider,
    OpenAIProvider,
    OpenRouterProvider,
    AnthropicProvider,
    GoogleProvider,
    GroqProvider,
    MistralProvider,
    DeepSeekProvider,
    TogetherProvider,
    OllamaProvider,
]

PROVIDERS: dict[str, Provider] = {cls.name: cls() for cls in _PROVIDER_CLASSES}

#: providers that need no key
KEYLESS = {name for name, p in PROVIDERS.items() if p.keyless}


def get_provider(name: str) -> Provider | None:
    return PROVIDERS.get(name.lower())


def list_providers() -> list[dict]:
    return [
        {"name": name, "keyless": p.keyless, "requires_key": not p.keyless}
        for name, p in PROVIDERS.items()
        if name != "echo"
    ]


def resolve_api_key(provider: str, user_keys: dict[str, str] | None = None) -> str:
    provider = provider.lower()
    if provider in KEYLESS:
        return ""
    if user_keys and user_keys.get(provider):
        return user_keys[provider]
    return settings.server_key_for(provider)


async def call_model(
    model_ref: str,
    messages: list[ChatMessage],
    *,
    user_keys: dict[str, str] | None = None,
    temperature: float = 0.2,
    max_tokens: int = 1024,
    top_p: float = 1.0,
    stop: list[str] | None = None,
    extra: dict | None = None,
) -> Completion:
    ref = ModelRef.parse(model_ref)
    provider = get_provider(ref.provider)
    if provider is None:
        return Completion(text="", model_ref=model_ref, error=f"unknown provider '{ref.provider}'")
    api_key = resolve_api_key(ref.provider, user_keys)
    return await provider.complete(
        ref.model_id,
        messages,
        temperature=temperature,
        max_tokens=max_tokens,
        top_p=top_p,
        stop=stop,
        api_key=api_key,
        timeout=float(settings.request_timeout_s),
        extra=extra or {},
    )


def has_credentials(model_ref: str, user_keys: dict[str, str] | None = None) -> bool:
    ref = ModelRef.parse(model_ref)
    if ref.provider in KEYLESS:
        return True
    return bool(resolve_api_key(ref.provider, user_keys))
