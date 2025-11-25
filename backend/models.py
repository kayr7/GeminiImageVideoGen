"""Pydantic models for request/response validation."""

from datetime import datetime
from typing import Any, Dict, List, Optional

from pydantic import BaseModel, Field


# Image Generation Models
class ImageGenerationRequest(BaseModel):
    prompt: str = Field(..., min_length=1, max_length=10000)
    model: Optional[str] = Field(default="gemini-2.5-flash-image")
    aspectRatio: Optional[str] = Field(default="1:1")
    negativePrompt: Optional[str] = None
    referenceImages: Optional[List[str]] = None
    numberOfImages: Optional[int] = Field(default=1, ge=1, le=4)


class ImageEditRequest(BaseModel):
    prompt: str = Field(..., min_length=1, max_length=10000)
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
    prompt: str = Field(..., min_length=1, max_length=10000)
    model: Optional[str] = Field(default="veo-3.1-fast-generate-preview")
    negativePrompt: Optional[str] = None
    firstFrame: Optional[str] = None  # Image as starting frame
    lastFrame: Optional[str] = None  # Image as ending frame
    referenceImages: Optional[List[str]] = Field(
        default=None, max_items=3
    )  # Up to 3 reference images


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
    firstFrameData: Optional[str] = None  # Base64 encoded first frame image
    lastFrameData: Optional[str] = None  # Base64 encoded last frame image


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


# Speech Generation Models
class SpeakerConfig(BaseModel):
    name: str = Field(..., min_length=1)
    voice: str = Field(..., min_length=1)


class SpeechGenerationRequest(BaseModel):
    text: str = Field(..., min_length=1, max_length=10000)
    voice: Optional[str] = Field(None, min_length=1)
    speakers: Optional[List[SpeakerConfig]] = None
    language: Optional[str] = None
    model: Optional[str] = Field(default="gemini-2.5-flash-preview-tts")


class SpeechResponse(BaseModel):
    audioUrl: Optional[str] = None
    audioData: Optional[str] = None
    text: str
    voice: str
    language: Optional[str] = None
    model: str
    generatedAt: datetime
    mediaId: Optional[str] = None


# Media Storage Models
class MediaMetadata(BaseModel):
    id: str
    type: str  # 'image', 'video', or 'audio'
    filename: str
    prompt: str
    model: str
    userId: str
    createdAt: datetime
    fileSize: int
    mimeType: str
    details: Optional[Dict[str, Any]] = None


# Generic Response Models
class SuccessResponse(BaseModel):
    success: bool = True
    data: dict = {}


class ErrorResponse(BaseModel):
    success: bool = False
    error: str
    details: Optional[List[str]] = None


# Authentication Models
class ModelInfo(BaseModel):
    id: str
    name: str
    category: str
    description: Optional[str] = None
    price: Optional[float] = None
    priceUnit: Optional[str] = None
    pricePerVideo: Optional[float] = None
    tier: Optional[str] = None
    capabilities: Optional[Dict[str, Any]] = None


class ModelQuotaConfig(BaseModel):
    daily: Optional[int] = Field(default=None, ge=0)
    monthly: Optional[int] = Field(default=None, ge=0)


class ModelAvailability(BaseModel):
    enabled: List[ModelInfo] = Field(default_factory=list)
    disabled: List[ModelInfo] = Field(default_factory=list)
    default: Optional[str] = None
    quotas: Dict[str, ModelQuotaConfig] = Field(default_factory=dict)


class FeatureFlags(BaseModel):
    imageGeneration: bool = True
    videoGeneration: bool = True
    musicGeneration: bool = True
    speechGeneration: bool = True


class LoginConfig(BaseModel):
    models: Dict[str, ModelAvailability]
    features: FeatureFlags


class AdminCategorySettings(BaseModel):
    enabled: Optional[List[str]] = None
    disabled: Optional[List[str]] = None
    default: Optional[str] = None
    quotas: Optional[Dict[str, ModelQuotaConfig]] = None


class LoginUser(BaseModel):
    username: str
    displayName: Optional[str] = None
    roles: List[str] = Field(default_factory=list)


class LoginResponseData(BaseModel):
    token: str
    user: LoginUser
    config: LoginConfig
    requirePasswordSetup: Optional[bool] = False


class LoginResponse(BaseModel):
    success: bool = True
    data: LoginResponseData


class LoginRequest(BaseModel):
    username: str = Field(..., min_length=1, max_length=128)
    password: str = Field(..., min_length=1, max_length=128)


