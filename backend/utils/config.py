"""Utility helpers for dynamic backend configuration and feature flags."""
from __future__ import annotations

import os
from typing import Any, Dict, List

from .admin_config import get_admin_model_settings

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


def _apply_model_overrides(
    category: str,
    models: Dict[str, ModelInfoDict],
    admin_overrides: Dict[str, Any] | None = None,
) -> Dict[str, Any]:
    """Return enabled/disabled model lists honouring admin and environment overrides."""

    available_ids: List[str] = list(models.keys())
    admin_overrides = admin_overrides or {}

    admin_enabled = admin_overrides.get("enabled")
    admin_disabled = set(admin_overrides.get("disabled", []) or [])
    admin_default = admin_overrides.get("default")
    admin_quotas = admin_overrides.get("quotas", {}) or {}

    if admin_enabled is not None:
        enabled_ids = [model_id for model_id in admin_enabled if model_id in available_ids]
    else:
        enabled_env = set(_parse_csv(os.getenv(f"ENABLED_{category.upper()}_MODELS")))
        disabled_env = set(_parse_csv(os.getenv(f"DISABLED_{category.upper()}_MODELS")))

        if enabled_env:
            enabled_ids = [model_id for model_id in available_ids if model_id in enabled_env]
        else:
            enabled_ids = available_ids.copy()

        if disabled_env:
            enabled_ids = [model_id for model_id in enabled_ids if model_id not in disabled_env]

    if admin_disabled:
        enabled_ids = [model_id for model_id in enabled_ids if model_id not in admin_disabled]

    default_override = None
    if admin_default and admin_default in enabled_ids:
        default_override = admin_default
    elif admin_enabled is None:
        env_default = os.getenv(f"DEFAULT_{category.upper()}_MODEL")
        if env_default and env_default in enabled_ids:
            default_override = env_default

    if not default_override and enabled_ids:
        default_override = enabled_ids[0]

    disabled_ids = [model_id for model_id in available_ids if model_id not in enabled_ids]

    quotas: Dict[str, Dict[str, Any]] = {}
    for model_id in available_ids:
        quota_config = admin_quotas.get(model_id)
        if not isinstance(quota_config, dict):
            continue

        quota_payload: Dict[str, Any] = {}
        for key in ("daily", "monthly"):
            if key in quota_config:
                value = quota_config[key]
                if value is None:
                    quota_payload[key] = None
                else:
                    try:
                        numeric_value = int(value)
                    except (TypeError, ValueError):
                        continue
                    if numeric_value >= 0:
                        quota_payload[key] = numeric_value
        if quota_payload:
            quotas[model_id] = quota_payload

    return {
        "enabled": [models[model_id] for model_id in enabled_ids],
        "disabled": [models[model_id] for model_id in disabled_ids],
        "default": default_override,
        "quotas": quotas,
    }


def _parse_bool(value: str | None, default: bool) -> bool:
    if value is None:
        return default
    return value.strip().lower() in {"1", "true", "yes", "on"}


def get_model_configuration() -> Dict[str, Any]:
    """Return model availability information for each media type."""
    config: Dict[str, Any] = {}
    admin_settings = get_admin_model_settings()
    for category, models in _MODELS_BY_CATEGORY.items():
        overrides = admin_settings.get(category, {}) if isinstance(admin_settings, dict) else {}
        config[category] = _apply_model_overrides(category, models, overrides)
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
    admin_settings = get_admin_model_settings()
    overrides = admin_settings.get(category, {}) if isinstance(admin_settings, dict) else {}
    result = _apply_model_overrides(category, _MODELS_BY_CATEGORY[category], overrides)
    return result["enabled"]


def get_model_registry() -> Dict[str, List[ModelInfoDict]]:
    """Expose the full registry for administrative tooling."""
    return {category: list(models.values()) for category, models in _MODELS_BY_CATEGORY.items()}


def resolve_model_choice(category: str, requested_model: str | None) -> ModelInfoDict:
    """Return the enabled model info for ``category`` honouring overrides.

    The helper prefers the explicitly requested model when it is enabled. If no
    model is provided (or the provided model is blank), the first enabled model
    becomes the default. A ``LookupError`` is raised when the requested model is
    disabled/unknown or the category has no enabled models.
    """

    enabled_models = list_enabled_models(category)
    if not enabled_models:
        raise LookupError(f"No enabled models configured for category '{category}'.")

    requested = (requested_model or "").strip()

    if requested:
        for model in enabled_models:
            if model["id"] == requested:
                return model
        raise LookupError(
            f"Model '{requested}' is disabled or unavailable for category '{category}'."
        )

    return enabled_models[0]


__all__ = [
    "get_application_configuration",
    "get_model_configuration",
    "get_feature_flags",
    "list_enabled_models",
    "get_model_registry",
    "resolve_model_choice",
]
