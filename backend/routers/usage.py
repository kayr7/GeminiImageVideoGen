"""Usage / status endpoint (consumed by the frontend UsageDisplay component)."""

import os

from fastapi import APIRouter

from models import SuccessResponse
from utils.rate_limiter import RATE_LIMITS, describe_limit

router = APIRouter()


@router.get("/status", response_model=SuccessResponse)
def get_usage_status():
    """Report API key configuration and the configured rate limits."""
    return SuccessResponse(
        success=True,
        data={
            "status": "active",
            "apiKeyConfigured": bool(os.getenv("GEMINI_API_KEY")),
            "rateLimit": {name: describe_limit(name) for name in RATE_LIMITS},
        },
    )
