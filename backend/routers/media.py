"""Media storage endpoints for retrieving saved images and videos."""

import base64
import logging
import os
from io import BytesIO
from typing import Any, Dict, Optional, Tuple

from fastapi import APIRouter, Depends, Header, HTTPException, Query, Request
from fastapi.responses import FileResponse, Response, StreamingResponse
from PIL import Image

import utils.media_storage as media_storage
from models import SuccessResponse, LoginUser
from utils import media_inputs
from utils.auth import get_current_user_with_db
from utils.media_storage import get_media_storage
from utils.media_urls import sign_media_path, verify
from utils.user_manager import User, UserManager
from utils.video_frame_extractor import extract_frames

logger = logging.getLogger(__name__)

router = APIRouter()

# Thumbnail configuration
THUMBNAIL_MAX_SIZE = (400, 400)  # Maximum thumbnail dimensions

# Signed URLs are capabilities, so browsers may cache them but shared caches must not.
CACHE_HEADERS = {"Cache-Control": "private, max-age=86400"}

# Note: Specific routes like /list and /stats must come BEFORE parameterized routes like /{media_id}
# Otherwise FastAPI will try to match "list" as a media_id parameter


def _item_from_row(row: Dict[str, Any], is_admin: bool) -> Dict[str, Any]:
    media_id = row["id"]

    def url(path: str) -> str:
        return sign_media_path(media_id, path)

    def input_url(kind: str, index: int) -> str:
        return url(f"/api/media/{media_id}/inputs/{kind}/{index}")

    return {
        "id": media_id,
        "type": row["type"],
        "prompt": row["prompt"],
        "model": row["model"],
        "createdAt": row["created_at"],
        "fileSize": row["file_size"],
        "mimeType": row["mime_type"],
        "userId": row["user_id"],
        "userEmail": (row["user_email"] or "unknown") if is_admin else None,
        "ipAddress": row["ip_address"] if is_admin else None,
        "url": url(f"/api/media/{media_id}"),
        "thumbnailUrl": url(f"/api/media/{media_id}/thumbnail"),
        "details": {
            "mode": row["mode"] if isinstance(row["mode"], str) else None,
            "negativePrompt": row["negative_prompt"] if isinstance(row["negative_prompt"], str) else None,
            "firstFrame": input_url("firstFrame", 0) if row["has_first"] else None,
            "lastFrame": input_url("lastFrame", 0) if row["has_last"] else None,
            "referenceImages": [input_url("referenceImages", i) for i in range(row["reference_count"] or 0)],
            "sourceImages": [input_url("sourceImages", i) for i in range(row["source_count"] or 0)],
        },
    }


