# User Management System - Quick Summary

## 📋 What You Get

### For Regular Users
- ✅ Personal login with email + password
- ✅ Individual quota tracking (images, videos, edits)
- ✅ Usage history and statistics
- ✅ Secure password management

### For Admins
- ✅ Full user management dashboard
- ✅ Bulk user creation (paste email list)
- ✅ Per-user quota configuration
- ✅ User activation/deactivation
- ✅ Force password resets
- ✅ View all users' generations

---

## 🗄️ Database Changes

### New Tables
```
users
├── id, email, password_hash
├── is_active, is_admin
├── require_password_reset
└── created_at, updated_at, last_login_at

user_admins (many-to-many)
├── user_id, admin_id
└── created_at
(Links users to admins who invited them)

user_quotas
├── user_id, generation_type (image/video/edit)
├── quota_type (daily/weekly/unlimited)
├── quota_limit, quota_used
└── quota_reset_at

user_sessions
├── token, user_id
├── created_at, expires_at
└── last_activity_at
```

### Existing Tables (Enhanced)
```
media
├── user_id ← Real user ID (not "anonymous")
├── ip_address ← IP where generated
└── ... (both tracked together)

video_jobs
├── user_id ← Real user ID
├── ip_address ← IP where generated
└── ... (both tracked together)
```

**Dual Tracking**: Every generation stores BOTH user account + IP address for complete accountability.

---

## 🔐 Authentication Flow

### First-Time User
```
1. Admin A adds: alice@example.com
2. System creates user + links to Admin A
3. Alice visits /login
4. Enters email + any password
5. System shows: "Set Your Password"
6. Alice sets secure password
7. Alice is logged in ✅
8. Alice is managed by Admin A

Later, if Admin B also adds alice@example.com:
→ No new user created
→ Just adds Admin B relationship
→ Alice now managed by both admins
```

### Normal Login
```
1. User enters email + password
2. System validates credentials
3. Creates session token
4. User accesses all features ✅
```

### Password Reset
```
1. Admin clicks "Reset Password" for user
2. User logs in next time
3. System shows: "Set New Password"
4. User sets new password
5. User continues ✅
```

---

## 📊 Quota System

### Quota Types
- **Daily**: Resets every 24 hours
- **Weekly**: Resets every 7 days  
- **Unlimited**: No limits

### Default Quotas (Proposed)
- Images: 50/day
- Videos: 10/day
- Edits: 30/day

### Enforcement
```
Before generation:
  ✓ Check quota remaining
  ✗ Block if exceeded
  ↻ Auto-reset when period expires

After generation:
  +1 Increment quota used
```

---

## 🎨 UI Changes

