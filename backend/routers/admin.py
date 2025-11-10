"""Administrative endpoints for managing model configuration."""
from __future__ import annotations

from fastapi import APIRouter, Depends, HTTPException, status

from models import AdminCategorySettings, ModelAvailability, ModelInfo, SuccessResponse
from utils.admin_config import get_admin_model_settings, store_admin_model_settings
from utils.auth import require_admin
from utils.config import get_model_configuration, get_model_registry

router = APIRouter()


def _serialise_registry() -> dict[str, list[dict[str, object]]]:
    registry = get_model_registry()
    serialised: dict[str, list[dict[str, object]]] = {}
    for category, models in registry.items():
        serialised[category] = [ModelInfo(**model).dict() for model in models]
    return serialised


def _serialise_effective() -> dict[str, dict[str, object]]:
    effective = get_model_configuration()
    output: dict[str, dict[str, object]] = {}
    for category, availability in effective.items():
        output[category] = ModelAvailability(**availability).dict()
    return output


def _merge_admin_settings() -> dict[str, dict[str, object]]:
    stored = get_admin_model_settings()
    merged: dict[str, dict[str, object]] = {}
    for category, values in stored.items():
        try:
            settings = AdminCategorySettings(**values)
        except Exception:
            continue
        merged[category] = settings.dict(exclude_unset=True, exclude_none=True)
    return merged


@router.get("/models", response_model=SuccessResponse)
async def get_model_settings(_: None = Depends(require_admin)) -> SuccessResponse:
    """Return registry, stored overrides and the effective availability."""
    payload = {
        "registry": _serialise_registry(),
        "settings": _merge_admin_settings(),
        "effective": _serialise_effective(),
    }
    return SuccessResponse(data=payload)


@router.put("/models/{category}", response_model=SuccessResponse)
async def update_model_settings(
    category: str,
    request: AdminCategorySettings,
    _: None = Depends(require_admin),
) -> SuccessResponse:
    """Update configuration for a given category."""
    registry = get_model_registry()
    normalised_category = category.lower()
    if normalised_category not in registry:
        raise HTTPException(status_code=status.HTTP_404_NOT_FOUND, detail="Unknown model category")

    models = registry[normalised_category]
    valid_ids = {model["id"] for model in models}

    enabled_ids = request.enabled
    if enabled_ids is None:
        enabled_ids = [model_id for model_id in valid_ids if model_id not in (request.disabled or [])]
    enabled_ids = [model_id for model_id in enabled_ids if model_id in valid_ids]

    default_model = request.default
    if default_model and default_model not in enabled_ids:
        if enabled_ids:
            default_model = enabled_ids[0]
        else:
            default_model = None

    quotas_payload: dict[str, dict[str, int | None]] = {}
    if request.quotas:
        for model_id, quota in request.quotas.items():
            if model_id not in valid_ids or quota is None:
                continue
            quota_data: dict[str, int | None] = {}
            if quota.daily is not None and quota.daily >= 0:
                quota_data["daily"] = quota.daily
            if quota.monthly is not None and quota.monthly >= 0:
                quota_data["monthly"] = quota.monthly
            if quota_data:
                quotas_payload[model_id] = quota_data

    stored_payload = {
        "enabled": enabled_ids,
        "disabled": [model_id for model_id in valid_ids if model_id not in enabled_ids],
        "default": default_model,
    }
    if quotas_payload:
        stored_payload["quotas"] = quotas_payload

    store_admin_model_settings(normalised_category, stored_payload)

    payload = {
        "registry": _serialise_registry(),
        "settings": _merge_admin_settings(),
        "effective": _serialise_effective(),
    }
    return SuccessResponse(data=payload)


__all__ = ["router"]
