"""Utility helpers for dynamic backend configuration and feature flags."""
from __future__ import annotations

import os
from typing import Any, Dict, List

ModelInfoDict = Dict[str, Any]

# Registry of all models understood by the backend. This mirrors the frontend constants so
# configuration can expose the same options from a single source of truth.
_MODEL_REGISTRY: Dict[str, List[ModelInfoDict]] = {
    "image": [
        {
            "id": "imagen-4.0-generate-001",
            "name": "Imagen 4.0",
            "description": "Highest quality image generation",
            "price": 0.04,
            "priceUnit": "per image",
            "tier": "paid",
        },
        {
            "id": "imagen-3.0-generate-002",
            "name": "Imagen 3.0",
            "description": "High quality image generation",
            "price": 0.02,
            "priceUnit": "per image",
            "tier": "paid",
        },
        {
            "id": "gemini-2.5-flash-image",
            "name": "Nano Banana (Gemini 2.5 Flash)",
            "description": "Fast, conversational image generation",
            "price": 0.0387,
            "priceUnit": "per image",
            "tier": "paid",
        },
    ],
    "video": [
        {
            "id": "veo-3.1-generate-preview",
            "name": "Veo 3.1",
            "description": "High quality 8s video with audio",
            "price": 0.40,
            "priceUnit": "per second",
            "pricePerVideo": 3.20,
            "tier": "paid",
        },
        {
            "id": "veo-3.1-fast-generate-preview",
            "name": "Veo 3.1 Fast",
            "description": "Fast 8s video with audio",
            "price": 0.15,
            "priceUnit": "per second",
            "pricePerVideo": 1.20,
            "tier": "paid",
        },
        {
            "id": "veo-3.0-generate-001",
            "name": "Veo 3.0 (Stable)",
            "description": "Stable 8s video with audio",
            "price": 0.40,
            "priceUnit": "per second",
            "pricePerVideo": 3.20,
            "tier": "paid",
        },
        {
            "id": "veo-3.0-fast-generate-001",
            "name": "Veo 3.0 Fast (Stable)",
            "description": "Fast stable 8s video with audio",
            "price": 0.15,
            "priceUnit": "per second",
            "pricePerVideo": 1.20,
            "tier": "paid",
        },
        {
            "id": "veo-2.0-generate-001",
            "name": "Veo 2.0",
            "description": "5-8s video (no audio)",
            "price": 0.35,
            "priceUnit": "per second",
            "pricePerVideo": 2.80,
            "tier": "paid",
        },
    ],
    "music": [
        {
            "id": "musiclm-001",
            "name": "MusicLM",
            "description": "Text-to-music generation",
            "tier": "beta",
        }
    ],
}


def _parse_csv(value: str | None) -> List[str]:
    """Parse a comma separated environment variable into a list of ids."""
    if not value:
        return []
    return [item.strip() for item in value.split(",") if item.strip()]


def _normalise_registry(registry: Dict[str, List[ModelInfoDict]]) -> Dict[str, Dict[str, ModelInfoDict]]:
    """Convert the registry into a mapping keyed by model id for quick lookup."""
    normalised: Dict[str, Dict[str, ModelInfoDict]] = {}
    for category, models in registry.items():
        normalised[category] = {}
        for model in models:
            normalised[category][model["id"]] = {
                **model,
                "category": category,
            }
    return normalised


_MODELS_BY_CATEGORY = _normalise_registry(_MODEL_REGISTRY)


def _apply_model_overrides(category: str, models: Dict[str, ModelInfoDict]) -> Dict[str, Any]:
    """Return enabled/disabled model lists honouring environment overrides."""
    enabled_env = set(_parse_csv(os.getenv(f"ENABLED_{category.upper()}_MODELS")))
    disabled_env = set(_parse_csv(os.getenv(f"DISABLED_{category.upper()}_MODELS")))
    available_ids: List[str] = list(models.keys())

    if enabled_env:
        enabled_ids = [model_id for model_id in available_ids if model_id in enabled_env]
    else:
        enabled_ids = available_ids.copy()

    if disabled_env:
        enabled_ids = [model_id for model_id in enabled_ids if model_id not in disabled_env]

    default_override = os.getenv(f"DEFAULT_{category.upper()}_MODEL")
    default_model = None
    if default_override and default_override in enabled_ids:
        default_model = default_override
    elif enabled_ids:
        default_model = enabled_ids[0]

    disabled_ids = [model_id for model_id in available_ids if model_id not in enabled_ids]

    return {
        "enabled": [models[model_id] for model_id in enabled_ids],
        "disabled": [models[model_id] for model_id in disabled_ids],
        "default": default_model,
    }


def _parse_bool(value: str | None, default: bool) -> bool:
    if value is None:
        return default
    return value.strip().lower() in {"1", "true", "yes", "on"}


def get_model_configuration() -> Dict[str, Any]:
    """Return model availability information for each media type."""
    config: Dict[str, Any] = {}
    for category, models in _MODELS_BY_CATEGORY.items():
        config[category] = _apply_model_overrides(category, models)
    return config


def get_feature_flags() -> Dict[str, bool]:
    """Return feature toggles derived from environment variables."""
    return {
        "imageGeneration": _parse_bool(os.getenv("ENABLE_IMAGE_GENERATION"), True),
        "videoGeneration": _parse_bool(os.getenv("ENABLE_VIDEO_GENERATION"), True),
        "musicGeneration": _parse_bool(os.getenv("ENABLE_MUSIC_GENERATION"), True),
    }


def get_application_configuration() -> Dict[str, Any]:
    """Aggregate configuration returned to clients on login."""
    return {
        "models": get_model_configuration(),
        "features": get_feature_flags(),
    }


def list_enabled_models(category: str) -> List[ModelInfoDict]:
    """Helper to retrieve enabled models for a specific category."""
    category = category.lower()
    if category not in _MODELS_BY_CATEGORY:
        return []
    result = _apply_model_overrides(category, _MODELS_BY_CATEGORY[category])
    return result["enabled"]


__all__ = [
    "get_application_configuration",
    "get_model_configuration",
    "get_feature_flags",
    "list_enabled_models",
]
