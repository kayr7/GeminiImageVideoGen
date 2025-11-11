"""Database-backed session manager for issued auth tokens."""

from __future__ import annotations

from datetime import datetime, timedelta
from typing import Optional
import secrets

from models import LoginUser
from .database import get_connection


class _SessionManager:
    """Manage short-lived bearer tokens for authenticated users in database."""

    def create_session(
        self, user: LoginUser, user_id: str, *, ttl_hours: int = 24
    ) -> str:
        """Create a new session and store in database."""
        token = secrets.token_urlsafe(32)
        now = datetime.utcnow()
        expires = now + timedelta(hours=ttl_hours)

        with get_connection() as conn:
            conn.execute(
                """
                INSERT INTO user_sessions (token, user_id, created_at, expires_at, last_activity_at)
                VALUES (?, ?, ?, ?, ?)
                """,
                (token, user_id, now.isoformat(), expires.isoformat(), now.isoformat()),
            )
            conn.commit()

        return token

    def get_user(self, token: str) -> Optional[LoginUser]:
        """Get user from session token."""
        with get_connection() as conn:
            # Get session
            row = conn.execute(
                """
                SELECT s.user_id, s.expires_at, u.email, u.is_admin, u.is_active
                FROM user_sessions s
                JOIN users u ON s.user_id = u.id
                WHERE s.token = ?
                """,
                (token,),
            ).fetchone()

            if not row:
                return None

            # Check if expired
            expires_at = datetime.fromisoformat(row["expires_at"])
            if expires_at < datetime.utcnow():
                # Clean up expired session
                conn.execute("DELETE FROM user_sessions WHERE token = ?", (token,))
                conn.commit()
                return None

            # Check if user is active
            if not bool(row["is_active"]):
                return None

            # Update last activity
            conn.execute(
                "UPDATE user_sessions SET last_activity_at = ? WHERE token = ?",
                (datetime.utcnow().isoformat(), token),
            )
            conn.commit()

            # Return LoginUser
            roles = ["admin"] if bool(row["is_admin"]) else []
            return LoginUser(
                username=row["email"],
                displayName=row["email"],
                roles=roles,
            )

    def invalidate(self, token: str) -> None:
        """Invalidate a session."""
        with get_connection() as conn:
            conn.execute("DELETE FROM user_sessions WHERE token = ?", (token,))
            conn.commit()

    def cleanup_expired_sessions(self) -> None:
        """Remove expired sessions from database."""
        with get_connection() as conn:
            conn.execute(
                "DELETE FROM user_sessions WHERE expires_at < ?",
                (datetime.utcnow().isoformat(),),
            )
            conn.commit()


session_manager = _SessionManager()


__all__ = ["session_manager"]
