"""Pydantic models for request/response validation."""

from typing import Any, Dict, List, Optional, Union

from pydantic import BaseModel, Field


# Image Generation Models
class ImageGenerationRequest(BaseModel):
    prompt: str = Field(..., min_length=1, max_length=10000)
    model: Optional[str] = Field(default="gemini-nano-banana-2.1")
    aspectRatio: Optional[str] = Field(default="1:1")
    negativePrompt: Optional[str] = None
    referenceImages: Optional[List[str]] = None
    numberOfImages: Optional[int] = Field(default=1, ge=1, le=4)


class ImageEditRequest(BaseModel):
    prompt: str = Field(..., min_length=1, max_length=10000)
    model: Optional[str] = Field(default="gemini-nano-banana-2.1")
    aspectRatio: Optional[str] = Field(default="1:1")
    sourceImages: Optional[List[str]] = None
    maskImage: Optional[str] = None


# Video Generation Models
class _VideoOptions(BaseModel):
    # Values are validated against the chosen model's capabilities in routers/video.py.
    aspectRatio: Optional[str] = None
    resolution: Optional[str] = None
    # The frontend sends the select value as a string ("8"); accept int or numeric string.
    durationSeconds: Optional[Union[int, str]] = None


class VideoGenerationRequest(_VideoOptions):
    prompt: str = Field(..., min_length=1, max_length=10000)
    model: Optional[str] = None  # None/blank -> configured default video model
    negativePrompt: Optional[str] = None  # appended to the prompt as "Avoid: ..."
    firstFrame: Optional[str] = None  # Image as starting frame
    lastFrame: Optional[str] = None  # Image as ending frame
    referenceImages: Optional[List[str]] = Field(
        default=None, max_items=3
    )  # Up to 3 reference images


class VideoAnimateRequest(_VideoOptions):
    prompt: Optional[str] = Field(default="Animate this image with smooth motion")
    model: Optional[str] = None
    sourceImages: List[str] = Field(..., min_items=1)
    negativePrompt: Optional[str] = None


# Music Generation Models
# Speech Generation Models
class SpeakerConfig(BaseModel):
    name: str = Field(..., min_length=1)
    voice: str = Field(..., min_length=1)


class SpeechGenerationRequest(BaseModel):
    text: str = Field(..., min_length=1, max_length=10000)
    voice: Optional[str] = Field(None, min_length=1)
    speakers: Optional[List[SpeakerConfig]] = None
    language: Optional[str] = None
    model: Optional[str] = Field(default="gemini-3.8-flash-tts")


# Media Storage Models
# Generic Response Models
class SuccessResponse(BaseModel):
    success: bool = True
    data: dict = {}


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


class BulkDeleteUsersRequest(BaseModel):
    userIds: List[str] = Field(..., min_length=1, max_length=500)
    deleteMedia: bool = True


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
    model: Optional[str] = Field(default="gemini-3.8-flash")


class CreateChatSessionRequest(BaseModel):
    name: Optional[str] = None
    systemPrompt: Optional[str] = None
    systemPromptId: Optional[str] = None


class UpdateChatSessionRequest(BaseModel):
    name: Optional[str] = Field(None, min_length=1, max_length=200)
    system_prompt: Optional[str] = Field(None, alias="systemPrompt")


class SendMessageRequest(BaseModel):
    message: str = Field(..., min_length=1, max_length=10000)
    model: Optional[str] = Field(default="gemini-3.8-flash")




# Placeholder Models (personal named values that prefill {{NAME}} fields)
from typing import Annotated  # noqa: E402

from pydantic import AfterValidator  # noqa: E402

from utils.placeholder_manager import (  # noqa: E402
    MAX_DESCRIPTION_LENGTH,
    MAX_VALUE_LENGTH,
    NAME_RE,
)


def _clean_placeholder_name(v: Any) -> Any:
    if isinstance(v, str):
        v = v.strip()
        if not NAME_RE.fullmatch(v):
            raise ValueError("name must be 1-64 characters: letters, digits or underscore")
    return v


def _clean_placeholder_value(v: Any) -> Any:
    if isinstance(v, str):
        v = v.strip()
        if not v:
            raise ValueError("value must not be empty")
        if len(v) > MAX_VALUE_LENGTH:
            raise ValueError(f"value must be at most {MAX_VALUE_LENGTH} characters")
    return v


def _clean_placeholder_description(v: Any) -> Any:
    if isinstance(v, str):
        v = v.strip()
        if len(v) > MAX_DESCRIPTION_LENGTH:
            raise ValueError(f"description must be at most {MAX_DESCRIPTION_LENGTH} characters")
        return v or None
    return v


PlaceholderName = Annotated[str, AfterValidator(_clean_placeholder_name)]
PlaceholderValue = Annotated[str, AfterValidator(_clean_placeholder_value)]
PlaceholderDescription = Annotated[Optional[str], AfterValidator(_clean_placeholder_description)]


class CreatePlaceholderRequest(BaseModel):
    name: PlaceholderName
    value: PlaceholderValue
    description: PlaceholderDescription = None


class UpdatePlaceholderRequest(BaseModel):
    """Any subset; an explicit "description": null/"" clears the description."""

    name: Optional[PlaceholderName] = None
    value: Optional[PlaceholderValue] = None
    description: PlaceholderDescription = None


class UpsertPlaceholderRequest(BaseModel):
    """PUT /by-name/{name}: description is left unchanged when omitted."""

    value: PlaceholderValue
    description: PlaceholderDescription = None

