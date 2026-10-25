"""
Video generation endpoints using Gemini Omni Flash via the Interactions API.
Documentation: https://ai.google.dev/gemini-api/docs/omni

Jobs run in Omni's background mode: POST /generate (or /animate) creates a
stored background interaction and records its id in ``operation_id``; GET
/status polls ``interactions.get`` under a per-job lock and, once the video is
ready, stores it exactly once (media + thumbnail + quota).

Finished videos are stored in the media store (see utils/media_storage.py); the
video_jobs table only keeps the job state and the resulting ``mediaId``. The
/status and /jobs/{id} endpoints still return the video as a ``data:`` URL
because the frontend feeds it straight into ``<video src>``, which cannot send
the Bearer header required by GET /api/media/{id}.
"""

import base64
import binascii
import logging
import threading
import time
import uuid
from collections import defaultdict
from datetime import datetime
from typing import Any, Dict, List, Optional, Tuple

from fastapi import APIRouter, Depends, HTTPException, Query, Request
from fastapi.concurrency import run_in_threadpool

from models import (
    LoginUser,
    SuccessResponse,
    VideoAnimateRequest,
    VideoGenerationRequest,
)
from utils.auth import get_current_user_with_db
from utils.config import (
    VIDEO_DEFAULT_DURATION,
    VIDEO_MAX_DURATION,
    VIDEO_MIN_DURATION,
    get_model_registry,
    resolve_model_choice,
)
from utils.gemini import get_client_ip, get_video_client, split_data_url, to_base64
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
CREATE_TIMEOUT_SECONDS = 120  # background create returns in ~2 s
GET_TIMEOUT_SECONDS = 300  # a finished interaction carries the video inline (base64)
_PENDING_STATUSES = {"in_progress", "queued"}

# One lock per job id so concurrent polls (e.g. two tabs) finalise a job only once.
_finalize_locks: Dict[str, threading.Lock] = defaultdict(threading.Lock)
_finalize_locks_guard = threading.Lock()


def _job_lock(job_id: str) -> threading.Lock:
    with _finalize_locks_guard:
        return _finalize_locks[job_id]


# ---------------------------------------------------------------------------
# Request validation / Omni input building
# ---------------------------------------------------------------------------


def _resolve_video_model(requested: Optional[str]) -> Dict[str, Any]:
    try:
        return resolve_model_choice("video", requested)
    except LookupError as error:
        status_code = 400 if (requested or "").strip() else 503
        raise HTTPException(status_code=status_code, detail=str(error))


def _require_frame_support(model_info: Dict[str, Any], feature: str) -> None:
    """Reject first/last frame or reference-image input the chosen model does not support."""
    ref_config = model_info.get("capabilities", {}).get("video_reference_images", {})
    if feature.lower().startswith("reference"):
        supported = ref_config.get("supports_reference_images", ref_config.get("enabled", False))
    elif feature.lower().startswith("last"):
        supported = ref_config.get("supports_end_frame", ref_config.get("enabled", False))
    else:
        supported = ref_config.get("supports_start_frame", ref_config.get("enabled", False))
    if not supported:
        raise HTTPException(
            status_code=400, detail=f"{feature} is not supported by {model_info['id']}."
        )


def _choice(value: Optional[str], allowed: List[str], default: str, label: str, model_id: str) -> str:
    value = (value or "").strip() or default
    if allowed and value not in allowed:
        raise HTTPException(
            status_code=400,
            detail=f"{label} '{value}' is not supported by {model_id}. "
            f"Supported: {', '.join(allowed)}.",
        )
    return value


def _duration(value: Any, capabilities: Dict[str, Any], model_id: str) -> int:
    if value is None or (isinstance(value, str) and not value.strip()):
        return int(capabilities.get("default_duration") or VIDEO_DEFAULT_DURATION)
    try:
        seconds = int(str(value).strip().rstrip("sS"))
    except ValueError:
        raise HTTPException(status_code=400, detail=f"Invalid duration '{value}'.")
    if not VIDEO_MIN_DURATION <= seconds <= VIDEO_MAX_DURATION:
        raise HTTPException(
            status_code=400,
            detail=f"Duration {seconds}s is not supported by {model_id}. "
            f"Choose {VIDEO_MIN_DURATION}-{VIDEO_MAX_DURATION} seconds.",
        )
    return seconds


def _output_options(req: Any, model_info: Dict[str, Any]) -> Dict[str, Any]:
    """Validate aspect ratio / resolution / duration against the model capabilities."""
    caps = model_info.get("capabilities", {})
    model_id = model_info["id"]
    return {
        "aspectRatio": _choice(
            req.aspectRatio, caps.get("aspect_ratios", []), "16:9", "Aspect ratio", model_id
        ),
        "resolution": _choice(
            req.resolution, caps.get("resolutions", []),
            caps.get("default_resolution", "720p"), "Resolution", model_id,
        ),
        "durationSeconds": _duration(req.durationSeconds, caps, model_id),
    }


