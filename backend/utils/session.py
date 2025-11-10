"""Simple in-memory session manager for issued auth tokens."""
from __future__ import annotations

from datetime import datetime, timedelta
from typing import Dict, Optional

from models import LoginUser

import secrets


class _SessionManager:
    """Manage short-lived bearer tokens for authenticated users."""

    def __init__(self) -> None:
        self._sessions: Dict[str, Dict[str, object]] = {}

    def create_session(self, user: LoginUser, *, ttl_hours: int = 24) -> str:
        token = secrets.token_urlsafe(32)
        self._sessions[token] = {
            "user": user,
            "expires": datetime.utcnow() + timedelta(hours=ttl_hours),
        }
        return token

    def get_user(self, token: str) -> Optional[LoginUser]:
        session = self._sessions.get(token)
        if not session:
            return None

        expires_at = session.get("expires")
        if isinstance(expires_at, datetime) and expires_at < datetime.utcnow():
            # Session expired - remove and treat as invalid
            self._sessions.pop(token, None)
            return None

        user = session.get("user")
        if isinstance(user, LoginUser):
            return user
        return None

    def invalidate(self, token: str) -> None:
        self._sessions.pop(token, None)


session_manager = _SessionManager()


__all__ = ["session_manager"]
