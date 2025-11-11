"""User management utilities for authentication and user operations."""

from __future__ import annotations

import os
import secrets
import uuid
from datetime import datetime, timedelta
from typing import Optional, List, Dict, Any, Tuple

import bcrypt

from .database import get_connection


class User:
    """User model."""

    def __init__(
        self,
        id: str,
        email: str,
        password_hash: Optional[str],
        is_active: bool,
        is_admin: bool,
        require_password_reset: bool,
        created_at: str,
        updated_at: str,
        last_login_at: Optional[str] = None,
    ):
        self.id = id
        self.email = email
        self.password_hash = password_hash
        self.is_active = is_active
        self.is_admin = is_admin
        self.require_password_reset = require_password_reset
        self.created_at = created_at
        self.updated_at = updated_at
        self.last_login_at = last_login_at

    def to_dict(self) -> Dict[str, Any]:
        """Convert to dictionary."""
        return {
            "id": self.id,
            "email": self.email,
            "isActive": self.is_active,
            "isAdmin": self.is_admin,
            "requirePasswordReset": self.require_password_reset,
            "createdAt": self.created_at,
            "updatedAt": self.updated_at,
            "lastLoginAt": self.last_login_at,
        }


class UserManager:
    """Manages user operations."""

    @staticmethod
    def hash_password(password: str) -> str:
        """Hash a password using bcrypt."""
        salt = bcrypt.gensalt(rounds=12)
        return bcrypt.hashpw(password.encode("utf-8"), salt).decode("utf-8")

    @staticmethod
    def verify_password(password: str, password_hash: str) -> bool:
        """Verify a password against its hash."""
        try:
            return bcrypt.checkpw(
                password.encode("utf-8"), password_hash.encode("utf-8")
            )
        except Exception:
            return False

    @staticmethod
    def validate_password(password: str) -> Tuple[bool, Optional[str]]:
        """
        Validate password strength.

        Requirements:
        - Minimum 8 characters
        - At least one uppercase letter
        - At least one lowercase letter
        - At least one number

        Returns:
            Tuple of (is_valid, error_message)
        """
        if len(password) < 8:
            return False, "Password must be at least 8 characters long"

        if not any(c.isupper() for c in password):
            return False, "Password must contain at least one uppercase letter"

        if not any(c.islower() for c in password):
            return False, "Password must contain at least one lowercase letter"

        if not any(c.isdigit() for c in password):
            return False, "Password must contain at least one number"

        return True, None

    @staticmethod
    def create_user(
        email: str,
        password: Optional[str] = None,
        is_admin: bool = False,
        is_active: bool = True,
    ) -> User:
        """Create a new user."""
        now = datetime.utcnow().isoformat()
        user_id = str(uuid.uuid4())

        password_hash = UserManager.hash_password(password) if password else None
        require_password_reset = (
            password_hash is None
        )  # Need to set password if not provided

        with get_connection() as conn:
            conn.execute(
                """
                INSERT INTO users (
                    id, email, password_hash, is_active, is_admin,
                    require_password_reset, created_at, updated_at
                ) VALUES (?, ?, ?, ?, ?, ?, ?, ?)
                """,
                (
                    user_id,
                    email.lower().strip(),
                    password_hash,
                    1 if is_active else 0,
                    1 if is_admin else 0,
                    1 if require_password_reset else 0,
                    now,
                    now,
                ),
            )
            conn.commit()

        return UserManager.get_user_by_id(user_id)

    @staticmethod
    def get_user_by_id(user_id: str) -> Optional[User]:
        """Get user by ID."""
        with get_connection() as conn:
            row = conn.execute(
                "SELECT * FROM users WHERE id = ?", (user_id,)
            ).fetchone()

            if not row:
                return None

            return User(
                id=row["id"],
                email=row["email"],
                password_hash=row["password_hash"],
                is_active=bool(row["is_active"]),
                is_admin=bool(row["is_admin"]),
                require_password_reset=bool(row["require_password_reset"]),
                created_at=row["created_at"],
                updated_at=row["updated_at"],
                last_login_at=row["last_login_at"],
            )

    @staticmethod
    def get_user_by_email(email: str) -> Optional[User]:
        """Get user by email."""
        with get_connection() as conn:
            row = conn.execute(
                "SELECT * FROM users WHERE email = ?", (email.lower().strip(),)
            ).fetchone()

            if not row:
                return None

            return User(
                id=row["id"],
                email=row["email"],
                password_hash=row["password_hash"],
                is_active=bool(row["is_active"]),
                is_admin=bool(row["is_admin"]),
                require_password_reset=bool(row["require_password_reset"]),
                created_at=row["created_at"],
                updated_at=row["updated_at"],
                last_login_at=row["last_login_at"],
            )

    @staticmethod
    def update_user(
        user_id: str,
        password: Optional[str] = None,
        is_active: Optional[bool] = None,
        require_password_reset: Optional[bool] = None,
    ) -> Optional[User]:
        """Update user fields."""
        updates = []
        params = []

        if password is not None:
            updates.append("password_hash = ?")
            params.append(UserManager.hash_password(password))
            updates.append("require_password_reset = ?")
            params.append(0)  # Password was set, no reset needed

        if is_active is not None:
            updates.append("is_active = ?")
            params.append(1 if is_active else 0)

        if require_password_reset is not None:
            updates.append("require_password_reset = ?")
            params.append(1 if require_password_reset else 0)

        if not updates:
            return UserManager.get_user_by_id(user_id)

        updates.append("updated_at = ?")
        params.append(datetime.utcnow().isoformat())
        params.append(user_id)

        with get_connection() as conn:
            conn.execute(
                f"UPDATE users SET {', '.join(updates)} WHERE id = ?",
                params,
            )
            conn.commit()

        return UserManager.get_user_by_id(user_id)

    @staticmethod
    def update_last_login(user_id: str):
        """Update user's last login timestamp."""
        with get_connection() as conn:
            conn.execute(
                "UPDATE users SET last_login_at = ? WHERE id = ?",
                (datetime.utcnow().isoformat(), user_id),
            )
            conn.commit()

    @staticmethod
    def create_admin_relationship(admin_id: str, user_id: str):
        """Create admin-user relationship."""
        with get_connection() as conn:
            # Check if relationship already exists
            existing = conn.execute(
                "SELECT id FROM user_admins WHERE admin_id = ? AND user_id = ?",
                (admin_id, user_id),
            ).fetchone()

            if existing:
                return  # Already exists

            conn.execute(
                "INSERT INTO user_admins (id, admin_id, user_id, created_at) VALUES (?, ?, ?, ?)",
                (str(uuid.uuid4()), admin_id, user_id, datetime.utcnow().isoformat()),
            )
            conn.commit()

    @staticmethod
    def get_admin_users(admin_id: str) -> List[User]:
        """Get all users managed by this admin."""
        with get_connection() as conn:
            rows = conn.execute(
                """
                SELECT u.* FROM users u
                INNER JOIN user_admins ua ON u.id = ua.user_id
                WHERE ua.admin_id = ?
                ORDER BY u.created_at DESC
                """,
                (admin_id,),
            ).fetchall()

            return [
                User(
                    id=row["id"],
                    email=row["email"],
                    password_hash=row["password_hash"],
                    is_active=bool(row["is_active"]),
                    is_admin=bool(row["is_admin"]),
                    require_password_reset=bool(row["require_password_reset"]),
                    created_at=row["created_at"],
                    updated_at=row["updated_at"],
                    last_login_at=row["last_login_at"],
                )
                for row in rows
            ]

    @staticmethod
    def can_admin_manage_user(admin_id: str, user_id: str) -> bool:
        """Check if admin can manage this user."""
        with get_connection() as conn:
            row = conn.execute(
                "SELECT id FROM user_admins WHERE admin_id = ? AND user_id = ?",
                (admin_id, user_id),
            ).fetchone()
            return row is not None

    @staticmethod
    def get_user_admins(user_id: str) -> List[str]:
        """Get list of admin IDs who can manage this user."""
        with get_connection() as conn:
            rows = conn.execute(
                "SELECT admin_id FROM user_admins WHERE user_id = ?",
                (user_id,),
            ).fetchall()
            return [row["admin_id"] for row in rows]

    @staticmethod
    def add_tag(user_id: str, tag: str) -> bool:
        """
        Add a tag to a user.

        Args:
            user_id: User ID
            tag: Tag to add (case-insensitive, will be lowercased)

        Returns:
            True if tag was added, False if it already existed
        """
        tag = tag.strip().lower()
        if not tag:
            return False

        tag_id = str(uuid.uuid4())
        now = datetime.utcnow().isoformat()

        try:
            with get_connection() as conn:
                conn.execute(
                    "INSERT INTO user_tags (id, user_id, tag, created_at) VALUES (?, ?, ?, ?)",
                    (tag_id, user_id, tag, now),
                )
                conn.commit()
            return True
        except Exception:
            # Tag already exists (UNIQUE constraint)
            return False

    @staticmethod
    def remove_tag(user_id: str, tag: str) -> bool:
        """
        Remove a tag from a user.

        Args:
            user_id: User ID
            tag: Tag to remove (case-insensitive)

        Returns:
            True if tag was removed, False if it didn't exist
        """
        tag = tag.strip().lower()

        with get_connection() as conn:
            result = conn.execute(
                "DELETE FROM user_tags WHERE user_id = ? AND tag = ?",
                (user_id, tag),
            )
            conn.commit()
            return result.rowcount > 0

    @staticmethod
    def get_user_tags(user_id: str) -> List[str]:
        """
        Get all tags for a user.

        Args:
            user_id: User ID

        Returns:
            List of tags (sorted alphabetically)
        """
        with get_connection() as conn:
            rows = conn.execute(
                "SELECT tag FROM user_tags WHERE user_id = ? ORDER BY tag",
                (user_id,),
            ).fetchall()
            return [row["tag"] for row in rows]

    @staticmethod
    def set_user_tags(user_id: str, tags: List[str]) -> None:
        """
        Set all tags for a user (replaces existing tags).

        Args:
            user_id: User ID
            tags: List of tags to set
        """
        # Normalize tags
        normalized_tags = list(set(tag.strip().lower() for tag in tags if tag.strip()))

        with get_connection() as conn:
            # Remove all existing tags
            conn.execute("DELETE FROM user_tags WHERE user_id = ?", (user_id,))

            # Add new tags
            now = datetime.utcnow().isoformat()
            for tag in normalized_tags:
                tag_id = str(uuid.uuid4())
                conn.execute(
                    "INSERT INTO user_tags (id, user_id, tag, created_at) VALUES (?, ?, ?, ?)",
                    (tag_id, user_id, tag, now),
                )

            conn.commit()

    @staticmethod
    def get_all_tags() -> List[str]:
        """
        Get all unique tags across all users.

        Returns:
            List of all unique tags (sorted alphabetically)
        """
        with get_connection() as conn:
            rows = conn.execute(
                "SELECT DISTINCT tag FROM user_tags ORDER BY tag"
            ).fetchall()
            return [row["tag"] for row in rows]


