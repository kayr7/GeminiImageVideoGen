"""Quota management system for user generation limits."""

from __future__ import annotations

import uuid
from datetime import datetime, timedelta
from typing import Optional, Dict, List, Any

from .database import get_connection


class Quota:
    """Quota model."""

    def __init__(
        self,
        id: str,
        user_id: str,
        generation_type: str,
        quota_type: str,
        quota_limit: Optional[int],
        quota_used: int,
        quota_reset_at: Optional[str],
        created_at: str,
        updated_at: str,
    ):
        self.id = id
        self.user_id = user_id
        self.generation_type = generation_type
        self.quota_type = quota_type
        self.quota_limit = quota_limit
        self.quota_used = quota_used
        self.quota_reset_at = quota_reset_at
        self.created_at = created_at
        self.updated_at = updated_at

    def to_dict(self) -> Dict[str, Any]:
        """Convert to dictionary."""
        remaining = None
        if self.quota_limit is not None:
            remaining = max(0, self.quota_limit - self.quota_used)

        return {
            "id": self.id,
            "userId": self.user_id,
            "generationType": self.generation_type,
            "quotaType": self.quota_type,
            "quotaLimit": self.quota_limit,
            "quotaUsed": self.quota_used,
            "quotaRemaining": remaining,
            "quotaResetAt": self.quota_reset_at,
            "createdAt": self.created_at,
            "updatedAt": self.updated_at,
        }