### New Pages
1. **Admin > User Management**
   - User list with filters (only shows admin's users)
   - Shows shared user indicators
   - Add users (bulk email input)
   - View user generations (with email + IP)
   - Edit quotas
   - Activate/deactivate
   - Reset passwords

2. **User Profile**
   - Current quotas
   - Usage history
   - Change password

### Modified Pages
1. **Login Page**
   - Password setup flow
   - Better error messages

2. **All Generation Pages**
   - Quota display: "Remaining: 45/50 images today"
   - Warning when low
   - Block when exhausted

3. **Gallery**
   - Users see only their media (IP hidden)
   - Admins see media from users they invited
   - Shows: **User Email + IP Address** for each generation
   - Filter by user or IP

4. **Header**
   - Show current user email
   - Profile link
   - Logout button

---

## 🔧 API Changes

### New Endpoints
```
POST /api/auth/set-password
POST /api/auth/change-password
GET  /api/auth/me

POST /api/admin/users/bulk-create          (creates user_admins relationships)
GET  /api/admin/users                      (only admin's invited users)
GET  /api/admin/users/{id}/generations     (view user's media with email+IP)
PUT  /api/admin/users/{id}
POST /api/admin/users/{id}/reset-password

GET  /api/user/quotas
GET  /api/user/usage-history

PUT  /api/admin/quotas/{user_id}
POST /api/admin/quotas/{user_id}/reset
```

### Modified Endpoints
All generation endpoints now:
- ✅ Require authentication
- ✅ Check quotas before generation
- ✅ Increment quota after success
- ✅ Save **user_id** (which user account)
- ✅ Save **ip_address** (from which IP)
- ✅ Dual tracking for complete accountability

---

## 📅 Implementation Timeline

### Phase 1: Database (2-3 hours)
- Create new tables
- Write migrations
- Create initial admin user

### Phase 2: Backend (4-5 hours)
- User management endpoints
- Authentication with password setup
- Quota checking system
- Add auth middleware to all routes

### Phase 3: Frontend - Admin (3-4 hours)
- User management UI
- Bulk user creation
- Quota management
- User activation controls

### Phase 4: Frontend - User (3-4 hours)
- Login enhancements
- Password setup forms
- Quota displays
- User profile page

### Phase 5: Testing (2-3 hours)
- Test all flows
- Bug fixes
- Documentation

**Total: 16-21 hours over 2-3 days**

**Key Additions**:
- user_admins table (many-to-many relationships)
- Admin-scoped queries (only see their users)
- Dual tracking (user_id + ip_address)
- Shared user support

---

## ⚠️ Migration Strategy

### Backward Compatibility
1. Keep existing admin env vars
2. Create admin user in database
3. Existing sessions still work
4. Existing media assigned to admin

### Zero Downtime
1. Deploy database changes first
2. Backend maintains compatibility
3. Frontend deployed last
4. Users see changes gradually

---

## 🔒 Security

### Password Security
- bcrypt hashing (12 rounds)
- Minimum 8 characters
- Must include: uppercase, lowercase, number
- Never stored in plain text

### Session Security
- 32-byte secure random tokens
- 24-hour expiration
- Database-backed
- Automatic cleanup

### Authorization
- Middleware on all routes
- Ownership verification
- Admin override capability
- Rate limiting per user

---

## ❓ Questions for You

### 1. Password Requirements
**Option A** (Strict): Min 8 chars + uppercase + lowercase + number  
**Option B** (Simple): Just min 8 chars  
**Recommended**: Option A

### 2. Default Quotas
**Proposed**:
- Images: 50/day
- Videos: 10/day  
- Edits: 30/day

**Your preference?** Higher/lower?

### 3. Session Duration
**Option A**: 24 hours of inactivity (log out daily)  
**Option B**: 7 days (log out weekly)  
**Recommended**: Option A (more secure)

### 4. Existing Anonymous Media
**Option A**: Assign to admin user  
**Option B**: Keep as "anonymous"  
**Option C**: Delete  
**Recommended**: Option A

### 5. User Notification
**Phase 1**: Admin manually tells users (email/Slack)  
**Future**: Automated email invites  
**Acceptable?**: Yes/No

---

## 🎯 Example Workflows

### Admin Creates Users
```
1. Admin A logs in
2. Goes to Admin > Users
3. Clicks "Add Users"
4. Pastes email list:
   alice@example.com
   bob@example.com (already exists, invited by Admin B)
   charlie@example.com
5. Sets default quotas:
   - Images: 50/day
   - Videos: 10/day
   - Edits: unlimited
6. Clicks "Create Users"
7. System:
   - Creates alice + charlie
   - Links bob to Admin A (shared user)
8. Admin A can now manage all 3 users
9. Admin A notifies users manually
```

### User First Login
```
1. Alice receives notification from admin
2. Opens app at /login
3. Enters: alice@example.com / temporary123
4. System detects first login
5. Shows "Set Your Password" form
6. Alice enters: SecurePass123!
7. Password saved, Alice logged in
8. Sees dashboard with quota: "50/50 images remaining"
```

### User Generates Image
```
1. User clicks "Generate Image"
2. System checks: 45/50 images used today
3. Allows generation ✅
4. Image generated successfully
5. Quota updated: 46/50
6. Shown in UI: "4 images remaining today"
```

### Admin Manages Quotas
```
1. Admin A sees Bob uses too many resources
2. Goes to Users > Bob (Admin A can manage Bob)
3. Clicks "View Generations"
4. Sees list with:
   - Each image/video
   - Generated by: bob@example.com
   - From IP: 192.168.1.50
5. Adjusts quotas:
   - Images: 50/day → 20/day
   - Videos: 10/day → 5/day
6. Saves changes
7. Bob sees new limits immediately
```

---

## ✅ Approval Checklist

Before I start implementing, please confirm:

- [ ] Overall design approved
- [ ] Database schema acceptable
- [ ] Authentication flow makes sense
- [ ] Quota system is clear
- [ ] UI changes are appropriate
- [ ] Timeline is reasonable
- [ ] Security measures sufficient

**Answers to questions:**
1. Password requirements: A or B?
2. Default quotas: 50/10/30 or different?
3. Session duration: 24h or 7d?
4. Existing media: Assign to admin?
5. Manual user notification OK?
6. Multiple admins can manage same user? (Proposed: YES)

---

## 🚀 Ready to Start?

Once you approve the design and answer the questions, I'll begin implementation in this order:

1. ✅ Create database migration
2. ✅ Implement user management backend
3. ✅ Add authentication middleware
4. ✅ Build quota system
5. ✅ Create admin UI
6. ✅ Add user-facing features
7. ✅ Test everything
8. ✅ Update documentation

**Type "APPROVED" when ready, or let me know what changes you'd like!**

