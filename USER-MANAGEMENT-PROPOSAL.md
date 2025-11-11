# User Management System - Implementation Proposal

## Overview
Transform the current single-admin system into a full multi-user platform with admin-controlled user management and per-user quotas.

---

## Requirements Summary

1. **Authentication Required**: All users must login before accessing any generation features
2. **Admin-Controlled Registration**: Only admins can add users (no self-signup)
3. **Email-Based Invites**: Users receive invite via email list, set password on first login
4. **Admin Password Reset**: Admins can force password reset for users
5. **User Activation/Deactivation**: Admins can enable/disable user accounts
6. **Per-User Quotas**: Configurable limits per user for each generation type (daily/weekly/unlimited)

---

## Architecture Design

### 1. Database Schema Changes

#### Key Design Decisions

**Dual Tracking for Generations**:
- `user_id`: Which user account generated the content (for quota, ownership)
- `ip_address`: From which IP address (for abuse prevention, compliance)
- Both fields stored together provide complete accountability

**Admin-User Relationships**:
- Many-to-many relationship via `user_admins` table
- Multiple admins can invite the same user
- Each admin only sees/manages users they invited
- Users can be managed by multiple admins independently

#### New Tables

**`users` table**:
```sql
CREATE TABLE users (
    id TEXT PRIMARY KEY,              -- UUID
    email TEXT UNIQUE NOT NULL,       -- User email (unique identifier)
    password_hash TEXT,               -- Hashed password (NULL until first login)
    is_active BOOLEAN DEFAULT 1,      -- Can user login?
    is_admin BOOLEAN DEFAULT 0,       -- Admin privileges?
    require_password_reset BOOLEAN DEFAULT 1,  -- Force password change?
    created_at TEXT NOT NULL,
    updated_at TEXT NOT NULL,
    last_login_at TEXT
);
CREATE INDEX idx_users_email ON users(email);
CREATE INDEX idx_users_active ON users(is_active);
```

**`user_admins` table** (many-to-many relationship):
```sql
CREATE TABLE user_admins (
    id TEXT PRIMARY KEY,              -- UUID
    user_id TEXT NOT NULL,            -- User being managed
    admin_id TEXT NOT NULL,           -- Admin who can manage this user
    created_at TEXT NOT NULL,
    FOREIGN KEY (user_id) REFERENCES users(id) ON DELETE CASCADE,
    FOREIGN KEY (admin_id) REFERENCES users(id) ON DELETE CASCADE,
    UNIQUE(user_id, admin_id)         -- Prevent duplicate relationships
);
CREATE INDEX idx_user_admins_user ON user_admins(user_id);
CREATE INDEX idx_user_admins_admin ON user_admins(admin_id);
```

**Why many-to-many?** Multiple admins can invite the same user. Each admin who invited a user can manage that user's settings.

**`user_quotas` table**:
```sql
CREATE TABLE user_quotas (
    id TEXT PRIMARY KEY,              -- UUID
    user_id TEXT NOT NULL,
    generation_type TEXT NOT NULL CHECK (generation_type IN ('image', 'video', 'edit')),
    quota_type TEXT NOT NULL CHECK (quota_type IN ('daily', 'weekly', 'unlimited')),
    quota_limit INTEGER,              -- NULL for unlimited
    quota_used INTEGER DEFAULT 0,
    quota_reset_at TEXT,              -- When quota resets
    created_at TEXT NOT NULL,
    updated_at TEXT NOT NULL,
    FOREIGN KEY (user_id) REFERENCES users(id) ON DELETE CASCADE
);
CREATE INDEX idx_user_quotas_user_id ON user_quotas(user_id);
CREATE INDEX idx_user_quotas_type ON user_quotas(user_id, generation_type);
```

**`user_sessions` table** (enhanced existing session management):
```sql
CREATE TABLE user_sessions (
    token TEXT PRIMARY KEY,
    user_id TEXT NOT NULL,
    created_at TEXT NOT NULL,
    expires_at TEXT NOT NULL,
    last_activity_at TEXT NOT NULL,
    FOREIGN KEY (user_id) REFERENCES users(id) ON DELETE CASCADE
);
CREATE INDEX idx_user_sessions_user_id ON user_sessions(user_id);
CREATE INDEX idx_user_sessions_expires ON user_sessions(expires_at);
```

