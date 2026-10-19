"""User management endpoints for admins."""

from __future__ import annotations

import logging

from typing import Optional, Tuple

from fastapi import APIRouter, HTTPException, Query, status, Depends

from models import (
    BulkCreateUsersRequest,
    BulkDeleteUsersRequest,
    UpdateUserRequest,
    UpdateUserTagsRequest,
    SuccessResponse,
    LoginUser,
)
from utils.auth import require_admin
from utils.user_manager import User, UserManager, get_env_admin_username
from utils.quota_manager import QuotaManager

logger = logging.getLogger(__name__)

router = APIRouter()


@router.post("/bulk-create", response_model=SuccessResponse)
async def bulk_create_users(
    request: BulkCreateUsersRequest, admin: LoginUser = Depends(require_admin)
) -> SuccessResponse:
    """
    Create multiple users by email list.
    If user already exists, just add admin relationship.
    """
    # Get admin user
    admin_user = UserManager.get_user_by_email(admin.username)
    if not admin_user:
        raise HTTPException(
            status_code=status.HTTP_404_NOT_FOUND, detail="Admin user not found"
        )

    created_users = []

    for email in request.emails:
        email = email.lower().strip()

        # Check if user already exists
        existing_user = UserManager.get_user_by_email(email)

        if existing_user:
            # User exists, just add admin relationship
            UserManager.create_admin_relationship(admin_user.id, existing_user.id)

            # Check who else manages this user
            other_admins = [
                aid
                for aid in UserManager.get_user_admins(existing_user.id)
                if aid != admin_user.id
            ]

            created_users.append(
                {
                    "id": existing_user.id,
                    "email": existing_user.email,
                    "isNew": False,
                    "invitedBy": admin.username,
                    "sharedWith": other_admins,
                    "tags": UserManager.get_user_tags(existing_user.id),
                }
            )
        else:
            # Create new user
            new_user = UserManager.create_user(
                email=email,
                password=None,  # Will be set on first login
                is_admin=False,
                is_active=True,
            )

            # Create admin relationship
            UserManager.create_admin_relationship(admin_user.id, new_user.id)

            # Set default quotas
            if request.defaultQuotas:
                for gen_type, quota_settings in request.defaultQuotas.items():
                    QuotaManager.create_quota(
                        new_user.id,
                        gen_type,
                        quota_settings.get("type", "daily"),
                        quota_settings.get("limit"),
                    )
            else:
                QuotaManager.set_default_quotas(new_user.id)

            # Set default tags
            if request.defaultTags:
                UserManager.set_user_tags(new_user.id, request.defaultTags)

            created_users.append(
                {
                    "id": new_user.id,
                    "email": new_user.email,
                    "isNew": True,
                    "invitedBy": admin.username,
                    "tags": UserManager.get_user_tags(new_user.id),
                }
            )

    return SuccessResponse(success=True, data={"created": created_users})


@router.get("", response_model=SuccessResponse)
async def list_users(admin: LoginUser = Depends(require_admin)) -> SuccessResponse:
    """List all users managed by this admin."""
    admin_user = UserManager.get_user_by_email(admin.username)
    if not admin_user:
        raise HTTPException(
            status_code=status.HTTP_404_NOT_FOUND, detail="Admin user not found"
        )

    # Get users managed by this admin
    users = UserManager.get_admin_users(admin_user.id)

    media_counts = UserManager.count_media_by_user()
    user_list = []
    for user in users:
        # Check if user is shared with other admins
        admin_ids = UserManager.get_user_admins(user.id)
        is_shared = len(admin_ids) > 1

        other_admins = []
        if is_shared:
            for aid in admin_ids:
                if aid != admin_user.id:
                    other_admin = UserManager.get_user_by_id(aid)
                    if other_admin:
                        other_admins.append(other_admin.email)

        user_list.append(
            {
                "id": user.id,
                "email": user.email,
                "isActive": user.is_active,
                "isAdmin": user.is_admin,
                "requirePasswordReset": user.require_password_reset,
                "createdAt": user.created_at,
                "updatedAt": user.updated_at,
                "lastLoginAt": user.last_login_at,
                "isShared": is_shared,
                "sharedWith": other_admins if is_shared else None,
                "tags": UserManager.get_user_tags(user.id),
                "mediaCount": media_counts.get(user.id, 0),
            }
        )

    return SuccessResponse(success=True, data={"users": user_list})


def _deletion_block(admin_user: User, user_id: str) -> Optional[Tuple[int, str]]:
    """(status, reason) if admin_user may not delete user_id, else None."""
    user = UserManager.get_user_by_id(user_id)
    if not user:
        return status.HTTP_404_NOT_FOUND, "User not found"
    if user.id == admin_user.id:
        return status.HTTP_400_BAD_REQUEST, "You cannot delete your own account"
    if not UserManager.can_admin_manage_user(admin_user.id, user_id):
        return (
            status.HTTP_403_FORBIDDEN,
            "You don't have permission to delete this user",
        )
    if user.is_admin:
        return status.HTTP_400_BAD_REQUEST, "Remove admin rights before deleting"
    env_admin = get_env_admin_username()
    if env_admin and user.email == env_admin.lower().strip():
        return (
            status.HTTP_400_BAD_REQUEST,
            "The environment-configured admin cannot be deleted",
        )
    return None


