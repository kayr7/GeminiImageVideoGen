"""
Image generation endpoints using Google Gemini Python SDK
Documentation: https://ai.google.dev/gemini-api/docs/imagen
"""

from fastapi import APIRouter, HTTPException, Request
from google import genai
import os
import base64
from datetime import datetime

from models import (
    ImageGenerationRequest,
    ImageEditRequest,
    ImageResponse,
    SuccessResponse,
)
from utils.config import resolve_model_choice
from utils.media_storage import get_media_storage
from utils.rate_limiter import check_rate_limit

router = APIRouter()


def get_client():
    """Get authenticated Gemini client"""
    api_key = os.getenv("GEMINI_API_KEY")
    if not api_key:
        raise HTTPException(status_code=500, detail="GEMINI_API_KEY not configured")
    return genai.Client(api_key=api_key)


def get_client_ip(request: Request) -> str:
    """
    Extract client IP address from request for abuse tracking.
    Handles X-Forwarded-For and X-Real-IP headers for proxy scenarios.
    """
    # Check X-Forwarded-For header (comma-separated list, first is client)
    forwarded_for = request.headers.get("X-Forwarded-For")
    if forwarded_for:
        return forwarded_for.split(",")[0].strip()

    # Check X-Real-IP header
    real_ip = request.headers.get("X-Real-IP")
    if real_ip:
        return real_ip.strip()

    # Fallback to direct client IP
    if request.client and request.client.host:
        return request.client.host

    return "unknown"


@router.post("/generate", response_model=SuccessResponse)
async def generate_image(req: ImageGenerationRequest, request: Request):
    """
    Generate an image from a text prompt
    Supports both Nano Banana (gemini-2.5-flash-image) and Imagen models
    """
    try:
        # Get client IP for abuse tracking
        client_ip = get_client_ip(request)

        # Check rate limit
        await check_rate_limit("anonymous", "image")

        client = get_client()

        requested_model_id = (req.model or "").strip()

        try:
            model_info = resolve_model_choice("image", req.model)
        except LookupError as error:
            status_code = 400 if requested_model_id else 503
            raise HTTPException(status_code=status_code, detail=str(error))
        model_name = model_info["id"]

        # Determine if using Nano Banana or Imagen
        is_nano_banana = "flash" in model_name.lower() or "gemini" in model_name.lower()

        if not is_nano_banana and req.referenceImages:
            raise HTTPException(
                status_code=400,
                detail="Reference images are not supported with Imagen models",
            )

        if is_nano_banana:
            # Nano Banana (Gemini 2.5 Flash Image) approach
            # Build contents with prompt and optional reference images
            parts = [req.prompt]

            if req.referenceImages:
                for img_data in req.referenceImages:
                    # Extract base64 data
                    if "," in img_data:
                        img_data = img_data.split(",")[1]
                    parts.append(
                        {"inline_data": {"mime_type": "image/png", "data": img_data}}
                    )

            # Generate with Nano Banana
            config = {"response_modalities": ["Image"]}

            if req.aspectRatio and req.aspectRatio != "1:1":
                config["image_config"] = {"aspect_ratio": req.aspectRatio}

            response = client.models.generate_content(
                model=model_name, contents=parts, config=config
            )

            # Extract image data
            if response.candidates and len(response.candidates) > 0:
                for part in response.candidates[0].content.parts:
                    if hasattr(part, "inline_data") and part.inline_data:
                        # Get image data - it's always bytes from the API
                        image_data = part.inline_data.data

                        # Ensure we have bytes and convert to base64 string
                        if isinstance(image_data, bytes):
                            image_base64 = base64.b64encode(image_data).decode("utf-8")
                        elif isinstance(image_data, str):
                            # Already base64 string
                            image_base64 = image_data
                        else:
                            # Unknown type, try to get string representation
                            image_base64 = str(image_data)

                        print(
                            f"Image data type: {type(image_data)}, Base64 length: {len(image_base64)}"
                        )

                        # Save to storage with reference images and IP
                        storage = get_media_storage()
                        details = {}
                        if req.referenceImages:
                            details["referenceImages"] = req.referenceImages

                        media_id = storage.save_media(
                            media_type="image",
                            base64_data=image_base64,
                            metadata={
                                "prompt": req.prompt,
                                "model": model_name,
                                "userId": "anonymous",
                                "mimeType": "image/png",
                                "details": details if details else None,
                                "ipAddress": client_ip,  # Track IP for abuse prevention
                            },
                        )

                        # Return response with all string values
                        response_data = {
                            "imageUrl": f"data:image/png;base64,{image_base64}",
                            "imageData": str(image_base64),  # Ensure it's a string
                            "prompt": str(req.prompt),
                            "model": model_name,
                            "generatedAt": datetime.now().isoformat(),
                            "mediaId": str(media_id),
                        }

                        return SuccessResponse(success=True, data=response_data)
        else:
            # Imagen approach (using predict method)
            instance = {"prompt": req.prompt}

            parameters = {
                "sampleCount": req.numberOfImages or 1,
                "aspectRatio": req.aspectRatio or "1:1",
            }

            if req.negativePrompt:
                instance["negativePrompt"] = req.negativePrompt

            # Note: Imagen via SDK uses different method
            # For now, we'll use REST API approach
            import requests

            api_key = os.getenv("GEMINI_API_KEY")
            url = f"https://generativelanguage.googleapis.com/v1beta/models/{model_name}:predict"

            response = requests.post(
                url,
                params={"key": api_key},
                json={"instances": [instance], "parameters": parameters},
            )

            if response.status_code != 200:
                raise HTTPException(
                    status_code=response.status_code,
                    detail=response.json()
                    .get("error", {})
                    .get("message", "Image generation failed"),
                )

            data = response.json()
            if data.get("predictions") and len(data["predictions"]) > 0:
                image_base64 = data["predictions"][0].get("bytesBase64Encoded") or data[
                    "predictions"
                ][0].get("image")

                if image_base64:
                    # Save to storage with IP (Imagen doesn't support reference images, but save negative prompt if provided)
                    storage = get_media_storage()
                    details = {}
                    if req.negativePrompt:
                        details["negativePrompt"] = req.negativePrompt

                    media_id = storage.save_media(
                        media_type="image",
                        base64_data=image_base64,
                        metadata={
                            "prompt": req.prompt,
                            "model": model_name,
                            "userId": "anonymous",
                            "mimeType": "image/png",
                            "details": details if details else None,
                            "ipAddress": client_ip,  # Track IP for abuse prevention
                        },
                    )

                    return SuccessResponse(
                        success=True,
                        data={
                            "imageUrl": f"data:image/png;base64,{image_base64}",
                            "imageData": image_base64,
                            "prompt": req.prompt,
                            "model": model_name,
                            "generatedAt": datetime.now().isoformat(),
                            "mediaId": media_id,
                        },
                    )

        raise HTTPException(status_code=500, detail="No image data in response")

    except HTTPException:
        raise
    except Exception as e:
        raise HTTPException(status_code=500, detail=str(e))