#### Modified Tables

**`media` table** - Already tracks user and IP:
```sql
-- Already has:
user_id TEXT NOT NULL,  -- ✅ Already stores user ID
ip_address TEXT,         -- ✅ Already stores IP address

-- Both are now used:
-- - user_id: Which user account generated this
-- - ip_address: From which IP address
-- This provides dual tracking for accountability and abuse prevention
```

**`video_jobs` table** - Same tracking:
```sql
-- Already has:
user_id TEXT NOT NULL,  -- ✅ Already stores user ID
ip_address TEXT,         -- ✅ Already stores IP address

-- Both tracked for video generations too
```

**No migration needed** - Both fields already exist! We just need to:
- Change `user_id` from "anonymous" to actual user IDs
- Continue storing `ip_address` as before

---

### 2. Backend API Changes

#### New Endpoints

**Authentication Routes** (`/api/auth/*`):
- `POST /api/auth/login` - Enhanced to handle first-time password setup
- `POST /api/auth/logout` - Invalidate session
- `POST /api/auth/set-password` - First-time password setup
- `POST /api/auth/change-password` - User changes their own password
- `GET /api/auth/me` - Get current user info + quota status

**Admin User Management** (`/api/admin/users/*`):
- `GET /api/admin/users` - List users **invited by current admin**
- `POST /api/admin/users/bulk-create` - Add multiple users (creates user_admins relationship)
- `GET /api/admin/users/{user_id}` - Get user details (only if admin invited them)
- `PUT /api/admin/users/{user_id}` - Update user (only if admin invited them)
- `POST /api/admin/users/{user_id}/reset-password` - Force password reset (only their users)
- `DELETE /api/admin/users/{user_id}` - Remove admin relationship (or delete if no other admins)
- `GET /api/admin/users/{user_id}/generations` - View user's generations with user email + IP

**Admin Quota Management** (`/api/admin/quotas/*`):
- `GET /api/admin/quotas/{user_id}` - Get user quotas
- `PUT /api/admin/quotas/{user_id}` - Set/update user quotas
- `POST /api/admin/quotas/{user_id}/reset` - Manually reset quota usage

**User Quota Info** (`/api/user/*`):
- `GET /api/user/quotas` - Current user's quota status
- `GET /api/user/usage-history` - Usage statistics

#### Modified Endpoints

**All Generation Endpoints**:
- Add authentication middleware: `user = Depends(get_current_user)`
- Add quota check before generation: `check_user_quota(user, "image")`
- Increment quota usage after successful generation
- Save both `user_id` (user account) and `ip_address` (IP tracking)
- Example: `save_media(..., user_id=user.id, ip_address=get_client_ip(request))`

**Media Endpoints**:
- `/api/media/list` - Filter by current user (non-admins see only their media)
  - Admins see media from users they invited
  - Response includes: user email, IP address (for admin view)
- `/api/media/{id}` - Verify ownership or admin relationship
- `DELETE /api/media/{id}` - Verify ownership or admin relationship

---

### 3. Authentication Flow

#### Login Flow
```
1. User enters email + password
2. Backend checks:
   - User exists?
   - User is_active?
   - Password correct (if set)?
   - require_password_reset flag?
3a. If password not set OR require_password_reset:
    → Return { requirePasswordSetup: true }
    → Frontend shows "Set Password" form
    → User submits new password
    → Backend sets password_hash, require_password_reset=false
    → Create session, return token
3b. If password correct:
    → Create session, return token
    → Update last_login_at
```

#### First-Time User Flow
```
1. Admin (e.g., admin@example.com) adds user email(s) in admin panel
2. System checks if user exists:
   - If NEW: Create user + create user_admins relationship
   - If EXISTS: Just add user_admins relationship (shared user)
3. User created/linked with:
   - email: provided
   - password_hash: NULL (if new user)
   - is_active: true
   - require_password_reset: true (if new user)
   - user_admins: Link to inviting admin
4. User visits login page, enters email + temporary "any" password
5. Backend detects password_hash=NULL
6. Frontend shows "Set Your Password" form
7. User sets password
8. User is logged in
9. User now managed by inviting admin(s)
```

