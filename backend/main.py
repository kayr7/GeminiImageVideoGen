"""
FastAPI Backend for Gemini Image/Video Generation
"""

from fastapi import FastAPI, HTTPException
from fastapi.middleware.cors import CORSMiddleware
from dotenv import load_dotenv
import os

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
)
from utils.user_manager import ensure_env_admin_exists
from utils.database import initialize_database

# Load environment variables
load_dotenv()

# Verify API key is set
if not os.getenv("GEMINI_API_KEY"):
    print("WARNING: GEMINI_API_KEY not found in environment variables")

app = FastAPI(
    title="Gemini Media Generation API",
    description="Backend API for image and video generation using Google Gemini API",
    version="1.0.0",
    root_path=os.getenv("ROOT_PATH", ""),  # Support subpath deployment
)

# Configure CORS
app.add_middleware(
    CORSMiddleware,
    allow_origins=[
        "http://localhost:3000",
        "http://localhost:3001",
        "http://frontend:3000",
        "*",  # Allow all origins for subpath deployment
    ],
    allow_credentials=True,
    allow_methods=["*"],
    allow_headers=["*"],
)

# Include routers
app.include_router(auth.router, prefix="/api/auth", tags=["Authentication"])
app.include_router(admin.router, prefix="/api/admin", tags=["Administration"])
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


@app.on_event("startup")
async def startup_event():
    """Initialize database and create admin user on startup."""
    print("Initializing database...")
    initialize_database()

    print("Ensuring admin user from .env exists...")
    admin_user = ensure_env_admin_exists()
    if admin_user:
        print(f"✓ Admin user initialized: {admin_user.email}")
    else:
        print(
            "⚠ No admin credentials found in .env - please set APP_USERNAME and APP_PASSWORD"
        )

    print("✓ Application startup complete")
