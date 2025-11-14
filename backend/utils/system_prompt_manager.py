"""System prompt manager for reusable system messages."""

from __future__ import annotations

import uuid
from datetime import datetime
from typing import Dict, List, Optional

from utils.database import get_connection


class SystemPrompt:
    """Represents a system prompt."""

    def __init__(
        self,
        id: str,
        user_id: str,
        name: str,
        media_type: str,
        prompt_text: str,
        created_at: str,
        updated_at: str,
    ):
        self.id = id
        self.user_id = user_id
        self.name = name
        self.media_type = media_type
        self.prompt_text = prompt_text
        self.created_at = created_at
        self.updated_at = updated_at

    def to_dict(self) -> Dict:
        """Convert to dictionary."""
        return {
            "id": self.id,
            "userId": self.user_id,
            "name": self.name,
            "mediaType": self.media_type,
            "promptText": self.prompt_text,
            "createdAt": self.created_at,
            "updatedAt": self.updated_at,
        }


class SystemPromptManager:
    """Manage system prompts."""

    @staticmethod
    def create_system_prompt(
        user_id: str,
        name: str,
        media_type: str,
        prompt_text: str,
    ) -> SystemPrompt:
        """Create a new system prompt."""
        prompt_id = str(uuid.uuid4())
        now = datetime.utcnow().isoformat() + "Z"

        with get_connection() as conn:
            conn.execute(
                """
                INSERT INTO system_prompts 
                (id, user_id, name, media_type, prompt_text, created_at, updated_at)
                VALUES (?, ?, ?, ?, ?, ?, ?)
                """,
                (
                    prompt_id,
                    user_id,
                    name,
                    media_type,
                    prompt_text,
                    now,
                    now,
                ),
            )
            conn.commit()

        return SystemPrompt(
            id=prompt_id,
            user_id=user_id,
            name=name,
            media_type=media_type,
            prompt_text=prompt_text,
            created_at=now,
            updated_at=now,
        )

    @staticmethod
    def get_system_prompt(prompt_id: str, user_id: str) -> Optional[SystemPrompt]:
        """Get a system prompt by ID (only if owned by user)."""
        with get_connection() as conn:
            row = conn.execute(
                """
                SELECT id, user_id, name, media_type, prompt_text, created_at, updated_at
                FROM system_prompts
                WHERE id = ? AND user_id = ?
                """,
                (prompt_id, user_id),
            ).fetchone()

            if not row:
                return None

            return SystemPrompt(
                id=row["id"],
                user_id=row["user_id"],
                name=row["name"],
                media_type=row["media_type"],
                prompt_text=row["prompt_text"],
                created_at=row["created_at"],
                updated_at=row["updated_at"],
            )

    @staticmethod
    def list_system_prompts(
        user_id: str, media_type: Optional[str] = None
    ) -> List[SystemPrompt]:
        """List all system prompts for a user, optionally filtered by media type."""
        with get_connection() as conn:
            if media_type:
                rows = conn.execute(
                    """
                    SELECT id, user_id, name, media_type, prompt_text, created_at, updated_at
                    FROM system_prompts
                    WHERE user_id = ? AND media_type = ?
                    ORDER BY updated_at DESC
                    """,
                    (user_id, media_type),
                ).fetchall()
            else:
                rows = conn.execute(
                    """
                    SELECT id, user_id, name, media_type, prompt_text, created_at, updated_at
                    FROM system_prompts
                    WHERE user_id = ?
                    ORDER BY updated_at DESC
                    """,
                    (user_id,),
                ).fetchall()

            return [
                SystemPrompt(
                    id=row["id"],
                    user_id=row["user_id"],
                    name=row["name"],
                    media_type=row["media_type"],
                    prompt_text=row["prompt_text"],
                    created_at=row["created_at"],
                    updated_at=row["updated_at"],
                )
                for row in rows
            ]

    @staticmethod
    def update_system_prompt(
        prompt_id: str,
        user_id: str,
        name: Optional[str] = None,
        prompt_text: Optional[str] = None,
    ) -> Optional[SystemPrompt]:
        """Update an existing system prompt."""
        # First check if prompt exists and belongs to user
        prompt = SystemPromptManager.get_system_prompt(prompt_id, user_id)
        if not prompt:
            return None

        now = datetime.utcnow().isoformat() + "Z"

        # Build update query dynamically
        updates = []
        params = []

        if name is not None:
            updates.append("name = ?")
            params.append(name)
        if prompt_text is not None:
            updates.append("prompt_text = ?")
            params.append(prompt_text)

        if not updates:
            return prompt  # Nothing to update

        updates.append("updated_at = ?")
        params.append(now)

        params.extend([prompt_id, user_id])

        with get_connection() as conn:
            conn.execute(
                f"""
                UPDATE system_prompts
                SET {', '.join(updates)}
                WHERE id = ? AND user_id = ?
                """,
                params,
            )
            conn.commit()

        # Return updated prompt
        return SystemPromptManager.get_system_prompt(prompt_id, user_id)

    @staticmethod
    def delete_system_prompt(prompt_id: str, user_id: str) -> bool:
        """Delete a system prompt (only if owned by user)."""
        with get_connection() as conn:
            cursor = conn.execute(
                """
                DELETE FROM system_prompts
                WHERE id = ? AND user_id = ?
                """,
                (prompt_id, user_id),
            )
            conn.commit()
            return cursor.rowcount > 0

    @staticmethod
    def prompt_exists(user_id: str, name: str, media_type: str) -> bool:
        """Check if a system prompt with this name already exists for this user and media type."""
        with get_connection() as conn:
            row = conn.execute(
                """
                SELECT COUNT(*) as count
                FROM system_prompts
                WHERE user_id = ? AND name = ? AND media_type = ?
                """,
                (user_id, name, media_type),
            ).fetchone()
            return row["count"] > 0

