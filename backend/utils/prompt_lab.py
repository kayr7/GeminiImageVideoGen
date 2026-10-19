"""Prompt Lab: public, rate-limited LLM prompting playground (settings, registry, limits, stats).

Everything here is in-memory and single-process (asyncio-safe because no awaits happen
inside the critical sections). Prompt contents and IPs are never persisted or logged.
"""
from __future__ import annotations

import asyncio
import logging
import os
import sqlite3
import time
from collections import deque
from datetime import datetime, timedelta, timezone
from typing import Any, Deque, Dict, List, Optional

from fastapi import HTTPException
from starlette.concurrency import run_in_threadpool

from utils import admin_config
from utils.database import get_connection

logger = logging.getLogger("prompt_lab")

SECTION = "promptLab"
MAX_MESSAGE_CHARS = 100_000
MAX_TOTAL_CHARS = 200_000
MAX_OUTPUT_TOKENS_RANGE = (256, 8192)
ESTIMATE_SHORTCUT_RATIO = 0.7
SEMAPHORE_WAIT_SECONDS = 10.0


def _env_int(name: str, default: int) -> int:
    try:
        return int(os.getenv(name, "") or default)
    except ValueError:
        return default


def max_input_tokens() -> int:
    return _env_int("PROMPT_LAB_MAX_INPUT_TOKENS", 10_000)


# --------------------------------------------------------------------------- registry

def _preset(label: str, budget: int) -> Dict[str, Any]:
    return {"label": label, "budget": budget}


MODEL_REGISTRY: List[Dict[str, Any]] = [
    {
        "id": "gemini-2.5-flash",
        "name": "Gemini 2.5 Flash",
        "description": "Fast all-rounder; thinking can be switched off.",
        "thinking": {
            "canDisable": True, "min": 0, "max": 24576, "defaultBudget": -1,
            "presets": [_preset("Off", 0), _preset("Low", 1024), _preset("Medium", 4096),
                        _preset("High", 16384), _preset("Dynamic", -1)],
        },
    },
    {
        "id": "gemini-2.5-flash-lite",
        "name": "Gemini 2.5 Flash-Lite",
        "description": "Smallest and cheapest; thinking is off by default.",
        "thinking": {
            "canDisable": True, "min": 512, "max": 24576, "defaultBudget": 0,
            "presets": [_preset("Off", 0), _preset("Low", 1024), _preset("Medium", 4096),
                        _preset("Dynamic", -1)],
        },
    },
    {
        "id": "gemini-2.5-pro",
        "name": "Gemini 2.5 Pro",
        "description": "Strongest reasoning; thinking is always on.",
        "thinking": {
            "canDisable": False, "min": 128, "max": 32768, "defaultBudget": -1,
            "presets": [_preset("Low", 1024), _preset("Medium", 4096),
                        _preset("High", 16384), _preset("Dynamic", -1)],
        },
    },
]
_REGISTRY_BY_ID = {m["id"]: m for m in MODEL_REGISTRY}

DEFAULT_SETTINGS: Dict[str, Any] = {
    "enabled": False,
    "expiresAt": None,
    "allowedModels": ["gemini-2.5-flash", "gemini-2.5-flash-lite"],
    "defaultModel": "gemini-2.5-flash",
    "maxOutputTokens": 2048,
    "allowHistory": True,
}


def get_model(model_id: str) -> Optional[Dict[str, Any]]:
    return _REGISTRY_BY_ID.get(model_id)


def all_model_ids() -> List[str]:
    return list(_REGISTRY_BY_ID)


def validate_budget(model: Dict[str, Any], budget: int) -> None:
    t = model["thinking"]
    if budget == -1:
        return
    if budget == 0:
        if t["canDisable"]:
            return
        raise HTTPException(400, f"{model['name']} cannot run with thinking turned off.")
    lo = max(t["min"], 1)
    if not (lo <= budget <= t["max"]):
        raise HTTPException(
            400,
            f"Invalid thinking budget {budget} for {model['name']}: use "
            f"{'0, ' if t['canDisable'] else ''}-1 (dynamic) or {lo}-{t['max']}.",
        )


# --------------------------------------------------------------------------- settings

_cache: Dict[str, Any] = {"key": None, "settings": None}


def _parse_expiry(value: Any) -> Optional[datetime]:
    if not value or not isinstance(value, str):
        return None
    try:
        dt = datetime.fromisoformat(value.replace("Z", "+00:00"))
    except ValueError:
        return None
    return dt if dt.tzinfo else dt.replace(tzinfo=timezone.utc)


