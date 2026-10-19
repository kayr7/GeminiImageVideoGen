"""
Video generation endpoints using the Google Gemini Python SDK with Veo.
Documentation: https://ai.google.dev/gemini-api/docs/video

Finished videos are stored in the media store (see utils/media_storage.py); the
video_jobs table only keeps the job state and the resulting ``mediaId``. The
/status and /jobs/{id} endpoints still return the video as a ``data:`` URL
because the frontend feeds it straight into ``<video src>``, which cannot send
the Bearer header required by GET /api/media/{id}.
"""

import logging
import threading
from collections import defaultdict
from datetime import datetime
from typing import Any, Dict, List, Optional, Tuple

from fastapi import APIRouter, Depends, HTTPException, Query, Request
from fastapi.concurrency import run_in_threadpool
from google.genai import types

from models import (
    LoginUser,
    SuccessResponse,
    VideoAnimateRequest,
    VideoGenerationRequest,
)
from utils.auth import get_current_user_with_db
from utils.config import resolve_model_choice
from utils.gemini import decode_data_url, get_client, get_client_ip, to_base64
from utils.media_storage import get_media_storage
from utils.quota_manager import QuotaManager
from utils.rate_limiter import check_rate_limit
from utils.user_manager import User
from utils.video_frame_extractor import extract_frames
from utils.video_queue import get_video_queue

logger = logging.getLogger(__name__)

router = APIRouter()

AuthTuple = Tuple[LoginUser, User]

MAX_REFERENCE_IMAGES = 3

# One lock per job id so concurrent polls (e.g. two tabs) finalise a job only once.
_finalize_locks: Dict[str, threading.Lock] = defaultdict(threading.Lock)
_finalize_locks_guard = threading.Lock()


def _job_lock(job_id: str) -> threading.Lock:
    with _finalize_locks_guard:
        return _finalize_locks[job_id]


def _to_image(data_url: str) -> types.Image:
    image_bytes, mime_type = decode_data_url(data_url)
    return types.Image(image_bytes=image_bytes, mime_type=mime_type)


def _to_reference_images(images: List[str]) -> List[types.VideoGenerationReferenceImage]:
    return [
        types.VideoGenerationReferenceImage(image=_to_image(img), reference_type="asset")
        for img in images[:MAX_REFERENCE_IMAGES]
    ]


def _resolve_video_model(requested: Optional[str]) -> Dict[str, Any]:
    try:
        return resolve_model_choice("video", requested)
    except LookupError as error:
        status_code = 400 if (requested or "").strip() else 503
        raise HTTPException(status_code=status_code, detail=str(error))


def _require_frame_support(model_info: Dict[str, Any], feature: str) -> None:
    ref_config = model_info.get("capabilities", {}).get("video_reference_images", {})
    if not ref_config.get("enabled", False):
        raise HTTPException(
            status_code=400,
            detail=f"{feature} is not supported by {model_info['id']}. "
            f"Please use 'veo-3.1-generate-preview' (standard, not fast) for {feature.lower()} support.",
        )


async def _start_video_job(
    *,
    auth: AuthTuple,
    request: Request,
    model_info: Dict[str, Any],
    prompt: str,
    mode: str,
    details: Dict[str, Any],
    image: Optional[types.Image] = None,
    config: Optional[types.GenerateVideosConfig] = None,
    message: str,
) -> SuccessResponse:
    """Start a Veo operation, record it as a job and build the API response."""
    _, db_user = auth
    model_name = model_info["id"]

    client = get_client()
    kwargs: Dict[str, Any] = {"model": model_name, "prompt": prompt}
    if image is not None:
        kwargs["image"] = image
    if config is not None:
        kwargs["config"] = config

    logger.info("Starting %s video generation (model=%s, user=%s)", mode, model_name, db_user.id)
    operation = await run_in_threadpool(lambda: client.models.generate_videos(**kwargs))

    get_video_queue().create_job(
        {
            "userId": db_user.id,
            "prompt": prompt,
            "model": model_name,
            "mode": mode,
            "status": "processing",
            "progress": 0,
            "jobId": operation.name,
            "ipAddress": get_client_ip(request),  # abuse tracking
            "details": {"mode": mode, **details},
        }
    )

    return SuccessResponse(
        success=True,
        data={
            "jobId": operation.name,
            "status": "processing",
            "progress": 0,
            "generatedAt": datetime.now().isoformat(),
            "message": message,
        },
    )


async def _precheck(auth: AuthTuple) -> None:
    """Quota and rate-limit checks shared by all job-creating endpoints."""
    _, db_user = auth
    has_quota, error_msg = QuotaManager.check_quota(db_user.id, "video")
    if not has_quota:
        raise HTTPException(status_code=429, detail=error_msg)
    await check_rate_limit(db_user.id, "video")