class QuotaManager:
    """Manages user quotas."""

    # Default quotas for new users
    DEFAULT_QUOTAS = {
        "image": {"type": "daily", "limit": 50},
        "video": {"type": "daily", "limit": 10},
        "edit": {"type": "daily", "limit": 30},
    }

    @staticmethod
    def _calculate_reset_time(quota_type: str) -> str:
        """Calculate the next reset time based on quota type."""
        now = datetime.utcnow()

        if quota_type == "daily":
            # Reset at midnight UTC
            next_reset = now.replace(
                hour=0, minute=0, second=0, microsecond=0
            ) + timedelta(days=1)
        elif quota_type == "weekly":
            # Reset on Monday at midnight UTC
            days_until_monday = (7 - now.weekday()) % 7
            if days_until_monday == 0:
                days_until_monday = 7
            next_reset = now.replace(
                hour=0, minute=0, second=0, microsecond=0
            ) + timedelta(days=days_until_monday)
        else:  # unlimited
            return None

        return next_reset.isoformat()

    @staticmethod
    def create_quota(
        user_id: str,
        generation_type: str,
        quota_type: str,
        quota_limit: Optional[int],
    ) -> Quota:
        """Create a new quota for a user."""
        now = datetime.utcnow().isoformat()
        quota_id = str(uuid.uuid4())
        quota_reset_at = QuotaManager._calculate_reset_time(quota_type)

        with get_connection() as conn:
            conn.execute(
                """
                INSERT INTO user_quotas (
                    id, user_id, generation_type, quota_type, quota_limit,
                    quota_used, quota_reset_at, created_at, updated_at
                ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?)
                """,
                (
                    quota_id,
                    user_id,
                    generation_type,
                    quota_type,
                    quota_limit,
                    0,
                    quota_reset_at,
                    now,
                    now,
                ),
            )
            conn.commit()

        return QuotaManager.get_quota(user_id, generation_type)

    @staticmethod
    def get_quota(user_id: str, generation_type: str) -> Optional[Quota]:
        """Get quota for user and generation type."""
        with get_connection() as conn:
            row = conn.execute(
                """
                SELECT * FROM user_quotas
                WHERE user_id = ? AND generation_type = ?
                """,
                (user_id, generation_type),
            ).fetchone()

            if not row:
                return None

            return Quota(
                id=row["id"],
                user_id=row["user_id"],
                generation_type=row["generation_type"],
                quota_type=row["quota_type"],
                quota_limit=row["quota_limit"],
                quota_used=row["quota_used"],
                quota_reset_at=row["quota_reset_at"],
                created_at=row["created_at"],
                updated_at=row["updated_at"],
            )

    @staticmethod
    def get_all_quotas(user_id: str) -> List[Quota]:
        """Get all quotas for a user."""
        with get_connection() as conn:
            rows = conn.execute(
                "SELECT * FROM user_quotas WHERE user_id = ? ORDER BY generation_type",
                (user_id,),
            ).fetchall()

            return [
                Quota(
                    id=row["id"],
                    user_id=row["user_id"],
                    generation_type=row["generation_type"],
                    quota_type=row["quota_type"],
                    quota_limit=row["quota_limit"],
                    quota_used=row["quota_used"],
                    quota_reset_at=row["quota_reset_at"],
                    created_at=row["created_at"],
                    updated_at=row["updated_at"],
                )
                for row in rows
            ]

    @staticmethod
    def check_quota(user_id: str, generation_type: str) -> tuple[bool, Optional[str]]:
        """
        Check if user has quota remaining for this generation type.

        Returns:
            Tuple of (has_quota, error_message)
        """
        quota = QuotaManager.get_quota(user_id, generation_type)

        if not quota:
            # No quota defined = unlimited for now
            # Could also create default quota here
            return True, None

        if quota.quota_type == "unlimited":
            return True, None

        # Check if quota needs reset
        if quota.quota_reset_at:
            reset_time = datetime.fromisoformat(quota.quota_reset_at)
            if datetime.utcnow() >= reset_time:
                QuotaManager._reset_quota(quota.id)
                quota = QuotaManager.get_quota(user_id, generation_type)

        if quota.quota_limit is None:
            return True, None

        if quota.quota_used >= quota.quota_limit:
            reset_info = ""
            if quota.quota_reset_at:
                reset_info = f" Resets at {quota.quota_reset_at}"
            return (
                False,
                f"Quota exceeded for {generation_type}. Used: {quota.quota_used}/{quota.quota_limit}.{reset_info}",
            )

        return True, None

    @staticmethod
    def increment_quota(user_id: str, generation_type: str):
        """Increment quota usage after successful generation."""
        quota = QuotaManager.get_quota(user_id, generation_type)

        if not quota:
            # Create default quota if doesn't exist
            default = QuotaManager.DEFAULT_QUOTAS.get(
                generation_type, {"type": "unlimited", "limit": None}
            )
            QuotaManager.create_quota(
                user_id,
                generation_type,
                default["type"],
                default["limit"],
            )
            quota = QuotaManager.get_quota(user_id, generation_type)

        if quota and quota.quota_type != "unlimited":
            with get_connection() as conn:
                conn.execute(
                    """
                    UPDATE user_quotas
                    SET quota_used = quota_used + 1, updated_at = ?
                    WHERE id = ?
                    """,
                    (datetime.utcnow().isoformat(), quota.id),
                )
                conn.commit()

    @staticmethod
    def _reset_quota(quota_id: str):
        """Reset quota usage and update reset time."""
        with get_connection() as conn:
            # Get current quota
            row = conn.execute(
                "SELECT quota_type FROM user_quotas WHERE id = ?",
                (quota_id,),
            ).fetchone()

            if not row:
                return

            quota_type = row["quota_type"]
            next_reset = QuotaManager._calculate_reset_time(quota_type)

            conn.execute(
                """
                UPDATE user_quotas
                SET quota_used = 0, quota_reset_at = ?, updated_at = ?
                WHERE id = ?
                """,
                (next_reset, datetime.utcnow().isoformat(), quota_id),
            )
            conn.commit()

    @staticmethod
    def update_quota(
        user_id: str,
        generation_type: str,
        quota_type: Optional[str] = None,
        quota_limit: Optional[int] = None,
    ) -> Optional[Quota]:
        """Update quota settings."""
        quota = QuotaManager.get_quota(user_id, generation_type)

        if not quota:
            # Create new quota
            if quota_type and quota_limit is not None:
                return QuotaManager.create_quota(
                    user_id, generation_type, quota_type, quota_limit
                )
            return None

        updates = []
        params = []

        if quota_type is not None:
            updates.append("quota_type = ?")
            params.append(quota_type)
            # Recalculate reset time
            updates.append("quota_reset_at = ?")
            params.append(QuotaManager._calculate_reset_time(quota_type))

        if quota_limit is not None:
            updates.append("quota_limit = ?")
            params.append(quota_limit)

        if not updates:
            return quota

        updates.append("updated_at = ?")
        params.append(datetime.utcnow().isoformat())
        params.append(quota.id)

        with get_connection() as conn:
            conn.execute(
                f"UPDATE user_quotas SET {', '.join(updates)} WHERE id = ?",
                params,
            )
            conn.commit()

        return QuotaManager.get_quota(user_id, generation_type)

    @staticmethod
    def set_default_quotas(user_id: str):
        """Set default quotas for a new user."""
        for gen_type, settings in QuotaManager.DEFAULT_QUOTAS.items():
            existing = QuotaManager.get_quota(user_id, gen_type)
            if not existing:
                QuotaManager.create_quota(
                    user_id,
                    gen_type,
                    settings["type"],
                    settings.get("limit"),
                )

    @staticmethod
    def reset_user_quota(user_id: str, generation_type: str):
        """Manually reset quota for a user."""
        quota = QuotaManager.get_quota(user_id, generation_type)
        if quota:
            QuotaManager._reset_quota(quota.id)


__all__ = ["Quota", "QuotaManager"]
