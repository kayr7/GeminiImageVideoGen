"""Media storage system for saving images and videos to disk."""

import base64
import logging
import json
import os
import uuid
from datetime import datetime
from pathlib import Path
from typing import Any, Dict, List, Optional

from utils import media_inputs
from utils.database import get_connection, initialize_database

logger = logging.getLogger(__name__)

# Storage configuration
# MEDIA_STORAGE_DIR overrides the default location (read at import time).
STORAGE_ROOT = Path(os.environ.get("MEDIA_STORAGE_DIR") or Path(__file__).parent.parent / ".media-storage")
VIDEOS_DIR = STORAGE_ROOT / "videos"
IMAGES_DIR = STORAGE_ROOT / "images"
AUDIO_DIR = STORAGE_ROOT / "audio"
THUMBNAILS_DIR = STORAGE_ROOT / "thumbnails"


class MediaStorage:
    """Persist media files on disk with metadata stored in SQLite."""

    def __init__(self):
        initialize_database()
        self._ensure_directories()

    def _ensure_directories(self) -> None:
        """Create storage directories if they don't exist."""
        for directory in (
            STORAGE_ROOT, VIDEOS_DIR, IMAGES_DIR, AUDIO_DIR, THUMBNAILS_DIR,
            media_inputs.originals_dir(STORAGE_ROOT),
        ):
            directory.mkdir(parents=True, exist_ok=True)

    @staticmethod
    def file_path_for(media_type: str, filename: str) -> Path:
        """Location of a media file (reads the module paths at call time)."""
        if media_type == "video":
            return VIDEOS_DIR / filename
        if media_type == "audio":
            return AUDIO_DIR / filename
        return IMAGES_DIR / filename

    def _row_to_metadata(self, row) -> Dict[str, Any]:
        details: Optional[Dict[str, Any]] = None
        if row["details"]:
            try:
                details = json.loads(row["details"])
            except json.JSONDecodeError:
                details = None

        created_at = datetime.fromisoformat(row["created_at"])

        # Handle ip_address field (may not exist in old database)
        try:
            ip_address = row["ip_address"] if "ip_address" in row.keys() else None
        except (KeyError, IndexError):
            ip_address = None

        return {
            "id": row["id"],
            "type": row["type"],
            "filename": row["filename"],
            "prompt": row["prompt"] or "",
            "model": row["model"] or "",
            "userId": row["user_id"],
            "createdAt": created_at,
            "fileSize": row["file_size"],
            "mimeType": row["mime_type"],
            "details": details,
            "ipAddress": ip_address,  # May be None for old entries or before migration
        }

    def save_media(self, media_type: str, base64_data: str, metadata: dict) -> str:
        """Save media to disk and return the media ID"""
        # Generate unique ID and filename
        media_id = str(uuid.uuid4())
        default_mime = "image/png"
        if media_type == "video":
            default_mime = "video/mp4"
        elif media_type == "audio":
            default_mime = "audio/wav"
            
        extension = self._get_extension(
            metadata.get("mimeType", default_mime)
        )
        filename = f"{media_id}.{extension}"

        # Determine file path
        if media_type == "video":
            file_path = VIDEOS_DIR / filename
        elif media_type == "audio":
            file_path = AUDIO_DIR / filename
        else:
            file_path = IMAGES_DIR / filename

        # Convert base64 to bytes and save
        file_bytes = base64.b64decode(base64_data)
        file_path.write_bytes(file_bytes)

        # Input images go to files; only names are kept in the DB row.
        details = media_inputs.extract_inputs(media_id, metadata.get("details"), STORAGE_ROOT)

        # Save metadata with IP address for abuse tracking
        media_metadata = {
            "id": media_id,
            "type": media_type,
            "filename": filename,
            "prompt": metadata.get("prompt", ""),
            "model": metadata.get("model", ""),
            "userId": metadata.get("userId", "anonymous"),
            "createdAt": datetime.now(),
            "fileSize": len(file_bytes),
            "mimeType": metadata.get("mimeType", default_mime),
            "details": details,
            "ipAddress": metadata.get("ipAddress"),  # Track IP for abuse prevention
        }

        with get_connection() as conn:
            conn.execute(
                """
                INSERT INTO media (
                    id, type, filename, prompt, model, user_id,
                    created_at, file_size, mime_type, details, ip_address
                ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
                """,
                (
                    media_metadata["id"],
                    media_metadata["type"],
                    media_metadata["filename"],
                    media_metadata["prompt"],
                    media_metadata["model"],
                    media_metadata["userId"],
                    media_metadata["createdAt"].isoformat(),
                    media_metadata["fileSize"],
                    media_metadata["mimeType"],
                    (
                        json.dumps(media_metadata["details"])
                        if media_metadata.get("details")
                        else None
                    ),
                    media_metadata["ipAddress"],
                ),
            )
            conn.commit()

        logger.info("Saved %s to disk: %s (%.2f MB)", media_type, filename, len(file_bytes) / 1024 / 1024)

        return media_id

    def save_thumbnail(self, media_id: str, base64_data: str) -> bool:
        """Save a thumbnail image for a specific media ID"""
        try:
            thumbnail_path = THUMBNAILS_DIR / f"{media_id}.jpg"
            file_bytes = base64.b64decode(base64_data)
            thumbnail_path.write_bytes(file_bytes)
            return True
        except Exception:
            logger.exception("Failed to save thumbnail for %s", media_id)
            return False

    def get_media(self, media_id: str) -> dict:
        """Retrieve media from disk by ID"""
        with get_connection() as conn:
            row = conn.execute(
                "SELECT * FROM media WHERE id = ?",
                (media_id,),
            ).fetchone()

        if not row:
            return None

        media_meta = self._row_to_metadata(row)

        file_path = self.file_path_for(media_meta["type"], media_meta["filename"])

        if not file_path.exists():
            logger.warning("Media file not found: %s", file_path)
            return None

        # Read file
        file_bytes = file_path.read_bytes()

        return {"data": file_bytes, "metadata": media_meta}

    def get_media_metadata(self, media_id: str) -> Optional[Dict[str, Any]]:
        """Cheap lookup (no details blob, no file read): id, type, filename, userId, mimeType, fileSize."""
        with get_connection() as conn:
            row = conn.execute(
                "SELECT id, type, filename, user_id, mime_type, file_size FROM media WHERE id = ?",
                (media_id,),
            ).fetchone()
        if not row:
            return None
        return {
            "id": row["id"],
            "type": row["type"],
            "filename": row["filename"],
            "userId": row["user_id"],
            "mimeType": row["mime_type"],
            "fileSize": row["file_size"],
        }

    def get_media_details(self, media_id: str) -> Optional[Dict[str, Any]]:
        """Parsed details JSON of one media row (may be large for legacy rows)."""
        with get_connection() as conn:
            row = conn.execute("SELECT details FROM media WHERE id = ?", (media_id,)).fetchone()
        if not row or not row["details"]:
            return None
        try:
            parsed = json.loads(row["details"])
        except json.JSONDecodeError:
            return None
        return parsed if isinstance(parsed, dict) else None

    def list_media_summaries(
        self,
        *,
        user_id: Optional[str] = None,
        admin_id: Optional[str] = None,
        media_type: Optional[str] = None,
        limit: int = 20,
        offset: int = 0,
    ) -> tuple[List[Dict[str, Any]], int]:
        """Page of slim media rows plus total count, newest first.

        Either ``user_id`` (that user's media) or ``admin_id`` (the admin's own media plus
        media of users they manage). No details blob is loaded: SQLite JSON functions
        extract only mode, negativePrompt and the number of input images.
        """
        if admin_id is not None:
            where = "(user_id = ? OR user_id IN (SELECT user_id FROM user_admins WHERE admin_id = ?))"
            params: List[Any] = [admin_id, admin_id]
        else:
            where = "user_id = ?"
            params = [user_id]
        if media_type:
            where += " AND type = ?"
            params.append(media_type)

        def count(path: str) -> str:
            return (
                f"COALESCE(json_array_length(m.details, '$.inputs.{path}'),"
                f" json_array_length(m.details, '$.{path}'), 0)"
            )

        def has(path: str) -> str:
            return (
                f"(COALESCE(json_type(m.details, '$.inputs.{path}'), '') = 'text'"
                f" OR COALESCE(json_type(m.details, '$.{path}'), '') = 'text')"
            )

        query = f"""
            SELECT m.id, m.type, m.prompt, m.model, m.user_id, m.created_at,
                   m.file_size, m.mime_type, m.ip_address, u.email AS user_email,
                   json_extract(m.details, '$.mode') AS mode,
                   json_extract(m.details, '$.negativePrompt') AS negative_prompt,
                   {count('referenceImages')} AS reference_count,
                   {count('sourceImages')} AS source_count,
                   {has('firstFrame')} AS has_first,
                   {has('lastFrame')} AS has_last
            FROM (SELECT id FROM media WHERE {where}
                  ORDER BY created_at DESC, id DESC LIMIT ? OFFSET ?) p
            JOIN media m ON m.id = p.id
            LEFT JOIN users u ON u.id = m.user_id
            ORDER BY m.created_at DESC, m.id DESC
        """
        with get_connection() as conn:
            total = conn.execute(f"SELECT COUNT(*) FROM media WHERE {where}", params).fetchone()[0]
            rows = conn.execute(query, [*params, limit, offset]).fetchall()

        return [dict(row) for row in rows], total

    def list_user_media(
        self,
        user_id: str,
        media_type: str = None,
        limit: int = 50,
        offset: int = 0,
    ) -> list:
        """List all media for a user with pagination"""
        query = "SELECT * FROM media WHERE user_id = ?"
        params: List[Any] = [user_id]

        if media_type:
            query += " AND type = ?"
            params.append(media_type)

        query += " ORDER BY datetime(created_at) DESC LIMIT ? OFFSET ?"
        params.append(limit)
        params.append(offset)

        with get_connection() as conn:
            rows = conn.execute(query, params).fetchall()

        return [self._row_to_metadata(row) for row in rows]

    def count_user_media(self, user_id: str, media_type: str = None) -> int:
        """Count total media for a user"""
        query = "SELECT COUNT(*) FROM media WHERE user_id = ?"
        params: List[Any] = [user_id]

        if media_type:
            query += " AND type = ?"
            params.append(media_type)

        with get_connection() as conn:
            return conn.execute(query, params).fetchone()[0]

    def delete_media(self, media_id: str) -> bool:
        """Delete media file and metadata by ID"""
        with get_connection() as conn:
            row = conn.execute(
                "SELECT * FROM media WHERE id = ?",
                (media_id,),
            ).fetchone()

        if not row:
            return False

        media_meta = self._row_to_metadata(row)

        file_path = self.file_path_for(media_meta["type"], media_meta["filename"])

        try:
            if file_path.exists():
                file_path.unlink()
        except Exception:
            logger.exception("Error deleting media file %s", file_path)
            raise

        with get_connection() as conn:
            conn.execute("DELETE FROM media WHERE id = ?", (media_id,))
            conn.commit()

        self._delete_input_files(media_id)
        return True

    @staticmethod
    def _delete_input_files(media_id: str) -> None:
        for directory in (media_inputs.originals_dir(STORAGE_ROOT), media_inputs.previews_dir(STORAGE_ROOT)):
            try:
                for path in directory.glob(f"{media_id}_*"):
                    path.unlink(missing_ok=True)
            except OSError:
                logger.warning("Failed to delete input files for %s", media_id, exc_info=True)

    def get_stats(self) -> dict:
        """Get storage statistics"""
        with get_connection() as conn:
            totals = conn.execute(
                "SELECT COUNT(*) as total,"
                " SUM(CASE WHEN type = 'image' THEN 1 ELSE 0 END) as images,"
                " SUM(CASE WHEN type = 'video' THEN 1 ELSE 0 END) as videos,"
                " SUM(CASE WHEN type = 'audio' THEN 1 ELSE 0 END) as audio,"
                " COALESCE(SUM(file_size), 0) as total_size,"
                " MIN(created_at) as oldest,"
                " MAX(created_at) as newest"
                " FROM media"
            ).fetchone()

        return {
            "totalFiles": totals["total"],
            "totalSize": totals["total_size"],
            "images": totals["images"],
            "videos": totals["videos"],
            "audio": totals["audio"] or 0,
            "oldestFile": totals["oldest"],
            "newestFile": totals["newest"],
        }

    def _get_extension(self, mime_type: str) -> str:
        """Get file extension from MIME type"""
        extensions = {
            "video/mp4": "mp4",
            "video/webm": "webm",
            "image/png": "png",
            "image/jpeg": "jpg",
            "image/jpg": "jpg",
            "image/webp": "webp",
            "image/gif": "gif",
            "audio/wav": "wav",
            "audio/mp3": "mp3",
            "audio/mpeg": "mp3",
        }
        
        if mime_type in extensions:
            return extensions[mime_type]
            
        if mime_type.startswith("video/"):
            return "mp4"
        if mime_type.startswith("audio/"):
            return "wav"
            
        return "png"


# Singleton instance
_storage_instance = None


def get_media_storage() -> MediaStorage:
    """Get the singleton media storage instance"""
    global _storage_instance
    if _storage_instance is None:
        _storage_instance = MediaStorage()
    return _storage_instance
