"""Media storage endpoints for retrieving saved images and videos."""

import base64
import logging
from io import BytesIO
from typing import Any, Dict, Optional, Tuple

from fastapi import APIRouter, Depends, HTTPException, Query, Response
from PIL import Image

from models import SuccessResponse, LoginUser
from utils.auth import get_current_user_with_db
from utils.database import get_connection
from utils.media_storage import get_media_storage, THUMBNAILS_DIR
from utils.user_manager import User, UserManager
from utils.video_frame_extractor import extract_frames

logger = logging.getLogger(__name__)

router = APIRouter()

# Thumbnail configuration
THUMBNAIL_MAX_SIZE = (400, 400)  # Maximum thumbnail dimensions

# Note: Specific routes like /list and /stats must come BEFORE parameterized routes like /{media_id}
# Otherwise FastAPI will try to match "list" as a media_id parameter


@router.get("/list", response_model=SuccessResponse)
def list_media(
    type: Optional[str] = Query(None, description="Filter by type: 'image' or 'video'"),
    page: int = Query(1, ge=1, description="Page number"),
    limit: int = Query(20, ge=1, le=100, description="Items per page"),
    auth: Tuple[LoginUser, User] = Depends(get_current_user_with_db),
):
    """
    List media for the current user.
    Regular users see only their own media.
    Admins see media from users they invited.
    """
    try:
        login_user, db_user = auth
        storage = get_media_storage()
        offset = (page - 1) * limit

        # Check if admin
        is_admin = db_user.is_admin
        media_list = []
        total_count = 0

        if is_admin:
            # Admin: Get media from all users they invited
            managed_user_ids = [
                user.id for user in UserManager.get_admin_users(db_user.id)
            ]
            # Include admin's own media
            managed_user_ids.append(db_user.id)

            with get_connection() as conn:
                placeholders = ",".join("?" * len(managed_user_ids))
                base_query = f"FROM media WHERE user_id IN ({placeholders})"
                params = list(managed_user_ids)

                if type:
                    base_query += " AND type = ?"
                    params.append(type)

                # Get total count
                count_query = f"SELECT COUNT(*) {base_query}"
                total_count = conn.execute(count_query, params).fetchone()[0]

                # Get paginated items
                query = f"""
                    SELECT id, type, prompt, model, user_id, created_at,
                           file_size, mime_type, details, ip_address
                    {base_query}
                    ORDER BY created_at DESC LIMIT ? OFFSET ?
                """
                params.append(limit)
                params.append(offset)

                rows = conn.execute(query, params).fetchall()

                # Build media list with user email and IP
                for row in rows:
                    user = UserManager.get_user_by_id(row["user_id"])
                    media_item = {
                        "id": row["id"],
                        "type": row["type"],
                        "prompt": row["prompt"],
                        "model": row["model"],
                        "userId": row["user_id"],
                        "userEmail": user.email if user else "unknown",
                        "createdAt": row["created_at"],
                        "fileSize": row["file_size"],
                        "mimeType": row["mime_type"],
                        "details": row["details"],
                        "ipAddress": row["ip_address"],
                        "url": f"/api/media/{row['id']}",
                        "thumbnailUrl": f"/api/media/{row['id']}/thumbnail",
                    }
                    media_list.append(media_item)
        else:
            # Regular user: Only see own media
            total_count = storage.count_user_media(db_user.id, media_type=type)
            media_list = storage.list_user_media(
                db_user.id, media_type=type, limit=limit, offset=offset
            )

            # Add URL to each item
            for item in media_list:
                item["url"] = f"/api/media/{item['id']}"
                item["thumbnailUrl"] = f"/api/media/{item['id']}/thumbnail"

        return SuccessResponse(
            success=True,
            data={
                "media": media_list,
                "total": total_count,
                "page": page,
                "limit": limit,
                "pages": (total_count + limit - 1) // limit,
            },
        )

    except Exception as e:
        logger.exception("Media request failed")
        raise HTTPException(status_code=500, detail=str(e))


@router.get("/stats", response_model=SuccessResponse)
def get_stats(auth: Tuple[LoginUser, User] = Depends(get_current_user_with_db)):
    """
    Get storage statistics.
    Admins see stats for all users they manage.
    Regular users see only their own stats.
    """
    try:
        login_user, db_user = auth
        storage = get_media_storage()

        if db_user.is_admin:
            # Admin: Get stats for all managed users
            stats = storage.get_stats()
        else:
            # Regular user: Get only their stats
            stats = storage.get_user_stats(db_user.id)

        return SuccessResponse(
            success=True,
            data={**stats, "totalSizeMB": round(stats["totalSize"] / 1024 / 1024, 2)},
        )

    except Exception as e:
        logger.exception("Media request failed")
        raise HTTPException(status_code=500, detail=str(e))


# Parameterized routes must come AFTER specific routes
CACHE_HEADERS = {"Cache-Control": "public, max-age=31536000"}


