"""API routes for system prompt management."""

from fastapi import APIRouter, Depends, HTTPException, Query
from typing import Tuple

from models import (
    CreateSystemPromptRequest,
    UpdateSystemPromptRequest,
    SystemPromptResponse,
    SuccessResponse,
)
from utils.auth import get_current_user_with_db
from utils.system_prompt_manager import SystemPromptManager
from utils.user_manager import User, LoginUser

router = APIRouter()


@router.post("", response_model=SuccessResponse)
async def create_system_prompt(
    request: CreateSystemPromptRequest,
    auth: Tuple[LoginUser, User] = Depends(get_current_user_with_db),
):
    """Create a new system prompt."""
    login_user, db_user = auth

    # Check if system prompt with this name already exists
    if SystemPromptManager.prompt_exists(db_user.id, request.name, request.mediaType):
        raise HTTPException(
            status_code=400,
            detail=f"System prompt with name '{request.name}' already exists for {request.mediaType}",
        )

    prompt = SystemPromptManager.create_system_prompt(
        user_id=db_user.id,
        name=request.name,
        media_type=request.mediaType,
        prompt_text=request.promptText,
    )

    return SuccessResponse(success=True, data={"systemPrompt": prompt.to_dict()})


@router.get("", response_model=SuccessResponse)
async def list_system_prompts(
    media_type: str = Query(None, description="Filter by media type"),
    auth: Tuple[LoginUser, User] = Depends(get_current_user_with_db),
):
    """List all system prompts for the current user, optionally filtered by media type."""
    login_user, db_user = auth

    prompts = SystemPromptManager.list_system_prompts(db_user.id, media_type)

    return SuccessResponse(
        success=True, data={"systemPrompts": [p.to_dict() for p in prompts]}
    )


@router.get("/{prompt_id}", response_model=SuccessResponse)
async def get_system_prompt(
    prompt_id: str,
    auth: Tuple[LoginUser, User] = Depends(get_current_user_with_db),
):
    """Get a specific system prompt by ID."""
    login_user, db_user = auth

    prompt = SystemPromptManager.get_system_prompt(prompt_id, db_user.id)
    if not prompt:
        raise HTTPException(status_code=404, detail="System prompt not found")

    return SuccessResponse(success=True, data={"systemPrompt": prompt.to_dict()})


@router.put("/{prompt_id}", response_model=SuccessResponse)
async def update_system_prompt(
    prompt_id: str,
    request: UpdateSystemPromptRequest,
    auth: Tuple[LoginUser, User] = Depends(get_current_user_with_db),
):
    """Update an existing system prompt."""
    login_user, db_user = auth

    # Check if user owns this prompt
    existing = SystemPromptManager.get_system_prompt(prompt_id, db_user.id)
    if not existing:
        raise HTTPException(status_code=404, detail="System prompt not found")

    # If renaming, check for name conflicts
    if request.name and request.name != existing.name:
        if SystemPromptManager.prompt_exists(
            db_user.id, request.name, existing.media_type
        ):
            raise HTTPException(
                status_code=400,
                detail=f"System prompt with name '{request.name}' already exists for {existing.media_type}",
            )

    prompt = SystemPromptManager.update_system_prompt(
        prompt_id=prompt_id,
        user_id=db_user.id,
        name=request.name,
        prompt_text=request.promptText,
    )

    if not prompt:
        raise HTTPException(status_code=404, detail="System prompt not found")

    return SuccessResponse(success=True, data={"systemPrompt": prompt.to_dict()})


@router.delete("/{prompt_id}", response_model=SuccessResponse)
async def delete_system_prompt(
    prompt_id: str,
    auth: Tuple[LoginUser, User] = Depends(get_current_user_with_db),
):
    """Delete a system prompt."""
    login_user, db_user = auth

    deleted = SystemPromptManager.delete_system_prompt(prompt_id, db_user.id)
    if not deleted:
        raise HTTPException(status_code=404, detail="System prompt not found")

    return SuccessResponse(success=True, data={"promptId": prompt_id})

