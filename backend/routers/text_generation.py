"""API routes for text generation and chat sessions."""

from fastapi import APIRouter, Depends, HTTPException, Request
from typing import Tuple

from models import (
    TextGenerationRequest,
    TextGenerationResponse,
    CreateChatSessionRequest,
    UpdateChatSessionRequest,
    ChatSessionResponse,
    SendMessageRequest,
    ChatMessageResponse,
    SuccessResponse,
    LoginUser,
)
from utils.auth import get_current_user_with_db
from utils.text_generation_manager import TextGenerationManager
from utils.chat_session_manager import ChatSessionManager
from utils.user_manager import User
from utils.quota_manager import QuotaManager

router = APIRouter()


def get_client_ip(request: Request) -> str:
    """Extract client IP address from request."""
    forwarded = request.headers.get("X-Forwarded-For")
    if forwarded:
        return forwarded.split(",")[0].strip()
    return request.client.host if request.client else "unknown"


# Text Generation Routes
@router.post("/generate", response_model=SuccessResponse)
async def generate_text(
    request_body: TextGenerationRequest,
    request: Request,
    auth: Tuple[LoginUser, User] = Depends(get_current_user_with_db),
):
    """Generate text using Gemini API (single-turn)."""
    login_user, db_user = auth
    client_ip = get_client_ip(request)

    # Check quota
    can_generate, message = QuotaManager.check_quota(db_user.id, "text")
    if not can_generate:
        raise HTTPException(status_code=403, detail=message)

    try:
        # Generate text
        generation = TextGenerationManager.generate_text(
            user_id=db_user.id,
            user_message=request_body.userMessage,
            system_prompt=request_body.systemPrompt,
            system_prompt_id=request_body.systemPromptId,
            template_id=request_body.templateId,
            variable_values=request_body.variableValues,
            model=request_body.model or "gemini-2.0-flash-exp",
            ip_address=client_ip,
        )

        # Increment quota
        QuotaManager.increment_quota(db_user.id, "text")

        return SuccessResponse(success=True, data={"generation": generation.to_dict()})

    except Exception as e:
        raise HTTPException(status_code=500, detail=str(e))


@router.get("/history", response_model=SuccessResponse)
async def get_generation_history(
    auth: Tuple[LoginUser, User] = Depends(get_current_user_with_db),
):
    """Get text generation history for the current user."""
    login_user, db_user = auth

    generations = TextGenerationManager.list_generations(db_user.id, limit=100)

    return SuccessResponse(
        success=True, data={"generations": [g.to_dict() for g in generations]}
    )


@router.get("/history/{generation_id}", response_model=SuccessResponse)
async def get_generation(
    generation_id: str,
    auth: Tuple[LoginUser, User] = Depends(get_current_user_with_db),
):
    """Get a specific generation by ID."""
    login_user, db_user = auth

    generation = TextGenerationManager.get_generation(generation_id, db_user.id)
    if not generation:
        raise HTTPException(status_code=404, detail="Generation not found")

    return SuccessResponse(success=True, data={"generation": generation.to_dict()})


@router.delete("/history/{generation_id}", response_model=SuccessResponse)
async def delete_generation(
    generation_id: str,
    auth: Tuple[LoginUser, User] = Depends(get_current_user_with_db),
):
    """Delete a generation from history."""
    login_user, db_user = auth

    deleted = TextGenerationManager.delete_generation(generation_id, db_user.id)
    if not deleted:
        raise HTTPException(status_code=404, detail="Generation not found")

    return SuccessResponse(success=True, data={"generationId": generation_id})


# Chat Session Routes
@router.post("/chat/sessions", response_model=SuccessResponse)
async def create_chat_session(
    request_body: CreateChatSessionRequest,
    auth: Tuple[LoginUser, User] = Depends(get_current_user_with_db),
):
    """Create a new chat session."""
    login_user, db_user = auth

    session = ChatSessionManager.create_session(
        user_id=db_user.id,
        name=request_body.name,
        system_prompt=request_body.systemPrompt,
        system_prompt_id=request_body.systemPromptId,
    )

    return SuccessResponse(success=True, data={"session": session.to_dict()})


