"""Authentication helpers for FastAPI dependencies."""

from __future__ import annotations

from typing import Tuple
from fastapi import Depends, Header, HTTPException, status

from models import LoginUser
from .session import session_manager
from .user_manager import User, UserManager


def get_current_user(authorization: str | None = Header(default=None)) -> LoginUser:
    """Get current user from authorization token."""
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


def get_current_user_with_db(
    authorization: str | None = Header(default=None),
) -> Tuple[LoginUser, User]:
    """Get current user from authorization token with full database user object."""
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

    # Get full user object from database
    db_user = UserManager.get_user_by_email(user.username)
    if not db_user:
        raise HTTPException(
            status_code=status.HTTP_401_UNAUTHORIZED,
            detail="User not found in database",
        )

    return user, db_user


def require_admin(user: LoginUser = Depends(get_current_user)) -> LoginUser:
    """Require admin role."""
    if "admin" not in (user.roles or []):
        raise HTTPException(
            status_code=status.HTTP_403_FORBIDDEN,
            detail="Admin privileges required",
        )
    return user


__all__ = ["get_current_user", "get_current_user_with_db", "require_admin"]
