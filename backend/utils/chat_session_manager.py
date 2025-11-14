"""Chat session manager for multi-turn conversations."""

from __future__ import annotations

import os
import uuid
from datetime import datetime
from typing import Dict, List, Optional

import google.generativeai as genai

from utils.database import get_connection

# Configure Gemini API
GEMINI_API_KEY = os.getenv("GEMINI_API_KEY")
if GEMINI_API_KEY:
    genai.configure(api_key=GEMINI_API_KEY)


class ChatMessage:
    """Represents a single message in a chat."""

    def __init__(
        self,
        id: str,
        session_id: str,
        role: str,
        content: str,
        created_at: str,
    ):
        self.id = id
        self.session_id = session_id
        self.role = role
        self.content = content
        self.created_at = created_at

    def to_dict(self) -> Dict:
        """Convert to dictionary."""
        return {
            "id": self.id,
            "sessionId": self.session_id,
            "role": self.role,
            "content": self.content,
            "createdAt": self.created_at,
        }


class ChatSession:
    """Represents a chat session."""

    def __init__(
        self,
        id: str,
        user_id: str,
        name: Optional[str],
        system_prompt: Optional[str],
        system_prompt_id: Optional[str],
        created_at: str,
        updated_at: str,
    ):
        self.id = id
        self.user_id = user_id
        self.name = name
        self.system_prompt = system_prompt
        self.system_prompt_id = system_prompt_id
        self.created_at = created_at
        self.updated_at = updated_at

    def to_dict(self) -> Dict:
        """Convert to dictionary."""
        return {
            "id": self.id,
            "userId": self.user_id,
            "name": self.name,
            "systemPrompt": self.system_prompt,
            "systemPromptId": self.system_prompt_id,
            "createdAt": self.created_at,
            "updatedAt": self.updated_at,
        }


