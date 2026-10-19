"""Shared helpers for talking to the Gemini API and handling request payloads."""

from __future__ import annotations

import base64
import os
from functools import lru_cache

from fastapi import HTTPException, Request
from google import genai

DEFAULT_IMAGE_MIME = "image/png"


@lru_cache(maxsize=1)
def _client_for_key(api_key: str) -> genai.Client:
    return genai.Client(api_key=api_key)


def get_client() -> genai.Client:
    """Return a (cached) Gemini client, or raise 500 if no API key is configured."""
    api_key = os.getenv("GEMINI_API_KEY")
    if not api_key:
        raise HTTPException(status_code=500, detail="GEMINI_API_KEY not configured")
    return _client_for_key(api_key)


def get_client_ip(request: Request) -> str:
    """Best-effort client IP for abuse tracking, honouring reverse-proxy headers."""
    forwarded_for = request.headers.get("X-Forwarded-For")
    if forwarded_for:
        return forwarded_for.split(",")[0].strip()

    real_ip = request.headers.get("X-Real-IP")
    if real_ip:
        return real_ip.strip()

    if request.client and request.client.host:
        return request.client.host

    return "unknown"


def split_data_url(data: str, default_mime: str = DEFAULT_IMAGE_MIME) -> tuple[str, str]:
    """Split ``data:<mime>;base64,<payload>`` into (base64 payload, mime type).

    Plain base64 strings (no ``data:`` header) are returned unchanged with ``default_mime``.
    """
    if "," not in data:
        return data, default_mime

    header, payload = data.split(",", 1)
    mime_type = default_mime
    if header.startswith("data:") and ";" in header:
        mime_type = header[len("data:"):].split(";", 1)[0] or default_mime
    return payload, mime_type


def decode_data_url(data: str, default_mime: str = DEFAULT_IMAGE_MIME) -> tuple[bytes, str]:
    """Decode a data URL or plain base64 string into (raw bytes, mime type)."""
    payload, mime_type = split_data_url(data, default_mime)
    return base64.b64decode(payload), mime_type


def to_base64(data: bytes | str) -> str:
    """Normalise SDK binary payloads (bytes or already-encoded str) to a base64 string."""
    if isinstance(data, bytes):
        return base64.b64encode(data).decode("ascii")
    return data


__all__ = [
    "DEFAULT_IMAGE_MIME",
    "get_client",
    "get_client_ip",
    "split_data_url",
    "decode_data_url",
    "to_base64",
]
