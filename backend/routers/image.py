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


_SAFETY_FINISH_REASONS = {
    "IMAGE_SAFETY",
    "IMAGE_PROHIBITED_CONTENT",
    "IMAGE_OTHER",
    "SAFETY",
    "PROHIBITED_CONTENT",
    "BLOCKLIST",
    "SPII",
    "IMAGE_RECITATION",
    "RECITATION",
}
_MAX_TEXT_REPLY = 500


def _enum_name(value: Any) -> Optional[str]:
    """Normalise SDK enums / strings (``FinishReason.IMAGE_OTHER``) to ``IMAGE_OTHER``."""
    if value is None:
        return None
    name = getattr(value, "name", None) or str(value)
    return name.rsplit(".", 1)[-1].upper() or None


def _no_image_error(
    model_name: str,
    finish_reason: Optional[str],
    block_reason: Optional[str],
    text_reply: str,
) -> HTTPException:
    """Build the 422 returned when the model answered without an image."""
    reason = block_reason or finish_reason
    if block_reason or (finish_reason in _SAFETY_FINISH_REASONS):
        message = (
            "The request was blocked by the model's safety filter. Common causes are "
            "real people (celebrities, politicians), brands/logos or copyrighted "
            "characters, or sensitive content. Rephrase the prompt or use different "
            "reference images."
        )
    elif finish_reason == "NO_IMAGE":
        message = (
            "The model did not produce an image for this prompt. Describe the picture "
            "you want to see (subject, style, setting) instead of asking a question or "
            "sending a greeting."
        )
    else:
        message = (
            "The model did not return an image. Try rephrasing the prompt as a "
            "description of the picture you want."
        )
    if reason:
        message += f" (reason: {reason})"
    text_reply = (text_reply or "").strip()
    if text_reply:
        if len(text_reply) > _MAX_TEXT_REPLY:
            text_reply = text_reply[:_MAX_TEXT_REPLY].rstrip() + "…"
        message += f" The model replied: \"{text_reply}\""

    logger.warning(
        "No image in response (model=%s, finish_reason=%s, block_reason=%s, text=%r)",
        model_name, finish_reason, block_reason, text_reply[:200],
    )
    return HTTPException(status_code=422, detail=message)


def _upstream_error(model_name: str, api_error: Exception) -> HTTPException:
    """Map an exception from the Gemini SDK to an HTTP error for the client."""
    logger.exception("Gemini image API error (model=%s)", model_name)
    status = getattr(api_error, "code", None) or getattr(api_error, "status_code", None)
    error_msg = getattr(api_error, "message", None) or str(api_error)
    if status == 429:
        return HTTPException(
            status_code=429,
            detail="The image service is busy or the API quota is exhausted. Please try again in a minute.",
        )
    if status == 400:
        return HTTPException(
            status_code=400,
            detail=f"The image model rejected the request: {error_msg}",
        )
    if isinstance(status, int) and status >= 500:
        return HTTPException(
            status_code=502,
            detail=f"The image service had a temporary problem ({status}). Please try again. {error_msg}",
        )
    return HTTPException(status_code=500, detail=f"Image generation failed: {error_msg}")


def _generate_with_gemini(
    client,
    model_name: str,
    parts: List[Any],
    aspect_ratio: Optional[str],
    response_modalities: Optional[List[str]] = None,
) -> Tuple[str, str]:
    """Call a Nano Banana (generateContent) model; return (base64 image, mime type).

    Raises HTTPException 422 (with a user-facing explanation) when the model
    answers without an image, e.g. because of the safety filter or a text reply.
    """
    config: Dict[str, Any] = {"response_modalities": list(response_modalities or ["IMAGE"])}
    if aspect_ratio and aspect_ratio != "1:1":
        config["image_config"] = {"aspect_ratio": aspect_ratio}

    try:
        response = client.models.generate_content(
            model=model_name, contents=parts, config=config
        )
    except Exception as api_error:
        raise _upstream_error(model_name, api_error)

    feedback = getattr(response, "prompt_feedback", None) if response else None
    block_reason = _enum_name(getattr(feedback, "block_reason", None))
    candidates = (getattr(response, "candidates", None) or []) if response else []
    candidate = candidates[0] if candidates else None
    finish_reason = _enum_name(getattr(candidate, "finish_reason", None))
    content = getattr(candidate, "content", None)

    text_chunks: List[str] = []
    draft = None  # interim "thought" image (3.x models), only used as a fallback
    for part in (getattr(content, "parts", None) or []):
        is_thought = bool(getattr(part, "thought", False))
        inline = getattr(part, "inline_data", None)
        if inline and inline.data:
            if not is_thought:
                return to_base64(inline.data), (inline.mime_type or DEFAULT_IMAGE_MIME)
            draft = draft or inline
            continue
        text = getattr(part, "text", None)
        if text and not is_thought:
            text_chunks.append(text)
    if draft is not None:
        return to_base64(draft.data), (draft.mime_type or DEFAULT_IMAGE_MIME)

    if finish_reason == "NO_IMAGE" and config["response_modalities"] == ["IMAGE"]:
        # Image-only requests occasionally come back empty for question-like prompts
        # that the same model answers with text + image; retry once in that mode.
        logger.info("No image from %s in IMAGE-only mode; retrying with TEXT+IMAGE", model_name)
        return _generate_with_gemini(client, model_name, parts, aspect_ratio, ["TEXT", "IMAGE"])

    raise _no_image_error(model_name, finish_reason, block_reason, " ".join(text_chunks))


def _response_modalities(model_info: Dict[str, Any]) -> List[str]:
    return model_info.get("capabilities", {}).get("response_modalities") or ["IMAGE"]


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
            _response_modalities(model_info),
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
            _response_modalities(model_info),
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
