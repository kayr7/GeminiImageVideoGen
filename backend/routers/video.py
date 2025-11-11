"""
Video generation endpoints using Google Gemini Python SDK with Veo
Documentation: https://ai.google.dev/gemini-api/docs/video
"""

from fastapi import APIRouter, HTTPException, Query, Request, Depends
from google import genai
from google.genai import types
import os
import time
import base64
from datetime import datetime
from typing import Dict, Optional, Tuple

from models import (
    VideoGenerationRequest,
    VideoAnimateRequest,
    VideoResponse,
    SuccessResponse,
    LoginUser,
)
from utils.config import resolve_model_choice
from utils.media_storage import get_media_storage
from utils.video_queue import get_video_queue
from utils.rate_limiter import check_rate_limit
from utils.auth import get_current_user_with_db
from utils.user_manager import User
from utils.quota_manager import QuotaManager

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


def extract_base64_bytes(image_data: str) -> tuple[bytes, str]:
    """Extract base64 data from data URL and convert to bytes, also return mime type"""
    # Extract mime type from data URL if present
    mime_type = "image/png"  # Default

    if "," in image_data:
        # Format: data:image/png;base64,<base64_string>
        header, base64_str = image_data.split(",", 1)
        if ":" in header and ";" in header:
            mime_type = header.split(":")[1].split(";")[0]
    else:
        base64_str = image_data

    # Decode base64 string to bytes
    image_bytes = base64.b64decode(base64_str)
    return image_bytes, mime_type


def create_image_from_bytes(
    image_bytes: bytes, mime_type: str = "image/png"
) -> types.Image:
    """Create a types.Image object from bytes with mime type"""
    return types.Image(imageBytes=image_bytes, mimeType=mime_type)


