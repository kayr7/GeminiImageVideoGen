"""
Pydantic models for request/response validation
"""
from pydantic import BaseModel, Field
from typing import Optional, List
from datetime import datetime

# Image Generation Models
class ImageGenerationRequest(BaseModel):
    prompt: str = Field(..., min_length=1, max_length=2000)
    model: Optional[str] = Field(default="gemini-2.5-flash-image")
    aspectRatio: Optional[str] = Field(default="1:1")
    negativePrompt: Optional[str] = None
    referenceImages: Optional[List[str]] = None
    numberOfImages: Optional[int] = Field(default=1, ge=1, le=4)

class ImageEditRequest(BaseModel):
    prompt: str = Field(..., min_length=1, max_length=2000)
    model: Optional[str] = Field(default="gemini-2.5-flash-image")
    aspectRatio: Optional[str] = Field(default="1:1")
    sourceImages: Optional[List[str]] = None
    maskImage: Optional[str] = None

class ImageResponse(BaseModel):
    imageUrl: Optional[str] = None
    imageData: Optional[str] = None
    prompt: str
    model: str
    generatedAt: datetime
    mediaId: Optional[str] = None

# Video Generation Models
class VideoGenerationRequest(BaseModel):
    prompt: str = Field(..., min_length=1, max_length=1000)
    model: Optional[str] = Field(default="veo-3.1-fast-generate-preview")
    negativePrompt: Optional[str] = None
    firstFrame: Optional[str] = None  # Image as starting frame
    lastFrame: Optional[str] = None   # Image as ending frame
    referenceImages: Optional[List[str]] = Field(default=None, max_items=3)  # Up to 3 reference images

class VideoAnimateRequest(BaseModel):
    prompt: Optional[str] = Field(default="Animate this image with smooth motion")
    model: Optional[str] = Field(default="veo-3.1-fast-generate-preview")
    sourceImages: List[str] = Field(..., min_items=1)
    negativePrompt: Optional[str] = None

class VideoResponse(BaseModel):
    videoUrl: Optional[str] = None
    videoData: Optional[str] = None
    jobId: Optional[str] = None
    status: str  # 'completed', 'processing', 'failed'
    progress: Optional[int] = None
    estimatedCompletion: Optional[datetime] = None
    mediaId: Optional[str] = None
    error: Optional[str] = None

# Music Generation Models
class MusicGenerationRequest(BaseModel):
    description: str = Field(..., min_length=1, max_length=500)
    duration: Optional[int] = Field(default=30, ge=10, le=60)
    style: Optional[str] = None

class MusicResponse(BaseModel):
    audioUrl: Optional[str] = None
    audioData: Optional[str] = None
    description: str
    generatedAt: datetime
    error: Optional[str] = None

# Media Storage Models
class MediaMetadata(BaseModel):
    id: str
    type: str  # 'image' or 'video'
    filename: str
    prompt: str
    model: str
    userId: str
    createdAt: datetime
    fileSize: int
    mimeType: str

# Generic Response Models
class SuccessResponse(BaseModel):
    success: bool = True
    data: dict = {}

class ErrorResponse(BaseModel):
    success: bool = False
    error: str
    details: Optional[List[str]] = None

