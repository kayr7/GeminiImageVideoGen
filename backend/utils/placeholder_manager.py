"""Personal named placeholder values (e.g. CONTEXT -> "We are ACME GmbH ...").

The frontend prefills ``{{NAME}}`` fields in templates/prompts from these.
Names are case-sensitive and unique per user. Rows are removed with the user
via ON DELETE CASCADE.
"""

from __future__ import annotations

import re
import sqlite3
import uuid
from datetime import datetime
from typing import Dict, List, Optional

from utils.database import get_connection

MAX_PLACEHOLDERS_PER_USER = 100
NAME_PATTERN = r"^[A-Za-z0-9_]{1,64}$"
NAME_RE = re.compile(NAME_PATTERN)
MAX_VALUE_LENGTH = 20000
MAX_DESCRIPTION_LENGTH = 500

_COLUMNS = "id, user_id, name, value, description, created_at, updated_at"


class PlaceholderNameConflict(Exception):
    """A placeholder with this name already exists for the user."""


class PlaceholderLimitReached(Exception):
    """The user already has MAX_PLACEHOLDERS_PER_USER placeholders."""


# Sentinel: "leave this field unchanged" (description may be set to None explicitly).
UNSET = object()


class Placeholder:
    def __init__(self, id, user_id, name, value, description, created_at, updated_at):
        self.id = id
        self.user_id = user_id
        self.name = name
        self.value = value
        self.description = description
        self.created_at = created_at
        self.updated_at = updated_at

    @classmethod
    def from_row(cls, row: sqlite3.Row) -> "Placeholder":
        return cls(*(row[k] for k in _COLUMNS.split(", ")))

    def to_dict(self) -> Dict:
        return {
            "id": self.id,
            "userId": self.user_id,
            "name": self.name,
            "value": self.value,
            "description": self.description,
            "createdAt": self.created_at,
            "updatedAt": self.updated_at,
        }


def _now() -> str:
    return datetime.utcnow().isoformat() + "Z"


def _is_unique_violation(exc: sqlite3.IntegrityError) -> bool:
    return "UNIQUE" in str(exc).upper()


class PlaceholderManager:
    @staticmethod
    def _get(conn: sqlite3.Connection, placeholder_id: str, user_id: str) -> Optional[Placeholder]:
        row = conn.execute(
            f"SELECT {_COLUMNS} FROM user_placeholders WHERE id = ? AND user_id = ?",
            (placeholder_id, user_id),
        ).fetchone()
        return Placeholder.from_row(row) if row else None

    @staticmethod
    def _insert(conn, user_id: str, name: str, value: str, description: Optional[str]) -> Placeholder:
        """Insert inside an already open write transaction; enforces the per-user limit."""
        count = conn.execute(
            "SELECT COUNT(*) FROM user_placeholders WHERE user_id = ?", (user_id,)
        ).fetchone()[0]
        if count >= MAX_PLACEHOLDERS_PER_USER:
            raise PlaceholderLimitReached()
        now = _now()
        p = Placeholder(str(uuid.uuid4()), user_id, name, value, description, now, now)
        conn.execute(
            f"INSERT INTO user_placeholders ({_COLUMNS}) VALUES (?, ?, ?, ?, ?, ?, ?)",
            (p.id, p.user_id, p.name, p.value, p.description, p.created_at, p.updated_at),
        )
        return p

    @staticmethod
    def list_placeholders(user_id: str) -> List[Placeholder]:
        with get_connection() as conn:
            rows = conn.execute(
                f"SELECT {_COLUMNS} FROM user_placeholders WHERE user_id = ? "
                "ORDER BY name COLLATE NOCASE, name",
                (user_id,),
            ).fetchall()
        return [Placeholder.from_row(r) for r in rows]

    @staticmethod
    def get_placeholder(placeholder_id: str, user_id: str) -> Optional[Placeholder]:
        with get_connection() as conn:
            return PlaceholderManager._get(conn, placeholder_id, user_id)

    @staticmethod
    def create_placeholder(
        user_id: str, name: str, value: str, description: Optional[str] = None
    ) -> Placeholder:
        """Raises PlaceholderNameConflict / PlaceholderLimitReached."""
        with get_connection() as conn:
            try:
                conn.execute("BEGIN IMMEDIATE")
                exists = conn.execute(
                    "SELECT 1 FROM user_placeholders WHERE user_id = ? AND name = ?",
                    (user_id, name),
                ).fetchone()
                if exists:
                    raise PlaceholderNameConflict()
                p = PlaceholderManager._insert(conn, user_id, name, value, description)
                conn.commit()
                return p
            except sqlite3.IntegrityError as exc:
                conn.rollback()
                if _is_unique_violation(exc):
                    raise PlaceholderNameConflict() from exc
                raise
            except Exception:
                conn.rollback()
                raise

    @staticmethod
    def update_placeholder(
        placeholder_id: str,
        user_id: str,
        name=UNSET,
        value=UNSET,
        description=UNSET,
    ) -> Optional[Placeholder]:
        """Returns None if not found/not owned. Raises PlaceholderNameConflict on rename clash."""
        fields = {
            col: v
            for col, v in (("name", name), ("value", value), ("description", description))
            if v is not UNSET
        }
        with get_connection() as conn:
            existing = PlaceholderManager._get(conn, placeholder_id, user_id)
            if existing is None:
                return None
            if not fields:
                return existing
            fields["updated_at"] = _now()
            assignments = ", ".join(f"{col} = ?" for col in fields)
            try:
                cursor = conn.execute(
                    f"UPDATE user_placeholders SET {assignments} WHERE id = ? AND user_id = ?",
                    (*fields.values(), placeholder_id, user_id),
                )
                conn.commit()
            except sqlite3.IntegrityError as exc:
                conn.rollback()
                if _is_unique_violation(exc):
                    raise PlaceholderNameConflict() from exc
                raise
            if cursor.rowcount == 0:
                return None
            return PlaceholderManager._get(conn, placeholder_id, user_id)

    @staticmethod
    def upsert_by_name(
        user_id: str, name: str, value: str, description=UNSET
    ) -> Placeholder:
        """Create the placeholder or update its value (and description, if given).

        Raises PlaceholderLimitReached when creating at the limit.
        """
        with get_connection() as conn:
            try:
                conn.execute("BEGIN IMMEDIATE")
                row = conn.execute(
                    f"SELECT {_COLUMNS} FROM user_placeholders WHERE user_id = ? AND name = ?",
                    (user_id, name),
                ).fetchone()
                if row is None:
                    p = PlaceholderManager._insert(
                        conn, user_id, name, value,
                        None if description is UNSET else description,
                    )
                else:
                    p = Placeholder.from_row(row)
                    p.value = value
                    if description is not UNSET:
                        p.description = description
                    p.updated_at = _now()
                    conn.execute(
                        "UPDATE user_placeholders SET value = ?, description = ?, updated_at = ? "
                        "WHERE id = ?",
                        (p.value, p.description, p.updated_at, p.id),
                    )
                conn.commit()
                return p
            except Exception:
                conn.rollback()
                raise

    @staticmethod
    def delete_placeholder(placeholder_id: str, user_id: str) -> bool:
        with get_connection() as conn:
            cursor = conn.execute(
                "DELETE FROM user_placeholders WHERE id = ? AND user_id = ?",
                (placeholder_id, user_id),
            )
            conn.commit()
            return cursor.rowcount > 0