@router.post("/generate", response_model=SuccessResponse)
async def generate_video(
    req: VideoGenerationRequest,
    request: Request,
    auth: Tuple[LoginUser, User] = Depends(get_current_user_with_db),
):
    """
    Generate a video from a text prompt
    Supports:
    - Negative prompts (what NOT to include)
    - First frame (image as starting frame)
    - Last frame (image as ending frame)
    - Reference images (up to 3, for visual guidance - not as frames)

    Requires authentication and checks user quotas.
    See: https://ai.google.dev/gemini-api/docs/video
    """
    try:
        login_user, db_user = auth

        # Get client IP for abuse tracking
        client_ip = get_client_ip(request)

        # Check quota before generation
        has_quota, error_msg = QuotaManager.check_quota(db_user.id, "video")
        if not has_quota:
            raise HTTPException(status_code=429, detail=error_msg)

        # Check rate limit
        await check_rate_limit(db_user.id, "video")

        client = get_client()

        requested_model_id = (req.model or "").strip()

        try:
            model_info = resolve_model_choice("video", req.model)
        except LookupError as error:
            status_code = 400 if requested_model_id else 503
            raise HTTPException(status_code=status_code, detail=str(error))
        model_name = model_info["id"]

        # Check if advanced features are supported by this model
        # Reference images are only supported by veo-3.1-generate-preview (not fast variant)
        supports_reference_images = "fast" not in model_name.lower()

        # Build config for advanced options
        config_kwargs = {}

        # Add negative prompt if provided
        if req.negativePrompt:
            config_kwargs["negativePrompt"] = req.negativePrompt

        # Add last frame if provided (ending frame) - goes in config
        if req.lastFrame:
            image_bytes, mime_type = extract_base64_bytes(req.lastFrame)
            config_kwargs["lastFrame"] = create_image_from_bytes(image_bytes, mime_type)

        # Add reference images if provided (up to 3, for content/style guidance) - goes in config
        # NOTE: Reference images are only supported by veo-3.1-generate-preview, NOT fast variants
        if req.referenceImages and len(req.referenceImages) > 0:
            if not supports_reference_images:
                raise HTTPException(
                    status_code=400,
                    detail=f"Reference images are not supported by {model_name}. "
                    "Please use 'veo-3.1-generate-preview' (standard, not fast) for reference image support.",
                )

            reference_images = []
            for img_data in req.referenceImages[:3]:  # Max 3 images
                image_bytes, mime_type = extract_base64_bytes(img_data)
                # Create VideoGenerationReferenceImage objects
                # Don't specify referenceType - let the API use default behavior
                ref_img = types.VideoGenerationReferenceImage(
                    image=create_image_from_bytes(image_bytes, mime_type)
                )
                reference_images.append(ref_img)
            config_kwargs["referenceImages"] = reference_images

        # Create config if we have any advanced options
        config = types.GenerateVideosConfig(**config_kwargs) if config_kwargs else None

        # Build kwargs for generate_videos
        kwargs = {
            "model": model_name,
            "prompt": req.prompt,
        }

        # Add first frame if provided (starting frame) - goes as 'image' parameter
        if req.firstFrame:
            image_bytes, mime_type = extract_base64_bytes(req.firstFrame)
            kwargs["image"] = create_image_from_bytes(image_bytes, mime_type)

        # Add config if we have one
        if config:
            kwargs["config"] = config

        # Start video generation (this returns an operation)
        print(f"Starting video generation with model: {model_name}")
        print(f"Config: {config_kwargs if config_kwargs else 'None'}")
        operation = client.models.generate_videos(**kwargs)

        # Create job in queue
        queue = get_video_queue()
        job = queue.create_job(
            {
                "userId": db_user.id,  # Real user ID
                "prompt": req.prompt,
                "model": model_name,
                "mode": "text",
                "status": "processing",
                "progress": 0,
                "jobId": operation.name,
                "ipAddress": client_ip,  # Track IP for abuse prevention
                "details": {
                    "mode": "text",
                    "negativePrompt": req.negativePrompt,
                    "firstFrame": req.firstFrame,
                    "lastFrame": req.lastFrame,
                    "referenceImages": req.referenceImages,
                },
            }
        )

        print(f"Video generation started. Operation: {operation.name}")

        return SuccessResponse(
            success=True,
            data={
                "jobId": operation.name,
                "status": "processing",
                "progress": 0,
                "generatedAt": datetime.now().isoformat(),
                "message": "Video generation started. Use /api/video/status to check progress.",
            },
        )

    except HTTPException:
        raise
    except Exception as e:
        print(f"Video generation error: {str(e)}")
        raise HTTPException(status_code=500, detail=str(e))


