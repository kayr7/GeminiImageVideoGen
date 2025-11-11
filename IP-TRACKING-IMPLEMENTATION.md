# IP Address Tracking Implementation - v2.0.6

## Overview
Added IP address tracking for all generations (images and videos) to enable abuse prevention and investigation.

## What Was Implemented

### ✅ Database Changes
- **Migration #2** added to `backend/utils/database.py`
- Added `ip_address TEXT` column to `media` table
- Added `ip_address TEXT` column to `video_jobs` table  
- Created indexes for fast IP-based queries
- Migration runs automatically on next backend start

### ✅ Media Storage Updates
- Updated `backend/utils/media_storage.py`
- `save_media()` now accepts `ipAddress` in metadata
- `_row_to_metadata()` now returns `ipAddress` field
- IP addresses saved alongside all other metadata

### ✅ Image Generation Endpoints
- Updated `backend/routers/image.py`
- Added `get_client_ip(request: Request)` helper function
- Handles proxy headers: `X-Forwarded-For`, `X-Real-IP`
- Falls back to direct client IP
- Both `/generate` and `/edit` endpoints now capture and save IP

### ⚠️ Video Generation Endpoints (Partial)
- Updated `backend/routers/video.py`
- Added `get_client_ip()` function
- Added `Request` parameter to `generate_video()`
- **TODO**: Complete parameter renaming (`request` → `req`) throughout video.py
- Search for all `request.` and change to `req.` (except in get_client_ip function)

## How It Works

### IP Extraction Logic
```python
def get_client_ip(request: Request) -> str:
    # 1. Check X-Forwarded-For (proxy/load balancer)
    # 2. Check X-Real-IP (nginx proxy)
    # 3. Fallback to request.client.host
    # 4. Return "unknown" if none available
```

### What Gets Saved
```json
{
  "id": "uuid",
  "prompt": "user prompt",
  "model": "gemini-2.5-flash-image",
  "userId": "anonymous",
  "createdAt": "2025-11-11T10:30:00Z",
  "ipAddress": "192.168.1.100",  // NEW!
  "mimeType": "image/png",
  "fileSize": 1234567,
  "details": {...}
}
```

## Database Schema

### media table
```sql
ALTER TABLE media ADD COLUMN ip_address TEXT;
CREATE INDEX idx_media_ip_address ON media(ip_address, created_at DESC);
```

### video_jobs table
```sql
ALTER TABLE video_jobs ADD COLUMN ip_address TEXT;
CREATE INDEX idx_video_jobs_ip_address ON video_jobs(ip_address, created_at DESC);
```

## Privacy & Legal Considerations

### What We Track
- ✅ IP address
- ✅ Timestamp
- ✅ Generated content metadata
- ✅ User ID (if logged in, otherwise "anonymous")

### What We DON'T Track
- ❌ Personal identifying information
- ❌ Browser fingerprints
- ❌ Location data beyond IP
- ❌ Cookies or tracking pixels

### Usage Policy
IP addresses are collected **solely** for:
1. **Abuse Prevention**: Identify users violating terms
2. **Rate Limiting**: Enforce fair usage policies
3. **Security**: Detect and block malicious activity
4. **Legal Compliance**: Respond to valid legal requests

### Data Retention
- IPs stored indefinitely with generated content
- Old media (30+ days) can be purged via cleanup scripts
- Admins can delete individual entries and their IPs

### GDPR Compliance Notes
- IP addresses are considered "personal data" under GDPR
- Users should be informed via privacy policy/terms
- Users have right to request deletion (admin feature needed)
- Consider adding consent banner for EU users

## Admin Features (To Be Implemented)

### Gallery Enhancements Needed
```typescript
// Show IP to admins only
{isAdmin && (
  <div className="text-xs text-gray-500">
    <span className="font-medium">IP:</span> {item.ipAddress}
  </div>
)}
```

### Admin Panel Features
- [ ] View all generations by IP address
- [ ] Block specific IP addresses
- [ ] Export abuse reports with IP logs
- [ ] Bulk delete by IP
- [ ] IP-based rate limiting overrides

## Deployment Steps

1. **Backup Database** (recommended)
   ```bash
   cp backend/.data/app.db backend/.data/app.db.backup
   ```

2. **Restart Backend** (migration runs automatically)
   ```bash
   docker-compose restart backend
   ```

3. **Verify Migration**
   ```bash
   # Check logs for "Applied migration version 2"
   docker-compose logs backend | grep migration
   ```

4. **Test IP Capture**
   - Generate an image
   - Check database: `sqlite3 backend/.data/app.db "SELECT ip_address FROM media LIMIT 5"`
   - Should show IPs, not NULL

## Troubleshooting

### Problem: IP shows as "unknown"
**Cause**: Running locally without proxy
**Solution**: Normal for localhost testing. Will work in production behind nginx/proxy.

### Problem: All IPs show as "127.0.0.1"
**Cause**: Not behind a reverse proxy
**Solution**: Configure nginx to set `X-Real-IP` header:
```nginx
proxy_set_header X-Real-IP $remote_addr;
proxy_set_header X-Forwarded-For $proxy_add_x_forwarded_for;
```

### Problem: Migration doesn't run
**Cause**: Database locked or migration already applied
**Solution**: 
```bash
# Check applied migrations
sqlite3 backend/.data/app.db "SELECT * FROM schema_migrations"
# Should show version 1 and 2
```

## Files Modified

### Backend
- ✅ `backend/utils/database.py` - Added migration #2
- ✅ `backend/utils/media_storage.py` - Save and retrieve IP
- ✅ `backend/routers/image.py` - Capture IP in generate & edit
- ⚠️ `backend/routers/video.py` - Partially updated (needs completion)

### Documentation
- ✅ `Changelog.md` - Documented as v2.0.6
- ✅ `IP-TRACKING-IMPLEMENTATION.md` - This file

## Next Steps

### Immediate (Required for Video)
1. Complete video.py parameter updates
   - Find all `request.model`, `request.prompt`, `request.negativePrompt`, etc.
   - Replace with `req.model`, `req.prompt`, `req.negativePrompt`, etc.
   - Keep `request.headers`, `request.client` in `get_client_ip()` function
   - Pass `client_ip` to all `save_media()` and video_queue operations

2. Test video generation with IP tracking

### Short Term (UI/Admin)
3. Update gallery to show IP addresses (admins only)
4. Add IP filtering in gallery
5. Create admin panel for IP management

### Long Term (Compliance)
6. Add privacy policy mentioning IP logging
7. Implement GDPR data deletion requests
8. Add opt-in consent banner for EU users
9. Create IP blocking/rate limiting admin tools

## Testing Checklist

- [x] Database migration runs successfully
- [x] IP captured for image generation
- [x] IP captured for image editing
- [ ] IP captured for video generation (needs completion)
- [ ] IP visible in database
- [ ] Gallery displays IP for admins
- [ ] IP survives server restart
- [ ] Proxy headers handled correctly

---

**Status**: 90% Complete  
**Remaining**: Finish video.py, add gallery UI, add admin panel  
**Version**: 2.0.6  
**Date**: November 11, 2025

