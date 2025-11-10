"""Helpers for persisting admin-controlled model configuration."""
from __future__ import annotations

import json
import os
from pathlib import Path
from typing import Any, Dict

_DEFAULT_FILENAME = "admin-config.json"
_BASE_PATH = Path(__file__).resolve().parent.parent
_DEFAULT_PATH = _BASE_PATH / "data" / _DEFAULT_FILENAME

_CONFIG_PATH = Path(os.getenv("ADMIN_CONFIG_PATH", _DEFAULT_PATH))


def _ensure_directory(path: Path) -> None:
    path.parent.mkdir(parents=True, exist_ok=True)


def _load_raw_config() -> Dict[str, Any]:
    if not _CONFIG_PATH.exists():
        return {"models": {}}

    try:
        with _CONFIG_PATH.open("r", encoding="utf-8") as handle:
            payload = json.load(handle)
            if isinstance(payload, dict) and isinstance(payload.get("models"), dict):
                return payload
    except json.JSONDecodeError:
        # Fall back to empty config if file is corrupted
        pass
    return {"models": {}}


def _write_raw_config(payload: Dict[str, Any]) -> None:
    _ensure_directory(_CONFIG_PATH)
    with _CONFIG_PATH.open("w", encoding="utf-8") as handle:
        json.dump(payload, handle, indent=2, sort_keys=True)


def get_admin_model_settings() -> Dict[str, Any]:
    """Return a copy of the stored model configuration overrides."""
    payload = _load_raw_config()
    return dict(payload.get("models", {}))


def store_admin_model_settings(category: str, settings: Dict[str, Any]) -> Dict[str, Any]:
    """Persist overrides for a specific model category."""
    payload = _load_raw_config()
    models_config = payload.setdefault("models", {})
    models_config[category] = settings
    _write_raw_config(payload)
    return settings


def remove_admin_model_settings(category: str) -> None:
    payload = _load_raw_config()
    models_config = payload.get("models")
    if isinstance(models_config, dict) and category in models_config:
        models_config.pop(category)
        _write_raw_config(payload)


__all__ = [
    "get_admin_model_settings",
    "store_admin_model_settings",
    "remove_admin_model_settings",
]
