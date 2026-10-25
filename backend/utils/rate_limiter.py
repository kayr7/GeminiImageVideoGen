"""Simple in-memory, thread-safe rate limiting utility."""

import threading
import time
from collections import defaultdict
from typing import Dict, List

from fastapi import HTTPException

_lock = threading.Lock()
# user_id -> resource_type -> list of monotonic timestamps
_rate_limits: Dict[str, Dict[str, List[float]]] = defaultdict(lambda: defaultdict(list))

# Rate limit configuration
RATE_LIMITS = {
    "image": {"limit": 10, "window": 60},  # 10 requests per minute
    "speech": {"limit": 10, "window": 60},  # 10 requests per minute
    "video": {"limit": 5, "window": 3600},  # 5 requests per hour
    "music": {"limit": 5, "window": 3600},  # 5 requests per hour
}


def describe_limit(resource_type: str) -> str:
    """Human readable limit, e.g. '10 per minute'."""
    config = RATE_LIMITS[resource_type]
    window = config["window"]
    if window == 60:
        period = "minute"
    elif window == 3600:
        period = "hour"
    else:
        period = f"{window} seconds"
    return f"{config['limit']} per {period}"


def enforce_rate_limit(user_id: str, resource_type: str) -> None:
    """Raise 429 if the user exceeded the limit, otherwise record the request."""
    config = RATE_LIMITS.get(resource_type)
    if config is None:
        return

    now = time.monotonic()
    cutoff = now - config["window"]

    with _lock:
        timestamps = [t for t in _rate_limits[user_id][resource_type] if t > cutoff]
        if len(timestamps) >= config["limit"]:
            _rate_limits[user_id][resource_type] = timestamps
            raise HTTPException(
                status_code=429,
                detail=(
                    f"Rate limit exceeded. Maximum {config['limit']} {resource_type} "
                    f"requests per {config['window']} seconds."
                ),
            )
        timestamps.append(now)
        _rate_limits[user_id][resource_type] = timestamps


async def check_rate_limit(user_id: str, resource_type: str) -> None:
    """Async-compatible wrapper kept for callers that ``await`` it."""
    enforce_rate_limit(user_id, resource_type)
