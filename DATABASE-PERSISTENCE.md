# Database Persistence Setup

## Overview
The SQLite database is now persisted across container restarts using Docker volumes.

## What's Persisted

### Database Location
- **Path inside container**: `/app/.data/app.db`
- **Path on host**: `./backend/.data/app.db`
- **What it contains**:
  - Media metadata (images, videos)
  - Video job queue
  - IP addresses for abuse tracking
  - User sessions
  - Admin settings

### Other Persisted Data
1. **Media Storage**: `./backend/.media-storage/`
   - Actual image and video files
   - Organized by type (images/, videos/)

2. **Video Jobs**: `./backend/.video-jobs/`
   - Video generation job metadata
   - Used for tracking async video operations

3. **Database**: `./backend/.data/` ← **NEW!**
   - SQLite database file
   - Schema migrations tracking
   - All metadata and settings

## Docker Compose Configuration

```yaml
services:
  backend:
    volumes:
      - ./backend/.media-storage:/app/.media-storage  # Media files
      - ./backend/.video-jobs:/app/.video-jobs        # Video job queue
      - ./backend/.data:/app/.data                    # Database ← NEW!
```

## How It Works

### Volume Mounting
When you start the containers, Docker creates a bind mount:
- **Host directory**: `./backend/.data/`
- **Container directory**: `/app/.data/`

Any changes to the database inside the container are written to the host filesystem, so they persist even when containers are stopped or rebuilt.

## Benefits

### ✅ Data Persistence
- Database survives container restarts
- Database survives container rebuilds
- Database survives `docker-compose down`

### ✅ Easy Backups
```bash
# Backup the database
cp backend/.data/app.db backend/.data/app.db.backup

# Or backup with timestamp
cp backend/.data/app.db backend/.data/app.db.$(date +%Y%m%d_%H%M%S)
```

### ✅ Easy Migration
```bash
# Copy database to another server
scp backend/.data/app.db user@server:/path/to/backend/.data/
```

### ✅ Development Workflow
- Database changes persist during development
- No need to regenerate test data after restarts
- Migrations only run once

## Directory Structure

```
backend/
├── .data/              ← Database directory (persisted)
│   └── app.db         ← SQLite database file
├── .media-storage/    ← Media files (persisted)
│   ├── images/
│   └── videos/
└── .video-jobs/       ← Job metadata (persisted)
```

## First-Time Setup

### 1. Create Directory
The directory is created automatically on first run, but you can create it manually:

```bash
mkdir -p backend/.data
```

### 2. Set Permissions (Linux/Mac)
```bash
# Ensure the backend can write to it
chmod 755 backend/.data
```

### 3. Start Containers
```bash
docker-compose up -d
```

The database will be created on first run with all migrations applied.

## Verifying Persistence

### Test 1: Container Restart
```bash
# Generate some content (images/videos)

# Restart backend
docker-compose restart backend

# Check gallery - content should still be there ✅
```

### Test 2: Container Rebuild
```bash
# Generate some content

# Rebuild and restart
docker-compose down
docker-compose up --build -d

# Check gallery - content should still be there ✅
```

### Test 3: Database Inspection
```bash
# Check if database file exists on host
ls -lh backend/.data/app.db

# View database contents
sqlite3 backend/.data/app.db "SELECT COUNT(*) as total FROM media"

# View schema migrations
sqlite3 backend/.data/app.db "SELECT * FROM schema_migrations"
```

## Backup Strategy

### Manual Backup
```bash
# Simple copy
cp backend/.data/app.db backend/.data/app.db.backup

# Timestamped backup
cp backend/.data/app.db "backend/.data/app.db.backup.$(date +%Y%m%d_%H%M%S)"
```

### Automated Backup (Cron)
```bash
# Add to crontab (daily backup at 2 AM)
0 2 * * * cp /path/to/backend/.data/app.db /path/to/backups/app.db.$(date +\%Y\%m\%d)

# Keep only last 7 days
0 3 * * * find /path/to/backups -name "app.db.*" -mtime +7 -delete
```