#### Password Reset Flow
```
1. Admin clicks "Reset Password" for user
2. Backend sets require_password_reset=true
3. User logs in next time
4. Backend detects require_password_reset=true
5. Frontend shows "Set New Password" form
6. User sets new password
7. User is logged in
```

---

### 4. Quota Management System

#### Quota Types
- **daily**: Resets every 24 hours
- **weekly**: Resets every 7 days
- **unlimited**: No limits (quota_limit = NULL)

#### Quota Enforcement
```python
def check_user_quota(user_id: str, generation_type: str) -> bool:
    """Check if user has quota remaining for this generation type."""
    quota = get_user_quota(user_id, generation_type)
    
    if not quota:
        # No quota defined = unlimited
        return True
    
    if quota.quota_type == "unlimited":
        return True
    
    # Check if quota needs reset
    if quota.quota_reset_at and datetime.now() > quota.quota_reset_at:
        reset_quota(quota)
    
    if quota.quota_limit is None:
        return True
    
    return quota.quota_used < quota.quota_limit

def increment_quota(user_id: str, generation_type: str):
    """Increment quota usage after successful generation."""
    quota = get_user_quota(user_id, generation_type)
    if quota and quota.quota_type != "unlimited":
        quota.quota_used += 1
        save_quota(quota)
```

#### Default Quotas
When admin creates user without specifying quotas:
- **Image**: 50/day
- **Video**: 10/day
- **Edit**: 30/day

---

### 5. Frontend Changes

#### New Pages

**Login Page Enhancement** (`app/login/page.tsx`):
- Check if first-time login or password reset required
- Show password setup form
- Validate password strength

**Admin User Management** (`app/admin/users/page.tsx`):
- User list table showing **only users invited by current admin**
- Bulk user creation form (textarea for email list)
- Shows if user is shared (invited by multiple admins)
- User activation toggle (only for their users)
- Password reset button (only for their users)
- Remove user button (removes relationship, or deletes if no other admins)

**Admin User Detail** (`app/admin/users/[id]/page.tsx`):
- User information
- Quota management interface
- Usage statistics
- Activity log

**User Profile** (`app/profile/page.tsx`):
- Current user info
- Quota usage display
- Change password form
- Usage history

#### Modified Pages

**All Generation Pages**:
- Add quota display at top: "Remaining: X/Y images today"
- Show warning when quota low
- Disable generation when quota exhausted

**Gallery Page**:
- Non-admins see only their media (with IP address hidden)
- Admins see media from users they invited
  - Shows: User email + IP address for each generation
  - Filter by user email
  - Filter by IP address
- Super admin view: See all media (if needed in future)

**Header Component**:
- Show current user email
- Add "Profile" link
- Logout button

#### New Components

**`QuotaDisplay.tsx`**:
```tsx
<QuotaDisplay 
  type="image" 
  used={45} 
  limit={50} 
  resetAt="2025-11-12T00:00:00Z" 
/>
```

**`UserQuotaManager.tsx`** (Admin):
```tsx
<UserQuotaManager 
  userId="user-123" 
  quotas={quotas}
  onUpdate={handleUpdate}
/>
```

**`PasswordSetupForm.tsx`**:
```tsx
<PasswordSetupForm 
  isFirstTime={true}
  onSubmit={handlePasswordSetup}
/>
```

---

### 6. Security Considerations

#### Password Security
- **Hashing**: bcrypt with salt (rounds=12)
- **Minimum Requirements**: 8 chars, 1 uppercase, 1 lowercase, 1 number
- **No password storage**: Only hashed passwords in database

#### Session Security
- **Token**: Secure random 32-byte hex string
- **Expiration**: 24 hours of inactivity
- **Storage**: Database-backed (not just in-memory)
- **Cleanup**: Automatic cleanup of expired sessions

#### Authorization
- **Middleware**: All protected routes check authentication
- **Ownership**: Users can only access their own data
- **Admin Override**: Admins can access all data
- **Rate Limiting**: Per-user rate limiting (existing system)