def _current_admin(admin: LoginUser) -> User:
    admin_user = UserManager.get_user_by_email(admin.username)
    if not admin_user:
        raise HTTPException(
            status_code=status.HTTP_404_NOT_FOUND, detail="Admin user not found"
        )
    return admin_user


@router.post("/bulk-delete", response_model=SuccessResponse)
async def bulk_delete_users(
    request: BulkDeleteUsersRequest, admin: LoginUser = Depends(require_admin)
) -> SuccessResponse:
    """Delete several users; applies the single-delete rules per user and continues on failure."""
    admin_user = _current_admin(admin)
    deleted, failed, deleted_media = [], [], 0
    for user_id in dict.fromkeys(request.userIds):
        block = _deletion_block(admin_user, user_id)
        if block:
            failed.append({"userId": user_id, "reason": block[1]})
            continue
        try:
            result = UserManager.delete_user(user_id, delete_media=request.deleteMedia)
        except Exception:
            logger.exception("Failed to delete user %s", user_id)
            failed.append({"userId": user_id, "reason": "Internal error while deleting"})
            continue
        if result is None:
            failed.append({"userId": user_id, "reason": "User not found"})
            continue
        deleted.append(user_id)
        deleted_media += result["deletedMedia"]
    return SuccessResponse(
        success=True,
        data={"deleted": deleted, "failed": failed, "deletedMedia": deleted_media},
    )


@router.delete("/{user_id}", response_model=SuccessResponse)
async def delete_user(
    user_id: str,
    deleteMedia: bool = Query(True, description="Also delete the user's generated media"),
    admin: LoginUser = Depends(require_admin),
) -> SuccessResponse:
    """
    Delete a user (sessions, quotas, tags, admin links, chats, templates are removed).
    With deleteMedia=false the media stays and remains visible to all admins as "deleted user".
    """
    admin_user = _current_admin(admin)
    block = _deletion_block(admin_user, user_id)
    if block:
        raise HTTPException(status_code=block[0], detail=block[1])
    result = UserManager.delete_user(user_id, delete_media=deleteMedia)
    if result is None:
        raise HTTPException(
            status_code=status.HTTP_404_NOT_FOUND, detail="User not found"
        )
    return SuccessResponse(success=True, data=result)


@router.get("/{user_id}", response_model=SuccessResponse)
async def get_user(
    user_id: str, admin: LoginUser = Depends(require_admin)
) -> SuccessResponse:
    """Get details of a specific user (only if admin manages them)."""
    admin_user = UserManager.get_user_by_email(admin.username)
    if not admin_user:
        raise HTTPException(
            status_code=status.HTTP_404_NOT_FOUND, detail="Admin user not found"
        )

    # Check if admin can manage this user
    if not UserManager.can_admin_manage_user(admin_user.id, user_id):
        raise HTTPException(
            status_code=status.HTTP_403_FORBIDDEN,
            detail="You don't have permission to view this user",
        )

    user = UserManager.get_user_by_id(user_id)
    if not user:
        raise HTTPException(
            status_code=status.HTTP_404_NOT_FOUND, detail="User not found"
        )

    # Get quotas
    quotas = QuotaManager.get_all_quotas(user_id)
    quota_list = [quota.to_dict() for quota in quotas]

    # Check if shared
    admin_ids = UserManager.get_user_admins(user_id)
    is_shared = len(admin_ids) > 1
    other_admins = []
    if is_shared:
        for aid in admin_ids:
            if aid != admin_user.id:
                other_admin = UserManager.get_user_by_id(aid)
                if other_admin:
                    other_admins.append(other_admin.email)

    return SuccessResponse(
        success=True,
        data={
            "user": {
                "id": user.id,
                "email": user.email,
                "isActive": user.is_active,
                "isAdmin": user.is_admin,
                "requirePasswordReset": user.require_password_reset,
                "createdAt": user.created_at,
                "updatedAt": user.updated_at,
                "lastLoginAt": user.last_login_at,
                "isShared": is_shared,
                "sharedWith": other_admins if is_shared else None,
                "tags": UserManager.get_user_tags(user_id),
            },
            "quotas": quota_list,
        },
    )


@router.put("/{user_id}", response_model=SuccessResponse)
async def update_user(
    user_id: str, request: UpdateUserRequest, admin: LoginUser = Depends(require_admin)
) -> SuccessResponse:
    """Update user settings (only if admin manages them)."""
    admin_user = UserManager.get_user_by_email(admin.username)
    if not admin_user:
        raise HTTPException(
            status_code=status.HTTP_404_NOT_FOUND, detail="Admin user not found"
        )

    # Check if admin can manage this user
    if not UserManager.can_admin_manage_user(admin_user.id, user_id):
        raise HTTPException(
            status_code=status.HTTP_403_FORBIDDEN,
            detail="You don't have permission to update this user",
        )

    # Update user
    updated_user = UserManager.update_user(
        user_id,
        is_active=request.isActive,
    )

    if not updated_user:
        raise HTTPException(
            status_code=status.HTTP_404_NOT_FOUND, detail="User not found"
        )

    return SuccessResponse(success=True, data={"user": updated_user.to_dict()})


