"""Media storage system for saving images and videos to disk."""

import base64
import json
import uuid
from datetime import datetime
from pathlib import Path
from typing import Any, Dict, List, Optional

from utils.database import get_connection, initialize_database

# Storage configuration
STORAGE_ROOT = Path(__file__).parent.parent / ".media-storage"
VIDEOS_DIR = STORAGE_ROOT / "videos"
IMAGES_DIR = STORAGE_ROOT / "images"


class MediaStorage:
    """Persist media files on disk with metadata stored in SQLite."""

    def __init__(self):
        initialize_database()
        self._ensure_directories()

    def _ensure_directories(self) -> None:
        """Create storage directories if they don't exist."""
        for directory in (STORAGE_ROOT, VIDEOS_DIR, IMAGES_DIR):
            directory.mkdir(parents=True, exist_ok=True)

    def _row_to_metadata(self, row) -> Dict[str, Any]:
        details: Optional[Dict[str, Any]] = None
        if row["details"]:
            try:
                details = json.loads(row["details"])
            except json.JSONDecodeError:
                details = None

        created_at = datetime.fromisoformat(row["created_at"])

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
            "ipAddress": row.get("ip_address"),  # May be None for old entries
        }

    def save_media(self, media_type: str, base64_data: str, metadata: dict) -> str:
        """Save media to disk and return the media ID"""
        # Generate unique ID and filename
        media_id = str(uuid.uuid4())
        extension = self._get_extension(
            metadata.get(
                "mimeType", "video/mp4" if media_type == "video" else "image/png"
            )
        )
        filename = f"{media_id}.{extension}"

        # Determine file path
        file_path = (
            VIDEOS_DIR / filename if media_type == "video" else IMAGES_DIR / filename
        )

        # Convert base64 to bytes and save
        file_bytes = base64.b64decode(base64_data)
        file_path.write_bytes(file_bytes)

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
            "mimeType": metadata.get(
                "mimeType", "video/mp4" if media_type == "video" else "image/png"
            ),
            "details": metadata.get("details"),
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

        print(
            f"Saved {media_type} to disk: {filename} ({len(file_bytes) / 1024 / 1024:.2f} MB)"
        )

        return media_id

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

        # Determine file path
        file_path = (
            VIDEOS_DIR / media_meta["filename"]
            if media_meta["type"] == "video"
            else IMAGES_DIR / media_meta["filename"]
        )

        if not file_path.exists():
            print(f"Media file not found: {file_path}")
            return None

        # Read file
        file_bytes = file_path.read_bytes()

        return {"data": file_bytes, "metadata": media_meta}

    def list_user_media(self, user_id: str, media_type: str = None) -> list:
        """List all media for a user"""
        query = "SELECT * FROM media WHERE user_id = ?"
        params: List[Any] = [user_id]

        if media_type:
            query += " AND type = ?"
            params.append(media_type)

        query += " ORDER BY datetime(created_at) DESC"

        with get_connection() as conn:
            rows = conn.execute(query, params).fetchall()

        return [self._row_to_metadata(row) for row in rows]

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

        file_path = (
            VIDEOS_DIR / media_meta["filename"]
            if media_meta["type"] == "video"
            else IMAGES_DIR / media_meta["filename"]
        )

        try:
            if file_path.exists():
                file_path.unlink()
        except Exception as e:
            print(f"Error deleting media file {file_path}: {e}")
            raise

        with get_connection() as conn:
            conn.execute("DELETE FROM media WHERE id = ?", (media_id,))
            conn.commit()
        return True

    def get_stats(self) -> dict:
        """Get storage statistics"""
        with get_connection() as conn:
            totals = conn.execute(
                "SELECT COUNT(*) as total,"
                " SUM(CASE WHEN type = 'image' THEN 1 ELSE 0 END) as images,"
                " SUM(CASE WHEN type = 'video' THEN 1 ELSE 0 END) as videos,"
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
        }
        return extensions.get(
            mime_type, "mp4" if mime_type.startswith("video/") else "png"
        )


# Singleton instance
_storage_instance = None


def get_media_storage() -> MediaStorage:
    """Get the singleton media storage instance"""
    global _storage_instance
    if _storage_instance is None:
        _storage_instance = MediaStorage()
    return _storage_instance
