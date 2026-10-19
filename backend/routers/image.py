"""
Image generation endpoints using the Google Gen AI Python SDK.
Documentation: https://ai.google.dev/gemini-api/docs/image-generation

Handlers are plain ``def`` so FastAPI runs them in its threadpool; the Gemini
SDK and sqlite calls are synchronous and would otherwise block the event loop.
"""

import logging
from datetime import datetime
from typing import Any, Dict, List, Optional, Tuple

from fastapi import APIRouter, Depends, HTTPException, Request

from models import (
    ImageEditRequest,
    ImageGenerationRequest,
    LoginUser,
    SuccessResponse,
)
from utils.auth import get_current_user_with_db
from utils.config import resolve_model_choice
from utils.gemini import DEFAULT_IMAGE_MIME, get_client, get_client_ip, split_data_url, to_base64
from utils.media_storage import get_media_storage
from utils.quota_manager import QuotaManager
from utils.rate_limiter import enforce_rate_limit
from utils.user_manager import User

logger = logging.getLogger(__name__)

router = APIRouter()


def _resolve_image_model(requested: Optional[str]) -> Dict[str, Any]:
    try:
        return resolve_model_choice("image", requested)
    except LookupError as error:
        status_code = 400 if (requested or "").strip() else 503
        raise HTTPException(status_code=status_code, detail=str(error))


def _image_parts(prompt: str, data_urls: Optional[List[str]]) -> List[Any]:
    """Build generate_content parts: the prompt followed by inline images."""
    parts: List[Any] = [prompt]
    for data_url in data_urls or []:
        payload, mime_type = split_data_url(data_url)
        parts.append({"inline_data": {"mime_type": mime_type, "data": payload}})
    return parts


def _generate_with_gemini(
    client, model_name: str, parts: List[Any], aspect_ratio: Optional[str]
) -> Tuple[str, str]:
    """Call a Nano Banana (generateContent) model; return (base64 image, mime type)."""
    config: Dict[str, Any] = {"response_modalities": ["Text", "Image"]}
    if aspect_ratio and aspect_ratio != "1:1":
        config["image_config"] = {"aspect_ratio": aspect_ratio}

    try:
        response = client.models.generate_content(
            model=model_name, contents=parts, config=config
        )
    except Exception as api_error:
        logger.exception("Gemini image API error (model=%s)", model_name)
        error_msg = str(api_error)
        if "IMAGE_OTHER" in error_msg or "not a valid" in error_msg:
            raise HTTPException(
                status_code=500,
                detail=(
                    "The model encountered an issue processing the request. This may "
                    "happen with certain reference images. Try with fewer or different "
                    f"reference images. Error: {error_msg}"
                ),
            )
        raise HTTPException(status_code=500, detail=f"Gemini API error: {error_msg}")

    if not response or not response.candidates:
        raise HTTPException(
            status_code=500,
            detail="No candidates in response from Gemini API. The model may have rejected the request.",
        )

    candidate = response.candidates[0]
    finish_reason = getattr(candidate, "finish_reason", None)
    if not candidate.content:
        raise HTTPException(
            status_code=500,
            detail=f"No content in response. Finish reason: {finish_reason}. The model may have filtered the request.",
        )
    if not candidate.content.parts:
        raise HTTPException(
            status_code=500,
            detail=f"No content parts in response. Finish reason: {finish_reason}. The model may have encountered an error.",
        )

    for part in candidate.content.parts:
        inline = getattr(part, "inline_data", None)
        if inline and inline.data:
            return to_base64(inline.data), (inline.mime_type or DEFAULT_IMAGE_MIME)

    raise HTTPException(status_code=500, detail="No image data in response")


