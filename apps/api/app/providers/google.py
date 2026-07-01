"""Google Gemini (Generative Language API) provider."""
from __future__ import annotations

import httpx

from app.providers.base import ChatMessage, Completion, Provider, ProviderError


class GoogleProvider(Provider):
    name = "google"
    base_url = "https://generativelanguage.googleapis.com/v1beta"

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
            raise ProviderError("No API key for provider 'google'")

        system = "\n\n".join(m.content for m in messages if m.role == "system")
        contents = []
        for m in messages:
            if m.role == "system":
                continue
            contents.append(
                {"role": "model" if m.role == "assistant" else "user", "parts": [{"text": m.content}]}
            )
        payload = {
            "contents": contents,
            "generationConfig": {
                "temperature": temperature,
                "topP": top_p,
                "maxOutputTokens": max_tokens,
                **({"stopSequences": stop} if stop else {}),
            },
        }
        if system:
            payload["systemInstruction"] = {"parts": [{"text": system}]}

        url = f"{self.base_url}/models/{model_id}:generateContent?key={api_key}"
        async with httpx.AsyncClient(timeout=timeout) as client:
            resp = await client.post(url, json=payload)
        if resp.status_code >= 400:
            raise ProviderError(f"google {resp.status_code}: {resp.text[:400]}")
        data = resp.json()
        cand = (data.get("candidates") or [{}])[0]
        parts = (cand.get("content") or {}).get("parts") or []
        text = "".join(p.get("text", "") for p in parts)
        usage = data.get("usageMetadata") or {}
        return Completion(
            text=text,
            model_ref=f"{self.name}/{model_id}",
            prompt_tokens=usage.get("promptTokenCount", 0),
            completion_tokens=usage.get("candidatesTokenCount", self.estimate_tokens(text)),
            finish_reason=cand.get("finishReason", "stop"),
            raw=data,
        )