@router.post("/edit", response_model=SuccessResponse)
async def edit_image(req: ImageEditRequest, request: Request):
    """
    Edit an image with a text prompt
    Supports multiple reference images
    """
    try:
        # Get client IP for abuse tracking
        client_ip = get_client_ip(request)

        # Check rate limit
        await check_rate_limit("anonymous", "image")

        if not req.sourceImages or len(req.sourceImages) == 0:
            raise HTTPException(
                status_code=400, detail="At least one source image is required"
            )

        client = get_client()
        requested_model_id = (req.model or "").strip()

        try:
            model_info = resolve_model_choice("image", req.model)
        except LookupError as error:
            status_code = 400 if requested_model_id else 503
            raise HTTPException(status_code=status_code, detail=str(error))
        model_name = model_info["id"]

        is_nano_banana = "flash" in model_name.lower() or "gemini" in model_name.lower()

        if is_nano_banana:
            # Build parts with prompt and images
            parts = [req.prompt]

            for img_data in req.sourceImages:
                if "," in img_data:
                    img_data = img_data.split(",")[1]
                parts.append(
                    {"inline_data": {"mime_type": "image/png", "data": img_data}}
                )

            config = {"response_modalities": ["Image"]}

            if req.aspectRatio and req.aspectRatio != "1:1":
                config["image_config"] = {"aspect_ratio": req.aspectRatio}

            response = client.models.generate_content(
                model=model_name, contents=parts, config=config
            )

            # Extract image
            if response.candidates and len(response.candidates) > 0:
                for part in response.candidates[0].content.parts:
                    if hasattr(part, "inline_data") and part.inline_data:
                        # Get image data - it's always bytes from the API
                        image_data = part.inline_data.data

                        # Ensure we have bytes and convert to base64 string
                        if isinstance(image_data, bytes):
                            image_base64 = base64.b64encode(image_data).decode("utf-8")
                        elif isinstance(image_data, str):
                            # Already base64 string
                            image_base64 = image_data
                        else:
                            # Unknown type, try to get string representation
                            image_base64 = str(image_data)

                        print(
                            f"Image edit data type: {type(image_data)}, Base64 length: {len(image_base64)}"
                        )

                        # Save to storage with source images and IP
                        storage = get_media_storage()
                        details = {}
                        if req.sourceImages:
                            details["sourceImages"] = req.sourceImages
                        details["mode"] = "edit"

                        media_id = storage.save_media(
                            media_type="image",
                            base64_data=image_base64,
                            metadata={
                                "prompt": req.prompt,
                                "model": model_name,
                                "userId": "anonymous",
                                "mimeType": "image/png",
                                "details": details,
                                "ipAddress": client_ip,  # Track IP for abuse prevention
                            },
                        )

                        # Return response with all string values
                        response_data = {
                            "imageUrl": f"data:image/png;base64,{image_base64}",
                            "imageData": str(image_base64),  # Ensure it's a string
                            "prompt": str(req.prompt),
                            "model": model_name,
                            "generatedAt": datetime.now().isoformat(),
                            "mediaId": str(media_id),
                        }

                        return SuccessResponse(success=True, data=response_data)

        raise HTTPException(status_code=500, detail="Image editing failed")

    except HTTPException:
        raise
    except Exception as e:
        raise HTTPException(status_code=500, detail=str(e))
