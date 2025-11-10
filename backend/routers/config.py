"""Public configuration endpoints exposing model availability."""
from __future__ import annotations

from fastapi import APIRouter

from models import SuccessResponse
from utils.config import get_application_configuration

router = APIRouter()


@router.get("", response_model=SuccessResponse)
async def read_application_configuration() -> SuccessResponse:
    """Return the current application configuration for clients."""
    return SuccessResponse(data=get_application_configuration())


__all__ = ["router"]