# User Management Models
class SetPasswordRequest(BaseModel):
    email: str = Field(..., min_length=1)
    password: str = Field(..., min_length=8, max_length=128)


class ChangePasswordRequest(BaseModel):
    currentPassword: str = Field(..., min_length=1)
    newPassword: str = Field(..., min_length=8, max_length=128)


class BulkCreateUsersRequest(BaseModel):
    emails: List[str] = Field(..., min_items=1)
    defaultQuotas: Optional[Dict[str, Dict[str, Any]]] = None
    defaultTags: Optional[List[str]] = None


class UpdateUserRequest(BaseModel):
    isActive: Optional[bool] = None


class UpdateQuotasRequest(BaseModel):
    quotas: Dict[str, Dict[str, Any]]  # e.g., {"image": {"type": "daily", "limit": 50}}


class UpdateUserTagsRequest(BaseModel):
    tags: List[str]  # List of tags to set for the user


class UserResponse(BaseModel):
    id: str
    email: str
    isActive: bool
    isAdmin: bool
    requirePasswordReset: bool
    createdAt: str
    updatedAt: str
    lastLoginAt: Optional[str] = None
    isShared: Optional[bool] = None
    sharedWith: Optional[List[str]] = None
    tags: Optional[List[str]] = None


class QuotaResponse(BaseModel):
    generationType: str
    quotaType: str
    quotaLimit: Optional[int]
    quotaUsed: int
    quotaRemaining: Optional[int]
    quotaResetAt: Optional[str]


# Text Generation Models
class CreateTemplateRequest(BaseModel):
    name: str = Field(..., min_length=1, max_length=200)
    mediaType: str = Field(..., pattern="^(text|image|video)$")
    templateText: str = Field(..., min_length=1, max_length=10000)
    variables: List[str] = Field(default_factory=list)


class UpdateTemplateRequest(BaseModel):
    name: Optional[str] = Field(None, min_length=1, max_length=200)
    templateText: Optional[str] = Field(None, min_length=1, max_length=10000)
    variables: Optional[List[str]] = None


class TemplateResponse(BaseModel):
    id: str
    userId: str
    name: str
    mediaType: str
    templateText: str
    variables: List[str]
    createdAt: str
    updatedAt: str


class CreateSystemPromptRequest(BaseModel):
    name: str = Field(..., min_length=1, max_length=200)
    mediaType: str = Field(..., pattern="^(text|image|video)$")
    promptText: str = Field(..., min_length=1, max_length=10000)


class UpdateSystemPromptRequest(BaseModel):
    name: Optional[str] = Field(None, min_length=1, max_length=200)
    promptText: Optional[str] = Field(None, min_length=1, max_length=10000)


class SystemPromptResponse(BaseModel):
    id: str
    userId: str
    name: str
    mediaType: str
    promptText: str
    createdAt: str
    updatedAt: str


class TextGenerationRequest(BaseModel):
    userMessage: str = Field(..., min_length=1, max_length=10000)
    systemPrompt: Optional[str] = None
    systemPromptId: Optional[str] = None
    templateId: Optional[str] = None
    variableValues: Optional[Dict[str, str]] = None
    model: Optional[str] = Field(default="gemini-2.0-flash-exp")


class TextGenerationResponse(BaseModel):
    id: str
    userId: str
    mode: str
    systemPrompt: Optional[str]
    systemPromptId: Optional[str]
    userMessage: str
    templateId: Optional[str]
    filledMessage: str
    variableValues: Optional[Dict[str, str]]
    modelResponse: str
    model: str
    ipAddress: Optional[str]
    createdAt: str


class CreateChatSessionRequest(BaseModel):
    name: Optional[str] = None
    systemPrompt: Optional[str] = None
    systemPromptId: Optional[str] = None


class UpdateChatSessionRequest(BaseModel):
    name: Optional[str] = Field(None, min_length=1, max_length=200)
    system_prompt: Optional[str] = Field(None, alias="systemPrompt")


class ChatSessionResponse(BaseModel):
    id: str
    userId: str
    name: Optional[str]
    systemPrompt: Optional[str]
    systemPromptId: Optional[str]
    createdAt: str
    updatedAt: str


class SendMessageRequest(BaseModel):
    message: str = Field(..., min_length=1, max_length=10000)
    model: Optional[str] = Field(default="gemini-2.0-flash-exp")


class ChatMessageResponse(BaseModel):
    id: str
    sessionId: str
    role: str
    content: str
    createdAt: str