def _save_and_respond(
    *,
    image_base64: str,
    mime_type: str,
    prompt: str,
    model_name: str,
    db_user: User,
    client_ip: str,
    details: Optional[Dict[str, Any]],
) -> SuccessResponse:
    """Persist the image, bump the quota and build the frontend response."""
    media_id = get_media_storage().save_media(
        media_type="image",
        base64_data=image_base64,
        metadata={
            "prompt": prompt,
            "model": model_name,
            "userId": db_user.id,
            "mimeType": mime_type,
            "details": details or None,
            "ipAddress": client_ip,  # tracked for abuse prevention
        },
    )

    # Only count the generation once it was produced and stored
    QuotaManager.increment_quota(db_user.id, "image")

    return SuccessResponse(
        success=True,
        data={
            "imageUrl": f"data:{mime_type};base64,{image_base64}",
            "imageData": image_base64,
            "prompt": prompt,
            "model": model_name,
            "generatedAt": datetime.now().isoformat(),
            "mediaId": str(media_id),
        },
    )


def _check_quota_and_rate(db_user: User) -> None:
    has_quota, error_msg = QuotaManager.check_quota(db_user.id, "image")
    if not has_quota:
        raise HTTPException(status_code=429, detail=error_msg)
    enforce_rate_limit(db_user.id, "image")


@router.post("/generate", response_model=SuccessResponse)
def generate_image(
    req: ImageGenerationRequest,
    request: Request,
    auth: Tuple[LoginUser, User] = Depends(get_current_user_with_db),
):
    """
    Generate an image from a text prompt.
    Uses the Nano Banana (generateContent) models.
    Requires authentication and checks user quotas.
    """
    _, db_user = auth
    try:
        client_ip = get_client_ip(request)
        _check_quota_and_rate(db_user)
        client = get_client()
        model_info = _resolve_image_model(req.model)
        model_name = model_info["id"]
        max_ref_images = (
            model_info.get("capabilities", {}).get("reference_images", {}).get("max", 3)
        )
        if req.referenceImages and len(req.referenceImages) > max_ref_images:
            raise HTTPException(
                status_code=400,
                detail=(
                    f"Too many reference images. {model_name} supports up to "
                    f"{max_ref_images} reference images, you provided {len(req.referenceImages)}."
                ),
            )
        # negativePrompt is still accepted by the request model but ignored: it only
        # ever applied to the retired Imagen models.
        image_base64, mime_type = _generate_with_gemini(
            client,
            model_name,
            _image_parts(req.prompt, req.referenceImages),
            req.aspectRatio,
        )
        details = {"referenceImages": req.referenceImages} if req.referenceImages else None

        return _save_and_respond(
            image_base64=image_base64,
            mime_type=mime_type,
            prompt=req.prompt,
            model_name=model_name,
            db_user=db_user,
            client_ip=client_ip,
            details=details,
        )
    except HTTPException:
        raise
    except Exception as e:
        logger.exception("Image generation failed")
        raise HTTPException(status_code=500, detail=str(e))


@router.post("/edit", response_model=SuccessResponse)
def edit_image(
    req: ImageEditRequest,
    request: Request,
    auth: Tuple[LoginUser, User] = Depends(get_current_user_with_db),
):
    """
    Edit image(s) with a text prompt (supports multiple source images).
    Requires authentication and checks user quotas.
    """
    _, db_user = auth
    try:
        client_ip = get_client_ip(request)
        _check_quota_and_rate(db_user)

        if not req.sourceImages:
            raise HTTPException(
                status_code=400, detail="At least one source image is required"
            )

        client = get_client()
        model_info = _resolve_image_model(req.model)
        model_name = model_info["id"]

        image_base64, mime_type = _generate_with_gemini(
            client,
            model_name,
            _image_parts(req.prompt, req.sourceImages),
            req.aspectRatio,
        )
        return _save_and_respond(
            image_base64=image_base64,
            mime_type=mime_type,
            prompt=req.prompt,
            model_name=model_name,
            db_user=db_user,
            client_ip=client_ip,
            details={"sourceImages": req.sourceImages, "mode": "edit"},
        )
    except HTTPException:
        raise
    except Exception as e:
        logger.exception("Image editing failed")
        raise HTTPException(status_code=500, detail=str(e))
