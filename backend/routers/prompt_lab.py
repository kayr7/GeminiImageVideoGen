"""Public Prompt Lab endpoints (SSE streaming) and the admin controls for them.

Everything on the request path is async: the async Gemini SDK is used, no sync
threadpool work happens per request except one small stats write at the end.
"""
from __future__ import annotations

import asyncio
import json
import logging
import time
from typing import Any, AsyncIterator, List, Literal, Optional

from fastapi import APIRouter, Depends, Header, HTTPException, Request
from fastapi.responses import StreamingResponse
from google.genai import types
from pydantic import BaseModel, Field, ValidationError

from models import SuccessResponse
from utils import prompt_lab as lab
from utils.auth import require_admin
from utils.gemini import get_client, get_client_ip

logger = logging.getLogger("prompt_lab")

router = APIRouter()
admin_router = APIRouter()

HEARTBEAT_SECONDS = 10.0
MAX_BODY_BYTES = 1_000_000


class LabMessage(BaseModel):
    role: Literal["user", "model"]
    text: str


class LabThinking(BaseModel):
    budget: int


class LabRequest(BaseModel):
    model: str
    messages: List[LabMessage] = Field(min_length=1, max_length=50)
    systemInstruction: Optional[str] = None
    thinking: LabThinking
    includeThoughts: bool = True
    temperature: Optional[float] = Field(default=None, ge=0, le=2)


def _sse(event: str, data: dict) -> str:
    return f"event: {event}\ndata: {json.dumps(data, ensure_ascii=False)}\n\n"


@router.get("/config", response_model=SuccessResponse)
async def get_config() -> SuccessResponse:
    return SuccessResponse(data=lab.public_config())


async def _reject(exc: HTTPException) -> HTTPException:
    if exc.status_code in (413, 429, 503):
        await lab.record_rejected()
    return exc


@router.post("/generate")
async def generate(request: Request, x_client_id: Optional[str] = Header(default=None)):
    settings = lab.get_settings()
    if not lab.is_active(settings):
        raise HTTPException(status_code=403, detail="Prompt Lab is not active")

    client_id = (x_client_id or "").strip() or None
    if client_id and len(client_id) > 64:
        raise HTTPException(status_code=400, detail="X-Client-Id must be at most 64 characters")

    try:
        lab.enforce_rate_limits(client_id, get_client_ip(request))
    except HTTPException as exc:
        raise await _reject(exc)

    if int(request.headers.get("content-length") or 0) > MAX_BODY_BYTES:
        raise await _reject(HTTPException(413, "Request body too large"))
    try:
        body = LabRequest.model_validate(json.loads(await request.body()))
    except (ValueError, ValidationError) as exc:
        detail = "Invalid request body"
        if isinstance(exc, ValidationError):
            first = exc.errors()[0]
            detail = f"Invalid request: {'.'.join(str(p) for p in first['loc'])}: {first['msg']}"
        raise HTTPException(status_code=400, detail=detail)

    model = lab.get_model(body.model)
    if model is None or body.model not in settings["allowedModels"]:
        raise HTTPException(status_code=400, detail="Unknown or unavailable model")
    lab.validate_budget(model, body.thinking.budget)

    if body.messages[-1].role != "user":
        raise HTTPException(status_code=400, detail="The last message must have role 'user'")
    messages = [m.model_dump() for m in body.messages]
    if not settings["allowHistory"]:
        messages = messages[-1:]
    if any(not m["text"].strip() for m in messages):
        raise HTTPException(status_code=400, detail="Messages must not be empty")
    if any(len(m["text"]) > lab.MAX_MESSAGE_CHARS for m in messages):
        raise await _reject(HTTPException(413, f"A message exceeds {lab.MAX_MESSAGE_CHARS:,} characters"))
    system = (body.systemInstruction or "").strip() or None

    client = get_client()
    try:
        await lab.enforce_token_limit(client, body.model, system, messages)
    except HTTPException as exc:
        raise await _reject(exc)

    budget = body.thinking.budget
    config = types.GenerateContentConfig(
        system_instruction=system,
        temperature=body.temperature,
        max_output_tokens=settings["maxOutputTokens"],
        thinking_config=types.ThinkingConfig(
            thinking_budget=budget,
            include_thoughts=(budget != 0 and body.includeThoughts),
        ),
    )
    contents = [types.Content(role=m["role"], parts=[types.Part(text=m["text"])]) for m in messages]

    try:
        lease = await lab.concurrency.acquire()
    except HTTPException as exc:
        raise await _reject(exc)

    stream = _stream(client, body.model, contents, config, budget, lease)
    return _LeasedStreamingResponse(
        stream,
        lease=lease,
        media_type="text/event-stream",
        headers={"Cache-Control": "no-cache", "X-Accel-Buffering": "no"},
    )


class _LeasedStreamingResponse(StreamingResponse):
    """Frees the concurrency slot however the response ends.

    If the client disconnects before the body generator starts, the generator's own
    ``finally`` never runs, so the slot is released here as well (release is idempotent).
    """

    def __init__(self, *args: Any, lease: "lab.Lease", **kwargs: Any) -> None:
        super().__init__(*args, **kwargs)
        self._lease = lease

    async def __call__(self, scope, receive, send) -> None:
        try:
            await super().__call__(scope, receive, send)
        finally:
            self._lease.release()


