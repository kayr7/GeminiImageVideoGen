# 🚀 Quick Restart Guide - Quota System Update

## Changes Made

1. ✅ Quota system simplified to **total usage** (no more daily/weekly resets)
2. ✅ Admin dashboard redesigned with inline editing
3. ✅ **0 quota bug fixed** - now properly enforced
4. ✅ Database migration #4 added (auto-runs on startup)

---

## Restart Instructions

### Option 1: Docker Compose (Recommended)

```bash
# Stop and restart with rebuild
docker-compose down
docker-compose up -d --build

# Check logs
docker-compose logs -f backend
```

### Option 2: Development Mode

```bash
# Backend
cd backend
source venv/bin/activate  # or your venv activation
python main.py

# Frontend (in new terminal)
cd ..
npm run dev
```

---

## Verify Changes

1. **Backend logs should show:**
   ```
   INFO:     Applying migration version 4
   INFO:     Database initialized successfully
   ```

2. **Admin Dashboard:**
   - Visit: http://localhost:3000/admin
   - You should see table layout with inline quota editing
   - Quota type options: "Limited" or "Unlimited" (not daily/weekly)

3. **Test 0 Quota:**
   - Create/edit a user with 0 image quota
   - Try to generate an image as that user
   - Should see: "Your image quota is set to 0. Contact your administrator."

---

## What to Expect

### Admin Dashboard
- Table view with all users and quotas visible
- Click "Edit" on any quota → change inline → "Save"
- Quota types: **Limited** or **Unlimited**
- Default limits: Image: 100, Video: 50, Edit: 100

### Generation Pages
- Quota display shows "(Total Usage)"
- No more reset time display
- Warning if quota is 0

### Existing Users
- Old quotas (daily/weekly) still work
- They just won't auto-reset anymore
- Can be updated to "limited" type via admin dashboard

---

## Troubleshooting

**"CHECK constraint failed: user_quotas"**
- Database migration didn't run
- Solution: Restart backend, check logs

**"Quota display still shows daily/weekly"**
- Frontend cache
- Solution: Hard refresh (Ctrl+Shift+R or Cmd+Shift+R)

**"Can't set quota to 0"**
- Old frontend code
- Solution: Rebuild frontend (`npm run build`)

---

## Next Steps

After verifying everything works:

1. **Update existing users** (optional):
   - Go to admin dashboard
   - Click "Edit" on each user's quotas
   - Change from "daily"/"weekly" to "limited"
   - Set appropriate total limits

2. **Test quota enforcement**:
   - Set a test user to 5 image quota
   - Generate 5 images
   - Try 6th → should be blocked

3. **Read full docs**:
   - `QUOTA-SYSTEM-UPDATE.md` - Complete details
   - `ADMIN-UI-SIMPLIFIED.md` - Admin dashboard guide
   - `Changelog.md` - Version 3.1.0 notes

---

**Ready to go! 🎉**

All your data is preserved, and the system is now simpler and more predictable.

