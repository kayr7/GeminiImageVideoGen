"""Signed, cache-friendly URLs for media files.

A signature authorises one media id (its original, thumbnail and input previews)
until ``exp``. ``exp`` is stable within a UTC day so browsers can cache the URLs.
"""

from __future__ import annotations

import hashlib
import hmac
import os
import secrets
import threading
import time
from datetime import datetime, timedelta, timezone
from pathlib import Path
from typing import Optional

from utils import database

SIG_LENGTH = 32
_SECRET_FILENAME = "media_url_secret"

_lock = threading.Lock()
_cached: dict = {}


def _load_secret() -> bytes:
    env = os.environ.get("MEDIA_URL_SECRET")
    if env:
        return env.encode()

    path: Path = database.DB_DIR / _SECRET_FILENAME
    with _lock:
        cached = _cached.get(str(path))
        if cached:
            return cached
        if path.exists():
            secret = path.read_text().strip().encode()
        else:
            path.parent.mkdir(parents=True, exist_ok=True)
            secret = secrets.token_hex(32).encode()
            fd = os.open(path, os.O_WRONLY | os.O_CREAT | os.O_EXCL, 0o600)
            with os.fdopen(fd, "wb") as fh:
                fh.write(secret)
        _cached[str(path)] = secret
        return secret


def _sign(media_id: str, exp: int) -> str:
    mac = hmac.new(_load_secret(), f"{media_id}:{exp}".encode(), hashlib.sha256)
    return mac.hexdigest()[:SIG_LENGTH]


def current_expiry(now: Optional[float] = None) -> int:
    """Midnight UTC at the start of the day after tomorrow (valid 24-48 h)."""
    moment = datetime.fromtimestamp(time.time() if now is None else now, tz=timezone.utc)
    midnight = moment.replace(hour=0, minute=0, second=0, microsecond=0)
    return int((midnight + timedelta(days=2)).timestamp())


def sign_media_path(media_id: str, path: str) -> str:
    """Append ``?exp=..&sig=..`` for ``media_id`` to ``path``."""
    exp = current_expiry()
    sep = "&" if "?" in path else "?"
    return f"{path}{sep}exp={exp}&sig={_sign(media_id, exp)}"


def verify(media_id: str, exp, sig) -> bool:
    """True if ``sig`` is a valid, unexpired signature for ``media_id``."""
    if exp is None or not sig:
        return False
    try:
        exp_int = int(exp)
    except (TypeError, ValueError):
        return False
    if exp_int <= time.time():
        return False
    return hmac.compare_digest(_sign(media_id, exp_int), str(sig))
