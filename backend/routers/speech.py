"""
Speech generation endpoints using Google Gemini Python SDK
Documentation: https://ai.google.dev/gemini-api/docs/speech-generation
"""

from fastapi import APIRouter, HTTPException, Request, Depends
from google.genai import types
import io
import logging
import wave
from datetime import datetime
from typing import Tuple

from models import (
    SpeechGenerationRequest,
    SuccessResponse,
    LoginUser,
)
from utils.config import resolve_model_choice
from utils.media_storage import get_media_storage
from utils.gemini import get_client, get_client_ip, to_base64
from utils.rate_limiter import enforce_rate_limit
from utils.auth import get_current_user_with_db
from utils.user_manager import User
from utils.quota_manager import QuotaManager

logger = logging.getLogger(__name__)

router = APIRouter()


@router.post("/generate", response_model=SuccessResponse)
def generate_speech(
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
        enforce_rate_limit(db_user.id, "speech")

        client = get_client()

        requested_model_id = (req.model or "").strip()

        try:
            model_info = resolve_model_choice("speech", req.model)
        except LookupError as error:
            status_code = 400 if requested_model_id else 503
            raise HTTPException(status_code=status_code, detail=str(error))
        model_name = model_info["id"]

        try:
            if req.speakers:
                # Multi-speaker configuration
                speaker_voice_configs = []
                for speaker in req.speakers:
                    speaker_voice_configs.append(
                        types.SpeakerVoiceConfig(
                            speaker=speaker.name,
                            voice_config=types.VoiceConfig(
                                prebuilt_voice_config=types.PrebuiltVoiceConfig(
                                    voice_name=speaker.voice,
                                )
                            )
                        )
                    )
                
                speech_config = types.SpeechConfig(
                    multi_speaker_voice_config=types.MultiSpeakerVoiceConfig(
                        speaker_voice_configs=speaker_voice_configs
                    )
                )
            else:
                # Single speaker configuration
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
            logger.exception("Speech API error (model=%s)", model_name)
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
        wav_buffer = io.BytesIO()
        with wave.open(wav_buffer, "wb") as wf:
            wf.setnchannels(1)
            wf.setsampwidth(2)
            wf.setframerate(24000)
            wf.writeframes(audio_data)
            
        wav_bytes = wav_buffer.getvalue()
        wav_base64 = to_base64(wav_bytes)

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
        logger.exception("Speech generation failed")
        raise HTTPException(status_code=500, detail=str(e))
