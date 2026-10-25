"""Utility helpers for dynamic backend configuration and feature flags."""

from __future__ import annotations

import os
from typing import Any, Dict, List

from .admin_config import get_admin_model_settings

ModelInfoDict = Dict[str, Any]

# Registry of all models understood by the backend. This mirrors the frontend constants so
# configuration can expose the same options from a single source of truth.
_RATIOS_10 = ["1:1", "2:3", "3:2", "3:4", "4:3", "4:5", "5:4", "9:16", "16:9", "21:9"]
_RATIOS_14 = [
    "1:1", "1:4", "1:8", "2:3", "3:2", "3:4",
    "4:1", "4:3", "4:5", "5:4", "8:1", "9:16", "16:9", "21:9",
]
_TTS_VOICES = [
    "Zephyr", "Puck", "Charon", "Kore", "Fenrir", "Leda", "Orus", "Aoede", "Callirrhoe",
    "Autonoe", "Enceladus", "Iapetus", "Umbriel", "Algieba", "Despina", "Erinome",
    "Algenib", "Rasalgethi", "Laomedeia", "Achernar", "Alnilam", "Schedar", "Gacrux",
    "Pulcherrima", "Achird", "Zubenelgenubi", "Vindemiatrix", "Sadachbia", "Sadaltager",
    "Sulafat",
]


def _image(model_id, name, description, price, max_refs, ratios, *, modalities=("IMAGE",)):
    return {
        "id": model_id,
        "name": name,
        "description": description,
        "price": price,
        "priceUnit": "per image (1K)",
        "tier": "paid",
        "capabilities": {
            "reference_images": {"enabled": True, "max": max_refs},
            "sample_count": {"min": 1, "max": 1},
            "aspect_ratios": list(ratios),
            # generateContent response_modalities. The 3.x models often answer with
            # text only (questions, greetings) when "TEXT" is allowed, so they are
            # restricted to images; gemini-2.5-flash-image needs TEXT+IMAGE or it
            # returns NO_IMAGE for ordinary prompts.
            "response_modalities": list(modalities),
        },
    }


# Gemini Omni Flash (Interactions API). Duration is sent as response_format.duration
# ("<n>s"); the API accepts 3-10 s. Billing is per output token: 5,792 tokens per
# second of 720p (~$0.10/s at $17.50 per 1M tokens); a 360p clip measured
# ~1,930 tokens/s (~$0.034/s). 1080p/4k are upscaled from 720p.
VIDEO_DURATIONS = [4, 6, 8, 10]
VIDEO_DEFAULT_DURATION = 8
VIDEO_MIN_DURATION = 3
VIDEO_MAX_DURATION = 10


def _video(model_id, name, description, price_per_second):
    return {
        "id": model_id,
        "name": name,
        "description": description,
        "price": price_per_second,
        "priceUnit": "per second (720p)",
        "pricePerVideo": round(price_per_second * VIDEO_DEFAULT_DURATION, 2),
        "tier": "paid",
        "capabilities": {
            "durations": list(VIDEO_DURATIONS),
            "default_duration": VIDEO_DEFAULT_DURATION,
            "resolutions": ["360p", "720p", "1080p", "4k"],
            "default_resolution": "720p",
            "aspect_ratios": ["16:9", "9:16"],
            # Omni has no negative-prompt field; the backend appends "Avoid: ..." to
            # the prompt instead (see routers/video.py).
            "supports_negative_prompt": True,
            "negative_prompt_mode": "prompt",
            "video_reference_images": {
                "enabled": True,
                "max": 3,
                "supports_start_frame": True,
                "supports_end_frame": True,
                "supports_reference_images": True,
            },
        },
    }


def _speech(model_id, name, description, price):
    return {
        "id": model_id,
        "name": name,
        "description": description,
        "price": price,
        "priceUnit": "per generation",
        "tier": "paid",
        "capabilities": {"voices": list(_TTS_VOICES)},
    }


def _text(model_id, name, description, price, supports_temperature=False):
    return {
        "id": model_id,
        "name": name,
        "description": description,
        "price": price,
        "priceUnit": "per 1M input tokens",
        "tier": "paid",
        "capabilities": {"supports_temperature": supports_temperature},
    }


_MODEL_REGISTRY: Dict[str, List[ModelInfoDict]] = {
    "image": [
        _image("gemini-nano-banana-2.1", "Nano Banana 2.1",
               "Newest image model — fast, high quality generation & editing, up to 4K",
               0.0336, 14, _RATIOS_10),
        _image("gemini-3.1-flash-image", "Nano Banana 2 (Gemini 3.1 Flash)",
               "Pro-level quality at flash speed, extended aspect ratios",
               0.067, 14, _RATIOS_14),
        _image("gemini-3.1-flash-lite-image", "Nano Banana 2 Lite",
               "Cheapest current image model — quick drafts (1K only)",
               0.0336, 14, _RATIOS_10),
        _image("gemini-3-pro-image", "Nano Banana Pro (Gemini 3 Pro)",
               "Professional asset production, complex instructions",
               0.14, 14, _RATIOS_10),
        _image("gemini-2.5-flash-image", "Nano Banana (Gemini 2.5 Flash, legacy)",
               "Legacy fast image generation",
               0.0387, 3, ["1:1", "3:4", "4:3", "9:16", "16:9"],
               modalities=("TEXT", "IMAGE")),
    ],
    "video": [
        _video("gemini-omni-1.1-flash", "Gemini Omni Flash",
               "Text/image-to-video with audio, 3-10 s, up to 4K (upscaled)", 0.10),
    ],
    "speech": [
        _speech("gemini-3.8-flash-tts", "Gemini 3.8 Flash TTS",
                "Most expressive speech, multi-speaker dialogue", 0.005),
        _speech("gemini-3.8-flash-lite-tts", "Gemini 3.8 Flash-Lite TTS",
                "Cost-efficient text-to-speech", 0.003),
    ],
    "text": [
        _text("gemini-3.8-flash", "Gemini 3.8 Flash",
              "Newest Flash model — fast and capable", 0.75),
        _text("gemini-3.6-flash", "Gemini 3.6 Flash",
              "Previous-generation Flash model", 0.75),
        _text("gemini-3.5-flash-lite", "Gemini 3.5 Flash-Lite",
              "Cheapest 3.x model for simple tasks", 0.30),
        _text("gemini-2.5-flash", "Gemini 2.5 Flash",
              "Legacy Flash; thinking can be fully disabled", 0.30, supports_temperature=True),
    ],
}


