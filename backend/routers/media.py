"""Media storage endpoints for retrieving saved images and videos."""

from fastapi import APIRouter, Depends, HTTPException, Query, Response
from typing import Optional, Tuple
from io import BytesIO
import base64
from PIL import Image
from pathlib import Path

from models import SuccessResponse, LoginUser
from utils.media_storage import get_media_storage, THUMBNAILS_DIR
from utils.video_frame_extractor import extract_frames
from utils.auth import require_admin, get_current_user_with_db
from utils.user_manager import User, UserManager
from utils.database import get_connection

router = APIRouter()

# Thumbnail configuration
THUMBNAIL_MAX_SIZE = (400, 400)  # Maximum thumbnail dimensions

# Note: Specific routes like /list and /stats must come BEFORE parameterized routes like /{media_id}
# Otherwise FastAPI will try to match "list" as a media_id parameter


@router.get("/list", response_model=SuccessResponse)
async def list_media(
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
        raise HTTPException(status_code=500, detail=str(e))


@router.get("/stats", response_model=SuccessResponse)
async def get_stats(auth: Tuple[LoginUser, User] = Depends(get_current_user_with_db)):
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
        raise HTTPException(status_code=500, detail=str(e))


# Parameterized routes must come AFTER specific routes
@router.get("/{media_id}/thumbnail")
async def get_media_thumbnail(
    media_id: str, auth: Tuple[LoginUser, User] = Depends(get_current_user_with_db)
):
    """
    Retrieve a thumbnail of a media file by ID.
    For images: generates a resized thumbnail (cached on disk).
    For videos: returns a placeholder (videos require video processing libs).
    Users can only access their own media.
    Admins can access media from users they manage.
    """
    try:
        login_user, db_user = auth
        storage = get_media_storage()
        result = storage.get_media(media_id)

        if not result:
            raise HTTPException(status_code=404, detail="Media not found")

        # Check if user has access to this media
        media_user_id = result["metadata"].get("userId")

        if not db_user.is_admin:
            # Regular user: Can only access own media
            if media_user_id != db_user.id:
                raise HTTPException(status_code=403, detail="Access denied")
        else:
            # Admin: Can access media from users they manage
            if media_user_id != db_user.id:
                # Check if admin manages this user
                if not UserManager.can_admin_manage_user(db_user.id, media_user_id):
                    raise HTTPException(status_code=403, detail="Access denied")

        media_type = result["metadata"].get("type", "").lower()

        if media_type == "image":
            # Check if thumbnail already exists on disk
            thumbnail_path = THUMBNAILS_DIR / f"{media_id}.jpg"

            if thumbnail_path.exists():
                # Return cached thumbnail
                try:
                    thumbnail_data = thumbnail_path.read_bytes()
                    return Response(
                        content=thumbnail_data,
                        media_type="image/jpeg",
                        headers={
                            "Content-Disposition": f'inline; filename="{media_id}_thumb.jpg"',
                            "Cache-Control": "public, max-age=31536000",
                        },
                    )
                except Exception as e:
                    # If reading cached thumbnail fails, regenerate
                    print(f"Failed to read cached thumbnail: {e}")

            # Generate thumbnail for image
            try:
                img = Image.open(BytesIO(result["data"]))

                # Convert RGBA to RGB if necessary
                if img.mode in ("RGBA", "LA", "P"):
                    # Create white background
                    background = Image.new("RGB", img.size, (255, 255, 255))
                    if img.mode == "P":
                        img = img.convert("RGBA")
                    background.paste(
                        img,
                        mask=img.split()[-1] if img.mode in ("RGBA", "LA") else None,
                    )
                    img = background
                elif img.mode != "RGB":
                    img = img.convert("RGB")

                # Create thumbnail
                img.thumbnail(THUMBNAIL_MAX_SIZE, Image.Resampling.LANCZOS)

                # Save to BytesIO
                thumbnail_io = BytesIO()
                img.save(thumbnail_io, format="JPEG", quality=85, optimize=True)
                thumbnail_data = thumbnail_io.getvalue()

                # Save thumbnail to disk for future use
                try:
                    thumbnail_path.write_bytes(thumbnail_data)
                except Exception as e:
                    # Log error but continue (caching is optional)
                    print(f"Failed to cache thumbnail: {e}")

                return Response(
                    content=thumbnail_data,
                    media_type="image/jpeg",
                    headers={
                        "Content-Disposition": f'inline; filename="{media_id}_thumb.jpg"',
                        "Cache-Control": "public, max-age=31536000",
                    },
                )
            except Exception as e:
                # If thumbnail generation fails, return original
                print(f"Thumbnail generation failed: {e}")
                return Response(
                    content=result["data"],
                    media_type=result["metadata"]["mimeType"],
                    headers={
                        "Content-Disposition": f'inline; filename="{media_id}.{get_extension(result["metadata"]["mimeType"])}"',
                        "Cache-Control": "public, max-age=31536000",
                    },
                )
        else:
            # For videos, check if thumbnail already exists on disk
            thumbnail_path = THUMBNAILS_DIR / f"{media_id}.jpg"

            if thumbnail_path.exists():
                # Return cached thumbnail
                try:
                    thumbnail_data = thumbnail_path.read_bytes()
                    return Response(
                        content=thumbnail_data,
                        media_type="image/jpeg",
                        headers={
                            "Content-Disposition": f'inline; filename="{media_id}_thumb.jpg"',
                            "Cache-Control": "public, max-age=31536000",
                        },
                    )
                except Exception as e:
                    print(f"Failed to read cached thumbnail: {e}")

            # Generate thumbnail for video
            try:
                # Extract first frame
                first_frame_b64, _ = extract_frames(result["data"])
                
                if first_frame_b64:
                    # Save thumbnail to disk
                    storage.save_thumbnail(media_id, first_frame_b64)
                    
                    # Decode for response
                    thumbnail_data = base64.b64decode(first_frame_b64)
                    
                    return Response(
                        content=thumbnail_data,
                        media_type="image/jpeg",
                        headers={
                            "Content-Disposition": f'inline; filename="{media_id}_thumb.jpg"',
                            "Cache-Control": "public, max-age=31536000",
                        },
                    )
            except Exception as e:
                print(f"Video thumbnail generation failed: {e}")

            # Fallback: return the original video
            return Response(
                content=result["data"],
                media_type=result["metadata"]["mimeType"],
                headers={
                    "Content-Disposition": f'inline; filename="{media_id}.{get_extension(result["metadata"]["mimeType"])}"',
                    "Cache-Control": "public, max-age=31536000",
                },
            )

    except HTTPException:
        raise
    except Exception as e:
        raise HTTPException(status_code=500, detail=str(e))


@router.get("/{media_id}")
async def get_media(
    media_id: str, auth: Tuple[LoginUser, User] = Depends(get_current_user_with_db)
):
    """
    Retrieve a specific media file by ID.
    Users can only access their own media.
    Admins can access media from users they manage.
    """
    try:
        login_user, db_user = auth
        storage = get_media_storage()
        result = storage.get_media(media_id)

        if not result:
            raise HTTPException(status_code=404, detail="Media not found")

        # Check if user has access to this media
        media_user_id = result["metadata"].get("userId")

        if not db_user.is_admin:
            # Regular user: Can only access own media
            if media_user_id != db_user.id:
                raise HTTPException(status_code=403, detail="Access denied")
        else:
            # Admin: Can access media from users they manage
            if media_user_id != db_user.id:
                # Check if admin manages this user
                if not UserManager.can_admin_manage_user(db_user.id, media_user_id):
                    raise HTTPException(status_code=403, detail="Access denied")

        # Return binary file with appropriate headers
        return Response(
            content=result["data"],
            media_type=result["metadata"]["mimeType"],
            headers={
                "Content-Disposition": f'inline; filename="{media_id}.{get_extension(result["metadata"]["mimeType"])}"',
                "Cache-Control": "public, max-age=31536000",
            },
        )

    except HTTPException:
        raise
    except Exception as e:
        raise HTTPException(status_code=500, detail=str(e))


@router.delete("/{media_id}", response_model=SuccessResponse)
async def delete_media(
    media_id: str, auth: Tuple[LoginUser, User] = Depends(get_current_user_with_db)
):
    """
    Delete a specific media item.
    Users can delete their own media.
    Admins can delete media from users they manage.
    """
    try:
        login_user, db_user = auth
        storage = get_media_storage()

        # Get media to check ownership
        result = storage.get_media(media_id)
        if not result:
            raise HTTPException(status_code=404, detail="Media not found")

        media_user_id = result["metadata"].get("userId")

        # Check permissions
        if not db_user.is_admin:
            # Regular user: Can only delete own media
            if media_user_id != db_user.id:
                raise HTTPException(status_code=403, detail="Access denied")
        else:
            # Admin: Can delete media from users they manage
            if media_user_id != db_user.id:
                if not UserManager.can_admin_manage_user(db_user.id, media_user_id):
                    raise HTTPException(status_code=403, detail="Access denied")

        deleted = storage.delete_media(media_id)

        if not deleted:
            raise HTTPException(status_code=404, detail="Media not found")

        # Delete cached thumbnail if it exists
        thumbnail_path = THUMBNAILS_DIR / f"{media_id}.jpg"
        if thumbnail_path.exists():
            try:
                thumbnail_path.unlink()
            except Exception as e:
                # Log error but don't fail the request
                print(f"Failed to delete thumbnail cache: {e}")

        return SuccessResponse(
            success=True, data={"mediaId": media_id, "deleted": True}
        )

    except HTTPException:
        raise
    except Exception as e:
        raise HTTPException(status_code=500, detail=str(e))


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