@router.post("/generate", response_model=SuccessResponse)
async def generate_video(
    req: VideoGenerationRequest,
    request: Request,
    auth: AuthTuple = Depends(get_current_user_with_db),
):
    """
    Generate a video from a text prompt.

    Supports a negative prompt, a first frame, a last frame and up to 3
    reference images. Veo does not allow last frame + reference images together.
    Requires authentication and checks user quotas.
    """
    await _precheck(auth)
    model_info = _resolve_video_model(req.model)

    if req.lastFrame and req.referenceImages:
        raise HTTPException(
            status_code=400,
            detail="Cannot use last frame and reference images together. "
            "Use either: (1) first+last frames for interpolation, OR (2) first frame+reference images for style-guided generation. "
            "See: https://ai.google.dev/gemini-api/docs/video",
        )

    config_kwargs: Dict[str, Any] = {}
    image = None
    try:
        if req.negativePrompt:
            config_kwargs["negative_prompt"] = req.negativePrompt
        if req.lastFrame:
            _require_frame_support(model_info, "Last frame")
            config_kwargs["last_frame"] = _to_image(req.lastFrame)
        if req.referenceImages:
            _require_frame_support(model_info, "Reference images")
            config_kwargs["reference_images"] = _to_reference_images(req.referenceImages)
        if req.firstFrame:
            _require_frame_support(model_info, "First frame")
            image = _to_image(req.firstFrame)
    except HTTPException:
        raise
    except Exception as e:
        raise HTTPException(status_code=400, detail=f"Invalid image data: {e}")

    try:
        return await _start_video_job(
            auth=auth,
            request=request,
            model_info=model_info,
            prompt=req.prompt,
            mode="text",
            details={
                "negativePrompt": req.negativePrompt,
                "firstFrame": req.firstFrame,
                "lastFrame": req.lastFrame,
                "referenceImages": req.referenceImages,
            },
            image=image,
            config=types.GenerateVideosConfig(**config_kwargs) if config_kwargs else None,
            message="Video generation started. Use /api/video/status to check progress.",
        )
    except HTTPException:
        raise
    except Exception as e:
        logger.exception("Video generation failed to start")
        raise HTTPException(status_code=500, detail=str(e))


@router.post("/animate", response_model=SuccessResponse)
async def animate_image(
    req: VideoAnimateRequest,
    request: Request,
    auth: AuthTuple = Depends(get_current_user_with_db),
):
    """
    Animate a still image into a video (the first image is the first frame,
    up to 3 more are used as reference images).
    Requires authentication and checks user quotas.
    """
    await _precheck(auth)

    if not req.sourceImages:
        raise HTTPException(status_code=400, detail="At least one source image is required")

    model_info = _resolve_video_model(req.model)

    config_kwargs: Dict[str, Any] = {}
    if req.negativePrompt:
        config_kwargs["negative_prompt"] = req.negativePrompt
    try:
        image = _to_image(req.sourceImages[0])
        if len(req.sourceImages) > 1:
            config_kwargs["reference_images"] = _to_reference_images(req.sourceImages[1:])
    except Exception as e:
        raise HTTPException(status_code=400, detail=f"Invalid image data: {e}")

    prompt = req.prompt or "Animate this image with smooth motion"
    try:
        return await _start_video_job(
            auth=auth,
            request=request,
            model_info=model_info,
            prompt=prompt,
            mode="animate",
            details={
                "negativePrompt": req.negativePrompt,
                "sourceImages": req.sourceImages,
            },
            image=image,
            config=types.GenerateVideosConfig(**config_kwargs) if config_kwargs else None,
            message="Video animation started. Use /api/video/status to check progress.",
        )
    except HTTPException:
        raise
    except Exception as e:
        logger.exception("Video animation failed to start")
        raise HTTPException(status_code=500, detail=str(e))


# ---------------------------------------------------------------------------
# Job access helpers
# ---------------------------------------------------------------------------


def _get_owned_job(job_id: str, auth: AuthTuple) -> Dict[str, Any]:
    """Return the job if the caller owns it (or is admin); 404 otherwise."""
    login_user, db_user = auth
    job = get_video_queue().get_job(job_id)
    is_admin = "admin" in (login_user.roles or [])
    if not job or (job["userId"] != db_user.id and not is_admin):
        raise HTTPException(status_code=404, detail="Job not found")
    return job


def _public_job(job: Dict[str, Any]) -> Dict[str, Any]:
    """Job fields safe/cheap to return (no input images, no video bytes)."""
    public = {k: v for k, v in job.items() if k not in ("details", "ipAddress")}
    for key in ("createdAt", "updatedAt", "completedAt"):
        if hasattr(public.get(key), "isoformat"):
            public[key] = public[key].isoformat()
    return public


def _stored_video_payload(job: Dict[str, Any]) -> Dict[str, Any]:
    """Load a completed job's video from the media store as the frontend expects it."""
    payload: Dict[str, Any] = {}
    media_id = job.get("mediaId")
    result = get_media_storage().get_media(media_id) if media_id else None
    if result:
        video_base64 = to_base64(result["data"])
        payload["videoUrl"] = f"data:video/mp4;base64,{video_base64}"
        payload["videoData"] = video_base64
    return payload


def _completed_response(job: Dict[str, Any], message: str) -> Dict[str, Any]:
    return {
        "jobId": job["jobId"],
        "status": "completed",
        "progress": 100,
        "mediaId": job.get("mediaId"),
        **_stored_video_payload(job),
        "message": message,
    }


