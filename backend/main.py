"""
FastAPI Backend for Gemini Image/Video Generation
"""
from fastapi import FastAPI, HTTPException
from fastapi.middleware.cors import CORSMiddleware
from dotenv import load_dotenv
import os

from routers import admin, auth, image, media, usage, video

# Load environment variables
load_dotenv()

# Verify API key is set
if not os.getenv("GEMINI_API_KEY"):
    print("WARNING: GEMINI_API_KEY not found in environment variables")

app = FastAPI(
    title="Gemini Media Generation API",
    description="Backend API for image and video generation using Google Gemini API",
    version="1.0.0",
    root_path=os.getenv("ROOT_PATH", "")  # Support subpath deployment
)

# Configure CORS
app.add_middleware(
    CORSMiddleware,
    allow_origins=[
        "http://localhost:3000",
        "http://localhost:3001",
        "http://frontend:3000",
        "*"  # Allow all origins for subpath deployment
    ],
    allow_credentials=True,
    allow_methods=["*"],
    allow_headers=["*"],
)

# Include routers
app.include_router(auth.router, prefix="/api/auth", tags=["Authentication"])
app.include_router(admin.router, prefix="/api/admin", tags=["Administration"])
app.include_router(image.router, prefix="/api/image", tags=["Image Generation"])
app.include_router(video.router, prefix="/api/video", tags=["Video Generation"])
app.include_router(media.router, prefix="/api/media", tags=["Media Storage"])
app.include_router(usage.router, prefix="/api/usage", tags=["Usage Tracking"])

@app.get("/")
async def root():
    return {
        "message": "Gemini Media Generation API",
        "version": "1.0.0",
        "docs": "/docs",
        "endpoints": {
            "image": "/api/image",
            "video": "/api/video",
            "media": "/api/media",
            "usage": "/api/usage"
        }
    }

@app.get("/health")
async def health_check():
    return {
        "status": "healthy",
        "gemini_api_key_configured": bool(os.getenv("GEMINI_API_KEY"))
    }

