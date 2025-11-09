# Gemini Image & Video Generation Platform

A comprehensive Next.js + Python FastAPI application for generating images and videos using Google's Gemini API (Imagen and Veo models).

## 🎯 Features

### Image Generation
- **Nano Banana** (Gemini 2.5 Flash Image) - Fast, conversational image generation
- **Imagen 3.0 & 4.0** - High-quality photorealistic images
- Multiple reference images support (up to 5) for composition/style transfer
- Aspect ratio control
- Negative prompts
- Image editing with reference images

### Video Generation
- **Veo 3.1 & Veo 3.1 Fast** - State-of-the-art video generation with audio
- **Advanced Features**:
  - ✅ **First Frame**: Use an image as the starting frame
  - ✅ **Last Frame**: Use an image as the ending frame
  - ✅ **Reference Images**: Up to 3 images for visual guidance (not as frames, but as style/content references)
  - ✅ **Negative Prompts**: Specify what NOT to include in the video
  - ✅ Text-to-video generation
  - ✅ Image-to-video animation
  - ✅ Natively generated audio (8-second videos at 720p/1080p)

### Storage & Persistence
- All generated media saved to disk (`.media-storage/`)
- Automatic cleanup after 30 days
- Media retrieval API endpoints
- Video job queue for async processing
- Server-side persistence across restarts

## 🏗️ Architecture

**Frontend**: Next.js 14 (App Router) + TypeScript + Tailwind CSS  
**Backend**: Python FastAPI + Google Gemini Python SDK  
**Deployment**: Docker Compose with subpath support (`/HdMImageVideo`)

## 📋 Prerequisites