def _failed_response(job_id: str, error: Optional[str]) -> Dict[str, Any]:
    return {"jobId": job_id, "status": "failed", "error": error}


# ---------------------------------------------------------------------------
# Status / finalisation
# ---------------------------------------------------------------------------


def _finalize_video(job: Dict[str, Any], generated_video: types.GeneratedVideo) -> Dict[str, Any]:
    """Download the finished video, store it, charge quota and mark the job completed."""
    client = get_client()
    video = generated_video.video
    if video is None:
        raise RuntimeError("No video reference in generated video")

    video_bytes = video.video_bytes or client.files.download(file=video)
    video_base64 = to_base64(video_bytes)
    first_frame, last_frame = extract_frames(video_bytes)

    user_id = job["userId"]
    details = {k: v for k, v in (job.get("details") or {}).items() if v is not None}
    if job.get("mode"):
        details["mode"] = job["mode"]
    metadata: Dict[str, Any] = {
        "prompt": job.get("prompt") or "Video generation",
        "model": job.get("model") or "veo",
        "userId": user_id,
        "mimeType": "video/mp4",
        "ipAddress": job.get("ipAddress"),
    }
    if details:
        metadata["details"] = details

    storage = get_media_storage()
    media_id = storage.save_media(media_type="video", base64_data=video_base64, metadata=metadata)
    if first_frame:
        storage.save_thumbnail(media_id, first_frame)

    QuotaManager.increment_quota(user_id, "video")
    get_video_queue().update_job(
        job["jobId"], {"status": "completed", "progress": 100, "mediaId": media_id}
    )
    logger.info("Video job %s completed (media %s)", job["jobId"], media_id)

    return {
        "jobId": job["jobId"],
        "status": "completed",
        "progress": 100,
        "videoUrl": f"data:video/mp4;base64,{video_base64}",
        "videoData": video_base64,
        "mediaId": media_id,
        "firstFrameData": first_frame,
        "lastFrameData": last_frame,
        "message": "Video generation completed successfully!",
    }


def _poll_operation(job: Dict[str, Any]) -> Dict[str, Any]:
    """Ask Google about an unfinished job and update/finalise it. Caller holds the job lock."""
    job_id = job["jobId"]
    queue = get_video_queue()
    operation = get_client().operations.get(types.GenerateVideosOperation(name=job_id))

    if not operation.done:
        queue.update_job(job_id, {"status": "processing", "progress": 50})
        return {
            "jobId": job_id,
            "status": "processing",
            "progress": 50,
            "message": "Video generation in progress...",
        }

    if operation.error:
        error_message = str(operation.error)
        queue.update_job(job_id, {"status": "failed", "error": error_message})
        return _failed_response(job_id, error_message)

    response = operation.response
    if response is None:
        raise RuntimeError("No response in completed operation")

    if not response.generated_videos:
        reasons = response.rai_media_filtered_reasons
        if reasons:
            error_message = f"Video generation filtered: {reasons[0]}"
            queue.update_job(job_id, {"status": "failed", "error": error_message})
            return _failed_response(job_id, error_message)
        raise RuntimeError("No generated videos in response")

    return _finalize_video(job, response.generated_videos[0])


@router.get("/status", response_model=SuccessResponse)
def check_video_status(
    jobId: str = Query(..., description="Operation ID from video generation"),
    auth: AuthTuple = Depends(get_current_user_with_db),
):
    """
    Check the status of a video generation job (idempotent).

    Finished jobs are answered from the stored result without contacting Google.
    """
    job = _get_owned_job(jobId, auth)

    try:
        with _job_lock(job["jobId"]):
            # Re-read inside the lock: another request may have just finalised it.
            job = _get_owned_job(jobId, auth)
            if job["status"] == "completed":
                data = _completed_response(job, "Video generation completed successfully!")
            elif job["status"] == "failed":
                data = _failed_response(job["jobId"], job.get("error"))
            else:
                data = _poll_operation(job)
        return SuccessResponse(success=True, data=data)
    except HTTPException:
        raise
    except Exception as e:
        logger.exception("Error checking video status for %s", jobId)
        raise HTTPException(status_code=500, detail=str(e))


@router.get("/jobs", response_model=SuccessResponse)
def list_video_jobs(auth: AuthTuple = Depends(get_current_user_with_db)):
    """List the current user's video jobs (without video data; use mediaId or /jobs/{id})."""
    _, db_user = auth
    jobs = get_video_queue().list_jobs(db_user.id)
    return SuccessResponse(success=True, data={"jobs": [_public_job(job) for job in jobs]})


@router.get("/jobs/{job_id:path}", response_model=SuccessResponse)
def get_video_job(job_id: str, auth: AuthTuple = Depends(get_current_user_with_db)):
    """Get one of the current user's jobs; completed jobs include the video as a data URL."""
    job = _get_owned_job(job_id, auth)
    data = _public_job(job)
    if job["status"] == "completed":
        data.update(_stored_video_payload(job))
    return SuccessResponse(success=True, data=data)
