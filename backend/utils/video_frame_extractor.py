"""
Video frame extraction utilities using OpenCV.
Extracts first and last frames from video bytes.
"""

import cv2
import numpy as np
import base64
from typing import Tuple, Optional


def extract_frames(video_bytes: bytes) -> Tuple[Optional[str], Optional[str]]:
    """
    Extract first and last frames from video bytes.
    
    Args:
        video_bytes: Raw video file bytes (MP4 format)
    
    Returns:
        Tuple of (first_frame_base64, last_frame_base64)
        Returns (None, None) if extraction fails
    """
    try:
        # Write video bytes to temporary array
        video_array = np.frombuffer(video_bytes, dtype=np.uint8)
        
        # Open video from memory
        video = cv2.VideoCapture()
        video.open(cv2.CAP_FFMPEG)
        
        # Try alternative method - write to temp file and read
        import tempfile
        import os
        
        with tempfile.NamedTemporaryFile(delete=False, suffix='.mp4') as temp_file:
            temp_file.write(video_bytes)
            temp_path = temp_file.name
        
        try:
            # Open video from temp file
            video = cv2.VideoCapture(temp_path)
            
            if not video.isOpened():
                print("Error: Could not open video")
                return None, None
            
            # Get total frame count
            total_frames = int(video.get(cv2.CAP_PROP_FRAME_COUNT))
            
            if total_frames == 0:
                print("Error: Video has no frames")
                video.release()
                return None, None
            
            # Extract first frame
            video.set(cv2.CAP_PROP_POS_FRAMES, 0)
            ret, first_frame = video.read()
            
            if not ret or first_frame is None:
                print("Error: Could not read first frame")
                video.release()
                return None, None
            
            # Extract last frame (go to last frame - 1 to ensure we get a valid frame)
            last_frame_index = max(0, total_frames - 2)
            video.set(cv2.CAP_PROP_POS_FRAMES, last_frame_index)
            ret, last_frame = video.read()
            
            if not ret or last_frame is None:
                print("Warning: Could not read last frame, using first frame")
                last_frame = first_frame
            
            # Release video capture
            video.release()
            
            # Convert frames to JPEG and base64
            first_frame_base64 = frame_to_base64(first_frame)
            last_frame_base64 = frame_to_base64(last_frame)
            
            return first_frame_base64, last_frame_base64
            
        finally:
            # Clean up temp file
            try:
                os.unlink(temp_path)
            except Exception as e:
                print(f"Warning: Could not delete temp file: {e}")
    
    except Exception as e:
        print(f"Error extracting frames: {str(e)}")
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
    """
    Get video metadata (duration, resolution, frame count).
    
    Args:
        video_bytes: Raw video file bytes
    
    Returns:
        Dictionary with video metadata
    """
    try:
        import tempfile
        import os
        
        with tempfile.NamedTemporaryFile(delete=False, suffix='.mp4') as temp_file:
            temp_file.write(video_bytes)
            temp_path = temp_file.name
        
        try:
            video = cv2.VideoCapture(temp_path)
            
            if not video.isOpened():
                return {"error": "Could not open video"}
            
            info = {
                "frame_count": int(video.get(cv2.CAP_PROP_FRAME_COUNT)),
                "fps": video.get(cv2.CAP_PROP_FPS),
                "width": int(video.get(cv2.CAP_PROP_FRAME_WIDTH)),
                "height": int(video.get(cv2.CAP_PROP_FRAME_HEIGHT)),
                "duration_seconds": video.get(cv2.CAP_PROP_FRAME_COUNT) / video.get(cv2.CAP_PROP_FPS)
            }
            
            video.release()
            return info
            
        finally:
            try:
                os.unlink(temp_path)
            except Exception as e:
                print(f"Warning: Could not delete temp file: {e}")
    
    except Exception as e:
        return {"error": str(e)}

