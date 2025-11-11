"""Authentication endpoints for the Gemini backend with user management."""

from __future__ import annotations

from fastapi import APIRouter, HTTPException, status, Depends

from models import (
    LoginRequest,
    LoginResponse,
    LoginResponseData,
    LoginUser,
    SetPasswordRequest,
    ChangePasswordRequest,
    SuccessResponse,
    QuotaResponse,
)
from utils.config import get_application_configuration
from utils.session import session_manager
from utils.user_manager import UserManager
from utils.quota_manager import QuotaManager
from utils.auth import get_current_user

router = APIRouter()


@router.post("/login", response_model=LoginResponse, status_code=status.HTTP_200_OK)
async def login(request: LoginRequest) -> LoginResponse:
    """
    Authenticate a user and return configuration for the frontend.

    Handles both:
    - First-time login (no password set) -> returns requirePasswordSetup: true
    - Normal login with password verification
    """
    # Get user by email (username is email)
    user = UserManager.get_user_by_email(request.username)

    if not user:
        raise HTTPException(
            status_code=status.HTTP_401_UNAUTHORIZED, detail="Invalid email or password"
        )

    if not user.is_active:
        raise HTTPException(
            status_code=status.HTTP_403_FORBIDDEN,
            detail="Account is deactivated. Please contact an administrator.",
        )

    # Check if password is set
    if not user.password_hash:
        # First-time user, needs to set password
        return LoginResponse(
            success=True,
            data=LoginResponseData(
                token="",
                user=LoginUser(
                    username=user.email,
                    displayName=user.email,
                    roles=["admin"] if user.is_admin else [],
                ),
                config=get_application_configuration(),
                requirePasswordSetup=True,
            ),
        )

    # Verify password
    if not UserManager.verify_password(request.password, user.password_hash):
        raise HTTPException(
            status_code=status.HTTP_401_UNAUTHORIZED, detail="Invalid email or password"
        )

    # Check if password reset required
    if user.require_password_reset:
        return LoginResponse(
            success=True,
            data=LoginResponseData(
                token="",
                user=LoginUser(
                    username=user.email,
                    displayName=user.email,
                    roles=["admin"] if user.is_admin else [],
                ),
                config=get_application_configuration(),
                requirePasswordSetup=True,
            ),
        )

    # Update last login
    UserManager.update_last_login(user.id)

    # Create session
    login_user = LoginUser(
        username=user.email,
        displayName=user.email,
        roles=["admin"] if user.is_admin else [],
    )
    token = session_manager.create_session(login_user, user.id)

    return LoginResponse(
        data=LoginResponseData(
            token=token,
            user=login_user,
            config=get_application_configuration(),
        )
    )


@router.post("/set-password", response_model=LoginResponse)
async def set_password(request: SetPasswordRequest) -> LoginResponse:
    """Set password for first-time login or after password reset."""
    user = UserManager.get_user_by_email(request.email)

    if not user:
        raise HTTPException(
            status_code=status.HTTP_404_NOT_FOUND, detail="User not found"
        )

    if not user.is_active:
        raise HTTPException(
            status_code=status.HTTP_403_FORBIDDEN, detail="Account is deactivated"
        )

    # Validate password strength
    is_valid, error_msg = UserManager.validate_password(request.password)
    if not is_valid:
        raise HTTPException(status_code=status.HTTP_400_BAD_REQUEST, detail=error_msg)

    # Set password
    UserManager.update_user(
        user.id,
        password=request.password,
        require_password_reset=False,
    )

    # Set default quotas if not already set
    QuotaManager.set_default_quotas(user.id)

    # Update last login
    UserManager.update_last_login(user.id)

    # Create session
    login_user = LoginUser(
        username=user.email,
        displayName=user.email,
        roles=["admin"] if user.is_admin else [],
    )
    token = session_manager.create_session(login_user, user.id)

    return LoginResponse(
        data=LoginResponseData(
            token=token,
            user=login_user,
            config=get_application_configuration(),
        )
    )


@router.post("/logout", response_model=SuccessResponse)
async def logout(user: LoginUser = Depends(get_current_user)) -> SuccessResponse:
    """Logout and invalidate session."""
    # Note: We'd need the token to invalidate it, but for now just return success
    # The frontend should discard the token
    return SuccessResponse(success=True, data={"message": "Logged out successfully"})


@router.post("/change-password", response_model=SuccessResponse)
async def change_password(
    request: ChangePasswordRequest, user: LoginUser = Depends(get_current_user)
) -> SuccessResponse:
    """Change current user's password."""
    db_user = UserManager.get_user_by_email(user.username)

    if not db_user:
        raise HTTPException(
            status_code=status.HTTP_404_NOT_FOUND, detail="User not found"
        )

    # Verify current password
    if not db_user.password_hash or not UserManager.verify_password(
        request.currentPassword, db_user.password_hash
    ):
        raise HTTPException(
            status_code=status.HTTP_401_UNAUTHORIZED,
            detail="Current password is incorrect",
        )

    # Validate new password
    is_valid, error_msg = UserManager.validate_password(request.newPassword)
    if not is_valid:
        raise HTTPException(status_code=status.HTTP_400_BAD_REQUEST, detail=error_msg)

    # Update password
    UserManager.update_user(db_user.id, password=request.newPassword)

    return SuccessResponse(
        success=True, data={"message": "Password changed successfully"}
    )


@router.get("/me", response_model=SuccessResponse)
async def get_me(user: LoginUser = Depends(get_current_user)) -> SuccessResponse:
    """Get current user info with quota status."""
    db_user = UserManager.get_user_by_email(user.username)

    if not db_user:
        raise HTTPException(
            status_code=status.HTTP_404_NOT_FOUND, detail="User not found"
        )

    # Get quotas
    quotas = QuotaManager.get_all_quotas(db_user.id)
    quota_dict = {}
    for quota in quotas:
        quota_dict[quota.generation_type] = QuotaResponse(
            generationType=quota.generation_type,
            quotaType=quota.quota_type,
            quotaLimit=quota.quota_limit,
            quotaUsed=quota.quota_used,
            quotaRemaining=(
                max(0, quota.quota_limit - quota.quota_used)
                if quota.quota_limit
                else None
            ),
            quotaResetAt=quota.quota_reset_at,
        ).model_dump()

    return SuccessResponse(
        success=True,
        data={
            "user": {
                "id": db_user.id,
                "email": db_user.email,
                "isActive": db_user.is_active,
                "isAdmin": db_user.is_admin,
                "lastLoginAt": db_user.last_login_at,
            },
            "quotas": quota_dict,
        },
    )


__all__ = ["router"]
