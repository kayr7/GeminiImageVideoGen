"""API routes for prompt template management."""

from fastapi import APIRouter, Depends, HTTPException, Query
from typing import List, Tuple

from models import (
    CreateTemplateRequest,
    UpdateTemplateRequest,
    TemplateResponse,
    SuccessResponse,
    LoginUser,
)
from utils.auth import get_current_user_with_db
from utils.template_manager import TemplateManager
from utils.user_manager import User

router = APIRouter()


@router.post("", response_model=SuccessResponse)
async def create_template(
    request: CreateTemplateRequest,
    auth: Tuple[LoginUser, User] = Depends(get_current_user_with_db),
):
    """Create a new prompt template."""
    login_user, db_user = auth

    # Check if template with this name already exists
    if TemplateManager.template_exists(db_user.id, request.name, request.mediaType):
        raise HTTPException(
            status_code=400,
            detail=f"Template with name '{request.name}' already exists for {request.mediaType}",
        )

    template = TemplateManager.create_template(
        user_id=db_user.id,
        name=request.name,
        media_type=request.mediaType,
        template_text=request.templateText,
        variables=request.variables,
    )

    return SuccessResponse(success=True, data={"template": template.to_dict()})


@router.get("", response_model=SuccessResponse)
async def list_templates(
    media_type: str = Query(None, description="Filter by media type"),
    auth: Tuple[LoginUser, User] = Depends(get_current_user_with_db),
):
    """List all templates for the current user, optionally filtered by media type."""
    login_user, db_user = auth

    templates = TemplateManager.list_templates(db_user.id, media_type)

    return SuccessResponse(
        success=True, data={"templates": [t.to_dict() for t in templates]}
    )


@router.get("/{template_id}", response_model=SuccessResponse)
async def get_template(
    template_id: str,
    auth: Tuple[LoginUser, User] = Depends(get_current_user_with_db),
):
    """Get a specific template by ID."""
    login_user, db_user = auth

    template = TemplateManager.get_template(template_id, db_user.id)
    if not template:
        raise HTTPException(status_code=404, detail="Template not found")

    return SuccessResponse(success=True, data={"template": template.to_dict()})


@router.put("/{template_id}", response_model=SuccessResponse)
async def update_template(
    template_id: str,
    request: UpdateTemplateRequest,
    auth: Tuple[LoginUser, User] = Depends(get_current_user_with_db),
):
    """Update an existing template."""
    login_user, db_user = auth

    # Check if user owns this template
    existing = TemplateManager.get_template(template_id, db_user.id)
    if not existing:
        raise HTTPException(status_code=404, detail="Template not found")

    # If renaming, check for name conflicts
    if request.name and request.name != existing.name:
        if TemplateManager.template_exists(
            db_user.id, request.name, existing.media_type
        ):
            raise HTTPException(
                status_code=400,
                detail=f"Template with name '{request.name}' already exists for {existing.media_type}",
            )

    template = TemplateManager.update_template(
        template_id=template_id,
        user_id=db_user.id,
        name=request.name,
        template_text=request.templateText,
        variables=request.variables,
    )

    if not template:
        raise HTTPException(status_code=404, detail="Template not found")

    return SuccessResponse(success=True, data={"template": template.to_dict()})


@router.delete("/{template_id}", response_model=SuccessResponse)
async def delete_template(
    template_id: str,
    auth: Tuple[LoginUser, User] = Depends(get_current_user_with_db),
):
    """Delete a template."""
    login_user, db_user = auth

    deleted = TemplateManager.delete_template(template_id, db_user.id)
    if not deleted:
        raise HTTPException(status_code=404, detail="Template not found")

    return SuccessResponse(success=True, data={"templateId": template_id})

