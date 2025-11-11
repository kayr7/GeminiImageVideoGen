# 🎯 Simplified to Two Quota Types

## Overview

The quota system has been further simplified from 3 types (image, video, edit) to just **2 types** (image, video). Editing operations now count towards their respective generation quotas.

---

## What Changed

### Before ❌
- **3 separate quotas**: Image, Video, Edit
- Editing images/videos counted towards "edit" quota
- Confusing for users - "what's the difference between image and edit?"
- More complex to manage and explain

### After ✅
- **2 quotas only**: Image, Video
- **Image editing** counts towards **image quota**
- **Video editing** counts towards **video quota**
- Simpler, more intuitive
- Easier to manage

---

## Why This Makes Sense

### Conceptual Clarity
- Editing an image **is** generating an image (with modifications)
- Editing a video **is** generating a video (with modifications)
- Users think in terms of: "How many images can I make?" not "How many edits vs generations?"

### Practical Benefits
- ✅ **Simpler quotas** - Only 2 numbers to track
- ✅ **Clearer limits** - "100 images" includes all image operations
- ✅ **Less confusion** - No need to explain edit vs generation
- ✅ **Easier admin** - Fewer fields to configure

---

## Technical Changes

### Backend

#### 1. `backend/utils/quota_manager.py`
```python
# Before
DEFAULT_QUOTAS = {
    "image": {"type": "limited", "limit": 100},
    "video": {"type": "limited", "limit": 50},
    "edit": {"type": "limited", "limit": 100},  # REMOVED
}

# After
DEFAULT_QUOTAS = {
    "image": {"type": "limited", "limit": 100},
    "video": {"type": "limited", "limit": 50},
}
```

#### 2. `backend/utils/database.py`
- **Migration #5** added
- Updates `user_quotas` table constraint
- Only allows `generation_type IN ('image', 'video')`
- Automatically removes old "edit" quotas
- Preserves image and video quotas

#### 3. `backend/routers/image.py`
```python
# Image editing endpoint - check_quota changed from "edit" to "image"

# Before
has_quota, error_msg = QuotaManager.check_quota(db_user.id, "edit")
...
QuotaManager.increment_quota(db_user.id, "edit")

# After
has_quota, error_msg = QuotaManager.check_quota(db_user.id, "image")
...
QuotaManager.increment_quota(db_user.id, "image")
```

### Frontend

#### 1. `app/admin/page.tsx`

**Bulk Creation Form:**
- Before: 3 input fields (Image, Video, Edit)
- After: 2 input fields (Image, Video)
- Added helper text: "(includes editing)"

**Table View:**
- Removed "Edit Quota" column
- Only shows "Image Quota" and "Video Quota"
- Column headers show "(includes editing)"

**State Management:**
- Removed `editQuotaLimit` state
- Removed edit quota from `defaultQuotas`
- Removed edit quota rendering logic

---

## User Impact

### For End Users
- **Clearer understanding** - "I have 100 image operations total"
- **No confusion** - Don't need to differentiate edit vs generate
- **Same functionality** - Can still edit images, just counts differently

### For Admins
- **Simpler setup** - Only 2 quota fields per user
- **Easier explanation** - "Image quota covers all image operations"
- **Cleaner UI** - Less cluttered table view

---

## Migration Details

### Automatic Migration #5

**What it does:**
1. Creates new `user_quotas` table with updated constraint
2. Copies **only** `image` and `video` quotas from old table
3. **Drops** all `edit` quotas (no longer needed)
4. Drops old table
5. Renames new table
6. Recreates indexes

**Data Safety:**
- ✅ Image quotas preserved
- ✅ Video quotas preserved
- ❌ Edit quotas removed (by design)

**Existing Users:**
- Image and video quotas unchanged
- Edit quota usage "lost" (but now merged into image conceptually)
- No action required

---

## Examples

### Scenario 1: User generates 50 images, edits 20

**Before (3 quotas):**
- Image quota: 50/100 used
- Edit quota: 20/100 used
- Total operations: 70

**After (2 quotas):**
- Image quota: 70/100 used (includes edits)
- Total operations: 70

### Scenario 2: Admin sets up new user

**Before:**
- Set image quota: 100
- Set video quota: 50
- Set edit quota: 100
- **Total**: 3 fields

**After:**
- Set image quota: 100 (includes editing)
- Set video quota: 50 (includes editing)
- **Total**: 2 fields