def _normalise(raw: Dict[str, Any]) -> Dict[str, Any]:
    s = dict(DEFAULT_SETTINGS)
    s["allowedModels"] = list(DEFAULT_SETTINGS["allowedModels"])
    if isinstance(raw.get("enabled"), bool):
        s["enabled"] = raw["enabled"]
    if _parse_expiry(raw.get("expiresAt")):
        s["expiresAt"] = raw["expiresAt"]
    if isinstance(raw.get("allowedModels"), list):
        s["allowedModels"] = [m for m in raw["allowedModels"] if m in _REGISTRY_BY_ID]
    mo = raw.get("maxOutputTokens")
    if isinstance(mo, int) and not isinstance(mo, bool):
        s["maxOutputTokens"] = min(max(mo, MAX_OUTPUT_TOKENS_RANGE[0]), MAX_OUTPUT_TOKENS_RANGE[1])
    if isinstance(raw.get("allowHistory"), bool):
        s["allowHistory"] = raw["allowHistory"]
    dm = raw.get("defaultModel")
    if dm in s["allowedModels"]:
        s["defaultModel"] = dm
    else:
        s["defaultModel"] = s["allowedModels"][0] if s["allowedModels"] else None
    return s


def get_settings() -> Dict[str, Any]:
    """Stored settings (normalised), cached in memory and revalidated by file mtime."""
    key = (str(admin_config._CONFIG_PATH), admin_config.admin_config_mtime())
    if _cache["key"] != key or _cache["settings"] is None:
        _cache["settings"] = _normalise(admin_config.get_admin_section(SECTION))
        _cache["key"] = key
    return dict(_cache["settings"])


def save_settings(settings: Dict[str, Any]) -> Dict[str, Any]:
    admin_config.store_admin_section(SECTION, settings)
    _cache["key"] = None
    return get_settings()


def is_active(settings: Optional[Dict[str, Any]] = None) -> bool:
    s = settings or get_settings()
    if not s["enabled"]:
        return False
    exp = _parse_expiry(s["expiresAt"])
    return exp is None or exp > datetime.now(timezone.utc)


def now_plus(minutes: int) -> str:
    return (datetime.now(timezone.utc) + timedelta(minutes=minutes)).strftime("%Y-%m-%dT%H:%M:%SZ")


def public_config() -> Dict[str, Any]:
    s = get_settings()
    base = {
        "enabled": False, "expiresAt": None, "maxInputTokens": max_input_tokens(),
        "maxOutputTokens": s["maxOutputTokens"], "allowHistory": s["allowHistory"],
        "defaultModel": None, "models": [],
    }
    if not is_active(s):
        base["maxOutputTokens"] = DEFAULT_SETTINGS["maxOutputTokens"]
        base["allowHistory"] = DEFAULT_SETTINGS["allowHistory"]
        return base
    base.update(
        enabled=True, expiresAt=s["expiresAt"], defaultModel=s["defaultModel"],
        models=[_REGISTRY_BY_ID[m] for m in s["allowedModels"]],
    )
    return base


# --------------------------------------------------------------------------- limits

class SlidingWindowLimiter:
    """Per-key sliding window; entries are pruned so memory stays bounded."""

    def __init__(self) -> None:
        self._hits: Dict[str, Deque[float]] = {}
        self._last_sweep = time.monotonic()

    def _prune(self, key: str, now: float, window: float) -> Deque[float]:
        dq = self._hits.setdefault(key, deque())
        while dq and dq[0] <= now - window:
            dq.popleft()
        return dq

    def retry_after(self, key: str, limit: int, window: float, now: float) -> float:
        dq = self._prune(key, now, window)
        if len(dq) < limit:
            return 0.0
        return max(dq[0] + window - now, 1.0)

    def record(self, key: str, now: float) -> None:
        self._hits.setdefault(key, deque()).append(now)

    def sweep(self, now: float, window: float = 60.0) -> None:
        if now - self._last_sweep < window:
            return
        self._last_sweep = now
        for key in list(self._hits):
            dq = self._hits[key]
            while dq and dq[0] <= now - window:
                dq.popleft()
            if not dq:
                del self._hits[key]

    def clear(self) -> None:
        self._hits.clear()


_limiter = SlidingWindowLimiter()


def enforce_rate_limits(client_id: Optional[str], ip: str) -> None:
    """Raise 429 (with Retry-After) if any applicable window is full, else record the hit."""
    now = time.monotonic()
    _limiter.sweep(now)
    checks = [(f"ip:{ip}", _env_int("PROMPT_LAB_IP_RPM", 600))]
    if client_id:
        checks.append((f"cid:{client_id}", _env_int("PROMPT_LAB_CLIENT_RPM", 12)))
    else:
        checks.append((f"ip-anon:{ip}", _env_int("PROMPT_LAB_ANON_RPM", 30)))
    worst = 0.0
    for key, limit in checks:
        worst = max(worst, _limiter.retry_after(key, limit, 60.0, now))
    if worst > 0:
        retry = int(worst) + 1
        raise HTTPException(
            status_code=429,
            detail=f"Too many requests. Please wait {retry} seconds before trying again.",
            headers={"Retry-After": str(retry)},
        )
    for key, _ in checks:
        _limiter.record(key, now)


class Lease:
    """One acquired concurrency slot; release() is idempotent."""

    def __init__(self, owner: "Concurrency", sem: asyncio.Semaphore) -> None:
        self._owner, self._sem, self._released = owner, sem, False

    def release(self) -> None:
        if self._released:
            return
        self._released = True
        self._owner.active = max(self._owner.active - 1, 0)
        self._sem.release()


