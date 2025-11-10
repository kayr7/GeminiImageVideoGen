"""Authentication endpoints for the Gemini backend."""
from __future__ import annotations

import os
import secrets
from typing import Tuple

from fastapi import APIRouter, HTTPException, status

from models import (
    LoginRequest,
    LoginResponse,
    LoginResponseData,
    LoginUser,
)
from utils.config import get_application_configuration

router = APIRouter()
USERNAME_ENV_KEYS: Tuple[str, ...] = (
    "APP_USERNAME",
    "ADMIN_USERNAME",
    "LOGIN_USERNAME",
)

PASSWORD_ENV_KEYS: Tuple[str, ...] = (
    "APP_PASSWORD",
    "ADMIN_PASSWORD",
    "LOGIN_PASSWORD",
)


def _load_credentials() -> Tuple[str, str]:
    """Load expected credentials from environment variables."""

    def _first_non_empty(env_keys: Tuple[str, ...]) -> str | None:
        for key in env_keys:
            value = os.getenv(key)
            if value:
                return value
        return None

    username = _first_non_empty(USERNAME_ENV_KEYS)
    password = _first_non_empty(PASSWORD_ENV_KEYS)

    if not username or not password:
        raise HTTPException(
            status_code=status.HTTP_500_INTERNAL_SERVER_ERROR,
            detail="Authentication credentials are not configured",
        )

    return username, password


def _load_roles() -> list[str]:
    roles_env = os.getenv("APP_USER_ROLES", "admin")
    roles = [role.strip() for role in roles_env.split(",") if role.strip()]
    return roles or ["admin"]


@router.post("/login", response_model=LoginResponse, status_code=status.HTTP_200_OK)
async def login(request: LoginRequest) -> LoginResponse:
    """Authenticate a user and return configuration for the frontend."""
    expected_username, expected_password = _load_credentials()

    if not (
        secrets.compare_digest(request.username, expected_username)
        and secrets.compare_digest(request.password, expected_password)
    ):
        raise HTTPException(status_code=status.HTTP_401_UNAUTHORIZED, detail="Invalid username or password")

    token = secrets.token_urlsafe(32)
    display_name = os.getenv("APP_DISPLAY_NAME") or request.username

    response = LoginResponse(
        data=LoginResponseData(
            token=token,
            user=LoginUser(
                username=request.username,
                displayName=display_name,
                roles=_load_roles(),
            ),
            config=get_application_configuration(),
        )
    )
    return response


__all__ = ["router"]