def ensure_env_admin_exists() -> Optional[User]:
    """
    Ensure the admin user from environment variables exists in the database.
    This maintains backward compatibility with .env-based admin credentials.

    Returns the admin user if successfully created/updated, None otherwise.
    """
    # Try to load admin credentials from environment
    username = None
    password = None

    # Check various env var names for username
    for key in ("APP_USERNAME", "ADMIN_USERNAME", "LOGIN_USERNAME"):
        username = os.getenv(key)
        if username:
            break

    # Check various env var names for password
    for key in ("APP_PASSWORD", "ADMIN_PASSWORD", "LOGIN_PASSWORD"):
        password = os.getenv(key)
        if password:
            break

    if not username or not password:
        return None  # No admin credentials in .env

    # Check if admin user exists
    existing_user = UserManager.get_user_by_email(username)

    if existing_user:
        # Verify password matches or update it
        if existing_user.password_hash:
            if not UserManager.verify_password(password, existing_user.password_hash):
                # Password changed in .env, update it
                UserManager.update_user(
                    existing_user.id,
                    password=password,
                    is_active=True,
                    require_password_reset=False,
                )
        else:
            # No password set, set it now
            UserManager.update_user(
                existing_user.id,
                password=password,
                is_active=True,
                require_password_reset=False,
            )

        return UserManager.get_user_by_id(existing_user.id)

    # Create new admin user
    admin_user = UserManager.create_user(
        email=username,
        password=password,
        is_admin=True,
        is_active=True,
    )

    # No need to set require_password_reset=False since we provided password
    if admin_user.require_password_reset:
        UserManager.update_user(
            admin_user.id,
            require_password_reset=False,
        )

    return admin_user


__all__ = ["User", "UserManager", "ensure_env_admin_exists"]
