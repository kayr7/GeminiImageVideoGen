"""
Media storage system for saving images and videos to disk
"""
import os
import json
import uuid
from datetime import datetime, timedelta
from pathlib import Path
import base64

# Storage configuration
STORAGE_ROOT = Path(__file__).parent.parent / ".media-storage"
VIDEOS_DIR = STORAGE_ROOT / "videos"
IMAGES_DIR = STORAGE_ROOT / "images"
METADATA_FILE = STORAGE_ROOT / "metadata.json"

RETENTION_DAYS = 30

class MediaStorage:
    def __init__(self):
        self.metadata = []
        self._ensure_directories()
        self._load_metadata()
    
    def _ensure_directories(self):
        """Create storage directories if they don't exist"""
        for directory in [STORAGE_ROOT, VIDEOS_DIR, IMAGES_DIR]:
            directory.mkdir(parents=True, exist_ok=True)
    
    def _load_metadata(self):
        """Load metadata from disk"""
        if METADATA_FILE.exists():
            try:
                with open(METADATA_FILE, 'r') as f:
                    data = json.load(f)
                    self.metadata = [
                        {**item, "createdAt": datetime.fromisoformat(item["createdAt"])}
                        for item in data
                    ]
            except Exception as e:
                print(f"Error loading media metadata: {e}")
                self.metadata = []
    
    def _save_metadata(self):
        """Save metadata to disk"""
        try:
            data = [
                {**item, "createdAt": item["createdAt"].isoformat()}
                for item in self.metadata
            ]
            with open(METADATA_FILE, 'w') as f:
                json.dump(data, f, indent=2)
        except Exception as e:
            print(f"Error saving media metadata: {e}")
    
    def save_media(self, media_type: str, base64_data: str, metadata: dict) -> str:
        """Save media to disk and return the media ID"""
        # Generate unique ID and filename
        media_id = str(uuid.uuid4())
        extension = self._get_extension(metadata.get("mimeType", "video/mp4" if media_type == "video" else "image/png"))
        filename = f"{media_id}.{extension}"
        
        # Determine file path
        file_path = VIDEOS_DIR / filename if media_type == "video" else IMAGES_DIR / filename
        
        # Convert base64 to bytes and save
        file_bytes = base64.b64decode(base64_data)
        file_path.write_bytes(file_bytes)
        
        # Save metadata
        media_metadata = {
            "id": media_id,
            "type": media_type,
            "filename": filename,
            "prompt": metadata.get("prompt", ""),
            "model": metadata.get("model", ""),
            "userId": metadata.get("userId", "anonymous"),
            "createdAt": datetime.now(),
            "fileSize": len(file_bytes),
            "mimeType": metadata.get("mimeType", "video/mp4" if media_type == "video" else "image/png")
        }
        
        self.metadata.append(media_metadata)
        self._save_metadata()
        
        print(f"Saved {media_type} to disk: {filename} ({len(file_bytes) / 1024 / 1024:.2f} MB)")
        
        return media_id
    
    def get_media(self, media_id: str) -> dict:
        """Retrieve media from disk by ID"""
        # Find metadata
        media_meta = next((item for item in self.metadata if item["id"] == media_id), None)
        if not media_meta:
            return None
        
        # Determine file path
        file_path = VIDEOS_DIR / media_meta["filename"] if media_meta["type"] == "video" else IMAGES_DIR / media_meta["filename"]
        
        if not file_path.exists():
            print(f"Media file not found: {file_path}")
            return None
        
        # Read file
        file_bytes = file_path.read_bytes()
        
        return {
            "data": file_bytes,
            "metadata": media_meta
        }
    
    def list_user_media(self, user_id: str, media_type: str = None) -> list:
        """List all media for a user"""
        filtered = [
            item for item in self.metadata
            if item["userId"] == user_id and (not media_type or item["type"] == media_type)
        ]
        # Sort by creation date (newest first)
        filtered.sort(key=lambda x: x["createdAt"], reverse=True)
        return filtered
    
    def get_stats(self) -> dict:
        """Get storage statistics"""
        images = [item for item in self.metadata if item["type"] == "image"]
        videos = [item for item in self.metadata if item["type"] == "video"]
        total_size = sum(item["fileSize"] for item in self.metadata)
        
        dates = [item["createdAt"] for item in self.metadata]
        
        return {
            "totalFiles": len(self.metadata),
            "totalSize": total_size,
            "images": len(images),
            "videos": len(videos),
            "oldestFile": min(dates).isoformat() if dates else None,
            "newestFile": max(dates).isoformat() if dates else None
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
            "image/gif": "gif"
        }
        return extensions.get(mime_type, "mp4" if mime_type.startswith("video/") else "png")

# Singleton instance
_storage_instance = None

def get_media_storage() -> MediaStorage:
    """Get the singleton media storage instance"""
    global _storage_instance
    if _storage_instance is None:
        _storage_instance = MediaStorage()
    return _storage_instance

