"""Text embeddings via a local Ollama server (nomic-embed-text) and cosine similarity."""
from __future__ import annotations

import asyncio
import json
import math
import os
import urllib.error
import urllib.request
from typing import List

EMBED_MODEL = "nomic-embed-text"
TIMEOUT_SECONDS = 30


class EmbeddingError(Exception):
    """The embedding backend is unreachable or returned something unusable."""


def _ollama_url() -> str:
    return os.getenv("OLLAMA_URL", "http://localhost:11434").rstrip("/")


def _embed_sync(texts: List[str]) -> List[List[float]]:
    payload = json.dumps({"model": EMBED_MODEL, "input": texts}).encode()
    req = urllib.request.Request(
        f"{_ollama_url()}/api/embed",
        data=payload,
        headers={"Content-Type": "application/json"},
    )
    try:
        with urllib.request.urlopen(req, timeout=TIMEOUT_SECONDS) as resp:
            body = json.load(resp)
    except urllib.error.HTTPError as exc:
        if exc.code == 404:
            raise EmbeddingError(f"Model '{EMBED_MODEL}' not found; run: ollama pull {EMBED_MODEL}") from exc
        raise EmbeddingError(f"Ollama returned HTTP {exc.code}") from exc
    except (urllib.error.URLError, TimeoutError, ValueError, OSError) as exc:
        raise EmbeddingError("Embedding service (Ollama) is unreachable") from exc
    embeddings = body.get("embeddings") if isinstance(body, dict) else None
    if not embeddings or len(embeddings) != len(texts):
        raise EmbeddingError("Embedding service returned an unexpected response")
    return embeddings


async def embed(texts: List[str]) -> List[List[float]]:
    return await asyncio.to_thread(_embed_sync, texts)


def cosine_similarity(a: List[float], b: List[float]) -> float:
    norm = math.sqrt(sum(x * x for x in a)) * math.sqrt(sum(y * y for y in b))
    if norm == 0:
        return 0.0
    return sum(x * y for x, y in zip(a, b)) / norm
