"""
FastAPI Backend for Gemini Image/Video Generation
"""

import logging
import os
from contextlib import asynccontextmanager

from dotenv import load_dotenv
from fastapi import FastAPI
from fastapi.middleware.cors import CORSMiddleware

from routers import (
    admin,
    auth,
    config,
    image,
    media,
    usage,
    video,
    users,
    quotas,
    templates,
    system_prompts,
    text_generation,
    speech,
    prompt_lab,
    placeholders,
)
from utils.user_manager import ensure_env_admin_exists
from utils.database import initialize_database

# Load environment variables
load_dotenv()

logging.basicConfig(
    level=os.getenv("LOG_LEVEL", "INFO").upper(),
    format="%(asctime)s %(levelname)s %(name)s: %(message)s",
)
logger = logging.getLogger(__name__)

if not os.getenv("GEMINI_API_KEY"):
    logger.warning("GEMINI_API_KEY not found in environment variables")


@asynccontextmanager
async def lifespan(app: FastAPI):
    """Initialize database and create the env-configured admin user on startup."""
    logger.info("Initializing database...")
    initialize_database()

    admin_user = ensure_env_admin_exists()
    if admin_user:
        logger.info("Admin user initialized: %s", admin_user.email)
    else:
        logger.warning(
            "No admin credentials found in .env - please set APP_USERNAME and APP_PASSWORD"
        )

    # Fail video jobs left 'processing' that can never finish (retired models, too old).
    video.recover_video_jobs()

    logger.info("Application startup complete")
    yield


app = FastAPI(
    lifespan=lifespan,
    title="Gemini Media Generation API",
    description="Backend API for image and video generation using Google Gemini API",
    version="1.0.0",
    root_path=os.getenv("ROOT_PATH", ""),  # Support subpath deployment
)

# Configure CORS. Auth uses Bearer tokens (no cookies), so credentials are not
# needed; origins are configurable via CORS_ORIGINS (comma-separated, default "*").
cors_origins = [
    origin.strip()
    for origin in os.getenv("CORS_ORIGINS", "*").split(",")
    if origin.strip()
]
app.add_middleware(
    CORSMiddleware,
    allow_origins=cors_origins or ["*"],
    allow_credentials=False,
    allow_methods=["*"],
    allow_headers=["*"],
)

# Include routers
app.include_router(auth.router, prefix="/api/auth", tags=["Authentication"])
app.include_router(admin.router, prefix="/api/admin", tags=["Administration"])
app.include_router(prompt_lab.admin_router, prefix="/api/admin/prompt-lab", tags=["Prompt Lab Admin"])
app.include_router(users.router, prefix="/api/admin/users", tags=["User Management"])
app.include_router(quotas.router, prefix="/api/admin/quotas", tags=["Quota Management"])
app.include_router(config.router, prefix="/api/config", tags=["Configuration"])
app.include_router(image.router, prefix="/api/image", tags=["Image Generation"])
app.include_router(video.router, prefix="/api/video", tags=["Video Generation"])
app.include_router(media.router, prefix="/api/media", tags=["Media Storage"])
app.include_router(usage.router, prefix="/api/usage", tags=["Usage Tracking"])
app.include_router(templates.router, prefix="/api/text/templates", tags=["Text Templates"])
app.include_router(system_prompts.router, prefix="/api/text/system-prompts", tags=["System Prompts"])
app.include_router(text_generation.router, prefix="/api/text", tags=["Text Generation"])
app.include_router(speech.router, prefix="/api/speech", tags=["Speech Generation"])
app.include_router(prompt_lab.router, prefix="/api/prompt-lab", tags=["Prompt Lab"])
app.include_router(placeholders.router, prefix="/api/placeholders", tags=["Placeholders"])


@app.get("/")
async def root():
    return {
        "message": "Gemini Media Generation API",
        "version": "1.0.0",
        "docs": "/docs",
        "endpoints": {
            "image": "/api/image",
            "video": "/api/video",
            "text": "/api/text",
            "media": "/api/media",
            "usage": "/api/usage",
        },
    }


@app.get("/health")
async def health_check():
    return {
        "status": "healthy",
        "gemini_api_key_configured": bool(os.getenv("GEMINI_API_KEY")),
    }

