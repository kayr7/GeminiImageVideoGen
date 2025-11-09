"""
Simple rate limiting utility
"""
from fastapi import HTTPException
from datetime import datetime, timedelta
from collections import defaultdict

# In-memory rate limit tracking
_rate_limits = defaultdict(lambda: defaultdict(list))

# Rate limit configuration
RATE_LIMITS = {
    "image": {"limit": 10, "window": 60},  # 10 requests per minute
    "video": {"limit": 5, "window": 3600},  # 5 requests per hour
    "music": {"limit": 5, "window": 3600},  # 5 requests per hour
}

async def check_rate_limit(user_id: str, resource_type: str):
    """Check if user has exceeded rate limit"""
    if resource_type not in RATE_LIMITS:
        return
    
    config = RATE_LIMITS[resource_type]
    now = datetime.now()
    cutoff = now - timedelta(seconds=config["window"])
    
    # Clean old requests
    _rate_limits[user_id][resource_type] = [
        timestamp for timestamp in _rate_limits[user_id][resource_type]
        if timestamp > cutoff
    ]
    
    # Check limit
    if len(_rate_limits[user_id][resource_type]) >= config["limit"]:
        raise HTTPException(
            status_code=429,
            detail=f"Rate limit exceeded. Maximum {config['limit']} {resource_type} requests per {config['window']} seconds."
        )
    
    # Add current request
    _rate_limits[user_id][resource_type].append(now)

