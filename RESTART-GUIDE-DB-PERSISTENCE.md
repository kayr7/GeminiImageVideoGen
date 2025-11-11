# Restart Guide: Database Persistence

## What Changed
The SQLite database is now persisted across container restarts using a Docker volume.

## Quick Restart

### Method 1: Docker Compose (Recommended)
```bash
cd /Users/rottmann/Coding/GeminiImageVideoGen

# Stop containers
docker-compose down

# Rebuild and start with new volume configuration
docker-compose up --build -d

# Check logs
docker-compose logs -f backend
```

### Method 2: Development Mode
```bash
cd /Users/rottmann/Coding/GeminiImageVideoGen/backend

# Just restart - database will be in backend/.data/
python -m uvicorn main:app --reload --host 0.0.0.0 --port 8000
```

## What to Expect

### ✅ Database Will Persist
- All existing media metadata survives
- IP addresses remain tracked
- Video job queue state maintained
- No data loss on restart

### ✅ Files Already Persisted (No Change)
- Images in `.media-storage/`
- Videos in `.media-storage/`
- Job metadata in `.video-jobs/`

### ✅ New Volume Mount
```yaml
volumes:
  - ./backend/.data:/app/.data  # ← NEW!
```

## Verification

### 1. Check Volume is Mounted
```bash
docker-compose exec backend ls -la /app/.data
# Should show: app.db
```

### 2. Check Database Exists on Host
```bash
ls -lh backend/.data/app.db
# Should show database file
```

### 3. Test Persistence
```bash
# Generate an image

# Restart backend
docker-compose restart backend

# Go to gallery - image should still be there ✅
```

## Troubleshooting

### Problem: Directory Doesn't Exist
```bash
mkdir -p backend/.data
docker-compose up -d
```

### Problem: Permission Denied
```bash
chmod 755 backend/.data
docker-compose restart backend
```

### Problem: Old Database Lost
If you had data before this change:
1. The database was **inside the container** and is now gone
2. Media files (images/videos) are still in `.media-storage/` ✅
3. Just regenerate - new database will persist from now on

## Next Steps
See `DATABASE-PERSISTENCE.md` for:
- Backup strategies
- Migration guides
- Security considerations
- Monitoring tips

---

**Ready to restart?** Just run:
```bash
docker-compose down && docker-compose up --build -d
```

