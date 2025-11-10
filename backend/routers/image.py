"""
Image generation endpoints using Google Gemini Python SDK
Documentation: https://ai.google.dev/gemini-api/docs/imagen
"""
from fastapi import APIRouter, HTTPException
from google import genai
import os
import base64
from datetime import datetime

from models import ImageGenerationRequest, ImageEditRequest, ImageResponse, SuccessResponse
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

@router.post("/generate", response_model=SuccessResponse)
async def generate_image(request: ImageGenerationRequest):
    """
    Generate an image from a text prompt
    Supports both Nano Banana (gemini-2.5-flash-image) and Imagen models
    """
    try:
        # Check rate limit
        await check_rate_limit("anonymous", "image")
        
        client = get_client()

        requested_model_id = (request.model or "").strip()

        try:
            model_info = resolve_model_choice("image", request.model)
        except LookupError as error:
            status_code = 400 if requested_model_id else 503
            raise HTTPException(status_code=status_code, detail=str(error))
        model_name = model_info["id"]

        # Determine if using Nano Banana or Imagen
        is_nano_banana = "flash" in model_name.lower() or "gemini" in model_name.lower()
        
        if is_nano_banana:
            # Nano Banana (Gemini 2.5 Flash Image) approach
            # Build contents with prompt and optional reference images
            parts = [request.prompt]
            
            if request.referenceImages:
                for img_data in request.referenceImages:
                    # Extract base64 data
                    if "," in img_data:
                        img_data = img_data.split(",")[1]
                    parts.append({
                        "inline_data": {
                            "mime_type": "image/png",
                            "data": img_data
                        }
                    })
            
            # Generate with Nano Banana
            config = {
                "response_modalities": ["Image"]
            }
            
            if request.aspectRatio and request.aspectRatio != "1:1":
                config["image_config"] = {
                    "aspect_ratio": request.aspectRatio
                }
            
            response = client.models.generate_content(
                model=model_name,
                contents=parts,
                config=config
            )
            
            # Extract image data
            if response.candidates and len(response.candidates) > 0:
                for part in response.candidates[0].content.parts:
                    if hasattr(part, 'inline_data') and part.inline_data:
                        # Get image data - it's always bytes from the API
                        image_data = part.inline_data.data
                        
                        # Ensure we have bytes and convert to base64 string
                        if isinstance(image_data, bytes):
                            image_base64 = base64.b64encode(image_data).decode('utf-8')
                        elif isinstance(image_data, str):
                            # Already base64 string
                            image_base64 = image_data
                        else:
                            # Unknown type, try to get string representation
                            image_base64 = str(image_data)
                        
                        print(f"Image data type: {type(image_data)}, Base64 length: {len(image_base64)}")
                        
                        # Save to storage
                        storage = get_media_storage()
                        media_id = storage.save_media(
                            media_type="image",
                            base64_data=image_base64,
                            metadata={
                                "prompt": request.prompt,
                                "model": model_name,
                                "userId": "anonymous",
                                "mimeType": "image/png"
                            }
                        )
                        
                        # Return response with all string values
                        response_data = {
                            "imageUrl": f"data:image/png;base64,{image_base64}",
                            "imageData": str(image_base64),  # Ensure it's a string
                            "prompt": str(request.prompt),
                            "model": model_name,
                            "generatedAt": datetime.now().isoformat(),
                            "mediaId": str(media_id)
                        }
                        
                        return SuccessResponse(
                            success=True,
                            data=response_data
                        )
        else:
            # Imagen approach (using predict method)
            instance = {
                "prompt": request.prompt
            }
            
            parameters = {
                "sampleCount": request.numberOfImages or 1,
                "aspectRatio": request.aspectRatio or "1:1"
            }
            
            if request.negativePrompt:
                instance["negativePrompt"] = request.negativePrompt
            
            # Note: Imagen via SDK uses different method
            # For now, we'll use REST API approach
            import requests
            api_key = os.getenv("GEMINI_API_KEY")
            url = f"https://generativelanguage.googleapis.com/v1beta/models/{model_name}:predict"
            
            response = requests.post(
                url,
                params={"key": api_key},
                json={
                    "instances": [instance],
                    "parameters": parameters
                }
            )
            
            if response.status_code != 200:
                raise HTTPException(
                    status_code=response.status_code,
                    detail=response.json().get("error", {}).get("message", "Image generation failed")
                )
            
            data = response.json()
            if data.get("predictions") and len(data["predictions"]) > 0:
                image_base64 = data["predictions"][0].get("bytesBase64Encoded") or data["predictions"][0].get("image")
                
                if image_base64:
                    # Save to storage
                    storage = get_media_storage()
                    media_id = storage.save_media(
                        media_type="image",
                        base64_data=image_base64,
                        metadata={
                            "prompt": request.prompt,
                            "model": model_name,
                            "userId": "anonymous",
                            "mimeType": "image/png"
                        }
                    )
                    
                    return SuccessResponse(
                        success=True,
                        data={
                            "imageUrl": f"data:image/png;base64,{image_base64}",
                            "imageData": image_base64,
                            "prompt": request.prompt,
                            "model": model_name,
                            "generatedAt": datetime.now().isoformat(),
                            "mediaId": media_id
                        }
                    )
        
        raise HTTPException(status_code=500, detail="No image data in response")
        
    except HTTPException:
        raise
    except Exception as e:
        raise HTTPException(status_code=500, detail=str(e))

