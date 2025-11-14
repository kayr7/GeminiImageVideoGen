"""Quota management endpoints for admins."""

from __future__ import annotations

from fastapi import APIRouter, HTTPException, status, Depends

from models import (
    UpdateQuotasRequest,
    QuotaResponse,
    SuccessResponse,
    LoginUser,
)
from utils.auth import require_admin, get_current_user
from utils.user_manager import UserManager
from utils.quota_manager import QuotaManager

router = APIRouter()


@router.get("/{user_id}", response_model=SuccessResponse)
async def get_user_quotas(
    user_id: str, admin: LoginUser = Depends(require_admin)
) -> SuccessResponse:
    """Get quotas for a user (only if admin manages them)."""
    admin_user = UserManager.get_user_by_email(admin.username)
    if not admin_user:
        raise HTTPException(
            status_code=status.HTTP_404_NOT_FOUND, detail="Admin user not found"
        )

    # Check if admin can manage this user
    if not UserManager.can_admin_manage_user(admin_user.id, user_id):
        raise HTTPException(
            status_code=status.HTTP_403_FORBIDDEN,
            detail="You don't have permission to view this user's quotas",
        )

    quotas = QuotaManager.get_all_quotas(user_id)
    quota_list = [quota.to_dict() for quota in quotas]

    return SuccessResponse(success=True, data={"quotas": quota_list})


@router.put("/{user_id}", response_model=SuccessResponse)
async def update_user_quotas(
    user_id: str,
    request: UpdateQuotasRequest,
    admin: LoginUser = Depends(require_admin),
) -> SuccessResponse:
    """Update quotas for a user (only if admin manages them)."""
    admin_user = UserManager.get_user_by_email(admin.username)
    if not admin_user:
        raise HTTPException(
            status_code=status.HTTP_404_NOT_FOUND, detail="Admin user not found"
        )

    # Check if admin can manage this user
    if not UserManager.can_admin_manage_user(admin_user.id, user_id):
        raise HTTPException(
            status_code=status.HTTP_403_FORBIDDEN,
            detail="You don't have permission to update this user's quotas",
        )

    # Update each quota
    for gen_type, quota_settings in request.quotas.items():
        if gen_type not in ["image", "video", "text"]:
            continue

        # Check if quota exists, if not create it first
        existing_quota = QuotaManager.get_quota(user_id, gen_type)
        if not existing_quota:
            # Create new quota with the specified settings
            QuotaManager.create_quota(
                user_id=user_id,
                generation_type=gen_type,
                quota_type=quota_settings.get("type", "limited"),
                quota_limit=quota_settings.get("limit", 100),
            )
        else:
            # Update existing quota
            QuotaManager.update_quota(
                user_id,
                gen_type,
                quota_type=quota_settings.get("type"),
                quota_limit=quota_settings.get("limit"),
            )

    # Get updated quotas
    quotas = QuotaManager.get_all_quotas(user_id)
    quota_list = [quota.to_dict() for quota in quotas]

    return SuccessResponse(success=True, data={"quotas": quota_list})


@router.post("/{user_id}/reset", response_model=SuccessResponse)
async def reset_user_quotas(
    user_id: str, generation_type: str, admin: LoginUser = Depends(require_admin)
) -> SuccessResponse:
    """Manually reset quota for a user (only if admin manages them)."""
    admin_user = UserManager.get_user_by_email(admin.username)
    if not admin_user:
        raise HTTPException(
            status_code=status.HTTP_404_NOT_FOUND, detail="Admin user not found"
        )

    # Check if admin can manage this user
    if not UserManager.can_admin_manage_user(admin_user.id, user_id):
        raise HTTPException(
            status_code=status.HTTP_403_FORBIDDEN,
            detail="You don't have permission to reset this user's quotas",
        )

    if generation_type not in ["image", "video", "text"]:
        raise HTTPException(
            status_code=status.HTTP_400_BAD_REQUEST, detail="Invalid generation type"
        )

    QuotaManager.reset_user_quota(user_id, generation_type)

    # Get updated quota
    quota = QuotaManager.get_quota(user_id, generation_type)

    return SuccessResponse(
        success=True, data={"quota": quota.to_dict() if quota else None}
    )


# User's own quota endpoints (no admin required)
@router.get("/me/status", response_model=SuccessResponse)
async def get_my_quotas(user: LoginUser = Depends(get_current_user)) -> SuccessResponse:
    """Get current user's quota status."""
    db_user = UserManager.get_user_by_email(user.username)
    if not db_user:
        raise HTTPException(
            status_code=status.HTTP_404_NOT_FOUND, detail="User not found"
        )

    quotas = QuotaManager.get_all_quotas(db_user.id)
    quota_dict = {}
    for quota in quotas:
        quota_dict[quota.generation_type] = quota.to_dict()

    return SuccessResponse(success=True, data={"quotas": quota_dict})


__all__ = ["router"]