### Backup Script
Create `backup-database.sh`:

```bash
#!/bin/bash
BACKUP_DIR="./backups"
TIMESTAMP=$(date +%Y%m%d_%H%M%S)
DB_FILE="backend/.data/app.db"

mkdir -p "$BACKUP_DIR"
cp "$DB_FILE" "$BACKUP_DIR/app.db.$TIMESTAMP"

echo "Database backed up to: $BACKUP_DIR/app.db.$TIMESTAMP"

# Keep only last 10 backups
ls -t "$BACKUP_DIR"/app.db.* | tail -n +11 | xargs rm -f
```

## Restoring from Backup

### Stop Containers
```bash
docker-compose down
```

### Restore Database
```bash
# Replace current database with backup
cp backend/.data/app.db.backup backend/.data/app.db
```

### Restart Containers
```bash
docker-compose up -d
```

## Troubleshooting

### Problem: Database not found
```
Error: no such file or directory: .data/app.db
```

**Solution**: The directory should be created automatically, but if not:
```bash
mkdir -p backend/.data
docker-compose restart backend
```

### Problem: Permission denied
```
Error: unable to open database file
```

**Solution**: Fix directory permissions:
```bash
chmod 755 backend/.data
docker-compose restart backend
```

### Problem: Database locked
```
Error: database is locked
```

**Solution**: Another process is using the database:
```bash
# Check for processes
lsof backend/.data/app.db

# Restart backend
docker-compose restart backend
```

### Problem: Corrupted database
```
Error: database disk image is malformed
```

**Solution**: Restore from backup:
```bash
docker-compose down
cp backend/.data/app.db.backup backend/.data/app.db
docker-compose up -d
```

## Migration Between Environments

### Export from Dev
```bash
# Stop containers
docker-compose down

# Backup database and media
tar -czf backup.tar.gz backend/.data backend/.media-storage

# Copy to production server
scp backup.tar.gz user@prod-server:/path/
```

### Import to Production
```bash
# Stop production containers
docker-compose down

# Extract backup
tar -xzf backup.tar.gz

# Start containers
docker-compose up -d
```

## Monitoring Database Size

### Check Current Size
```bash
# Database file size
du -h backend/.data/app.db

# Total media size
du -sh backend/.media-storage

# Combined total
du -sh backend/.data backend/.media-storage
```

### Set Up Alerts
```bash
# Alert if database exceeds 1GB
DB_SIZE=$(du -b backend/.data/app.db | cut -f1)
if [ $DB_SIZE -gt 1073741824 ]; then
    echo "Warning: Database size exceeds 1GB"
fi
```

## .gitignore Configuration

The database directory is now in `.gitignore`:

```gitignore
# Media storage and data
.media-storage/
.video-jobs/
backend/.data/  ← Prevents committing database to git
```

This prevents accidentally committing:
- Database files
- User-generated content
- Sensitive metadata (IPs, prompts)

## Performance Considerations

### Database File I/O
- SQLite performs well with bind mounts
- No performance degradation vs internal storage
- WAL mode enabled for better concurrency

### Disk Space
Monitor available space:
```bash
df -h .  # Check disk usage where backend/ is located
```

### Cleanup Old Data
```bash
# Delete media older than 30 days
find backend/.media-storage -type f -mtime +30 -delete

# Vacuum database to reclaim space
sqlite3 backend/.data/app.db "VACUUM"
```

## Security Considerations

### File Permissions
```bash
# Restrict access to database
chmod 600 backend/.data/app.db

# Only owner can read/write
ls -l backend/.data/app.db
# -rw------- 1 user user ... app.db
```

### Backup Encryption
```bash
# Encrypt backup
gpg -c backend/.data/app.db

# Creates encrypted file
# app.db.gpg
```

### Access Control
- Database contains IP addresses (personal data)
- Ensure host directory has proper permissions
- Consider encrypting backups for compliance

---

**Status**: Implemented ✅  
**Version**: 2.0.7  
**Date**: November 11, 2025

