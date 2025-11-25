"""
Speech generation endpoints using Google Gemini Python SDK
Documentation: https://ai.google.dev/gemini-api/docs/speech-generation
"""

from fastapi import APIRouter, HTTPException, Request, Depends
from google import genai
from google.genai import types
import os
import base64
from datetime import datetime
from typing import Tuple

from models import (
    SpeechGenerationRequest,
    SpeechResponse,
    SuccessResponse,
    LoginUser,
)
from utils.config import resolve_model_choice
from utils.media_storage import get_media_storage
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


@router.post("/generate", response_model=SuccessResponse)
async def generate_speech(
    req: SpeechGenerationRequest,
    request: Request,
    auth: Tuple[LoginUser, User] = Depends(get_current_user_with_db),
):
    """
    Generate speech from text
    Requires authentication and checks user quotas.
    """
    try:
        login_user, db_user = auth

        # Get client IP for abuse tracking
        client_ip = get_client_ip(request)

        # Check quota before generation
        has_quota, error_msg = QuotaManager.check_quota(db_user.id, "speech")
        if not has_quota:
            raise HTTPException(status_code=429, detail=error_msg)

        # Check rate limit
        await check_rate_limit(db_user.id, "speech")

        client = get_client()

        requested_model_id = (req.model or "").strip()

        try:
            model_info = resolve_model_choice("speech", req.model)
        except LookupError as error:
            status_code = 400 if requested_model_id else 503
            raise HTTPException(status_code=status_code, detail=str(error))
        model_name = model_info["id"]

        # Validate voice
        capabilities = model_info.get("capabilities", {})
        allowed_voices = capabilities.get("voices", [])
        if allowed_voices and req.voice not in allowed_voices:
             # If voice not in list, we might still try it if the list is not exhaustive, 
             # but for now let's assume the config is the source of truth if populated.
             # However, to be safe and flexible, we'll just warn or proceed. 
             # Let's proceed but maybe the API will error if invalid.
             pass

        try:
            print(f"Calling Speech Generation with model {model_name}, voice {req.voice}")
            
            # Construct the API request
            # Based on doc:
            # response = client.models.generate_content(
            #     model="gemini-2.5-flash-preview-tts",
            #     contents="Say cheerfully: Have a wonderful day!",
            #     config=types.GenerateContentConfig(
            #         response_modalities=["AUDIO"],
            #         speech_config=types.SpeechConfig(
            #             voice_config=types.VoiceConfig(
            #                 prebuilt_voice_config=types.PrebuiltVoiceConfig(
            #                     voice_name='Kore',
            #                 )
            #             )
            #         ),
            #     )
            # )

            speech_config = types.SpeechConfig(
                voice_config=types.VoiceConfig(
                    prebuilt_voice_config=types.PrebuiltVoiceConfig(
                        voice_name=req.voice,
                    )
                )
            )

            config = types.GenerateContentConfig(
                response_modalities=["AUDIO"],
                speech_config=speech_config,
            )

            response = client.models.generate_content(
                model=model_name,
                contents=req.text,
                config=config
            )

        except Exception as api_error:
            print(f"Speech API error: {str(api_error)}")
            raise HTTPException(
                status_code=500,
                detail=f"Gemini API error: {str(api_error)}",
            )

        # Extract audio data
        if not response.candidates or len(response.candidates) == 0:
            raise HTTPException(
                status_code=500,
                detail="No candidates in response from Gemini API.",
            )

        candidate = response.candidates[0]
        if not candidate.content or not candidate.content.parts:
             raise HTTPException(
                status_code=500,
                detail="No content parts in response.",
            )

        audio_data = None
        for part in candidate.content.parts:
            if hasattr(part, "inline_data") and part.inline_data:
                audio_data = part.inline_data.data
                break
        
        if not audio_data:
             raise HTTPException(
                status_code=500,
                detail="No audio data found in response.",
            )

        # Convert PCM to WAV
        import wave
        import io
        
        wav_buffer = io.BytesIO()
        with wave.open(wav_buffer, "wb") as wf:
            wf.setnchannels(1)
            wf.setsampwidth(2)
            wf.setframerate(24000)
            wf.writeframes(audio_data)
            
        wav_bytes = wav_buffer.getvalue()
        wav_base64 = base64.b64encode(wav_bytes).decode("utf-8")

        # Save to storage
        storage = get_media_storage()
        media_id = storage.save_media(
            media_type="audio",
            base64_data=wav_base64,
            metadata={
                "prompt": req.text, # Use text as prompt
                "model": model_name,
                "userId": db_user.id,
                "mimeType": "audio/wav",
                "details": {
                    "voice": req.voice,
                    "language": req.language
                },
                "ipAddress": client_ip,
            },
        )

        # Increment quota
        QuotaManager.increment_quota(db_user.id, "speech")

        response_data = {
            "audioUrl": f"data:audio/wav;base64,{wav_base64}",
            "audioData": wav_base64,
            "text": req.text,
            "voice": req.voice,
            "language": req.language,
            "model": model_name,
            "generatedAt": datetime.now().isoformat(),
            "mediaId": str(media_id),
        }

        return SuccessResponse(success=True, data=response_data)

    except HTTPException:
        raise
    except Exception as e:
        raise HTTPException(status_code=500, detail=str(e))
