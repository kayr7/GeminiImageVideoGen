# Subpath Deployment Guide

This application is designed to run under a subpath (`/HdMImageVideo`) for deployment behind a reverse proxy or on a shared server.

## Architecture

Both the frontend and backend are configured to work under the `/HdMImageVideo` subpath:

```
https://yourserver.com/HdMImageVideo/        → Next.js Frontend
https://yourserver.com/HdMImageVideo/api/*   → Python FastAPI Backend
```

## Configuration

### Backend (FastAPI)

The FastAPI backend uses the `root_path` parameter to handle subpath routing:

**Environment Variable:**
```bash
ROOT_PATH=/HdMImageVideo
```

**In `backend/main.py`:**
```python
app = FastAPI(
    title="Gemini Media Generation API",
    description="Backend API for image, video, and music generation",
    version="1.0.0",
    root_path=os.getenv("ROOT_PATH", "")  # Subpath support
)
```

**Start Command:**
```bash
uvicorn main:app --reload --port 8000 --root-path /HdMImageVideo
```

### Frontend (Next.js)

The Next.js frontend uses `basePath` for subpath routing:

**Environment Variable:**
```bash
NEXT_PUBLIC_BASE_PATH=/HdMImageVideo
NEXT_PUBLIC_API_URL=http://backend:8000/HdMImageVideo
```

**In `next.config.js`:**
```javascript
module.exports = {
  basePath: '/HdMImageVideo',
  // ... other config
}
```

## Docker Compose

The `docker-compose.yml` is already configured for subpath deployment:

```yaml
services:
  backend:
    environment:
      - ROOT_PATH=/HdMImageVideo
    ports:
      - "8000:8000"
    healthcheck:
      test: ["CMD-SHELL", "curl -f http://localhost:8000/HdMImageVideo/health"]
  
  frontend:
    environment:
      - NEXT_PUBLIC_BASE_PATH=/HdMImageVideo
      - NEXT_PUBLIC_API_URL=http://backend:8000/HdMImageVideo
    ports:
      - "3000:3000"
```

## Reverse Proxy Configuration

### Nginx

```nginx
# Proxy frontend
location /HdMImageVideo/ {
    proxy_pass http://localhost:3000/HdMImageVideo/;
    proxy_http_version 1.1;
    proxy_set_header Upgrade $http_upgrade;
    proxy_set_header Connection 'upgrade';
    proxy_set_header Host $host;
    proxy_cache_bypass $http_upgrade;
}

# Note: Backend API is already served through frontend's /HdMImageVideo/api/*
# If you need direct backend access:
# location /HdMImageVideo/api/ {
#     proxy_pass http://localhost:8000/HdMImageVideo/api/;
#     proxy_set_header Host $host;
#     proxy_set_header X-Real-IP $remote_addr;
# }
```

### Apache

```apache
<Location /HdMImageVideo>
    ProxyPass http://localhost:3000/HdMImageVideo
    ProxyPassReverse http://localhost:3000/HdMImageVideo
    ProxyPreserveHost On
</Location>
```

## Accessing the Application

After deployment:

- **Frontend UI:** https://yourserver.com/HdMImageVideo
- **Backend API:** https://yourserver.com/HdMImageVideo/api/*
- **API Docs:** https://yourserver.com/HdMImageVideo/docs
- **Health Check:** https://yourserver.com/HdMImageVideo/health

## Testing Subpath Deployment

### 1. Start with Docker Compose

```bash
docker-compose up --build
```

### 2. Test Backend Endpoints

```bash
# Health check
curl http://localhost:8000/HdMImageVideo/health

# API docs (in browser)
open http://localhost:8000/HdMImageVideo/docs

# Image generation
curl -X POST http://localhost:8000/HdMImageVideo/api/image/generate \
  -H "Content-Type: application/json" \
  -d '{"prompt": "A test image", "model": "gemini-2.5-flash-image"}'
```

### 3. Test Frontend

Open browser: http://localhost:3000/HdMImageVideo

## Troubleshooting

### Issue: API routes return 404

**Solution:** Ensure `ROOT_PATH` is set in backend environment:
```bash
export ROOT_PATH=/HdMImageVideo
```

### Issue: Frontend can't reach backend

**Solution:** Check `NEXT_PUBLIC_API_URL` includes the subpath:
```bash
NEXT_PUBLIC_API_URL=http://backend:8000/HdMImageVideo
```

### Issue: Swagger UI doesn't load

**Solution:** FastAPI's OpenAPI schema needs the root_path:
```python
app = FastAPI(root_path="/HdMImageVideo")
```

### Issue: CORS errors

**Solution:** Ensure CORS middleware allows the frontend origin with subpath:
```python
app.add_middleware(
    CORSMiddleware,
    allow_origins=["*"],  # Or specific origins with subpath
    allow_methods=["*"],
    allow_headers=["*"],
)
```

## Changing the Subpath

To use a different subpath (e.g., `/ai-studio`):

1. Update `backend/.env`:
   ```bash
   ROOT_PATH=/ai-studio
   ```

2. Update frontend environment:
   ```bash
   NEXT_PUBLIC_BASE_PATH=/ai-studio
   NEXT_PUBLIC_API_URL=http://backend:8000/ai-studio
   ```

3. Update `next.config.js`:
   ```javascript
   module.exports = {
     basePath: '/ai-studio',
   }
   ```

4. Update `docker-compose.yml` environment variables

5. Rebuild:
   ```bash
   docker-compose down
   docker-compose up --build
   ```

## Production Deployment

For production, ensure:

1. ✅ SSL/TLS certificates configured on reverse proxy
2. ✅ Firewall rules allow only necessary ports
3. ✅ Backend `.env` file secured with proper permissions
4. ✅ Health checks configured for monitoring
5. ✅ Log aggregation set up for debugging
6. ✅ Rate limiting configured appropriately
7. ✅ Media storage has sufficient disk space
8. ✅ Backup strategy for `.media-storage` and `.video-jobs`

## Reference

- [FastAPI Behind a Proxy](https://fastapi.tiangolo.com/advanced/behind-a-proxy/)
- [Next.js Base Path](https://nextjs.org/docs/api-reference/next.config.js/basepath)

