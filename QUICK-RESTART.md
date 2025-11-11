# Quick Restart Guide

## What Changed
✅ **Database now persists across container restarts**  
✅ **Admin can see IP addresses in gallery**  
✅ **Privacy notice added to gallery**

---

## Restart Your Application

### Option 1: Docker Compose (Production)
```bash
cd /Users/rottmann/Coding/GeminiImageVideoGen

# Stop and rebuild
docker-compose down
docker-compose up --build -d

# Watch logs
docker-compose logs -f backend
```

### Option 2: Development Mode
```bash
# Terminal 1 - Backend
cd /Users/rottmann/Coding/GeminiImageVideoGen/backend
python -m uvicorn main:app --reload --host 0.0.0.0 --port 8000

# Terminal 2 - Frontend
cd /Users/rottmann/Coding/GeminiImageVideoGen
npm run dev
```

---

## Verify Everything Works

### 1. Database Persistence
```bash
# Check database file exists
ls -lh backend/.data/app.db

# Generate an image
# Restart backend
# Image should still be in gallery ✅
```

### 2. IP Display (Admin Only)
- Login as admin
- Go to gallery
- Each media card shows IP at bottom ✅

### 3. Privacy Notice
- Visit gallery
- Blue notice box at top ✅

---

## Backup Database (Optional but Recommended)
```bash
# Create backup before restarting
cp backend/.data/app.db backend/.data/app.db.backup
```

---

## Troubleshooting

### Database directory doesn't exist
```bash
mkdir -p backend/.data
```

### Permission denied
```bash
chmod 755 backend/.data
```

### Want to start fresh
```bash
# DANGER: This deletes all your data!
rm -rf backend/.data
docker-compose restart backend
```

---

**Ready to go!** Just run:
```bash
docker-compose down && docker-compose up --build -d
```

See `SUMMARY-2024-11-11-v3.md` for complete details.

