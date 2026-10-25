"""
Video frame extraction utilities using OpenCV.
Extracts first and last frames from video bytes.
"""

import base64
import logging
import os
import tempfile
from contextlib import contextmanager
from typing import Iterator, Optional, Tuple

import cv2
import numpy as np

logger = logging.getLogger(__name__)


@contextmanager
def _temp_video_file(video_bytes: bytes) -> Iterator[str]:
    """Write video bytes to a temp .mp4 (OpenCV needs a path) and clean up afterwards."""
    with tempfile.NamedTemporaryFile(delete=False, suffix=".mp4") as temp_file:
        temp_file.write(video_bytes)
        temp_path = temp_file.name
    try:
        yield temp_path
    finally:
        try:
            os.unlink(temp_path)
        except OSError as e:
            logger.warning("Could not delete temp file %s: %s", temp_path, e)


def extract_frames(video_bytes: bytes) -> Tuple[Optional[str], Optional[str]]:
    """
    Extract first and last frames from video bytes.

    Returns:
        Tuple of (first_frame_base64, last_frame_base64) as JPEGs,
        or (None, None) if extraction fails.
    """
    try:
        with _temp_video_file(video_bytes) as path:
            video = cv2.VideoCapture(path)
            try:
                if not video.isOpened():
                    logger.warning("Could not open video for frame extraction")
                    return None, None

                total_frames = int(video.get(cv2.CAP_PROP_FRAME_COUNT))
                if total_frames == 0:
                    logger.warning("Video has no frames")
                    return None, None

                video.set(cv2.CAP_PROP_POS_FRAMES, 0)
                ret, first_frame = video.read()
                if not ret or first_frame is None:
                    logger.warning("Could not read first frame")
                    return None, None

                # Seek to second-to-last frame to make sure the read succeeds
                video.set(cv2.CAP_PROP_POS_FRAMES, max(0, total_frames - 2))
                ret, last_frame = video.read()
                if not ret or last_frame is None:
                    logger.warning("Could not read last frame, using first frame")
                    last_frame = first_frame
            finally:
                video.release()

        return frame_to_base64(first_frame), frame_to_base64(last_frame)

    except Exception:
        logger.exception("Error extracting frames")
        return None, None


def frame_to_base64(frame: np.ndarray, quality: int = 95) -> str:
    """
    Convert OpenCV frame (numpy array) to base64 JPEG string.
    
    Args:
        frame: OpenCV frame (BGR format)
        quality: JPEG quality (0-100)
    
    Returns:
        Base64 encoded JPEG image data (without data URL prefix)
    """
    # Encode frame as JPEG
    encode_param = [int(cv2.IMWRITE_JPEG_QUALITY), quality]
    _, buffer = cv2.imencode('.jpg', frame, encode_param)
    
    # Convert to base64
    frame_base64 = base64.b64encode(buffer).decode('utf-8')
    
    return frame_base64


def get_video_info(video_bytes: bytes) -> dict:
    """Get video metadata (duration, resolution, frame count)."""
    try:
        with _temp_video_file(video_bytes) as path:
            video = cv2.VideoCapture(path)
            try:
                if not video.isOpened():
                    return {"error": "Could not open video"}

                frame_count = int(video.get(cv2.CAP_PROP_FRAME_COUNT))
                fps = video.get(cv2.CAP_PROP_FPS)
                return {
                    "frame_count": frame_count,
                    "fps": fps,
                    "width": int(video.get(cv2.CAP_PROP_FRAME_WIDTH)),
                    "height": int(video.get(cv2.CAP_PROP_FRAME_HEIGHT)),
                    "duration_seconds": frame_count / fps if fps else 0.0,
                }
            finally:
                video.release()
    except Exception as e:
        return {"error": str(e)}