---

## UI Changes

### Admin Dashboard Table

**Before:**
```
| User | Status | Image Q | Video Q | Edit Q | Actions |
|------|--------|---------|---------|--------|---------|
| Alice| Active | 45/100  | 5/50    | 10/100 | ...     |
```

**After:**
```
| User | Status | Image Q         | Video Q         | Actions |
|------|--------|-----------------|-----------------|---------|
|      |        | (inc. editing)  | (inc. editing)  |         |
| Alice| Active | 55/100          | 5/50            | ...     |
```

### Bulk Creation Form

**Before:**
- Image Quota: [100]
- Video Quota: [50]
- Edit Quota: [100]

**After:**
- Image Quota (includes image editing): [100]
- Video Quota (includes video editing): [50]

---

## API Changes

### Quota Endpoints

**No breaking changes** - API still accepts 3 generation types for backward compatibility, but:
- Creating "edit" quotas will fail (constraint violation)
- Existing "edit" quotas automatically removed by migration
- Recommend updating clients to only use "image" and "video"

### Generation Endpoints

**Before:**
```
POST /api/image/generate  → checks "image" quota
POST /api/image/edit      → checks "edit" quota
POST /api/video/generate  → checks "video" quota
```

**After:**
```
POST /api/image/generate  → checks "image" quota
POST /api/image/edit      → checks "image" quota  ← CHANGED
POST /api/video/generate  → checks "video" quota
```

---

## Testing

### Test Image Editing Quota

1. Set user's image quota to 10
2. Generate 5 images
3. Edit 5 images
4. Try to generate 1 more → Should fail (10/10 used)

**Before:** Would succeed (edit quota separate)
**After:** Fails correctly (edit counts towards image)

### Test Admin UI

1. Go to admin dashboard
2. See only 2 quota columns (Image, Video)
3. Click "Add Users"
4. See only 2 quota input fields
5. Column headers show "(includes editing)"

---

## Documentation Updates

### User Guide
- ✅ Update quota explanations
- ✅ Remove references to "edit quota"
- ✅ Clarify that editing counts towards generation quota

### Admin Guide
- ✅ Update screenshots (2 columns not 3)
- ✅ Update bulk creation instructions
- ✅ Explain the "includes editing" note

### API Documentation
- ✅ Update quota type list
- ✅ Note deprecation of "edit" type
- ✅ Update example responses

---

## Rollback

If you need to revert:

1. **Revert code**:
   ```bash
   git revert HEAD
   ```

2. **Database**: Migration #5 removed edit quotas permanently
   - Can't automatically restore
   - Would need to manually recreate if needed

3. **Recommendation**: Don't rollback - the change is simpler and better

---

## Future Considerations

### Video Editing
When video editing is implemented:
- Will automatically use video quota
- No code changes needed
- Already handled in architecture

### Quota Reset Feature
- Admins can still reset image/video quotas individually
- Reset buttons to be added to UI in future
- API already supports it

---

## Benefits Summary

✅ **Simpler mental model** - 2 types instead of 3
✅ **Less configuration** - Fewer fields to set
✅ **Clearer UI** - Less cluttered admin dashboard
✅ **More intuitive** - Editing is just a type of generation
✅ **Easier to explain** - "100 image operations total"
✅ **Reduced complexity** - Less code, less confusion

---

## Breaking Changes

⚠️ **Minor Breaking Changes:**

1. **"edit" quota type removed** - Can no longer create edit quotas
2. **Database constraint** - Only accepts "image" and "video"
3. **Existing edit quotas** - Automatically deleted by migration #5

**Migration Strategy:**
- Automatic migration handles everything
- No manual steps required
- Existing users' image/video quotas preserved

---

## Deployment

### 1. Restart Backend

```bash
docker-compose down
docker-compose up -d --build
```

**Check logs:**
```
INFO:     Applying migration version 5
INFO:     Migration 5 completed
```

### 2. Restart Frontend

```bash
docker-compose restart frontend
# or
npm run build && docker-compose restart frontend
```

### 3. Verify

- ✅ Admin dashboard shows 2 quota columns
- ✅ Bulk creation form has 2 input fields
- ✅ Image editing uses image quota
- ✅ No errors in backend logs

---

**The quota system is now simpler and more intuitive!** 🎯

Version: 3.2.0
Date: 2025-11-11
Migration: #5 (automatic)
Breaking: Minor (edit quota removed)

