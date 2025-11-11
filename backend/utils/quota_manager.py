"""Quota management system for user generation limits - Total usage based."""

from __future__ import annotations

import uuid
from datetime import datetime
from typing import Optional, Dict, List, Any

from .database import get_connection


class Quota:
    """Quota model."""

    def __init__(
        self,
        id: str,
        user_id: str,
        generation_type: str,
        quota_type: str,  # Now just 'limited' or 'unlimited'
        quota_limit: Optional[int],
        quota_used: int,
        quota_reset_at: Optional[str],  # Not used anymore but kept for DB compatibility
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
            "quotaResetAt": None,  # No longer used
            "createdAt": self.created_at,
            "updatedAt": self.updated_at,
        }


class QuotaManager:
    """Manages user quotas - Total usage based (not time-based)."""

    # Default quotas for new users
    DEFAULT_QUOTAS = {
        "image": {"type": "limited", "limit": 100},
        "video": {"type": "limited", "limit": 50},
    }

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

        # Validate quota limit
        if quota_type == "unlimited":
            quota_limit = None
        elif quota_limit is not None and quota_limit < 0:
            quota_limit = 0

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
                    0,  # quota_used starts at 0
                    None,  # No reset time for total quotas
                    now,
                    now,
                ),
            )
            conn.commit()

        return QuotaManager.get_quota(user_id, generation_type)

    @staticmethod
    def get_quota(user_id: str, generation_type: str) -> Optional[Quota]:
        """Get quota for a user and generation type."""
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
                "SELECT * FROM user_quotas WHERE user_id = ?", (user_id,)
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
        Check if user has quota available for a generation.

        Returns:
            (has_quota, error_message)
        """
        quota = QuotaManager.get_quota(user_id, generation_type)

        if not quota:
            # No quota set, deny by default
            return False, "No quota configured for this generation type"

        # Unlimited quota
        if quota.quota_type == "unlimited" or quota.quota_limit is None:
            return True, None

        # Check if quota is available
        if quota.quota_used >= quota.quota_limit:
            if quota.quota_limit == 0:
                return (
                    False,
                    f"Your {generation_type} quota is set to 0. Contact your administrator.",
                )
            return (
                False,
                f"Quota exceeded. You have used {quota.quota_used}/{quota.quota_limit} {generation_type} generations.",
            )

        return True, None

    @staticmethod
    def increment_quota(user_id: str, generation_type: str) -> bool:
        """
        Increment the quota usage for a user and generation type.

        Returns:
            True if incremented successfully, False otherwise
        """
        quota = QuotaManager.get_quota(user_id, generation_type)

        if not quota:
            return False

        now = datetime.utcnow().isoformat()

        with get_connection() as conn:
            conn.execute(
                """
                UPDATE user_quotas
                SET quota_used = quota_used + 1, updated_at = ?
                WHERE user_id = ? AND generation_type = ?
                """,
                (now, user_id, generation_type),
            )
            conn.commit()

        return True

    @staticmethod
    def update_quota(
        user_id: str,
        generation_type: str,
        quota_type: Optional[str] = None,
        quota_limit: Optional[int] = None,
    ) -> Optional[Quota]:
        """Update a quota."""
        quota = QuotaManager.get_quota(user_id, generation_type)

        if not quota:
            return None

        updates = []
        params = []

        if quota_type is not None:
            updates.append("quota_type = ?")
            params.append(quota_type)

            # If changing to unlimited, set limit to None
            if quota_type == "unlimited":
                updates.append("quota_limit = ?")
                params.append(None)

        if quota_limit is not None and (
            quota_type != "unlimited" if quota_type else quota.quota_type != "unlimited"
        ):
            updates.append("quota_limit = ?")
            # Allow 0 quotas
            params.append(max(0, quota_limit) if quota_limit >= 0 else quota_limit)

        if not updates:
            return quota

        updates.append("updated_at = ?")
        params.append(datetime.utcnow().isoformat())
        params.append(user_id)
        params.append(generation_type)

        with get_connection() as conn:
            conn.execute(
                f"UPDATE user_quotas SET {', '.join(updates)} WHERE user_id = ? AND generation_type = ?",
                params,
            )
            conn.commit()

        return QuotaManager.get_quota(user_id, generation_type)

    @staticmethod
    def reset_user_quota(user_id: str, generation_type: str) -> bool:
        """Reset quota usage to 0 for a specific generation type."""
        now = datetime.utcnow().isoformat()

        with get_connection() as conn:
            result = conn.execute(
                """
                UPDATE user_quotas
                SET quota_used = 0, updated_at = ?
                WHERE user_id = ? AND generation_type = ?
                """,
                (now, user_id, generation_type),
            )
            conn.commit()
            return result.rowcount > 0

    @staticmethod
    def set_default_quotas(
        user_id: str, custom_quotas: Optional[Dict[str, Dict[str, Any]]] = None
    ):
        """
        Set default quotas for a new user.

        Args:
            user_id: User ID
            custom_quotas: Optional custom quota configuration
                          Format: {"image": {"type": "limited", "limit": 100}, ...}
        """
        quotas_to_create = (
            custom_quotas if custom_quotas else QuotaManager.DEFAULT_QUOTAS
        )

        for gen_type, quota_config in quotas_to_create.items():
            # Check if quota already exists
            existing = QuotaManager.get_quota(user_id, gen_type)
            if existing:
                continue

            quota_type = quota_config.get("type", "limited")
            quota_limit = quota_config.get("limit")

            # Ensure 0 is respected
            if quota_type != "unlimited" and quota_limit is not None:
                quota_limit = max(0, quota_limit)

            QuotaManager.create_quota(
                user_id=user_id,
                generation_type=gen_type,
                quota_type=quota_type,
                quota_limit=quota_limit,
            )


__all__ = ["Quota", "QuotaManager"]