def _image_item(data_url: str) -> Dict[str, str]:
    """Interactions API image input from a data URL / base64 string (validated)."""
    payload, mime_type = split_data_url(data_url)
    try:
        base64.b64decode(payload, validate=True)
    except (binascii.Error, ValueError) as error:
        raise HTTPException(status_code=400, detail=f"Invalid image data: {error}")
    return {"type": "image", "data": payload, "mime_type": mime_type}


def _image_roles_hint(first: bool, last: bool, ref_count: int) -> str:
    """Spell out what each attached image is for (Omni infers roles from the prompt)."""
    roles: List[str] = []
    index = 1
    if first:
        roles.append(f"image {index} is the first frame of the video")
        index += 1
    if last:
        roles.append(f"image {index} is the last frame of the video")
        index += 1
    if ref_count:
        span = f"image {index}" if ref_count == 1 else f"images {index}-{index + ref_count - 1}"
        roles.append(
            f"{span} {'is a reference' if ref_count == 1 else 'are references'} for "
            "subjects, characters and style (not frames)"
        )
    if not roles:
        return ""
    hint = "Input images: " + "; ".join(roles) + "."
    if first and last:
        hint += " Animate a smooth transition from the first to the last frame."
    return hint


def _video_mode(first: bool, last: bool, ref_count: int) -> str:
    if not (first or last or ref_count):
        return "text-to-video"
    if ref_count and not (first or last):
        return "reference-to-video"
    if first and last:
        return "first-last-frame"
    return "image-to-video"


def _build_input(
    prompt: str,
    negative_prompt: Optional[str],
    first_frame: Optional[str],
    last_frame: Optional[str],
    reference_images: List[str],
) -> Tuple[Any, str]:
    """Return (Interactions ``input``, full prompt text sent to the model)."""
    text = prompt.strip()
    hint = _image_roles_hint(bool(first_frame), bool(last_frame), len(reference_images))
    if hint:
        text += "\n\n" + hint
    if negative_prompt and negative_prompt.strip():
        # Omni has no negative-prompt field; the docs recommend stating it in the prompt.
        text += "\n\nAvoid: " + negative_prompt.strip()

    images = [img for img in (first_frame, last_frame) if img] + list(reference_images)
    if not images:
        return text, text
    return [*(_image_item(img) for img in images), {"type": "text", "text": text}], text


# ---------------------------------------------------------------------------
# Errors from the Interactions API
# ---------------------------------------------------------------------------


def _api_status(error: Exception) -> Optional[int]:
    status = getattr(error, "status_code", None) or getattr(error, "code", None)
    return status if isinstance(status, int) else None


def _api_message(error: Exception) -> str:
    body = getattr(error, "body", None)
    if isinstance(body, dict):
        inner = body.get("error")
        if isinstance(inner, dict) and inner.get("message"):
            return str(inner["message"])
    return str(getattr(error, "message", None) or error)


def _create_error(error: Exception) -> HTTPException:
    """Map an exception from interactions.create to an HTTP error (no job is created)."""
    status = _api_status(error)
    message = _api_message(error)
    if status == 400:
        logger.warning("Omni rejected the video request: %s", message)
        return HTTPException(status_code=400, detail=f"The video model rejected the request: {message}")
    if status == 429:
        return HTTPException(
            status_code=429,
            detail="The video service is busy or the API quota is exhausted. Please try again later.",
        )
    if status in (401, 403):
        logger.error("Omni authentication/permission error: %s", message)
        return HTTPException(status_code=502, detail=f"The video service refused access: {message}")
    logger.exception("Video generation failed to start")
    return HTTPException(
        status_code=502, detail=f"The video service could not start the job: {message}"
    )


# ---------------------------------------------------------------------------
# Job creation
# ---------------------------------------------------------------------------