def _parse_csv(value: str | None) -> List[str]:
    """Parse a comma separated environment variable into a list of ids."""
    if not value:
        return []
    return [item.strip() for item in value.split(",") if item.strip()]


def _normalise_registry(
    registry: Dict[str, List[ModelInfoDict]],
) -> Dict[str, Dict[str, ModelInfoDict]]:
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
        enabled_ids = [
            model_id for model_id in admin_enabled if model_id in available_ids
        ]
        if admin_enabled and not enabled_ids:
            # Stored list only references retired model ids: ignore it entirely.
            admin_enabled = None
    if admin_enabled is None:
        enabled_env = set(_parse_csv(os.getenv(f"ENABLED_{category.upper()}_MODELS")))
        disabled_env = set(_parse_csv(os.getenv(f"DISABLED_{category.upper()}_MODELS")))

        if enabled_env:
            enabled_ids = [
                model_id for model_id in available_ids if model_id in enabled_env
            ]
            if not enabled_ids:  # only retired ids configured: ignore the allow-list
                enabled_ids = available_ids.copy()
        else:
            enabled_ids = available_ids.copy()

        if disabled_env:
            enabled_ids = [
                model_id for model_id in enabled_ids if model_id not in disabled_env
            ]

    if admin_disabled:
        enabled_ids = [
            model_id for model_id in enabled_ids if model_id not in admin_disabled
        ]

    default_override = None
    if admin_default and admin_default in enabled_ids:
        default_override = admin_default
    elif admin_enabled is None:
        env_default = os.getenv(f"DEFAULT_{category.upper()}_MODEL")
        if env_default and env_default in enabled_ids:
            default_override = env_default

    if not default_override and enabled_ids:
        default_override = enabled_ids[0]

    disabled_ids = [
        model_id for model_id in available_ids if model_id not in enabled_ids
    ]

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
        overrides = (
            admin_settings.get(category, {}) if isinstance(admin_settings, dict) else {}
        )
        config[category] = _apply_model_overrides(category, models, overrides)
    return config


def get_feature_flags() -> Dict[str, bool]:
    """Return feature toggles derived from environment variables."""
    return {
        "imageGeneration": _parse_bool(os.getenv("ENABLE_IMAGE_GENERATION"), True),
        "videoGeneration": _parse_bool(os.getenv("ENABLE_VIDEO_GENERATION"), True),
        "musicGeneration": _parse_bool(os.getenv("ENABLE_MUSIC_GENERATION"), True),
        "speechGeneration": _parse_bool(os.getenv("ENABLE_SPEECH_GENERATION"), True),
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
    overrides = (
        admin_settings.get(category, {}) if isinstance(admin_settings, dict) else {}
    )
    result = _apply_model_overrides(category, _MODELS_BY_CATEGORY[category], overrides)
    return result["enabled"]


def get_model_registry() -> Dict[str, List[ModelInfoDict]]:
    """Expose the full registry for administrative tooling."""
    return {
        category: list(models.values())
        for category, models in _MODELS_BY_CATEGORY.items()
    }


def resolve_model_choice(category: str, requested_model: str | None) -> ModelInfoDict:
    """Return the enabled model info for ``category`` honouring overrides.

    The helper prefers the explicitly requested model when it is enabled. If no
    model is provided (or the provided model is blank), the configured default
    (admin/env override) is used, falling back to the first enabled model. A ``LookupError`` is raised when the requested model is
    disabled/unknown or the category has no enabled models.
    """

    category = category.lower()
    if category not in _MODELS_BY_CATEGORY:
        raise LookupError(f"No enabled models configured for category '{category}'.")
    admin_settings = get_admin_model_settings()
    overrides = (
        admin_settings.get(category, {}) if isinstance(admin_settings, dict) else {}
    )
    availability = _apply_model_overrides(category, _MODELS_BY_CATEGORY[category], overrides)
    enabled_models = availability["enabled"]
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

    default_id = availability.get("default")
    for model in enabled_models:
        if model["id"] == default_id:
            return model
    return enabled_models[0]


__all__ = [
    "get_application_configuration",
    "get_model_configuration",
    "get_feature_flags",
    "list_enabled_models",
    "get_model_registry",
    "resolve_model_choice",
]
