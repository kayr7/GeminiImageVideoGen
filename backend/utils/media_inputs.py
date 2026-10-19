"""Input images (reference/source/first/last frames) stored as files next to the media.

Legacy rows keep them inline as data URLs in ``media.details``; new rows store only
file names: ``{"mode":..., "inputs": {"referenceImages": ["f1.png"], "firstFrame": "f2.jpg"}}``.
"""

from __future__ import annotations

import logging
import os
from io import BytesIO
from pathlib import Path
from typing import Any, Dict, Optional

from PIL import Image

from utils.gemini import decode_data_url

logger = logging.getLogger(__name__)

LIST_KINDS = ("referenceImages", "sourceImages")
FRAME_KINDS = ("firstFrame", "lastFrame")
INPUT_KINDS = LIST_KINDS + FRAME_KINDS
PREVIEW_MAX_SIZE = (256, 256)

_EXT = {"image/png": "png", "image/jpeg": "jpg", "image/jpg": "jpg", "image/webp": "webp", "image/gif": "gif"}


def originals_dir(root: Path) -> Path:
    return Path(root) / "inputs" / "originals"


def previews_dir(root: Path) -> Path:
    return Path(root) / "inputs"


def preview_path(root: Path, media_id: str, kind: str, index: int) -> Path:
    return previews_dir(root) / f"{media_id}_{kind}_{index}.jpg"


def has_inline_inputs(details: Optional[Dict[str, Any]]) -> bool:
    if not isinstance(details, dict):
        return False
    for kind in INPUT_KINDS:
        value = details.get(kind)
        if isinstance(value, str) and value:
            return True
        if isinstance(value, list) and any(isinstance(v, str) and v for v in value):
            return True
    return False


def strip_inline_inputs(details: Optional[Dict[str, Any]]) -> Optional[Dict[str, Any]]:
    """Drop inline input images (keeps mode, negativePrompt, ...)."""
    if not isinstance(details, dict):
        return details
    return {k: v for k, v in details.items() if k not in INPUT_KINDS}


def _write_atomic(path: Path, data: bytes) -> None:
    path.parent.mkdir(parents=True, exist_ok=True)
    tmp = path.with_name(path.name + f".{os.getpid()}.tmp")
    tmp.write_bytes(data)
    os.replace(tmp, path)


def _store_one(media_id: str, kind: str, index: int, value: str, root: Path) -> Optional[str]:
    try:
        data, mime = decode_data_url(value)
    except Exception:
        logger.warning("Undecodable %s[%d] for media %s", kind, index, media_id)
        return None
    name = f"{media_id}_{kind}_{index}.{_EXT.get(mime, 'png')}"
    _write_atomic(originals_dir(root) / name, data)
    return name


def extract_inputs(media_id: str, details: Optional[Dict[str, Any]], root: Path) -> Optional[Dict[str, Any]]:
    """Write inline input images to files and return the slim details (idempotent)."""
    if not has_inline_inputs(details):
        return details

    slim = strip_inline_inputs(details)
    inputs: Dict[str, Any] = dict(slim.get("inputs") or {}) if isinstance(slim.get("inputs"), dict) else {}
    for kind in LIST_KINDS:
        value = details.get(kind)
        if isinstance(value, list):
            names = [
                _store_one(media_id, kind, i, v, root)
                for i, v in enumerate(value)
                if isinstance(v, str) and v
            ]
            names = [n for n in names if n]
            if names:
                inputs[kind] = names
    for kind in FRAME_KINDS:
        value = details.get(kind)
        if isinstance(value, str) and value:
            name = _store_one(media_id, kind, 0, value, root)
            if name:
                inputs[kind] = name
    if inputs:
        slim["inputs"] = inputs
    return slim


def load_input_bytes(
    media_id: str, details: Optional[Dict[str, Any]], kind: str, index: int, root: Path
) -> Optional[bytes]:
    """Bytes of one input image, from the file (new) or the inline data URL (legacy)."""
    if not isinstance(details, dict) or kind not in INPUT_KINDS or index < 0:
        return None

    stored = (details.get("inputs") or {}).get(kind) if isinstance(details.get("inputs"), dict) else None
    if stored is not None:
        names = stored if isinstance(stored, list) else [stored]
        if index < len(names) and isinstance(names[index], str):
            path = originals_dir(root) / Path(names[index]).name  # no path traversal
            try:
                return path.read_bytes()
            except OSError:
                return None
        return None

    legacy = details.get(kind)
    values = legacy if isinstance(legacy, list) else [legacy]
    if kind in FRAME_KINDS and index != 0:
        return None
    if index < len(values) and isinstance(values[index], str) and values[index]:
        try:
            return decode_data_url(values[index])[0]
        except Exception:
            return None
    return None


def make_preview(image_bytes: bytes) -> bytes:
    """JPEG preview of at most 256 px (transparency flattened onto white)."""
    img = Image.open(BytesIO(image_bytes))
    if img.mode in ("RGBA", "LA", "P"):
        img = img.convert("RGBA")
        background = Image.new("RGB", img.size, (255, 255, 255))
        background.paste(img, mask=img.split()[-1])
        img = background
    elif img.mode != "RGB":
        img = img.convert("RGB")
    img.thumbnail(PREVIEW_MAX_SIZE, Image.Resampling.LANCZOS)
    out = BytesIO()
    img.save(out, format="JPEG", quality=80)
    return out.getvalue()


def write_preview(path: Path, data: bytes) -> None:
    _write_atomic(path, data)