#### Data Privacy
- **Email Validation**: Ensure valid email format
- **No Email Sending**: Admin manually notifies users (or future: email integration)
- **Audit Log**: Track admin actions (user creation, quota changes, etc.)

---

### 7. Migration Strategy

#### Phase 1: Database Migration
1. Create new tables: `users`, `user_quotas`, `user_sessions`
2. Create initial admin user from environment variables
3. Migrate existing sessions to new format
4. Keep backward compatibility

#### Phase 2: Backend Implementation
1. Implement user management endpoints
2. Add authentication middleware to all routes
3. Implement quota system
4. Update existing endpoints

#### Phase 3: Frontend Implementation
1. Update login page with password setup
2. Create admin user management UI
3. Add quota displays to generation pages
4. Update header with user info

#### Phase 4: Testing & Deployment
1. Test authentication flows
2. Test quota enforcement
3. Test admin operations
4. Deploy with zero downtime

---

## Implementation Breakdown

### Backend Tasks (Estimated: 8-10 hours)

1. **Database Schema** (1.5 hours)
   - Create migration for new tables (users, user_quotas, user_sessions, user_admins)
   - Add indexes
   - Create initial admin user
   - Handle existing "anonymous" media

2. **User Management** (2.5 hours)
   - User CRUD operations
   - Bulk user creation with admin relationship
   - Handle shared users (multiple admins)
   - Password hashing/validation
   - User activation/deactivation
   - Admin-scoped user queries

3. **Authentication** (2 hours)
   - Enhanced login with password setup
   - First-time login detection
   - Password reset flow
   - Session management improvements

4. **Quota System** (2 hours)
   - Quota checking logic
   - Quota increment on generation
   - Quota reset scheduling
   - Quota management endpoints

5. **Authorization Middleware** (1.5 hours)
   - Add auth to all generation routes
   - Ownership verification
   - Admin-user relationship checks
   - Update media/video save to include user_id + ip_address

6. **Testing & Bug Fixes** (2 hours)

### Frontend Tasks (Estimated: 8-10 hours)

1. **Login Enhancement** (2 hours)
   - Password setup form
   - Validation
   - Error handling