@router.post("/{user_id}/reset-password", response_model=SuccessResponse)
async def reset_password(
    user_id: str, admin: LoginUser = Depends(require_admin)
) -> SuccessResponse:
    """Force password reset for user (only if admin manages them)."""
    admin_user = UserManager.get_user_by_email(admin.username)
    if not admin_user:
        raise HTTPException(
            status_code=status.HTTP_404_NOT_FOUND, detail="Admin user not found"
        )

    # Check if admin can manage this user
    if not UserManager.can_admin_manage_user(admin_user.id, user_id):
        raise HTTPException(
            status_code=status.HTTP_403_FORBIDDEN,
            detail="You don't have permission to reset this user's password",
        )

    # Set require_password_reset flag
    UserManager.update_user(user_id, require_password_reset=True)

    return SuccessResponse(
        success=True,
        data={
            "message": "Password reset flag set. User will need to set a new password on next login."
        },
    )


@router.get("/{user_id}/generations", response_model=SuccessResponse)
async def get_user_generations(
    user_id: str, limit: int = 50, admin: LoginUser = Depends(require_admin)
) -> SuccessResponse:
    """Get user's generations with email + IP (only if admin manages them)."""
    admin_user = UserManager.get_user_by_email(admin.username)
    if not admin_user:
        raise HTTPException(
            status_code=status.HTTP_404_NOT_FOUND, detail="Admin user not found"
        )

    # Check if admin can manage this user
    if not UserManager.can_admin_manage_user(admin_user.id, user_id):
        raise HTTPException(
            status_code=status.HTTP_403_FORBIDDEN,
            detail="You don't have permission to view this user's generations",
        )

    user = UserManager.get_user_by_id(user_id)
    if not user:
        raise HTTPException(
            status_code=status.HTTP_404_NOT_FOUND, detail="User not found"
        )

    # Get media from database
    from utils.database import get_connection

    with get_connection() as conn:
        rows = conn.execute(
            """
            SELECT id, type, prompt, model, created_at, ip_address, file_size, mime_type
            FROM media
            WHERE user_id = ?
            ORDER BY created_at DESC
            LIMIT ?
            """,
            (user_id, limit),
        ).fetchall()

        generations = []
        for row in rows:
            generations.append(
                {
                    "id": row["id"],
                    "type": row["type"],
                    "prompt": row["prompt"],
                    "model": row["model"],
                    "createdAt": row["created_at"],
                    "userId": user_id,
                    "userEmail": user.email,
                    "ipAddress": row["ip_address"],
                    "fileSize": row["file_size"],
                    "mimeType": row["mime_type"],
                }
            )

    return SuccessResponse(
        success=True,
        data={
            "user": {
                "id": user.id,
                "email": user.email,
            },
            "generations": generations,
        },
    )


@router.put("/{user_id}/tags", response_model=SuccessResponse)
async def update_user_tags(
    user_id: str,
    request: UpdateUserTagsRequest,
    admin: LoginUser = Depends(require_admin),
) -> SuccessResponse:
    """
    Update tags for a user (only if admin manages them).
    This replaces all existing tags with the provided list.
    """
    admin_user = UserManager.get_user_by_email(admin.username)
    if not admin_user:
        raise HTTPException(
            status_code=status.HTTP_404_NOT_FOUND, detail="Admin user not found"
        )

    # Check if admin can manage this user
    if not UserManager.can_admin_manage_user(admin_user.id, user_id):
        raise HTTPException(
            status_code=status.HTTP_403_FORBIDDEN,
            detail="You don't have permission to update this user's tags",
        )

    # Check if user exists
    user = UserManager.get_user_by_id(user_id)
    if not user:
        raise HTTPException(
            status_code=status.HTTP_404_NOT_FOUND, detail="User not found"
        )

    # Update tags
    UserManager.set_user_tags(user_id, request.tags)

    return SuccessResponse(
        success=True,
        data={
            "userId": user_id,
            "tags": UserManager.get_user_tags(user_id),
            "updated": True,
        },
    )


@router.get("/tags/all", response_model=SuccessResponse)
async def get_all_tags(admin: LoginUser = Depends(require_admin)) -> SuccessResponse:
    """
    Get all unique tags across all users.
    Useful for autocomplete/suggestions.
    """
    admin_user = UserManager.get_user_by_email(admin.username)
    if not admin_user:
        raise HTTPException(
            status_code=status.HTTP_404_NOT_FOUND, detail="Admin user not found"
        )

    all_tags = UserManager.get_all_tags()

    return SuccessResponse(success=True, data={"tags": all_tags})


__all__ = ["router"]
