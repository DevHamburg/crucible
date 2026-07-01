"""User API keys — stored encrypted (Fernet), returned only masked."""
from __future__ import annotations

from fastapi import APIRouter, Depends, HTTPException, status
from pydantic import BaseModel
from sqlalchemy import select
from sqlalchemy.ext.asyncio import AsyncSession

from app.api.deps import require_user
from app.api.serialize import apikey_out
from app.core.db import get_session
from app.core.security import decrypt_secret, encrypt_secret, mask_secret
from app.models import ApiKey, User
from app.providers.base import ChatMessage
from app.providers.registry import PROVIDERS, call_model

router = APIRouter(prefix="/keys", tags=["keys"])

_KEYED_PROVIDERS = [n for n, p in PROVIDERS.items() if not p.keyless and n != "echo"]


class KeyIn(BaseModel):
    provider: str
    key: str
    label: str = "default"


class KeyTestIn(BaseModel):
    provider: str
    key: str | None = None
    model_ref: str | None = None


@router.get("")
async def list_keys(
    user: User = Depends(require_user), session: AsyncSession = Depends(get_session)
) -> list[dict]:
    rows = (await session.scalars(select(ApiKey).where(ApiKey.user_id == user.id))).all()
    return [apikey_out(k) for k in rows]


@router.post("")
async def add_key(
    body: KeyIn, user: User = Depends(require_user), session: AsyncSession = Depends(get_session)
) -> dict:
    if body.provider not in _KEYED_PROVIDERS:
        raise HTTPException(status.HTTP_400_BAD_REQUEST, f"Unknown/keyless provider '{body.provider}'")
    existing = await session.scalar(
        select(ApiKey).where(
            ApiKey.user_id == user.id, ApiKey.provider == body.provider, ApiKey.label == body.label
        )
    )
    if existing:
        existing.encrypted_key = encrypt_secret(body.key)
        existing.masked = mask_secret(body.key)
        await session.commit()
        return apikey_out(existing)
    row = ApiKey(
        user_id=user.id,
        provider=body.provider,
        label=body.label,
        encrypted_key=encrypt_secret(body.key),
        masked=mask_secret(body.key),
    )
    session.add(row)
    await session.commit()
    return apikey_out(row)


@router.delete("/{key_id}")
async def delete_key(
    key_id: str, user: User = Depends(require_user), session: AsyncSession = Depends(get_session)
) -> dict:
    row = await session.get(ApiKey, key_id)
    if not row or row.user_id != user.id:
        raise HTTPException(status.HTTP_404_NOT_FOUND, "Key not found")
    await session.delete(row)
    await session.commit()
    return {"deleted": key_id}


@router.post("/test")
async def test_key(
    body: KeyTestIn, user: User = Depends(require_user), session: AsyncSession = Depends(get_session)
) -> dict:
    key = body.key
    if not key:
        row = await session.scalar(
            select(ApiKey).where(ApiKey.user_id == user.id, ApiKey.provider == body.provider)
        )
        if row:
            key = decrypt_secret(row.encrypted_key)
    if not key:
        raise HTTPException(status.HTTP_400_BAD_REQUEST, "No key provided or stored")
    ref = body.model_ref or _default_model_for(body.provider)
    comp = await call_model(ref, [ChatMessage("user", "Reply with the single word: pong")], user_keys={body.provider: key}, max_tokens=8)
    return {"ok": comp.ok, "provider": body.provider, "model": ref, "reply": comp.text[:80], "error": comp.error}


def _default_model_for(provider: str) -> str:
    return {
        "openai": "openai/gpt-4o-mini",
        "anthropic": "anthropic/claude-3-5-haiku-latest",
        "google": "google/gemini-2.0-flash",
        "mistral": "mistral/mistral-small-latest",
        "groq": "groq/llama-3.3-70b-versatile",
        "deepseek": "deepseek/deepseek-chat",
        "openrouter": "openrouter/meta-llama/llama-3.3-70b-instruct",
        "together": "together/meta-llama/Llama-3.3-70B-Instruct-Turbo",
    }.get(provider, f"{provider}/default")