async def _upstream(client: Any, model: str, contents: list, config: Any) -> AsyncIterator[Any]:
    stream = await client.aio.models.generate_content_stream(
        model=model, contents=contents, config=config
    )
    async for chunk in stream:
        yield chunk


async def _stream(client, model, contents, config, budget, lease) -> AsyncIterator[str]:
    start = time.monotonic()
    first_ms: Optional[int] = None
    usage = None
    failed = False
    upstream = _upstream(client, model, contents, config)
    pending: Optional[asyncio.Task] = None
    try:
        while True:
            pending = asyncio.ensure_future(upstream.__anext__())
            while True:
                done, _ = await asyncio.wait({pending}, timeout=HEARTBEAT_SECONDS)
                if done:
                    break
                yield ": ping\n\n"
            try:
                chunk = pending.result()
            except StopAsyncIteration:
                break
            pending = None
            if getattr(chunk, "usage_metadata", None) is not None:
                usage = chunk.usage_metadata
            for cand in (getattr(chunk, "candidates", None) or [])[:1]:
                content = getattr(cand, "content", None)
                for part in (getattr(content, "parts", None) or []):
                    text = getattr(part, "text", None)
                    if not text:
                        continue
                    if first_ms is None:
                        first_ms = int((time.monotonic() - start) * 1000)
                    yield _sse("thought" if getattr(part, "thought", False) else "answer",
                               {"text": text})
    except asyncio.CancelledError:
        failed = True  # client went away; stop upstream below
        raise
    except Exception as exc:  # noqa: BLE001
        failed = True
        logger.warning("Prompt Lab upstream error (%s): %s", model, type(exc).__name__)
        yield _sse("error", {"message": "The model request failed. Please try again."})
    finally:
        if pending is not None and not pending.done():
            pending.cancel()
        try:
            await upstream.aclose()
        except Exception:  # noqa: BLE001
            pass
        lease.release()

    latency = int((time.monotonic() - start) * 1000)
    p = int(getattr(usage, "prompt_token_count", 0) or 0)
    t = int(getattr(usage, "thoughts_token_count", 0) or 0)
    o = int(getattr(usage, "candidates_token_count", 0) or 0)
    total = int(getattr(usage, "total_token_count", 0) or (p + t + o))
    logger.info("prompt-lab model=%s budget=%s prompt=%d thoughts=%d output=%d latency_ms=%d%s",
                model, budget, p, t, o, latency, " error" if failed else "")
    await lab.record_usage(p, t, o, error=failed)
    if not failed:
        yield _sse("usage", {
            "promptTokens": p, "thoughtsTokens": t, "outputTokens": o, "totalTokens": total,
            "firstTokenMs": first_ms if first_ms is not None else latency,
            "latencyMs": latency, "model": model, "thinkingBudget": budget,
        })
    yield _sse("done", {})


# ------------------------------------------------------------------------------ admin

class AdminUpdate(BaseModel):
    enabled: Optional[bool] = None
    durationMinutes: Optional[int] = Field(default=None, ge=1, le=60 * 24 * 14)
    allowedModels: Optional[List[str]] = None
    defaultModel: Optional[str] = None
    maxOutputTokens: Optional[int] = Field(default=None, ge=256, le=8192)
    allowHistory: Optional[bool] = None


async def _admin_payload() -> dict:
    return {
        "settings": lab.get_settings(),
        "availableModels": lab.MODEL_REGISTRY,
        "stats": await lab.get_stats(),
    }


@admin_router.get("", response_model=SuccessResponse)
async def admin_get(_: None = Depends(require_admin)) -> SuccessResponse:
    return SuccessResponse(data=await _admin_payload())


@admin_router.put("", response_model=SuccessResponse)
async def admin_put(update: AdminUpdate, _: None = Depends(require_admin)) -> SuccessResponse:
    s = lab.get_settings()
    given = update.model_fields_set
    if update.allowedModels is not None:
        unknown = [m for m in update.allowedModels if lab.get_model(m) is None]
        if unknown or not update.allowedModels:
            raise HTTPException(400, f"Unknown or empty model list: {unknown}")
        s["allowedModels"] = list(dict.fromkeys(update.allowedModels))
    if update.defaultModel is not None:
        s["defaultModel"] = update.defaultModel
    if s["defaultModel"] not in s["allowedModels"]:
        if update.defaultModel is not None:
            raise HTTPException(400, "defaultModel must be one of allowedModels")
        s["defaultModel"] = s["allowedModels"][0]
    if update.maxOutputTokens is not None:
        s["maxOutputTokens"] = update.maxOutputTokens
    if update.allowHistory is not None:
        s["allowHistory"] = update.allowHistory
    if update.enabled is False:
        s["enabled"], s["expiresAt"] = False, None
    elif update.enabled is True or (s["enabled"] and "durationMinutes" in given):
        s["enabled"] = True
        s["expiresAt"] = lab.now_plus(update.durationMinutes) if update.durationMinutes else None
    lab.save_settings(s)
    return SuccessResponse(data=await _admin_payload())