class ChatSessionManager:
    """Manage chat sessions and multi-turn conversations."""

    @staticmethod
    def create_session(
        user_id: str,
        name: Optional[str] = None,
        system_prompt: Optional[str] = None,
        system_prompt_id: Optional[str] = None,
    ) -> ChatSession:
        """Create a new chat session."""
        session_id = str(uuid.uuid4())
        now = datetime.utcnow().isoformat() + "Z"

        with get_connection() as conn:
            conn.execute(
                """
                INSERT INTO chat_sessions 
                (id, user_id, name, system_prompt, system_prompt_id, created_at, updated_at)
                VALUES (?, ?, ?, ?, ?, ?, ?)
                """,
                (
                    session_id,
                    user_id,
                    name,
                    system_prompt,
                    system_prompt_id,
                    now,
                    now,
                ),
            )
            conn.commit()

        return ChatSession(
            id=session_id,
            user_id=user_id,
            name=name,
            system_prompt=system_prompt,
            system_prompt_id=system_prompt_id,
            created_at=now,
            updated_at=now,
        )

    @staticmethod
    def get_session(session_id: str, user_id: str) -> Optional[ChatSession]:
        """Get a chat session by ID (only if owned by user)."""
        with get_connection() as conn:
            row = conn.execute(
                """
                SELECT id, user_id, name, system_prompt, system_prompt_id, created_at, updated_at
                FROM chat_sessions
                WHERE id = ? AND user_id = ?
                """,
                (session_id, user_id),
            ).fetchone()

            if not row:
                return None

            return ChatSession(
                id=row["id"],
                user_id=row["user_id"],
                name=row["name"],
                system_prompt=row["system_prompt"],
                system_prompt_id=row["system_prompt_id"],
                created_at=row["created_at"],
                updated_at=row["updated_at"],
            )

    @staticmethod
    def list_sessions(
        user_id: str, limit: int = 100, offset: int = 0
    ) -> List[ChatSession]:
        """List chat sessions for a user."""
        with get_connection() as conn:
            rows = conn.execute(
                """
                SELECT id, user_id, name, system_prompt, system_prompt_id, created_at, updated_at
                FROM chat_sessions
                WHERE user_id = ?
                ORDER BY updated_at DESC
                LIMIT ? OFFSET ?
                """,
                (user_id, limit, offset),
            ).fetchall()

            return [
                ChatSession(
                    id=row["id"],
                    user_id=row["user_id"],
                    name=row["name"],
                    system_prompt=row["system_prompt"],
                    system_prompt_id=row["system_prompt_id"],
                    created_at=row["created_at"],
                    updated_at=row["updated_at"],
                )
                for row in rows
            ]

    @staticmethod
    def update_session(
        session_id: str,
        user_id: str,
        name: Optional[str] = None,
    ) -> Optional[ChatSession]:
        """Update a chat session."""
        session = ChatSessionManager.get_session(session_id, user_id)
        if not session:
            return None

        now = datetime.utcnow().isoformat() + "Z"

        with get_connection() as conn:
            if name is not None:
                conn.execute(
                    """
                    UPDATE chat_sessions
                    SET name = ?, updated_at = ?
                    WHERE id = ? AND user_id = ?
                    """,
                    (name, now, session_id, user_id),
                )
            else:
                conn.execute(
                    """
                    UPDATE chat_sessions
                    SET updated_at = ?
                    WHERE id = ? AND user_id = ?
                    """,
                    (now, session_id, user_id),
                )
            conn.commit()

        return ChatSessionManager.get_session(session_id, user_id)

    @staticmethod
    def delete_session(session_id: str, user_id: str) -> bool:
        """Delete a chat session and all its messages."""
        with get_connection() as conn:
            cursor = conn.execute(
                """
                DELETE FROM chat_sessions
                WHERE id = ? AND user_id = ?
                """,
                (session_id, user_id),
            )
            conn.commit()
            return cursor.rowcount > 0

    @staticmethod
    def add_message(
        session_id: str,
        role: str,
        content: str,
    ) -> ChatMessage:
        """Add a message to a chat session."""
        message_id = str(uuid.uuid4())
        now = datetime.utcnow().isoformat() + "Z"

        with get_connection() as conn:
            conn.execute(
                """
                INSERT INTO chat_messages 
                (id, session_id, role, content, created_at)
                VALUES (?, ?, ?, ?, ?)
                """,
                (
                    message_id,
                    session_id,
                    role,
                    content,
                    now,
                ),
            )
            conn.commit()

        return ChatMessage(
            id=message_id,
            session_id=session_id,
            role=role,
            content=content,
            created_at=now,
        )

    @staticmethod
    def get_messages(session_id: str, user_id: str) -> List[ChatMessage]:
        """Get all messages in a chat session (if user owns the session)."""
        # First verify user owns the session
        session = ChatSessionManager.get_session(session_id, user_id)
        if not session:
            return []

        with get_connection() as conn:
            rows = conn.execute(
                """
                SELECT id, session_id, role, content, created_at
                FROM chat_messages
                WHERE session_id = ?
                ORDER BY created_at ASC
                """,
                (session_id,),
            ).fetchall()

            return [
                ChatMessage(
                    id=row["id"],
                    session_id=row["session_id"],
                    role=row["role"],
                    content=row["content"],
                    created_at=row["created_at"],
                )
                for row in rows
            ]

    @staticmethod
    def send_message(
        session_id: str,
        user_id: str,
        user_message: str,
        model: str = "gemini-2.0-flash-exp",
    ) -> ChatMessage:
        """Send a message and get a response from Gemini."""
        # Get session
        session = ChatSessionManager.get_session(session_id, user_id)
        if not session:
            raise ValueError("Session not found")

        # Get chat history
        messages = ChatSessionManager.get_messages(session_id, user_id)

        # Create Gemini model with system instruction
        gemini_model = genai.GenerativeModel(
            model_name=model,
            system_instruction=session.system_prompt if session.system_prompt else None,
        )

        # Build conversation history for Gemini
        history = []
        for msg in messages:
            history.append(
                {
                    "role": msg.role,
                    "parts": [msg.content],
                }
            )

        # Start chat with history
        chat = gemini_model.start_chat(history=history)

        # Send message and get response
        response = chat.send_message(user_message)
        model_response = response.text

        # Save user message
        ChatSessionManager.add_message(session_id, "user", user_message)

        # Save model response
        model_message = ChatSessionManager.add_message(
            session_id, "model", model_response
        )

        # Update session timestamp
        ChatSessionManager.update_session(session_id, user_id)

        return model_message