def get_extension(mime_type: str) -> str:
    """Get file extension from MIME type"""
    extensions = {
        "video/mp4": "mp4",
        "video/webm": "webm",
        "image/png": "png",
        "image/jpeg": "jpg",
        "image/jpg": "jpg",
        "image/webp": "webp",
        "image/gif": "gif",
    }
    return extensions.get(mime_type, "bin")


def _load_accessible_media(media_id: str, db_user: User) -> Dict[str, Any]:
    """Return stored media if the user may access it (owner, or admin managing the owner)."""
    result = get_media_storage().get_media(media_id)
    if not result:
        raise HTTPException(status_code=404, detail="Media not found")
    _check_access(result, db_user)
    return result


def _check_access(result: Dict[str, Any], db_user: User) -> None:
    media_user_id = result["metadata"].get("userId")
    if media_user_id == db_user.id:
        return
    if db_user.is_admin and UserManager.can_admin_manage_user(db_user.id, media_user_id):
        return
    raise HTTPException(status_code=403, detail="Access denied")


def _original_response(media_id: str, result: Dict[str, Any]) -> Response:
    mime_type = result["metadata"]["mimeType"]
    return Response(
        content=result["data"],
        media_type=mime_type,
        headers={
            "Content-Disposition": f'inline; filename="{media_id}.{get_extension(mime_type)}"',
            **CACHE_HEADERS,
        },
    )


def _thumbnail_response(media_id: str, data: bytes) -> Response:
    return Response(
        content=data,
        media_type="image/jpeg",
        headers={
            "Content-Disposition": f'inline; filename="{media_id}_thumb.jpg"',
            **CACHE_HEADERS,
        },
    )


def _make_image_thumbnail(image_bytes: bytes) -> bytes:
    """Resize an image to a JPEG thumbnail (transparency flattened onto white)."""
    img = Image.open(BytesIO(image_bytes))

    if img.mode in ("RGBA", "LA", "P"):
        if img.mode == "P":
            img = img.convert("RGBA")
        background = Image.new("RGB", img.size, (255, 255, 255))
        background.paste(img, mask=img.split()[-1])
        img = background
    elif img.mode != "RGB":
        img = img.convert("RGB")

    img.thumbnail(THUMBNAIL_MAX_SIZE, Image.Resampling.LANCZOS)
    out = BytesIO()
    img.save(out, format="JPEG", quality=85, optimize=True)
    return out.getvalue()


@router.get("/{media_id}/thumbnail")
def get_media_thumbnail(
    media_id: str, auth: Tuple[LoginUser, User] = Depends(get_current_user_with_db)
):
    """
    Retrieve a thumbnail of a media file by ID (cached on disk).
    Images are resized; videos use their extracted first frame.
    Falls back to the original file if no thumbnail can be produced.
    Users can only access their own media; admins also media of users they manage.
    """
    _, db_user = auth
    result = _load_accessible_media(media_id, db_user)

    thumbnail_path = THUMBNAILS_DIR / f"{media_id}.jpg"
    if thumbnail_path.exists():
        try:
            return _thumbnail_response(media_id, thumbnail_path.read_bytes())
        except OSError:
            logger.warning("Failed to read cached thumbnail %s", media_id, exc_info=True)

    try:
        if result["metadata"].get("type", "").lower() == "image":
            thumbnail_data = _make_image_thumbnail(result["data"])
            try:
                thumbnail_path.write_bytes(thumbnail_data)
            except OSError:
                logger.warning("Failed to cache thumbnail %s", media_id, exc_info=True)
            return _thumbnail_response(media_id, thumbnail_data)

        first_frame_b64, _ = extract_frames(result["data"])
        if first_frame_b64:
            get_media_storage().save_thumbnail(media_id, first_frame_b64)
            return _thumbnail_response(media_id, base64.b64decode(first_frame_b64))
    except Exception:
        logger.warning("Thumbnail generation failed for %s", media_id, exc_info=True)

    return _original_response(media_id, result)


@router.get("/{media_id}")
def get_media(
    media_id: str, auth: Tuple[LoginUser, User] = Depends(get_current_user_with_db)
):
    """
    Retrieve a specific media file by ID.
    Users can only access their own media; admins also media of users they manage.
    """
    _, db_user = auth
    return _original_response(media_id, _load_accessible_media(media_id, db_user))


@router.delete("/{media_id}", response_model=SuccessResponse)
def delete_media(
    media_id: str, auth: Tuple[LoginUser, User] = Depends(get_current_user_with_db)
):
    """
    Delete a specific media item.
    Users can delete their own media; admins also media of users they manage.
    """
    _, db_user = auth
    _load_accessible_media(media_id, db_user)

    if not get_media_storage().delete_media(media_id):
        raise HTTPException(status_code=404, detail="Media not found")

    thumbnail_path = THUMBNAILS_DIR / f"{media_id}.jpg"
    try:
        thumbnail_path.unlink(missing_ok=True)
    except OSError:
        logger.warning("Failed to delete thumbnail cache %s", media_id, exc_info=True)

    return SuccessResponse(success=True, data={"mediaId": media_id, "deleted": True})