2. **Admin User Management** (3.5 hours)
   - User list page (only admin's users)
   - Show shared user indicators
   - Bulk creation form
   - User detail page with generations view (user email + IP)
   - Quota management UI

3. **User Profile** (1 hour)
   - Profile page
   - Change password
   - Usage display

4. **Quota Display Components** (2 hours)
   - Quota widgets
   - Generation page integration
   - Warning/error states

5. **Header & Navigation** (1 hour)
   - User display
   - Logout
   - Profile link

6. **Testing & Polish** (1 hour)

---

## API Examples

### Admin Creates Users
```http
POST /api/admin/users/bulk-create
Authorization: Bearer admin-token-123
Content-Type: application/json

{
  "emails": [
    "alice@example.com",
    "bob@example.com",
    "charlie@example.com"
  ],
  "defaultQuotas": {
    "image": { "type": "daily", "limit": 50 },
    "video": { "type": "weekly", "limit": 20 },
    "edit": { "type": "unlimited" }
  }
}

Response:
{
  "success": true,
  "data": {
    "created": [
      {
        "id": "user-001",
        "email": "alice@example.com",
        "isNew": true,  // Newly created user
        "invitedBy": "admin@example.com"
      },
      {
        "id": "user-002",
        "email": "bob@example.com",
        "isNew": false,  // Already existed, now shared
        "invitedBy": "admin@example.com",
        "sharedWith": ["other-admin@example.com"]
      }
    ]
  }
}
```

### First-Time Login
```http
POST /api/auth/login
Content-Type: application/json

{
  "email": "alice@example.com",
  "password": "anything"
}

Response:
{
  "success": true,
  "requirePasswordSetup": true,
  "message": "Please set your password"
}
```

### Set Password
```http
POST /api/auth/set-password
Content-Type: application/json

{
  "email": "alice@example.com",
  "password": "NewSecurePass123!"
}

Response:
{
  "success": true,
  "token": "session-token-here",
  "user": {
    "id": "user-123",
    "email": "alice@example.com",
    "isAdmin": false,
    "quotas": { ... }
  }
}
```

### Check Quota Before Generation
```http
GET /api/user/quotas
Authorization: Bearer user-token

Response:
{
  "success": true,
  "user": {
    "id": "user-001",
    "email": "alice@example.com"
  },
  "quotas": {
    "image": {
      "type": "daily",
      "limit": 50,
      "used": 45,
      "remaining": 5,
      "resetAt": "2025-11-12T00:00:00Z"
    },
    "video": {
      "type": "weekly",
      "limit": 20,
      "used": 3,
      "remaining": 17,
      "resetAt": "2025-11-18T00:00:00Z"
    }
  }
}
```

### Admin Views User's Generations
```http
GET /api/admin/users/user-001/generations?limit=50
Authorization: Bearer admin-token

Response:
{
  "success": true,
  "data": {
    "user": {
      "id": "user-001",
      "email": "alice@example.com"
    },
    "generations": [
      {
        "id": "media-123",
        "type": "image",
        "prompt": "A beautiful sunset...",
        "model": "imagen-4.0",
        "createdAt": "2025-11-11T14:30:00Z",
        "userId": "user-001",
        "userEmail": "alice@example.com",  // ← User who generated
        "ipAddress": "192.168.1.100"        // ← IP address used
      }
    ]
  }
}
```

---

## Benefits

### For Users
✅ Personal accounts with individual quotas  
✅ Secure password-based authentication  
✅ Clear visibility of usage limits  
✅ Individual generation history  

### For Admins
✅ Manage only users they invited  
✅ Flexible quota management per user  
✅ View each generation with user email + IP  
✅ Abuse prevention through deactivation  
✅ Share user management with other admins  

### For System
✅ Better cost control per user  
✅ **Dual accountability**: User email + IP address  
✅ Scalable to many users and admins  
✅ Professional multi-tenant user management  
✅ Compliance-ready tracking  

---

## Risks & Mitigations

| Risk | Mitigation |
|------|------------|
| Users forget passwords | Admin can reset passwords |
| Quota too restrictive | Admin can adjust per user |
| Breaking existing system | Phased migration with backward compatibility |
| Performance with many users | Indexed database queries, caching |
| Session management overhead | Automatic cleanup of old sessions |

---

## Future Enhancements (Not in Scope)

- 📧 Email invites with magic links
- 🔑 OAuth/SSO integration (Google, GitHub)
- 👥 Team/organization support
- 📊 Advanced analytics dashboard
- 🎟️ Usage-based billing
- 🔔 Quota warning notifications
- 🔍 Audit log UI

---

## Questions to Clarify

1. **Admin Notification**: How should admins notify users about their accounts?
   - Manual (admin tells user via email/Slack)
   - Future: Automated email invites

2. **Password Requirements**: Should we enforce strict password rules?
   - Proposed: Min 8 chars, 1 uppercase, 1 lowercase, 1 number
   - Or simpler: Just min 8 chars?

3. **Quota Defaults**: What default quotas for new users?
   - Proposed: 50 images/day, 10 videos/day, 30 edits/day
   - Or different values?

4. **Session Duration**: How long should sessions last?
   - Proposed: 24 hours of inactivity
   - Or longer (7 days)?

5. **Existing Media**: What to do with existing "anonymous" media?
   - Assign to admin user?
   - Keep as is?
   - Delete?

6. **Admin Relationships**: Can multiple admins manage the same user?
   - **YES** (proposed): Any admin who invited a user can manage them
   - Enables collaboration between admins
   - User sees combined quotas from all their admins

---

## Recommendation

I recommend implementing this system in **4 phases over 2-3 days**:

**Day 1 Morning**: Database schema + basic user management  
**Day 1 Afternoon**: Authentication + password setup  
**Day 2 Morning**: Quota system + middleware  
**Day 2 Afternoon**: Admin UI  
**Day 3**: User-facing features + testing  

This is a substantial change but will transform the app into a professional multi-user platform.

**Ready to proceed?** Please review and let me know:
1. Any changes to the proposed design?
2. Answers to the clarification questions?
3. Approval to start implementation?