- Docker & Docker Compose
- **Google Gemini API key** ([Get one here](https://ai.google.dev/))
  - ✅ Imagen & Nano Banana (image generation)
  - ✅ Veo (video generation)
  - ❌ MusicFX (not yet available with standard API keys)

## 🚀 Quick Start

### 1. Clone and Configure

```bash
# Clone the repository
git clone <your-repo-url>
cd GeminiImagVideoGen

# Set up backend environment
cd backend
cp .env.example .env
# Edit .env and add your GEMINI_API_KEY
cd ..
```

### 2. Run with Docker Compose

```bash
# Build and start all services
docker-compose up --build

# Access the application
# Frontend: http://localhost:3000/HdMImageVideo
# Backend API: http://localhost:8000/HdMImageVideo
# API Docs: http://localhost:8000/HdMImageVideo/docs
```

### 3. Local Development (without Docker)

**Backend:**
```bash
cd backend
python -m venv venv
source venv/bin/activate  # On Windows: venv\Scripts\activate
pip install -r requirements.txt
export GEMINI_API_KEY=your_key_here
export ROOT_PATH=/HdMImageVideo
uvicorn main:app --reload --port 8000 --root-path /HdMImageVideo
```

**Frontend:**
```bash
npm install
npm run dev
# Access at http://localhost:3000/HdMImageVideo
```

## 📖 API Documentation

### Backend Endpoints

**Image Generation:**
- `POST /HdMImageVideo/api/image/generate` - Generate images with Nano Banana or Imagen
- `POST /HdMImageVideo/api/image/edit` - Edit images with reference images

**Video Generation:**
- `POST /HdMImageVideo/api/video/generate` - Generate videos with Veo (supports first/last frame, reference images, negative prompts)
- `POST /HdMImageVideo/api/video/animate` - Animate images into videos
- `GET /HdMImageVideo/api/video/status?jobId=...` - Check video generation status
- `GET /HdMImageVideo/api/video/jobs` - List all video jobs
- `GET /HdMImageVideo/api/video/jobs/{job_id}` - Get specific job details

**Media Storage:**
- `GET /HdMImageVideo/api/media/{id}` - Retrieve saved media file
- `GET /HdMImageVideo/api/media/list` - List all saved media
- `GET /HdMImageVideo/api/media/stats` - Get storage statistics

**Usage:**
- `GET /HdMImageVideo/api/usage/status` - Get API usage status

Full interactive API documentation available at: `http://localhost:8000/HdMImageVideo/docs`

## 🎬 Veo Video Features

### Text-to-Video
```bash
curl -X POST http://localhost:8000/HdMImageVideo/api/video/generate \
  -H "Content-Type: application/json" \
  -d '{
    "prompt": "A serene mountain landscape at sunrise",
    "model": "veo-3.1-fast-generate-preview"
  }'
```

### With Negative Prompts
```bash
curl -X POST http://localhost:8000/HdMImageVideo/api/video/generate \
  -H "Content-Type: application/json" \
  -d '{
    "prompt": "A beautiful garden",
    "negativePrompt": "people, animals, buildings",
    "model": "veo-3.1-generate-preview"
  }'
```

### With First Frame (Starting Image)
```bash
curl -X POST http://localhost:8000/HdMImageVideo/api/video/generate \
  -H "Content-Type: application/json" \
  -d '{
    "prompt": "Camera zooming out from this scene",
    "firstFrame": "data:image/png;base64,iVBORw0KG...",
    "model": "veo-3.1-generate-preview"
  }'
```

### With Reference Images (Visual Guidance)
```bash
curl -X POST http://localhost:8000/HdMImageVideo/api/video/generate \
  -H "Content-Type: application/json" \
  -d '{
    "prompt": "A cinematic scene inspired by these images",
    "referenceImages": [
      "data:image/png;base64,iVBORw0KG...",
      "data:image/png;base64,iVBORw0KG...",
      "data:image/png;base64,iVBORw0KG..."
    ],
    "model": "veo-3.1-generate-preview"
  }'
```

## 📁 Project Structure

```
GeminiImagVideoGen/
├── backend/                    # Python FastAPI backend
│   ├── main.py                # FastAPI application entry point
│   ├── models.py              # Pydantic models
│   ├── routers/               # API route handlers
│   │   ├── image.py           # Image generation endpoints
│   │   ├── video.py           # Video generation endpoints (with Veo features)
│   │   ├── music.py           # Music generation endpoints
│   │   ├── media.py           # Media storage endpoints
│   │   └── usage.py           # Usage tracking endpoints
│   ├── utils/                 # Utility modules
│   │   ├── media_storage.py  # Media file storage system
│   │   ├── video_queue.py    # Video job queue system
│   │   └── rate_limiter.py   # Rate limiting
│   ├── requirements.txt       # Python dependencies
│   ├── Dockerfile             # Backend Docker image
│   └── .env.example           # Environment variables template
├── app/                       # Next.js frontend (App Router)
│   ├── page.tsx               # Home page
│   ├── image/page.tsx         # Image generation page
│   ├── video/page.tsx         # Video generation page
│   └── music/page.tsx         # Music generation page
├── components/                # React components
│   ├── generators/            # Generation UI components
│   │   ├── ImageGenerator.tsx
│   │   ├── VideoGenerator.tsx
│   │   └── MusicGenerator.tsx
│   ├── ui/                    # Reusable UI components
│   └── shared/                # Shared components
├── docker-compose.yml         # Multi-container Docker setup
├── Dockerfile                 # Frontend Docker image
└── README.md                  # This file
```

## 🔧 Configuration

### Environment Variables

**Backend (`backend/.env`):**
```bash
GEMINI_API_KEY=your_gemini_api_key_here
ROOT_PATH=/HdMImageVideo
```

**Frontend (Docker Compose sets these automatically):**
```bash
NEXT_PUBLIC_BASE_PATH=/HdMImageVideo
NEXT_PUBLIC_API_URL=http://backend:8000/HdMImageVideo
```

### Rate Limits

Default rate limits (configurable in `backend/utils/rate_limiter.py`):
- Image: 10 requests per minute
- Video: 5 requests per hour
- Music: 5 requests per hour

## 💰 Pricing

Based on [Gemini API Pricing](https://ai.google.dev/gemini-api/docs/pricing):

**Images:**
- Nano Banana: $0.0387 per image
- Imagen 3.0: $0.02 per image
- Imagen 4.0: $0.04 per image

**Videos:**
- Veo 3.1 Fast: $1.20 per 8-second video
- Veo 3.1: $3.20 per 8-second video
- Veo 3.0: $3.20 per 8-second video
- Veo 2.0: $1.50 per 5-second video

## 🧪 Testing

```bash
# Run frontend tests
npm test

# Run backend tests (if implemented)
cd backend
pytest
```

## 📚 Documentation

- [Gemini API Docs](https://ai.google.dev/gemini-api/docs)
- [Imagen Documentation](https://ai.google.dev/gemini-api/docs/imagen)
- [Veo Documentation](https://ai.google.dev/gemini-api/docs/video)
- [Google Gemini Python SDK](https://github.com/google/generative-ai-python)

## 🐛 Troubleshooting

### Video Generation Returns "No video URI"
- Check server logs for detailed error messages
- Ensure your prompt complies with Google's safety policies
- Try a different model (e.g., veo-3.1-fast-generate-preview)

### "GEMINI_API_KEY not configured"
- Make sure `backend/.env` file exists with your API key
- Restart the backend container after adding the key

### Port Already in Use
```bash
# Stop existing containers
docker-compose down

# Or change ports in docker-compose.yml
```

## 📝 License

[Your License Here]

## 🤝 Contributing

[Your Contributing Guidelines Here]

## 📧 Support

For issues and questions, please refer to the [official Gemini API documentation](https://ai.google.dev/gemini-api/docs) or open an issue in this repository.
