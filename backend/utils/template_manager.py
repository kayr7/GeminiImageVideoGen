"""Template manager for prompt templates."""

from __future__ import annotations

import json
import uuid
from datetime import datetime
from typing import Dict, List, Optional

from utils.database import get_connection


class PromptTemplate:
    """Represents a prompt template."""

    def __init__(
        self,
        id: str,
        user_id: str,
        name: str,
        media_type: str,
        template_text: str,
        variables: List[str],
        created_at: str,
        updated_at: str,
    ):
        self.id = id
        self.user_id = user_id
        self.name = name
        self.media_type = media_type
        self.template_text = template_text
        self.variables = variables
        self.created_at = created_at
        self.updated_at = updated_at

    def to_dict(self) -> Dict:
        """Convert to dictionary."""
        return {
            "id": self.id,
            "userId": self.user_id,
            "name": self.name,
            "mediaType": self.media_type,
            "templateText": self.template_text,
            "variables": self.variables,
            "createdAt": self.created_at,
            "updatedAt": self.updated_at,
        }


class TemplateManager:
    """Manage prompt templates."""

    @staticmethod
    def create_template(
        user_id: str,
        name: str,
        media_type: str,
        template_text: str,
        variables: List[str],
    ) -> PromptTemplate:
        """Create a new template."""
        template_id = str(uuid.uuid4())
        now = datetime.utcnow().isoformat() + "Z"

        with get_connection() as conn:
            conn.execute(
                """
                INSERT INTO prompt_templates 
                (id, user_id, name, media_type, template_text, variables, created_at, updated_at)
                VALUES (?, ?, ?, ?, ?, ?, ?, ?)
                """,
                (
                    template_id,
                    user_id,
                    name,
                    media_type,
                    template_text,
                    json.dumps(variables),
                    now,
                    now,
                ),
            )
            conn.commit()

        return PromptTemplate(
            id=template_id,
            user_id=user_id,
            name=name,
            media_type=media_type,
            template_text=template_text,
            variables=variables,
            created_at=now,
            updated_at=now,
        )

    @staticmethod
    def get_template(template_id: str, user_id: str) -> Optional[PromptTemplate]:
        """Get a template by ID (only if owned by user)."""
        with get_connection() as conn:
            row = conn.execute(
                """
                SELECT id, user_id, name, media_type, template_text, variables, created_at, updated_at
                FROM prompt_templates
                WHERE id = ? AND user_id = ?
                """,
                (template_id, user_id),
            ).fetchone()

            if not row:
                return None

            return PromptTemplate(
                id=row["id"],
                user_id=row["user_id"],
                name=row["name"],
                media_type=row["media_type"],
                template_text=row["template_text"],
                variables=json.loads(row["variables"]) if row["variables"] else [],
                created_at=row["created_at"],
                updated_at=row["updated_at"],
            )

    @staticmethod
    def list_templates(
        user_id: str, media_type: Optional[str] = None
    ) -> List[PromptTemplate]:
        """List all templates for a user, optionally filtered by media type."""
        with get_connection() as conn:
            if media_type:
                rows = conn.execute(
                    """
                    SELECT id, user_id, name, media_type, template_text, variables, created_at, updated_at
                    FROM prompt_templates
                    WHERE user_id = ? AND media_type = ?
                    ORDER BY updated_at DESC
                    """,
                    (user_id, media_type),
                ).fetchall()
            else:
                rows = conn.execute(
                    """
                    SELECT id, user_id, name, media_type, template_text, variables, created_at, updated_at
                    FROM prompt_templates
                    WHERE user_id = ?
                    ORDER BY updated_at DESC
                    """,
                    (user_id,),
                ).fetchall()

            return [
                PromptTemplate(
                    id=row["id"],
                    user_id=row["user_id"],
                    name=row["name"],
                    media_type=row["media_type"],
                    template_text=row["template_text"],
                    variables=json.loads(row["variables"]) if row["variables"] else [],
                    created_at=row["created_at"],
                    updated_at=row["updated_at"],
                )
                for row in rows
            ]

    @staticmethod
    def update_template(
        template_id: str,
        user_id: str,
        name: Optional[str] = None,
        template_text: Optional[str] = None,
        variables: Optional[List[str]] = None,
    ) -> Optional[PromptTemplate]:
        """Update an existing template."""
        # First check if template exists and belongs to user
        template = TemplateManager.get_template(template_id, user_id)
        if not template:
            return None

        now = datetime.utcnow().isoformat() + "Z"

        # Build update query dynamically
        updates = []
        params = []

        if name is not None:
            updates.append("name = ?")
            params.append(name)
        if template_text is not None:
            updates.append("template_text = ?")
            params.append(template_text)
        if variables is not None:
            updates.append("variables = ?")
            params.append(json.dumps(variables))

        if not updates:
            return template  # Nothing to update

        updates.append("updated_at = ?")
        params.append(now)

        params.extend([template_id, user_id])

        with get_connection() as conn:
            conn.execute(
                f"""
                UPDATE prompt_templates
                SET {', '.join(updates)}
                WHERE id = ? AND user_id = ?
                """,
                params,
            )
            conn.commit()

        # Return updated template
        return TemplateManager.get_template(template_id, user_id)

    @staticmethod
    def delete_template(template_id: str, user_id: str) -> bool:
        """Delete a template (only if owned by user)."""
        with get_connection() as conn:
            cursor = conn.execute(
                """
                DELETE FROM prompt_templates
                WHERE id = ? AND user_id = ?
                """,
                (template_id, user_id),
            )
            conn.commit()
            return cursor.rowcount > 0

    @staticmethod
    def template_exists(user_id: str, name: str, media_type: str) -> bool:
        """Check if a template with this name already exists for this user and media type."""
        with get_connection() as conn:
            row = conn.execute(
                """
                SELECT COUNT(*) as count
                FROM prompt_templates
                WHERE user_id = ? AND name = ? AND media_type = ?
                """,
                (user_id, name, media_type),
            ).fetchone()
            return row["count"] > 0