@router.post("/animate", response_model=SuccessResponse)
async def animate_image(
    req: VideoAnimateRequest,
    request: Request,
    auth: Tuple[LoginUser, User] = Depends(get_current_user_with_db),
):
    """
    Animate a still image into a video
    Uses the image as the first frame
    Requires authentication and checks user quotas.
    """
    try:
        login_user, db_user = auth

        # Get client IP for abuse tracking
        client_ip = get_client_ip(request)

        # Check quota before generation
        has_quota, error_msg = QuotaManager.check_quota(db_user.id, "video")
        if not has_quota:
            raise HTTPException(status_code=429, detail=error_msg)

        # Check rate limit
        await check_rate_limit(db_user.id, "video")

        if not req.sourceImages or len(req.sourceImages) == 0:
            raise HTTPException(
                status_code=400, detail="At least one source image is required"
            )

        client = get_client()

        requested_model_id = (req.model or "").strip()

        try:
            model_info = resolve_model_choice("video", req.model)
        except LookupError as error:
            status_code = 400 if requested_model_id else 503
            raise HTTPException(status_code=status_code, detail=str(error))
        model_name = model_info["id"]

        # Use first image as the starting frame
        image_bytes = extract_base64_bytes(req.sourceImages[0])

        # Build kwargs for generate_videos
        kwargs = {
            "model": model_name,
            "prompt": req.prompt or "Animate this image with smooth motion",
            "first_frame": image_bytes,
        }

        # Add negative prompt if provided
        if req.negativePrompt:
            kwargs["negative_prompt"] = req.negativePrompt

        # Add additional source images as reference images if provided
        if len(req.sourceImages) > 1:
            reference_images = []
            for img_data in req.sourceImages[1:4]:  # Max 3 additional images
                img_bytes = extract_base64_bytes(img_data)
                reference_images.append(img_bytes)
            kwargs["reference_images"] = reference_images

        # Start video generation
        print(f"Starting image animation with model: {kwargs['model']}")
        operation = client.models.generate_videos(**kwargs)

        # Create job in queue
        queue = get_video_queue()
        job = queue.create_job(
            {
                "userId": db_user.id,  # Real user ID
                "prompt": req.prompt or "Animate this image",
                "model": model_name,
                "mode": "animate",
                "status": "processing",
                "progress": 0,
                "jobId": operation.name,
                "ipAddress": client_ip,  # Track IP for abuse prevention
                "details": {
                    "mode": "animate",
                    "negativePrompt": req.negativePrompt,
                    "sourceImages": req.sourceImages,
                },
            }
        )

        print(f"Video animation started. Operation: {operation.name}")

        return SuccessResponse(
            success=True,
            data={
                "jobId": operation.name,
                "status": "processing",
                "progress": 0,
                "generatedAt": datetime.now().isoformat(),
                "message": "Video animation started. Use /api/video/status to check progress.",
            },
        )

    except HTTPException:
        raise
    except Exception as e:
        print(f"Video animation error: {str(e)}")
        raise HTTPException(status_code=500, detail=str(e))


