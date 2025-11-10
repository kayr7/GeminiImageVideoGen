"""Authentication helpers for FastAPI dependencies."""
from __future__ import annotations

from fastapi import Depends, Header, HTTPException, status

from models import LoginUser
from .session import session_manager


def get_current_user(authorization: str | None = Header(default=None)) -> LoginUser:
    if not authorization or not authorization.startswith("Bearer "):
        raise HTTPException(
            status_code=status.HTTP_401_UNAUTHORIZED,
            detail="Missing or invalid authorization header",
        )

    token = authorization.split(" ", 1)[1].strip()
    user = session_manager.get_user(token)
    if not user:
        raise HTTPException(
            status_code=status.HTTP_401_UNAUTHORIZED,
            detail="Invalid or expired session token",
        )
    return user


def require_admin(user: LoginUser = Depends(get_current_user)) -> LoginUser:
    if "admin" not in (user.roles or []):
        raise HTTPException(
            status_code=status.HTTP_403_FORBIDDEN,
            detail="Admin privileges required",
        )
    return user


__all__ = ["get_current_user", "require_admin"]