async def _start_video_job(
    *,
    auth: AuthTuple,
    request: Request,
    model_info: Dict[str, Any],
    prompt: str,
    input_payload: Any,
    options: Dict[str, Any],
    mode: str,
    details: Dict[str, Any],
    message: str,
) -> SuccessResponse:
    """Create an Omni background interaction, record it as a job and build the response."""
    _, db_user = auth
    model_name = model_info["id"]
    client = get_video_client()
    response_format = {
        "type": "video",
        "aspect_ratio": options["aspectRatio"],
        "resolution": options["resolution"],
        "duration": f"{options['durationSeconds']}s",
    }

    logger.info(
        "Starting %s video generation (model=%s, user=%s, %s)",
        mode, model_name, db_user.id, response_format,
    )
    started = time.monotonic()
    try:
        interaction = await run_in_threadpool(
            lambda: client.interactions.create(
                model=model_name,
                input=input_payload,
                response_format=response_format,
                background=True,
                store=True,
                timeout=CREATE_TIMEOUT_SECONDS,
            )
        )
    except Exception as error:
        raise _create_error(error)

    job_id = str(uuid.uuid4())
    queue = get_video_queue()
    queue.create_job(
        {
            "id": job_id,
            "jobId": job_id,
            "operationId": interaction.id,
            "userId": db_user.id,
            "prompt": prompt,
            "model": model_name,
            "mode": mode,
            "status": "processing",
            "progress": 0,
            "ipAddress": get_client_ip(request),  # abuse tracking
            "details": {"mode": mode, **options, **details},
        }
    )
    logger.info(
        "Video job %s started as interaction %s (%.1fs)",
        job_id, interaction.id, time.monotonic() - started,
    )

    data: Dict[str, Any] = {
        "jobId": job_id,
        "status": "processing",
        "progress": 0,
        "generatedAt": datetime.now().isoformat(),
        "message": message,
    }
    if str(getattr(interaction, "status", "")) not in _PENDING_STATUSES:
        # Finished (or failed) immediately: settle it now instead of on the first poll.
        def settle() -> Dict[str, Any]:
            with _job_lock(job_id):
                return _apply_interaction(queue.get_job(job_id), interaction)

        data = {**data, **(await run_in_threadpool(settle))}
    return SuccessResponse(success=True, data=data)


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
    Generate a video from a text prompt with Gemini Omni Flash.

    Optional: negative prompt (appended as "Avoid: ..."), first frame, last
    frame, up to 3 reference images, aspect ratio, resolution and duration.
    Requires authentication and checks user quotas.
    """
    await _precheck(auth)
    model_info = _resolve_video_model(req.model)
    options = _output_options(req, model_info)

    references = list(req.referenceImages or [])
    max_refs = (
        model_info.get("capabilities", {}).get("video_reference_images", {}).get("max", MAX_REFERENCE_IMAGES)
    )
    if req.firstFrame:
        _require_frame_support(model_info, "First frame")
    if req.lastFrame:
        _require_frame_support(model_info, "Last frame")
    if references:
        _require_frame_support(model_info, "Reference images")
        if len(references) > max_refs:
            raise HTTPException(
                status_code=400,
                detail=f"Too many reference images: {model_info['id']} supports up to {max_refs}.",
            )

    input_payload, _ = _build_input(
        req.prompt, req.negativePrompt, req.firstFrame, req.lastFrame, references
    )
    mode = _video_mode(bool(req.firstFrame), bool(req.lastFrame), len(references))
    return await _start_video_job(
        auth=auth,
        request=request,
        model_info=model_info,
        prompt=req.prompt,
        input_payload=input_payload,
        options=options,
        mode=mode,
        details={
            "negativePrompt": req.negativePrompt,
            "firstFrame": req.firstFrame,
            "lastFrame": req.lastFrame,
            "referenceImages": references or None,
        },
        message="Video generation started. Use /api/video/status to check progress.",
    )


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
    options = _output_options(req, model_info)
    _require_frame_support(model_info, "First frame")
    references = req.sourceImages[1 : 1 + MAX_REFERENCE_IMAGES]
    if references:
        _require_frame_support(model_info, "Reference images")

    prompt = req.prompt or "Animate this image with smooth motion"
    input_payload, _ = _build_input(
        prompt, req.negativePrompt, req.sourceImages[0], None, references
    )
    return await _start_video_job(
        auth=auth,
        request=request,
        model_info=model_info,
        prompt=prompt,
        input_payload=input_payload,
        options=options,
        mode="animate",
        details={
            "negativePrompt": req.negativePrompt,
            "sourceImages": req.sourceImages,
        },
        message="Video animation started. Use /api/video/status to check progress.",
    )


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


def _fail_job(job: Dict[str, Any], message: str) -> Dict[str, Any]:
    logger.warning("Video job %s failed: %s", job["jobId"], message)
    get_video_queue().update_job(job["jobId"], {"status": "failed", "error": message})
    return _failed_response(job["jobId"], message)


# ---------------------------------------------------------------------------
# Status / finalisation
# ---------------------------------------------------------------------------


def _download_video_uri(uri: str) -> bytes:
    """Fetch a ``delivery: uri`` result via the Files API (waits until it is ACTIVE)."""
    client = get_video_client()
    name = "files/" + uri.split("files/", 1)[-1].split(":", 1)[0].split("?", 1)[0].strip("/")
    for _ in range(30):
        state = str(getattr(client.files.get(name=name), "state", "") or "")
        if state.endswith("ACTIVE"):
            break
        if state.endswith("FAILED"):
            raise RuntimeError(f"Video file {name} failed to process")
        time.sleep(2)
    return client.files.download(file=name)


def _video_bytes(video: Any) -> Optional[bytes]:
    data = getattr(video, "data", None)
    if data:
        return base64.b64decode(data) if isinstance(data, str) else bytes(data)
    uri = getattr(video, "uri", None)
    if uri:
        return _download_video_uri(uri)
    return None


def _finalize_video(job: Dict[str, Any], video_bytes: bytes) -> Dict[str, Any]:
    """Store the finished video, charge quota and mark the job completed."""
    video_base64 = to_base64(video_bytes)
    first_frame, last_frame = extract_frames(video_bytes)

    user_id = job["userId"]
    details = {k: v for k, v in (job.get("details") or {}).items() if v is not None}
    if job.get("mode"):
        details["mode"] = job["mode"]
    metadata: Dict[str, Any] = {
        "prompt": job.get("prompt") or "Video generation",
        "model": job.get("model") or "gemini-omni-1.1-flash",
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
    logger.info("Video job %s completed (media %s, %d bytes)", job["jobId"], media_id, len(video_bytes))

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


def _interaction_errors(interaction: Any) -> str:
    parts = []
    for error in getattr(interaction, "errors", None) or []:
        message = getattr(error, "message", None) or (error.get("message") if isinstance(error, dict) else None)
        code = getattr(error, "code", None) or (error.get("code") if isinstance(error, dict) else None)
        if message or code:
            parts.append(f"{message or ''}{f' ({code})' if code else ''}".strip())
    return "; ".join(parts)


def _apply_interaction(job: Dict[str, Any], interaction: Any) -> Dict[str, Any]:
    """Update/finalise a job from an Interaction snapshot. Caller holds the job lock."""
    job_id = job["jobId"]
    status = str(getattr(interaction, "status", "") or "")

    if status in _PENDING_STATUSES:
        get_video_queue().update_job(job_id, {"status": "processing", "progress": 50})
        return {
            "jobId": job_id,
            "status": "processing",
            "progress": 50,
            "message": "Video generation in progress...",
        }

    if status == "completed":
        video_bytes = _video_bytes(getattr(interaction, "output_video", None))
        if not video_bytes:
            text = (getattr(interaction, "output_text", None) or "").strip()
            message = "No video was returned (the request was possibly filtered by the safety system)."
            if text:
                message += f" The model replied: \"{text[:500]}\""
            return _fail_job(job, message)
        return _finalize_video(job, video_bytes)

    labels = {
        "failed": "Video generation failed",
        "cancelled": "Video generation was cancelled",
        "incomplete": "Video generation did not complete",
        "budget_exceeded": "Video generation stopped: budget exceeded",
        "requires_action": "Video generation stopped unexpectedly (requires action)",
    }
    detail = _interaction_errors(interaction)
    message = labels.get(status, f"Video generation ended with status '{status or 'unknown'}'")
    return _fail_job(job, f"{message}: {detail}" if detail else f"{message}.")


def _poll_interaction(job: Dict[str, Any]) -> Dict[str, Any]:
    """Ask Google about an unfinished job and update/finalise it. Caller holds the job lock."""
    interaction_id = job.get("operationId")
    if not interaction_id:
        return _fail_job(
            job, "This job cannot be resumed (it was created by an older video model). Please start a new video."
        )
    try:
        interaction = get_video_client().interactions.get(interaction_id, timeout=GET_TIMEOUT_SECONDS)
    except Exception as error:
        status = _api_status(error)
        if status in (400, 404):
            return _fail_job(job, f"The video job is no longer available at Google: {_api_message(error)}")
        logger.warning("Polling interaction %s failed: %s", interaction_id, error)
        raise HTTPException(
            status_code=502,
            detail="Could not reach the video service to check the job. It is still running; please check again shortly.",
        )
    return _apply_interaction(job, interaction)


@router.get("/status", response_model=SuccessResponse)
def check_video_status(
    jobId: str = Query(..., description="Job id returned by /generate or /animate"),
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
                data = _poll_interaction(job)
        return SuccessResponse(success=True, data=data)
    except HTTPException:
        raise
    except Exception as e:
        logger.exception("Error checking video status for %s", jobId)
        raise HTTPException(status_code=500, detail=f"Error checking video status: {e}")


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


# ---------------------------------------------------------------------------
# Startup recovery
# ---------------------------------------------------------------------------


def recover_video_jobs() -> int:
    """Fail unfinished jobs that can never complete (retired model, no interaction id, too old).

    Called once from the app lifespan. Recent Omni jobs are left alone: the next
    /status poll resumes them from their stored interaction id.
    """
    known = [m["id"] for m in get_model_registry().get("video", [])]
    try:
        count = get_video_queue().fail_unresumable_jobs(known)
    except Exception:
        logger.exception("Video job recovery failed")
        return 0
    if count:
        logger.info("Marked %d unresumable video job(s) as failed", count)
    return count