class Concurrency:
    """Global cap on simultaneous upstream streams plus an active-request gauge."""

    def __init__(self) -> None:
        self._sem: Optional[asyncio.Semaphore] = None
        self._loop: Optional[asyncio.AbstractEventLoop] = None
        self._cap = 0
        self.active = 0

    def _semaphore(self) -> asyncio.Semaphore:
        loop = asyncio.get_running_loop()
        cap = _env_int("PROMPT_LAB_MAX_CONCURRENCY", 100)
        if self._sem is None or self._loop is not loop or self._cap != cap:
            self._sem, self._loop, self._cap = asyncio.Semaphore(cap), loop, cap
        return self._sem

    async def acquire(self) -> Lease:
        sem = self._semaphore()
        try:
            await asyncio.wait_for(sem.acquire(), SEMAPHORE_WAIT_SECONDS)
        except asyncio.TimeoutError:
            raise HTTPException(
                status_code=503,
                detail="Prompt Lab is busy right now. Please try again in a few seconds.",
                headers={"Retry-After": "10"},
            )
        self.active += 1
        return Lease(self, sem)


concurrency = Concurrency()


def reset_state() -> None:
    """Testing helper."""
    _limiter.clear()
    concurrency._sem = None
    concurrency.active = 0
    _cache["key"] = None


# --------------------------------------------------------------------------- tokens

def estimate_tokens(texts: List[str]) -> int:
    return sum(len(t.encode("utf-8")) for t in texts) // 4 + 1


def _too_long(n: int, limit: int) -> HTTPException:
    return HTTPException(
        status_code=413,
        detail=(f"Input is {n:,} tokens; the limit is {limit:,}. "
                "Shorten the prompt or clear the chat history."),
    )


async def enforce_token_limit(client: Any, model_id: str, system: Optional[str],
                              messages: List[Dict[str, str]]) -> int:
    """Raise 413 if system + messages exceed the limit. Returns the (estimated/counted) tokens."""
    from google.genai import types

    limit = max_input_tokens()
    texts = ([system] if system else []) + [m["text"] for m in messages]
    if sum(len(t) for t in texts) > MAX_TOTAL_CHARS:
        raise _too_long(estimate_tokens(texts), limit)
    est = estimate_tokens(texts)
    if est < limit * ESTIMATE_SHORTCUT_RATIO:
        return est
    contents = [types.Content(role="user", parts=[types.Part(text=system)])] if system else []
    contents += [types.Content(role=m["role"], parts=[types.Part(text=m["text"])]) for m in messages]
    try:
        resp = await client.aio.models.count_tokens(model=model_id, contents=contents)
        counted = int(resp.total_tokens)
    except Exception as exc:  # noqa: BLE001
        logger.warning("count_tokens failed (%s); falling back to estimate", type(exc).__name__)
        counted = est
    if counted > limit:
        raise _too_long(counted, limit)
    return counted


# --------------------------------------------------------------------------- stats

def _today() -> str:
    return datetime.now(timezone.utc).strftime("%Y-%m-%d")


def _record_sync(date: str, requests: int, prompt: int, thoughts: int, output: int,
                 errors: int, rejected: int) -> None:
    with get_connection() as conn:
        conn.execute(
            """
            INSERT INTO prompt_lab_usage
                (date, requests, prompt_tokens, thoughts_tokens, output_tokens, errors, rejected)
            VALUES (?, ?, ?, ?, ?, ?, ?)
            ON CONFLICT(date) DO UPDATE SET
                requests = requests + excluded.requests,
                prompt_tokens = prompt_tokens + excluded.prompt_tokens,
                thoughts_tokens = thoughts_tokens + excluded.thoughts_tokens,
                output_tokens = output_tokens + excluded.output_tokens,
                errors = errors + excluded.errors,
                rejected = rejected + excluded.rejected
            """,
            (date, requests, prompt, thoughts, output, errors, rejected),
        )
        conn.commit()


async def record_usage(prompt: int = 0, thoughts: int = 0, output: int = 0,
                       error: bool = False) -> None:
    await _safe_record(1, prompt, thoughts, output, 1 if error else 0, 0)


async def record_rejected() -> None:
    await _safe_record(0, 0, 0, 0, 0, 1)


async def _safe_record(*deltas: int) -> None:
    try:
        await run_in_threadpool(_record_sync, _today(), *deltas)
    except (sqlite3.Error, OSError):
        logger.exception("Failed to record Prompt Lab stats")


def _today_stats_sync() -> Dict[str, Any]:
    date = _today()
    with get_connection() as conn:
        row = conn.execute("SELECT * FROM prompt_lab_usage WHERE date = ?", (date,)).fetchone()
    return {
        "date": date,
        "requests": row["requests"] if row else 0,
        "promptTokens": row["prompt_tokens"] if row else 0,
        "thoughtsTokens": row["thoughts_tokens"] if row else 0,
        "outputTokens": row["output_tokens"] if row else 0,
        "errors": row["errors"] if row else 0,
        "rejected": row["rejected"] if row else 0,
    }


async def get_stats() -> Dict[str, Any]:
    today = await run_in_threadpool(_today_stats_sync)
    return {"today": today, "activeRequests": concurrency.active}