@router.get("/status", response_model=SuccessResponse)
async def check_video_status(
    jobId: str = Query(..., description="Operation ID from video generation")
):
    """
    Check the status of a video generation job
    """
    try:
        client = get_client()
        queue = get_video_queue()

        # Get operation status from Google
        print(f"Checking status for operation: {jobId}")
        # The jobId is the operation name string (e.g., "models/veo-3.1.../operations/xxx")
        # Use the internal _get_videos_operation method with operation_name keyword argument
        operation = client.operations._get_videos_operation(operation_name=jobId)

        # The operation is returned as a dict, not an object
        print(f"Operation response type: {type(operation)}")
        print(
            f"Operation keys: {operation.keys() if isinstance(operation, dict) else 'N/A'}"
        )

        # Check if operation is complete
        is_done = (
            operation.get("done", False)
            if isinstance(operation, dict)
            else getattr(operation, "done", False)
        )

        if not is_done:
            # Still processing
            queue.update_job(jobId, {"status": "processing", "progress": 50})

            return SuccessResponse(
                success=True,
                data={
                    "jobId": jobId,
                    "status": "processing",
                    "progress": 50,
                    "message": "Video generation in progress...",
                },
            )

        # Check for errors
        error = (
            operation.get("error")
            if isinstance(operation, dict)
            else getattr(operation, "error", None)
        )
        if error:
            error_message = str(error)
            queue.update_job(jobId, {"status": "failed", "error": error_message})

            return SuccessResponse(
                success=True,
                data={"jobId": jobId, "status": "failed", "error": error_message},
            )

        # Video is ready - download it
        print(f"Video generation complete for operation: {jobId}")

        # Extract response from dict or object
        response = (
            operation.get("response")
            if isinstance(operation, dict)
            else getattr(operation, "response", None)
        )
        if not response:
            raise Exception("No response in completed operation")

        print(f"Response type: {type(response)}")
        print(f"Response content: {response}")

        # Try multiple possible keys for generated videos
        generated_videos = None
        if isinstance(response, dict):
            generated_videos = (
                response.get("generatedVideos")
                or response.get("generated_videos")
                or response.get("generateVideoResponse", {}).get("generatedSamples")
            )
        else:
            generated_videos = getattr(response, "generated_videos", None) or getattr(
                response, "generatedVideos", None
            )
        if not generated_videos or len(generated_videos) == 0:
            raise Exception("No generated videos in response")

        generated_video = generated_videos[0]

        # Extract video reference
        video_ref = (
            generated_video.get("video")
            if isinstance(generated_video, dict)
            else getattr(generated_video, "video", None)
        )
        if not video_ref:
            raise Exception("No video reference in generated video")

        print(f"Video reference: {video_ref}")

        # Download the video file - video_ref might be a dict with 'uri' or an object
        if isinstance(video_ref, dict) and "uri" in video_ref:
            # Use the URI to download
            video_uri = video_ref["uri"]
            print(f"Downloading from URI: {video_uri}")
            # Use requests to download from URI
            import requests

            response = requests.get(
                video_uri, headers={"x-goog-api-key": os.getenv("GEMINI_API_KEY")}
            )
            response.raise_for_status()
            video_bytes = response.content
        else:
            # Try using client.files.download
            video_file = client.files.download(file=video_ref)
            video_bytes = (
                video_file.read()
                if hasattr(video_file, "read")
                else video_ref.get("videoBytes", b"")
            )

        # Convert to base64
        video_base64 = base64.b64encode(video_bytes).decode("utf-8")

        # Save to storage with metadata from the original request
        storage = get_media_storage()
        job_data = queue.get_job(jobId)

        prompt_for_metadata = (job_data or {}).get("prompt") or "Video generation"
        model_for_metadata = (job_data or {}).get("model") or "veo"
        user_id = (job_data or {}).get("userId") or "anonymous"

        details: Dict[str, object] = {}
        if job_data:
            if job_data.get("mode"):
                details["mode"] = job_data.get("mode")

            job_details = job_data.get("details")
            if isinstance(job_details, dict):
                for key, value in job_details.items():
                    if value is not None:
                        details[key] = value

        # Get IP address from job data
        ip_address = job_data.get("ipAddress")

        metadata_payload = {
            "prompt": prompt_for_metadata,
            "model": model_for_metadata,
            "userId": user_id,
            "mimeType": "video/mp4",
            "ipAddress": ip_address,  # Track IP for abuse prevention
        }
        if details:
            metadata_payload["details"] = details

        media_id = storage.save_media(
            media_type="video",
            base64_data=video_base64,
            metadata=metadata_payload,
        )

        print(f"Video saved with ID: {media_id}")

        # Increment quota after successful video generation
        QuotaManager.increment_quota(user_id, "video")

        # Update job
        queue.update_job(
            jobId,
            {
                "status": "completed",
                "progress": 100,
                "videoUrl": f"data:video/mp4;base64,{video_base64}",
                "videoData": video_base64,
                "mediaId": media_id,
            },
        )

        return SuccessResponse(
            success=True,
            data={
                "jobId": jobId,
                "status": "completed",
                "progress": 100,
                "videoUrl": f"data:video/mp4;base64,{video_base64}",
                "videoData": video_base64,
                "mediaId": media_id,
                "message": "Video generation completed successfully!",
            },
        )

    except HTTPException:
        raise
    except Exception as e:
        print(f"Error checking video status: {str(e)}")
        raise HTTPException(status_code=500, detail=str(e))


@router.get("/jobs", response_model=SuccessResponse)
async def list_video_jobs():
    """
    List all video generation jobs
    """
    try:
        queue = get_video_queue()
        jobs = queue.list_jobs("anonymous")

        return SuccessResponse(success=True, data={"jobs": jobs})

    except Exception as e:
        raise HTTPException(status_code=500, detail=str(e))


@router.get("/jobs/{job_id}", response_model=SuccessResponse)
async def get_video_job(job_id: str):
    """
    Get a specific video generation job
    """
    try:
        queue = get_video_queue()
        job = queue.get_job(job_id)

        if not job:
            raise HTTPException(status_code=404, detail="Job not found")

        return SuccessResponse(success=True, data=job)

    except HTTPException:
        raise
    except Exception as e:
        raise HTTPException(status_code=500, detail=str(e))