@router.get("/chat/sessions", response_model=SuccessResponse)
async def list_chat_sessions(
    auth: Tuple[LoginUser, User] = Depends(get_current_user_with_db),
):
    """List all chat sessions for the current user."""
    login_user, db_user = auth

    sessions = ChatSessionManager.list_sessions(db_user.id, limit=100)

    return SuccessResponse(
        success=True, data={"sessions": [s.to_dict() for s in sessions]}
    )


@router.get("/chat/sessions/{session_id}", response_model=SuccessResponse)
async def get_chat_session(
    session_id: str,
    auth: Tuple[LoginUser, User] = Depends(get_current_user_with_db),
):
    """Get a specific chat session by ID."""
    login_user, db_user = auth

    session = ChatSessionManager.get_session(session_id, db_user.id)
    if not session:
        raise HTTPException(status_code=404, detail="Chat session not found")

    return SuccessResponse(success=True, data={"session": session.to_dict()})


@router.put("/chat/sessions/{session_id}", response_model=SuccessResponse)
async def update_chat_session(
    session_id: str,
    request_body: UpdateChatSessionRequest,
    auth: Tuple[LoginUser, User] = Depends(get_current_user_with_db),
):
    """Update a chat session (e.g., change name or system prompt)."""
    login_user, db_user = auth

    # If updating system prompt, check if session has messages
    if request_body.system_prompt is not None:
        messages = ChatSessionManager.get_messages(session_id, db_user.id)
        if len(messages) > 0:
            raise HTTPException(
                status_code=400, 
                detail="Cannot update system prompt after messages have been sent"
            )

    session = ChatSessionManager.update_session(
        session_id=session_id,
        user_id=db_user.id,
        name=request_body.name,
        system_prompt=request_body.system_prompt,
    )

    if not session:
        raise HTTPException(status_code=404, detail="Chat session not found")

    return SuccessResponse(success=True, data={"session": session.to_dict()})


@router.delete("/chat/sessions/{session_id}", response_model=SuccessResponse)
async def delete_chat_session(
    session_id: str,
    auth: Tuple[LoginUser, User] = Depends(get_current_user_with_db),
):
    """Delete a chat session and all its messages."""
    login_user, db_user = auth

    deleted = ChatSessionManager.delete_session(session_id, db_user.id)
    if not deleted:
        raise HTTPException(status_code=404, detail="Chat session not found")

    return SuccessResponse(success=True, data={"sessionId": session_id})


@router.get("/chat/sessions/{session_id}/messages", response_model=SuccessResponse)
async def get_chat_messages(
    session_id: str,
    auth: Tuple[LoginUser, User] = Depends(get_current_user_with_db),
):
    """Get all messages in a chat session."""
    login_user, db_user = auth

    messages = ChatSessionManager.get_messages(session_id, db_user.id)

    return SuccessResponse(
        success=True, data={"messages": [m.to_dict() for m in messages]}
    )


@router.post("/chat/sessions/{session_id}/messages", response_model=SuccessResponse)
async def send_chat_message(
    session_id: str,
    request_body: SendMessageRequest,
    auth: Tuple[LoginUser, User] = Depends(get_current_user_with_db),
):
    """Send a message in a chat session and get a response."""
    login_user, db_user = auth

    # Check quota
    can_generate, message = QuotaManager.check_quota(db_user.id, "text")
    if not can_generate:
        raise HTTPException(status_code=403, detail=message)

    try:
        # Send message and get response
        model_message = ChatSessionManager.send_message(
            session_id=session_id,
            user_id=db_user.id,
            user_message=request_body.message,
            model=request_body.model or "gemini-2.0-flash-exp",
        )

        # Increment quota
        QuotaManager.increment_quota(db_user.id, "text")

        return SuccessResponse(success=True, data={"message": model_message.to_dict()})

    except ValueError as e:
        raise HTTPException(status_code=404, detail=str(e))
    except Exception as e:
        raise HTTPException(status_code=500, detail=str(e))

