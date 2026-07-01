"""FastAPI dependencies: DB session + (optional) authenticated user."""
from __future__ import annotations

from fastapi import Depends, Header, HTTPException, status
from sqlalchemy.ext.asyncio import AsyncSession

from app.core.config import settings
from app.core.db import get_session
from app.core.security import decode_access_token
from app.models import User


async def get_current_user(
    authorization: str | None = Header(default=None),
    session: AsyncSession = Depends(get_session),
) -> User | None:
    """Return the user for a Bearer token, or None when anonymous."""
    if not authorization or not authorization.lower().startswith("bearer "):
        return None
    token = authorization.split(" ", 1)[1].strip()
    payload = decode_access_token(token)
    if not payload:
        return None
    user = await session.get(User, payload.get("sub"))
    return user if (user and user.is_active) else None


async def require_user(user: User | None = Depends(get_current_user)) -> User:
    if user is None:
        if settings.allow_anonymous:
            # anonymous is allowed for actions, but some endpoints still need identity
            raise HTTPException(status.HTTP_401_UNAUTHORIZED, "Authentication required")
        raise HTTPException(status.HTTP_401_UNAUTHORIZED, "Authentication required")
    return user


async def require_admin(user: User = Depends(require_user)) -> User:
    if not user.is_admin:
        raise HTTPException(status.HTTP_403_FORBIDDEN, "Admin only")
    return user


DBSession = Depends(get_session)
