"""Admin-only text similarity comparison using the nomic-embed-text model."""
from __future__ import annotations

from fastapi import APIRouter, Depends, HTTPException
from pydantic import BaseModel, Field, field_validator

from models import SuccessResponse
from utils import embeddings
from utils.auth import require_admin

router = APIRouter()

MAX_TEXT_CHARS = 2000


class SimilarityRequest(BaseModel):
    textA: str = Field(max_length=MAX_TEXT_CHARS)
    textB: str = Field(max_length=MAX_TEXT_CHARS)

    @field_validator("textA", "textB")
    @classmethod
    def _not_blank(cls, value: str) -> str:
        if not value.strip():
            raise ValueError("must not be empty")
        return value


@router.post("", response_model=SuccessResponse)
async def compare_texts(request: SimilarityRequest, _: None = Depends(require_admin)) -> SuccessResponse:
    try:
        vec_a, vec_b = await embeddings.embed([request.textA, request.textB])
    except embeddings.EmbeddingError as exc:
        raise HTTPException(status_code=503, detail=str(exc))
    score = embeddings.cosine_similarity(vec_a, vec_b)
    return SuccessResponse(data={"similarity": round(score, 4), "model": embeddings.EMBED_MODEL})
