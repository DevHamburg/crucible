"""Auth: register, login, current user."""
from __future__ import annotations

from fastapi import APIRouter, Depends, HTTPException, status
from pydantic import BaseModel, EmailStr
from sqlalchemy import select
from sqlalchemy.ext.asyncio import AsyncSession

from app.api.deps import get_current_user
from app.core.config import settings
from app.core.db import get_session
from app.core.security import create_access_token, hash_password, verify_password
from app.models import User

router = APIRouter(prefix="/auth", tags=["auth"])


class RegisterIn(BaseModel):
    email: EmailStr
    password: str
    display_name: str = ""


class LoginIn(BaseModel):
    email: EmailStr
    password: str


def _user_out(u: User) -> dict:
    return {
        "id": u.id,
        "email": None if u.is_anonymous else u.email,
        "display_name": u.display_name,
        "is_admin": u.is_admin,
        "is_anonymous": u.is_anonymous,
    }


def _token(u: User) -> dict:
    return {
        "access_token": create_access_token(
            u.id, {"email": u.email, "admin": u.is_admin, "anon": u.is_anonymous}
        ),
        "token_type": "bearer",
        "user": _user_out(u),
    }


@router.post("/anon")
async def anon_session(session: AsyncSession = Depends(get_session)) -> dict:
    """Provision a throwaway anonymous account so any visitor can run benchmarks and
    store keys immediately. Registering later upgrades this same row (history kept)."""
    from app.models import new_id

    uid = new_id()
    user = User(
        email=f"anon+{uid}@crucible.local",
        hashed_password="!",  # unusable — anon rows can't log in with a password
        display_name="Guest",
        is_anonymous=True,
    )
    session.add(user)
    await session.commit()
    return _token(user)


@router.post("/register")
async def register(
    body: RegisterIn,
    current: User | None = Depends(get_current_user),
    session: AsyncSession = Depends(get_session),
) -> dict:
    exists = await session.scalar(select(User).where(User.email == body.email))
    if exists and not (current and exists.id == current.id):
        raise HTTPException(status.HTTP_409_CONFLICT, "Email already registered")

    if current and current.is_anonymous:
        # Upgrade the anonymous account in place -> keeps all runs, keys and results.
        current.email = body.email
        current.hashed_password = hash_password(body.password)
        current.display_name = body.display_name or body.email.split("@")[0]
        current.is_anonymous = False
        await session.commit()
        return _token(current)

    user = User(
        email=body.email,
        hashed_password=hash_password(body.password),
        display_name=body.display_name or body.email.split("@")[0],
    )
    session.add(user)
    await session.commit()
    return _token(user)


@router.post("/login")
async def login(body: LoginIn, session: AsyncSession = Depends(get_session)) -> dict:
    user = await session.scalar(select(User).where(User.email == body.email))
    if not user or not verify_password(body.password, user.hashed_password):
        raise HTTPException(status.HTTP_401_UNAUTHORIZED, "Invalid credentials")
    return _token(user)


@router.get("/me")
async def me(user: User | None = Depends(get_current_user)) -> dict:
    if user is None:
        return {"authenticated": False, "anonymous_allowed": settings.allow_anonymous}
    return {"authenticated": True, "user": _user_out(user)}