@router.post("/edit", response_model=SuccessResponse)
async def edit_image(request: ImageEditRequest):
    """
    Edit an image with a text prompt
    Supports multiple reference images
    """
    try:
        # Check rate limit
        await check_rate_limit("anonymous", "image")
        
        if not request.sourceImages or len(request.sourceImages) == 0:
            raise HTTPException(status_code=400, detail="At least one source image is required")
        
        client = get_client()
        requested_model_id = (request.model or "").strip()

        try:
            model_info = resolve_model_choice("image", request.model)
        except LookupError as error:
            status_code = 400 if requested_model_id else 503
            raise HTTPException(status_code=status_code, detail=str(error))
        model_name = model_info["id"]

        is_nano_banana = "flash" in model_name.lower() or "gemini" in model_name.lower()
        
        if is_nano_banana:
            # Build parts with prompt and images
            parts = [request.prompt]
            
            for img_data in request.sourceImages:
                if "," in img_data:
                    img_data = img_data.split(",")[1]
                parts.append({
                    "inline_data": {
                        "mime_type": "image/png",
                        "data": img_data
                    }
                })
            
            config = {
                "response_modalities": ["Image"]
            }
            
            if request.aspectRatio and request.aspectRatio != "1:1":
                config["image_config"] = {
                    "aspect_ratio": request.aspectRatio
                }
            
            response = client.models.generate_content(
                model=model_name,
                contents=parts,
                config=config
            )
            
            # Extract image
            if response.candidates and len(response.candidates) > 0:
                for part in response.candidates[0].content.parts:
                    if hasattr(part, 'inline_data') and part.inline_data:
                        # Get image data - it's always bytes from the API
                        image_data = part.inline_data.data
                        
                        # Ensure we have bytes and convert to base64 string
                        if isinstance(image_data, bytes):
                            image_base64 = base64.b64encode(image_data).decode('utf-8')
                        elif isinstance(image_data, str):
                            # Already base64 string
                            image_base64 = image_data
                        else:
                            # Unknown type, try to get string representation
                            image_base64 = str(image_data)
                        
                        print(f"Image edit data type: {type(image_data)}, Base64 length: {len(image_base64)}")
                        
                        # Save to storage
                        storage = get_media_storage()
                        media_id = storage.save_media(
                            media_type="image",
                            base64_data=image_base64,
                            metadata={
                                "prompt": request.prompt,
                                "model": model_name,
                                "userId": "anonymous",
                                "mimeType": "image/png"
                            }
                        )
                        
                        # Return response with all string values
                        response_data = {
                            "imageUrl": f"data:image/png;base64,{image_base64}",
                            "imageData": str(image_base64),  # Ensure it's a string
                            "prompt": str(request.prompt),
                            "model": model_name,
                            "generatedAt": datetime.now().isoformat(),
                            "mediaId": str(media_id)
                        }
                        
                        return SuccessResponse(
                            success=True,
                            data=response_data
                        )
        
        raise HTTPException(status_code=500, detail="Image editing failed")
        
    except HTTPException:
        raise
    except Exception as e:
        raise HTTPException(status_code=500, detail=str(e))

