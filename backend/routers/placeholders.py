"""API routes for personal placeholder values (prefill for {{NAME}} fields)."""

from typing import Tuple

from fastapi import APIRouter, Depends, HTTPException

from models import (
    CreatePlaceholderRequest,
    LoginUser,
    SuccessResponse,
    UpdatePlaceholderRequest,
    UpsertPlaceholderRequest,
)
from utils import placeholder_manager as pm
from utils.auth import get_current_user_with_db
from utils.placeholder_manager import (
    UNSET,
    PlaceholderLimitReached,
    PlaceholderManager,
    PlaceholderNameConflict,
)
from utils.user_manager import User

router = APIRouter()

NOT_FOUND = "Placeholder not found"


def _conflict(name: str) -> HTTPException:
    return HTTPException(status_code=409, detail=f"Placeholder '{name}' already exists")


def _limit() -> HTTPException:
    # Read at call time so tests can monkeypatch the constant.
    return HTTPException(
        status_code=400,
        detail=f"Placeholder limit reached ({pm.MAX_PLACEHOLDERS_PER_USER})",
    )


def _ok(placeholder) -> SuccessResponse:
    return SuccessResponse(success=True, data={"placeholder": placeholder.to_dict()})


@router.get("", response_model=SuccessResponse)
async def list_placeholders(auth: Tuple[LoginUser, User] = Depends(get_current_user_with_db)):
    """List the current user's placeholders, sorted by name (case-insensitive)."""
    _, db_user = auth
    items = PlaceholderManager.list_placeholders(db_user.id)
    return SuccessResponse(success=True, data={"placeholders": [p.to_dict() for p in items]})


@router.post("", response_model=SuccessResponse)
async def create_placeholder(
    request: CreatePlaceholderRequest,
    auth: Tuple[LoginUser, User] = Depends(get_current_user_with_db),
):
    _, db_user = auth
    try:
        p = PlaceholderManager.create_placeholder(
            db_user.id, request.name, request.value, request.description
        )
    except PlaceholderNameConflict:
        raise _conflict(request.name)
    except PlaceholderLimitReached:
        raise _limit()
    return _ok(p)


# Two path segments, so it never collides with PUT /{placeholder_id}.
@router.put("/by-name/{name}", response_model=SuccessResponse)
async def upsert_placeholder_by_name(
    name: str,
    request: UpsertPlaceholderRequest,
    auth: Tuple[LoginUser, User] = Depends(get_current_user_with_db),
):
    """Create the placeholder with this name, or update its value."""
    _, db_user = auth
    name = name.strip()
    if not pm.NAME_RE.fullmatch(name):
        raise HTTPException(
            status_code=422,
            detail="name must be 1-64 characters: letters, digits or underscore",
        )
    description = (
        request.description if "description" in request.model_fields_set else UNSET
    )
    try:
        p = PlaceholderManager.upsert_by_name(db_user.id, name, request.value, description)
    except PlaceholderLimitReached:
        raise _limit()
    return _ok(p)


@router.put("/{placeholder_id}", response_model=SuccessResponse)
async def update_placeholder(
    placeholder_id: str,
    request: UpdatePlaceholderRequest,
    auth: Tuple[LoginUser, User] = Depends(get_current_user_with_db),
):
    _, db_user = auth
    fields = request.model_fields_set
    if "name" in fields and request.name is None:
        raise HTTPException(status_code=422, detail="name must not be null")
    if "value" in fields and request.value is None:
        raise HTTPException(status_code=422, detail="value must not be null")
    try:
        p = PlaceholderManager.update_placeholder(
            placeholder_id,
            db_user.id,
            name=request.name if "name" in fields else UNSET,
            value=request.value if "value" in fields else UNSET,
            description=request.description if "description" in fields else UNSET,
        )
    except PlaceholderNameConflict:
        raise _conflict(request.name)
    if p is None:
        raise HTTPException(status_code=404, detail=NOT_FOUND)
    return _ok(p)


@router.delete("/{placeholder_id}", response_model=SuccessResponse)
async def delete_placeholder(
    placeholder_id: str,
    auth: Tuple[LoginUser, User] = Depends(get_current_user_with_db),
):
    _, db_user = auth
    if not PlaceholderManager.delete_placeholder(placeholder_id, db_user.id):
        raise HTTPException(status_code=404, detail=NOT_FOUND)
    return SuccessResponse(success=True, data={"placeholderId": placeholder_id})
