# Quick Setup Guide

## 🚀 Getting Started in 3 Steps

### Step 1: Get Your API Key

1. Visit https://ai.google.dev/
2. Click "Get API Key"
3. Create a new API key
4. Copy the key

### Step 2: Configure Backend

```bash
cd backend
cp .env.example .env
# Edit .env and paste your API key:
# GEMINI_API_KEY=your_actual_api_key_here
# ROOT_PATH=/HdMImageVideo
```

### Step 3: Start the Application

**Option A: Using Docker (Recommended)**

```bash
./start-docker.sh
```

**Option B: Local Development**

```bash
./start-dev.sh
```

That's it! 🎉

## 📍 Access Points

After starting:

- **Frontend:** http://localhost:3000/HdMImageVideo
- **Backend API:** http://localhost:8000/HdMImageVideo
- **API Docs (Swagger):** http://localhost:8000/HdMImageVideo/docs
- **Health Check:** http://localhost:8000/HdMImageVideo/health

## 🧪 Verify Installation

Run the test script to verify everything is working:

```bash
./test-subpath.sh
```

## 📚 What Can You Do?

### 1. Generate Images

- **Nano Banana**: Fast, conversational image generation
- **Imagen 3.0**: High-quality photorealistic images
- **Imagen 4.0**: Highest quality images

**Features:**
- Multiple reference images (up to 5)
- Aspect ratio control
- Negative prompts

### 2. Generate Videos

- **Veo 3.1**: State-of-the-art video with audio (8 seconds)
- **Veo 3.1 Fast**: Faster generation with good quality

**Features:**
- First frame (starting image)
- Last frame (ending image)
- Reference images (up to 3, for visual guidance)
- Negative prompts (what NOT to include)
- Image animation

### 3. Browse Your Creations

All generated images and videos are automatically saved and can be accessed through:
- Media list: `/HdMImageVideo/api/media/list`
- Individual media: `/HdMImageVideo/api/media/{id}`
- Storage stats: `/HdMImageVideo/api/media/stats`

## ⚙️ Configuration

### Change the Subpath

To deploy under a different path (e.g., `/ai`):

1. **Backend** (`backend/.env`):
   ```bash
   ROOT_PATH=/ai
   ```

2. **Frontend** (environment or `next.config.js`):
   ```bash
   NEXT_PUBLIC_BASE_PATH=/ai
   NEXT_PUBLIC_API_URL=http://localhost:8000/ai
   ```

3. **Rebuild:**
   ```bash
   docker-compose down
   docker-compose up --build
   ```

### Rate Limits

Default limits can be changed in `backend/utils/rate_limiter.py`:

```python
RATE_LIMITS = {
    "image": {"limit": 10, "window": 60},    # 10 per minute
    "video": {"limit": 5, "window": 3600},   # 5 per hour
    "music": {"limit": 5, "window": 3600},   # 5 per hour
}
```

## 🆘 Troubleshooting

### Issue: "GEMINI_API_KEY not configured"

**Solution:**
```bash
cd backend
# Make sure .env file exists with your API key
cat .env
# Should show: GEMINI_API_KEY=your_actual_key
```

### Issue: Port already in use

**Solution:**
```bash
# Stop any running containers
docker-compose down

# Or kill processes on specific ports
lsof -ti:3000 | xargs kill -9
lsof -ti:8000 | xargs kill -9
```

### Issue: Backend returns 404

**Solution:** Make sure `ROOT_PATH` is set correctly:
```bash
cd backend
cat .env | grep ROOT_PATH
# Should show: ROOT_PATH=/HdMImageVideo
```

### Issue: CORS errors

**Solution:** The backend is configured to allow all origins for subpath deployment. If you still see CORS errors, check that:
1. Frontend is calling the correct backend URL with subpath
2. Backend `ROOT_PATH` matches frontend `NEXT_PUBLIC_BASE_PATH`

### Issue: Video generation fails

**Common causes:**
1. **Safety filter**: Your prompt violated content policies
   - Check server logs for detailed error message
   - Modify your prompt and try again
2. **API key**: Make sure your API key has video generation enabled
3. **Rate limit**: Wait before trying again

## 📖 Next Steps

1. **Explore the API Docs:** http://localhost:8000/HdMImageVideo/docs
2. **Try different models:** Compare Nano Banana vs Imagen
3. **Experiment with Veo features:**
   - Use reference images for style
   - Try negative prompts
   - Animate your images
4. **Check the examples:** See README.md for curl examples

## 🔗 Resources

- [Gemini API Documentation](https://ai.google.dev/gemini-api/docs)
- [Imagen Documentation](https://ai.google.dev/gemini-api/docs/imagen)
- [Veo Documentation](https://ai.google.dev/gemini-api/docs/video)
- [Pricing Information](https://ai.google.dev/gemini-api/docs/pricing)

## 💬 Need Help?

- Check the logs: `docker-compose logs -f`
- Read DEPLOYMENT_SUBPATH.md for advanced configuration
- Review the API docs at `/HdMImageVideo/docs`

