"""
Media storage endpoints for retrieving saved images and videos
"""
from fastapi import APIRouter, HTTPException, Response, Query
from typing import Optional

from models import SuccessResponse
from utils.media_storage import get_media_storage

router = APIRouter()

@router.get("/{media_id}")
async def get_media(media_id: str):
    """Retrieve a specific media file by ID"""
    try:
        storage = get_media_storage()
        result = storage.get_media(media_id)
        
        if not result:
            raise HTTPException(status_code=404, detail="Media not found")
        
        # Return binary file with appropriate headers
        return Response(
            content=result["data"],
            media_type=result["metadata"]["mimeType"],
            headers={
                "Content-Disposition": f'inline; filename="{media_id}.{get_extension(result["metadata"]["mimeType"])}"',
                "Cache-Control": "public, max-age=31536000"
            }
        )
        
    except HTTPException:
        raise
    except Exception as e:
        raise HTTPException(status_code=500, detail=str(e))

@router.get("/list", response_model=SuccessResponse)
async def list_media(
    type: Optional[str] = Query(None, description="Filter by type: 'image' or 'video'"),
    limit: int = Query(50, ge=1, le=200)
):
    """List all media for the current user"""
    try:
        storage = get_media_storage()
        media_list = storage.list_user_media("anonymous", media_type=type)
        
        # Limit results
        limited_list = media_list[:limit]
        
        # Add URL to each item
        for item in limited_list:
            item["url"] = f"/api/media/{item['id']}"
        
        return SuccessResponse(
            success=True,
            data={
                "media": limited_list,
                "total": len(media_list)
            }
        )
        
    except Exception as e:
        raise HTTPException(status_code=500, detail=str(e))

@router.get("/stats", response_model=SuccessResponse)
async def get_stats():
    """Get storage statistics"""
    try:
        storage = get_media_storage()
        stats = storage.get_stats()
        
        return SuccessResponse(
            success=True,
            data={
                **stats,
                "totalSizeMB": round(stats["totalSize"] / 1024 / 1024, 2)
            }
        )
        
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
        "image/gif": "gif"
    }
    return extensions.get(mime_type, "bin")

