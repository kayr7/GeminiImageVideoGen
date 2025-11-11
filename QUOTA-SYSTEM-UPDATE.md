# 🔄 Quota System Update - Total Usage Model

## Overview

The quota system has been simplified from a time-based model (daily/weekly) to a **total usage model** where quotas represent lifetime totals until manually reset by an admin.

---

## What Changed

### Before ❌
- Quotas were time-based: Daily, Weekly, Unlimited
- Automatically reset at midnight (daily) or Monday (weekly)
- Complex reset time calculations
- Not ideal for controlling total costs

### After ✅
- Quotas are now: **Limited** or **Unlimited**
- **Limited** = Total usage count (e.g., 100 images total)
- **Unlimited** = No restrictions
- **Manual reset only** - Admins control when to reset
- **0 quotas are respected** - Fixed bug where 0 wasn't enforced

---

## Key Changes

### Backend

#### 1. `backend/utils/quota_manager.py`
- Removed time-based logic (`_calculate_reset_time`, `_reset_quota`)
- Updated `DEFAULT_QUOTAS`:
  ```python
  DEFAULT_QUOTAS = {
      "image": {"type": "limited", "limit": 100},
      "video": {"type": "limited", "limit": 50},
      "edit": {"type": "limited", "limit": 100},
  }
  ```
- `check_quota` now properly handles 0 quotas with specific error message
- `create_quota` validates and enforces 0 as a valid limit
- `quota_reset_at` field no longer used (kept for DB compatibility)

#### 2. `backend/utils/database.py`
- **Migration 4** added to update `user_quotas` table
- Updated CHECK constraint: `quota_type IN ('daily', 'weekly', 'limited', 'unlimited')`
- Recreates table to support new quota types
- Preserves all existing data

### Frontend

#### 1. `app/admin/page.tsx`
- Simplified quota type selector: **Limited** or **Unlimited**
- Default quota limits updated:
  - Image: 100
  - Video: 50
  - Edit: 100
- Inline editing supports 0 quotas (`min="0"`)
- Display shows "Total: X" instead of quota type name
- Fixed input handling to properly set 0 values

#### 2. `components/generators/QuotaDisplay.tsx`
- Removed reset time display
- Updated labels to show "(Total Usage)"
- Added specific warning for 0 quotas
- Simplified logic (no more time calculations)

---

## Benefits

✅ **Simpler** - No time-based complexity
✅ **Predictable** - Quotas don't auto-reset
✅ **Cost Control** - Better for managing total usage
✅ **Admin Control** - Admins decide when to reset
✅ **0 Quotas Work** - Can now set quotas to 0 to disable features

---

## Usage

### Setting Quotas (Admin)

1. Go to Admin Dashboard
2. Click **"Edit"** on any quota
3. Select:
   - **Limited** → Enter total number (can be 0)
   - **Unlimited** → No restrictions
4. Click **"Save"**

### Creating Users (Admin)

1. Click **"+ Add Users"**
2. Enter emails (one per line)
3. Select default quota type
4. Enter limits for each generation type (can be 0)
5. Click **"Create Users"**

### Resetting Quotas (Admin)

Currently manual via API:
```bash
curl -X POST http://localhost:8001/api/admin/quotas/{user_id}/reset \
  -H "Authorization: Bearer {admin_token}" \
  -d '{"generationType": "image"}'
```

*(UI button for reset coming in future update)*

---

## Database Migration

The migration is automatic on backend restart:

1. Creates new `user_quotas_new` table with updated constraints
2. Copies all data from `user_quotas` 
3. Drops old table
4. Renames new table
5. Recreates indexes

**Existing quotas are preserved** - 'daily' and 'weekly' types still valid but not used going forward.

---

## API Changes

### Quota Response
```json
{
  "generationType": "image",
  "quotaType": "limited",  // or "unlimited"
  "quotaLimit": 100,       // null if unlimited
  "quotaUsed": 45,
  "quotaRemaining": 55,    // null if unlimited
  "quotaResetAt": null     // No longer used
}
```

### Create/Update Quota
```json
{
  "quotas": {
    "image": {
      "type": "limited",  // or "unlimited"
      "limit": 100        // required if type is "limited", can be 0
    }
  }
}
```

---

## Testing

### Test 0 Quota Enforcement

1. Set a user's image quota to 0
2. Try to generate an image as that user
3. Should see error: "Your image quota is set to 0. Contact your administrator."

### Test Total Usage

1. Set a user's image quota to 5
2. Generate 5 images
3. Try to generate 6th image
4. Should see: "Quota exceeded. You have used 5/5 image generations."

### Test Unlimited

1. Set a user's quota to "unlimited"
2. Generate as many as you want
3. Should always succeed

---

## Migration Path

### For Existing Users

**Option 1: Keep Existing (Recommended)**
- Existing daily/weekly quotas continue to work
- They just won't auto-reset anymore
- Admins can manually reset when needed

**Option 2: Migrate to Limited**
- Update all users' quotas to "limited" type
- Set appropriate total limits
- Reset usage counts to 0

Migration script (if needed):
```python
# Convert all daily quotas to limited with same limit
from backend.utils.quota_manager import QuotaManager
from backend.utils.user_manager import UserManager

users = UserManager.get_all_users()  # You'd need to implement this
for user in users:
    quotas = QuotaManager.get_all_quotas(user.id)
    for quota in quotas:
        if quota.quota_type in ['daily', 'weekly']:
            QuotaManager.update_quota(
                user.id,
                quota.generation_type,
                quota_type='limited',
                quota_limit=quota.quota_limit
            )
```

---

## Future Enhancements

Possible improvements:
- [ ] **Bulk reset** - Reset quotas for multiple users
- [ ] **Auto-reset schedules** - Optional monthly/yearly resets
- [ ] **Quota expiration** - Time-limited quotas
- [ ] **Quota transfer** - Move unused quota between users
- [ ] **Usage analytics** - Charts showing quota usage over time
- [ ] **Reset button in UI** - One-click quota reset in admin dashboard

---

## Breaking Changes

⚠️ **Minor Breaking Changes:**

1. **API Response**: `quotaResetAt` is now always `null`
2. **Quota Types**: 'daily' and 'weekly' deprecated (still work but not recommended)
3. **Default Quotas**: New users get different default limits

**Migration Strategy**: 
- No action required for most deployments
- Existing data is preserved
- New quota types work alongside old ones

---

## Deployment

### 1. Update Backend

```bash
cd backend
docker-compose down
docker-compose up -d --build
```

The database migration runs automatically on startup.

### 2. Update Frontend

```bash
cd ..
npm run build
docker-compose restart frontend
```

### 3. Verify

- Check admin dashboard shows new quota options
- Test creating a user with 0 quota
- Test generating with limited quota

---

## Rollback (If Needed)

If you need to rollback:

1. **Revert code changes**:
   ```bash
   git revert HEAD
   ```

2. **Database**: The migration preserves old data, so reverting code is enough

3. **Restart services**:
   ```bash
   docker-compose restart
   ```

---

## Support

**Common Issues:**

1. **"CHECK constraint failed"** → Database migration didn't run. Restart backend.
2. **"0 quota not working"** → Clear browser cache and refresh.
3. **"Can't create user with 0"** → Make sure you're on latest backend version.

---

**The quota system is now simpler, more predictable, and properly enforces 0 quotas!** 🎉

Last updated: 2024-11-11
Version: 3.1.0