@router.get("/list", response_model=SuccessResponse)
def list_media(
    type: Optional[str] = Query(None, description="Filter by type: 'image', 'video' or 'audio'"),
    page: int = Query(1, ge=1, description="Page number"),
    limit: int = Query(20, ge=1, le=100, description="Items per page"),
    auth: Tuple[LoginUser, User] = Depends(get_current_user_with_db),
):
    """
    List media for the current user (slim items with signed URLs, never inline image data).
    Regular users see only their own media; admins also media of users they manage.
    """
    try:
        _, db_user = auth
        is_admin = db_user.is_admin
        rows, total = get_media_storage().list_media_summaries(
            user_id=None if is_admin else db_user.id,
            admin_id=db_user.id if is_admin else None,
            media_type=type,
            limit=limit,
            offset=(page - 1) * limit,
        )

        return SuccessResponse(
            success=True,
            data={
                "media": [_item_from_row(row, is_admin) for row in rows],
                "total": total,
                "page": page,
                "limit": limit,
                "pages": (total + limit - 1) // limit,
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


def authorize_media(
    media_id: str,
    exp: Optional[str] = Query(None, description="Signed URL expiry (unix seconds)"),
    sig: Optional[str] = Query(None, description="Signed URL signature"),
    authorization: Optional[str] = Header(default=None),
) -> Dict[str, Any]:
    """Authorise a media read by signed URL or Bearer token; return cheap metadata (404 if unknown)."""
    signed_ok = exp is not None and sig is not None and verify(media_id, exp, sig)
    if not signed_ok and not (authorization or "").startswith("Bearer "):
        raise HTTPException(status_code=401, detail="Invalid or expired media URL")

    db_user = None
    if not signed_ok:
        _, db_user = get_current_user_with_db(authorization)

    metadata = get_media_storage().get_media_metadata(media_id)
    if not metadata:
        raise HTTPException(status_code=404, detail="Media not found")
    if db_user is not None:
        _check_access(metadata, db_user)
    return metadata


def _check_access(metadata: Dict[str, Any], db_user: User) -> None:
    media_user_id = metadata.get("userId")
    if media_user_id == db_user.id:
        return
    if db_user.is_admin and UserManager.can_admin_manage_user(db_user.id, media_user_id):
        return
    raise HTTPException(status_code=403, detail="Access denied")


def _media_file(metadata: Dict[str, Any]):
    path = get_media_storage().file_path_for(metadata["type"], metadata["filename"])
    if not path.is_file():
        raise HTTPException(status_code=404, detail="Media file not found")
    return path


def _parse_range(header: str, size: int) -> Optional[Tuple[int, int]]:
    """Parse a single ``bytes=a-b`` range into inclusive (start, end); None if unsatisfiable/unsupported."""
    unit, _, spec = header.partition("=")
    if unit.strip().lower() != "bytes" or "," in spec:
        return None
    first, _, last = spec.strip().partition("-")
    try:
        if first == "":  # suffix range: last N bytes
            length = int(last)
            if length <= 0:
                return None
            return max(size - length, 0), size - 1
        start = int(first)
        end = int(last) if last else size - 1
    except ValueError:
        return None
    end = min(end, size - 1)
    if start > end or start >= size:
        return None
    return start, end


def _iter_file(path, start: int, end: int, chunk: int = 256 * 1024):
    with open(path, "rb") as fh:
        fh.seek(start)
        remaining = end - start + 1
        while remaining > 0:
            data = fh.read(min(chunk, remaining))
            if not data:
                break
            remaining -= len(data)
            yield data


def _original_response(media_id: str, metadata: Dict[str, Any], request: Optional[Request] = None):
    """Serve the file from disk (streamed), honouring HTTP Range for video seeking."""
    mime_type = metadata["mimeType"]
    path = _media_file(metadata)
    headers = {
        "Content-Disposition": f'inline; filename="{media_id}.{get_extension(mime_type)}"',
        "Accept-Ranges": "bytes",
        **CACHE_HEADERS,
    }
    range_header = request.headers.get("range") if request is not None else None
    if range_header:
        size = path.stat().st_size
        byte_range = _parse_range(range_header, size)
        if byte_range is None:
            return Response(status_code=416, headers={"Content-Range": f"bytes */{size}"})
        start, end = byte_range
        headers.update({"Content-Range": f"bytes {start}-{end}/{size}", "Content-Length": str(end - start + 1)})
        return StreamingResponse(
            _iter_file(path, start, end), status_code=206, media_type=mime_type, headers=headers
        )
    return FileResponse(path, media_type=mime_type, headers=headers)


def _jpeg_response(path, filename: str) -> FileResponse:
    return FileResponse(
        path,
        media_type="image/jpeg",
        headers={"Content-Disposition": f'inline; filename="{filename}"', **CACHE_HEADERS},
    )


def _write_atomic(path, data: bytes) -> None:
    path.parent.mkdir(parents=True, exist_ok=True)
    tmp = path.with_name(path.name + f".{os.getpid()}.tmp")
    tmp.write_bytes(data)
    os.replace(tmp, path)


def _make_image_thumbnail(source) -> bytes:
    """Resize an image (path or bytes) to a JPEG thumbnail (transparency flattened onto white)."""
    img = Image.open(BytesIO(source) if isinstance(source, bytes) else source)

    if img.mode in ("RGBA", "LA", "P"):
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
def get_media_thumbnail(media_id: str, request: Request, metadata: Dict[str, Any] = Depends(authorize_media)):
    """
    Retrieve a thumbnail of a media file by ID (cached on disk).
    Images are resized; videos use their extracted first frame.
    Falls back to the original file if no thumbnail can be produced.
    Access: valid signed URL, or Bearer token of the owner / managing admin.
    """
    thumbnail_path = media_storage.THUMBNAILS_DIR / f"{media_id}.jpg"
    if thumbnail_path.is_file():
        return _jpeg_response(thumbnail_path, f"{media_id}_thumb.jpg")

    # Only now is the original read.
    original = _media_file(metadata)
    try:
        if metadata["type"].lower() == "image":
            thumbnail_data = _make_image_thumbnail(original)
        else:
            first_frame_b64, _ = extract_frames(original.read_bytes())
            thumbnail_data = base64.b64decode(first_frame_b64) if first_frame_b64 else None
        if thumbnail_data:
            try:
                _write_atomic(thumbnail_path, thumbnail_data)
                return _jpeg_response(thumbnail_path, f"{media_id}_thumb.jpg")
            except OSError:
                logger.warning("Failed to cache thumbnail %s", media_id, exc_info=True)
                return Response(content=thumbnail_data, media_type="image/jpeg", headers=CACHE_HEADERS)
    except Exception:
        logger.warning("Thumbnail generation failed for %s", media_id, exc_info=True)

    return _original_response(media_id, metadata, request)


@router.get("/{media_id}/inputs/{kind}/{index}")
def get_media_input(
    media_id: str,
    kind: str,
    index: int,
    metadata: Dict[str, Any] = Depends(authorize_media),
):
    """JPEG preview (max 256 px) of an input image used to generate this media."""
    if kind not in media_inputs.INPUT_KINDS or index < 0:
        raise HTTPException(status_code=404, detail="Input not found")

    root = media_storage.STORAGE_ROOT
    cached = media_inputs.preview_path(root, media_id, kind, index)
    if cached.is_file():
        return _jpeg_response(cached, cached.name)

    details = get_media_storage().get_media_details(media_id)
    source = media_inputs.load_input_bytes(media_id, details, kind, index, root)
    if source is None:
        raise HTTPException(status_code=404, detail="Input not found")
    try:
        preview = media_inputs.make_preview(source)
    except Exception:
        logger.warning("Input preview failed for %s/%s/%s", media_id, kind, index, exc_info=True)
        raise HTTPException(status_code=404, detail="Input not readable")
    try:
        media_inputs.write_preview(cached, preview)
        return _jpeg_response(cached, cached.name)
    except OSError:
        return Response(content=preview, media_type="image/jpeg", headers=CACHE_HEADERS)


@router.get("/{media_id}")
def get_media(media_id: str, request: Request, metadata: Dict[str, Any] = Depends(authorize_media)):
    """
    Retrieve a specific media file by ID (supports HTTP Range for video seeking).
    Access: valid signed URL, or Bearer token of the owner / managing admin.
    """
    return _original_response(media_id, metadata, request)


@router.delete("/{media_id}", response_model=SuccessResponse)
def delete_media(
    media_id: str, auth: Tuple[LoginUser, User] = Depends(get_current_user_with_db)
):
    """
    Delete a specific media item.
    Users can delete their own media; admins also media of users they manage.
    """
    _, db_user = auth
    metadata = get_media_storage().get_media_metadata(media_id)
    if not metadata:
        raise HTTPException(status_code=404, detail="Media not found")
    _check_access(metadata, db_user)

    if not get_media_storage().delete_media(media_id):
        raise HTTPException(status_code=404, detail="Media not found")

    try:
        (media_storage.THUMBNAILS_DIR / f"{media_id}.jpg").unlink(missing_ok=True)
    except OSError:
        logger.warning("Failed to delete thumbnail cache %s", media_id, exc_info=True)

    return SuccessResponse(success=True, data={"mediaId": media_id, "deleted": True})
