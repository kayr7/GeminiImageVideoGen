"""Text generation manager using Gemini API."""

from __future__ import annotations

import json
import os
import uuid
from datetime import datetime
from typing import Dict, List, Optional

from google import genai
from google.genai import types

from utils.database import get_connection

# Configure Gemini API - create client
GEMINI_API_KEY = os.getenv("GEMINI_API_KEY")
if not GEMINI_API_KEY:
    raise ValueError("GEMINI_API_KEY environment variable is required")

client = genai.Client(api_key=GEMINI_API_KEY)


class TextGeneration:
    """Represents a text generation result."""

    def __init__(
        self,
        id: str,
        user_id: str,
        mode: str,
        system_prompt: Optional[str],
        system_prompt_id: Optional[str],
        user_message: str,
        template_id: Optional[str],
        filled_message: str,
        variable_values: Optional[Dict[str, str]],
        model_response: str,
        model: str,
        ip_address: Optional[str],
        created_at: str,
    ):
        self.id = id
        self.user_id = user_id
        self.mode = mode
        self.system_prompt = system_prompt
        self.system_prompt_id = system_prompt_id
        self.user_message = user_message
        self.template_id = template_id
        self.filled_message = filled_message
        self.variable_values = variable_values
        self.model_response = model_response
        self.model = model
        self.ip_address = ip_address
        self.created_at = created_at

    def to_dict(self) -> Dict:
        """Convert to dictionary."""
        return {
            "id": self.id,
            "userId": self.user_id,
            "mode": self.mode,
            "systemPrompt": self.system_prompt,
            "systemPromptId": self.system_prompt_id,
            "userMessage": self.user_message,
            "templateId": self.template_id,
            "filledMessage": self.filled_message,
            "variableValues": self.variable_values,
            "modelResponse": self.model_response,
            "model": self.model,
            "ipAddress": self.ip_address,
            "createdAt": self.created_at,
        }


class TextGenerationManager:
    """Manage text generation with Gemini API."""

    @staticmethod
    def generate_text(
        user_id: str,
        user_message: str,
        system_prompt: Optional[str] = None,
        system_prompt_id: Optional[str] = None,
        template_id: Optional[str] = None,
        variable_values: Optional[Dict[str, str]] = None,
        model: str = "gemini-2.0-flash-exp",
        ip_address: Optional[str] = None,
    ) -> TextGeneration:
        """Generate text using Gemini API (single-turn)."""
        generation_id = str(uuid.uuid4())
        now = datetime.utcnow().isoformat() + "Z"

        # Fill template variables if provided
        filled_message = user_message
        if variable_values:
            for key, value in variable_values.items():
                filled_message = filled_message.replace(f"{{{{{key}}}}}", value)

        # Generate content using new SDK
        config_params = {"model": model}
        if system_prompt:
            config_params["system_instruction"] = system_prompt
        
        response = client.models.generate_content(
            model=model,
            contents=filled_message,
            config=types.GenerateContentConfig(**config_params) if system_prompt else None
        )
        model_response = response.text

        # Save to database
        with get_connection() as conn:
            conn.execute(
                """
                INSERT INTO text_generations 
                (id, user_id, mode, system_prompt, system_prompt_id, user_message, template_id, 
                 filled_message, variable_values, model_response, model, ip_address, created_at)
                VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
                """,
                (
                    generation_id,
                    user_id,
                    "single",
                    system_prompt,
                    system_prompt_id,
                    user_message,
                    template_id,
                    filled_message,
                    json.dumps(variable_values) if variable_values else None,
                    model_response,
                    model,
                    ip_address,
                    now,
                ),
            )
            conn.commit()

        return TextGeneration(
            id=generation_id,
            user_id=user_id,
            mode="single",
            system_prompt=system_prompt,
            system_prompt_id=system_prompt_id,
            user_message=user_message,
            template_id=template_id,
            filled_message=filled_message,
            variable_values=variable_values,
            model_response=model_response,
            model=model,
            ip_address=ip_address,
            created_at=now,
        )

    @staticmethod
    def list_generations(
        user_id: str, limit: int = 100, offset: int = 0
    ) -> List[TextGeneration]:
        """List text generations for a user."""
        with get_connection() as conn:
            rows = conn.execute(
                """
                SELECT id, user_id, mode, system_prompt, system_prompt_id, user_message, 
                       template_id, filled_message, variable_values, model_response, model, 
                       ip_address, created_at
                FROM text_generations
                WHERE user_id = ?
                ORDER BY created_at DESC
                LIMIT ? OFFSET ?
                """,
                (user_id, limit, offset),
            ).fetchall()

            return [
                TextGeneration(
                    id=row["id"],
                    user_id=row["user_id"],
                    mode=row["mode"],
                    system_prompt=row["system_prompt"],
                    system_prompt_id=row["system_prompt_id"],
                    user_message=row["user_message"],
                    template_id=row["template_id"],
                    filled_message=row["filled_message"],
                    variable_values=json.loads(row["variable_values"])
                    if row["variable_values"]
                    else None,
                    model_response=row["model_response"],
                    model=row["model"],
                    ip_address=row["ip_address"],
                    created_at=row["created_at"],
                )
                for row in rows
            ]

    @staticmethod
    def get_generation(generation_id: str, user_id: str) -> Optional[TextGeneration]:
        """Get a specific generation."""
        with get_connection() as conn:
            row = conn.execute(
                """
                SELECT id, user_id, mode, system_prompt, system_prompt_id, user_message, 
                       template_id, filled_message, variable_values, model_response, model, 
                       ip_address, created_at
                FROM text_generations
                WHERE id = ? AND user_id = ?
                """,
                (generation_id, user_id),
            ).fetchone()

            if not row:
                return None

            return TextGeneration(
                id=row["id"],
                user_id=row["user_id"],
                mode=row["mode"],
                system_prompt=row["system_prompt"],
                system_prompt_id=row["system_prompt_id"],
                user_message=row["user_message"],
                template_id=row["template_id"],
                filled_message=row["filled_message"],
                variable_values=json.loads(row["variable_values"])
                if row["variable_values"]
                else None,
                model_response=row["model_response"],
                model=row["model"],
                ip_address=row["ip_address"],
                created_at=row["created_at"],
            )

    @staticmethod
    def delete_generation(generation_id: str, user_id: str) -> bool:
        """Delete a generation."""
        with get_connection() as conn:
            cursor = conn.execute(
                """
                DELETE FROM text_generations
                WHERE id = ? AND user_id = ?
                """,
                (generation_id, user_id),
            )
            conn.commit()
            return cursor.rowcount > 0

