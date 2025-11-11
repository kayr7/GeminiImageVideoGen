# ✅ API Endpoints Updated for User Tagging

## Summary

All API endpoints in `backend/routers/users.py` have been updated to support the user tagging system.

---

## Endpoints Modified

### 1. `POST /api/admin/users/bulk-create` ✅ Updated

**What Changed:**
- Added support for `defaultTags` in request
- Sets tags for newly created users
- Returns tags in response

**Request:**
```json
{
  "emails": ["alice@example.com", "bob@example.com"],
  "defaultQuotas": {
    "image": {"type": "limited", "limit": 100},
    "video": {"type": "limited", "limit": 50}
  },
  "defaultTags": ["course-101", "team-a", "Q1-2024"]
}
```

**Response:**
```json
{
  "success": true,
  "data": {
    "created": [
      {
        "id": "user-123",
        "email": "alice@example.com",
        "isNew": true,
        "invitedBy": "admin@example.com",
        "tags": ["course-101", "team-a", "q1-2024"]
      }
    ]
  }
}
```

**Code Changes:**
```python
# Set default tags
if request.defaultTags:
    UserManager.set_user_tags(new_user.id, request.defaultTags)

created_users.append({
    # ... other fields ...
    "tags": UserManager.get_user_tags(new_user.id),
})
```

---

### 2. `GET /api/admin/users` ✅ Updated

**What Changed:**
- Returns tags for each user in the list

**Request:**
```bash
GET /api/admin/users
Authorization: Bearer <token>
```

**Response:**
```json
{
  "success": true,
  "data": {
    "users": [
      {
        "id": "user-123",
        "email": "alice@example.com",
        "isActive": true,
        "isAdmin": false,
        "requirePasswordReset": false,
        "createdAt": "2025-11-11T10:00:00Z",
        "updatedAt": "2025-11-11T10:00:00Z",
        "lastLoginAt": "2025-11-11T12:00:00Z",
        "isShared": false,
        "sharedWith": null,
        "tags": ["course-101", "team-a"]
      }
    ]
  }
}
```

**Code Changes:**
```python
user_list.append({
    # ... other fields ...
    "tags": UserManager.get_user_tags(user.id),
})
```

---

### 3. `GET /api/admin/users/{user_id}` ✅ Updated

**What Changed:**
- Returns tags for the specific user

**Request:**
```bash
GET /api/admin/users/user-123
Authorization: Bearer <token>
```

**Response:**
```json
{
  "success": true,
  "data": {
    "user": {
      "id": "user-123",
      "email": "alice@example.com",
      "isActive": true,
      "isAdmin": false,
      "requirePasswordReset": false,
      "createdAt": "2025-11-11T10:00:00Z",
      "updatedAt": "2025-11-11T10:00:00Z",
      "lastLoginAt": "2025-11-11T12:00:00Z",
      "isShared": false,
      "sharedWith": null,
      "tags": ["course-101", "team-a"]
    },
    "quotas": [...]
  }
}
```

**Code Changes:**
```python
return SuccessResponse(
    success=True,
    data={
        "user": {
            # ... other fields ...
            "tags": UserManager.get_user_tags(user_id),
        },
        "quotas": quota_list,
    },
)
```

---

### 4. `PUT /api/admin/users/{user_id}/tags` ✅ NEW

**What It Does:**
- Updates tags for a specific user
- Replaces all existing tags with the provided list
- Only accessible to admins who manage the user

**Request:**
```bash
PUT /api/admin/users/user-123/tags
Authorization: Bearer <token>
Content-Type: application/json

{
  "tags": ["course-102", "team-b", "advanced"]
}
```

**Response:**
```json
{
  "success": true,
  "data": {
    "userId": "user-123",
    "tags": ["course-102", "team-b", "advanced"],
    "updated": true
  }
}
```

**Special Cases:**

**Remove all tags:**
```json
{
  "tags": []
}
```

**Add single tag:**
```json
{
  "tags": ["vip"]
}
```

**Code Implementation:**
```python
@router.put("/{user_id}/tags", response_model=SuccessResponse)
async def update_user_tags(
    user_id: str,
    request: UpdateUserTagsRequest,
    admin: LoginUser = Depends(require_admin),
) -> SuccessResponse:
    """
    Update tags for a user (only if admin manages them).
    This replaces all existing tags with the provided list.
    """
    admin_user = UserManager.get_user_by_email(admin.username)
    if not admin_user:
        raise HTTPException(
            status_code=status.HTTP_404_NOT_FOUND, detail="Admin user not found"
        )

    # Check if admin can manage this user
    if not UserManager.can_admin_manage_user(admin_user.id, user_id):
        raise HTTPException(
            status_code=status.HTTP_403_FORBIDDEN,
            detail="You don't have permission to update this user's tags",
        )

    # Check if user exists
    user = UserManager.get_user_by_id(user_id)
    if not user:
        raise HTTPException(
            status_code=status.HTTP_404_NOT_FOUND, detail="User not found"
        )

    # Update tags
    UserManager.set_user_tags(user_id, request.tags)

    return SuccessResponse(
        success=True,
        data={
            "userId": user_id,
            "tags": UserManager.get_user_tags(user_id),
            "updated": True,
        },
    )
```

---

### 5. `GET /api/admin/users/tags/all` ✅ NEW

**What It Does:**
- Returns all unique tags across all users
- Useful for autocomplete/tag suggestions in the frontend
- Only accessible to admins

**Request:**
```bash
GET /api/admin/users/tags/all
Authorization: Bearer <token>
```

**Response:**
```json
{
  "success": true,
  "data": {
    "tags": [
      "advanced",
      "course-101",
      "course-102",
      "premium",
      "q1-2024",
      "team-a",
      "team-b"
    ]
  }
}
```

**Code Implementation:**
```python
@router.get("/tags/all", response_model=SuccessResponse)
async def get_all_tags(admin: LoginUser = Depends(require_admin)) -> SuccessResponse:
    """
    Get all unique tags across all users.
    Useful for autocomplete/suggestions.
    """
    admin_user = UserManager.get_user_by_email(admin.username)
    if not admin_user:
        raise HTTPException(
            status_code=status.HTTP_404_NOT_FOUND, detail="Admin user not found"
        )

    all_tags = UserManager.get_all_tags()

    return SuccessResponse(success=True, data={"tags": all_tags})
```

---

## API Testing Examples

### Using cURL

**1. Create users with tags:**
```bash
curl -X POST https://example.com/api/admin/users/bulk-create \
  -H "Authorization: Bearer $TOKEN" \
  -H "Content-Type: application/json" \
  -d '{
    "emails": ["alice@example.com"],
    "defaultTags": ["course", "team-a"]
  }'
```

**2. List users (with tags):**
```bash
curl https://example.com/api/admin/users \
  -H "Authorization: Bearer $TOKEN"
```

**3. Get specific user (with tags):**
```bash
curl https://example.com/api/admin/users/user-123 \
  -H "Authorization: Bearer $TOKEN"
```

**4. Update user tags:**
```bash
curl -X PUT https://example.com/api/admin/users/user-123/tags \
  -H "Authorization: Bearer $TOKEN" \
  -H "Content-Type: application/json" \
  -d '{"tags": ["new-tag", "another-tag"]}'
```

**5. Get all unique tags:**
```bash
curl https://example.com/api/admin/users/tags/all \
  -H "Authorization: Bearer $TOKEN"
```

---

### Using Python Requests

```python
import requests

BASE_URL = "https://example.com"
TOKEN = "your-admin-token"
headers = {"Authorization": f"Bearer {TOKEN}"}

# Create users with tags
response = requests.post(
    f"{BASE_URL}/api/admin/users/bulk-create",
    headers=headers,
    json={
        "emails": ["alice@example.com"],
        "defaultTags": ["course", "team-a"]
    }
)
print(response.json())

# List users
response = requests.get(
    f"{BASE_URL}/api/admin/users",
    headers=headers
)
users = response.json()["data"]["users"]
for user in users:
    print(f"{user['email']}: {user['tags']}")

# Update tags
response = requests.put(
    f"{BASE_URL}/api/admin/users/user-123/tags",
    headers=headers,
    json={"tags": ["new-tag", "another-tag"]}
)
print(response.json())

# Get all tags
response = requests.get(
    f"{BASE_URL}/api/admin/users/tags/all",
    headers=headers
)
all_tags = response.json()["data"]["tags"]
print(f"Available tags: {all_tags}")
```

---

### Using JavaScript/Fetch

```javascript
const BASE_URL = 'https://example.com';
const TOKEN = 'your-admin-token';
const headers = {
  'Authorization': `Bearer ${TOKEN}`,
  'Content-Type': 'application/json'
};

// Create users with tags
const createResponse = await fetch(`${BASE_URL}/api/admin/users/bulk-create`, {
  method: 'POST',
  headers,
  body: JSON.stringify({
    emails: ['alice@example.com'],
    defaultTags: ['course', 'team-a']
  })
});
const createData = await createResponse.json();
console.log(createData);

// List users
const usersResponse = await fetch(`${BASE_URL}/api/admin/users`, { headers });
const usersData = await usersResponse.json();
usersData.data.users.forEach(user => {
  console.log(`${user.email}: ${user.tags}`);
});

// Update tags
const updateResponse = await fetch(`${BASE_URL}/api/admin/users/user-123/tags`, {
  method: 'PUT',
  headers,
  body: JSON.stringify({ tags: ['new-tag', 'another-tag'] })
});
const updateData = await updateResponse.json();
console.log(updateData);

// Get all tags
const tagsResponse = await fetch(`${BASE_URL}/api/admin/users/tags/all`, { headers });
const tagsData = await tagsResponse.json();
console.log('Available tags:', tagsData.data.tags);
```

---

## Error Handling

### 403 Forbidden - Admin doesn't manage user
```json
{
  "detail": "You don't have permission to update this user's tags"
}
```

### 404 Not Found - User doesn't exist
```json
{
  "detail": "User not found"
}
```

### 404 Not Found - Admin user not found
```json
{
  "detail": "Admin user not found"
}
```

### 401 Unauthorized - Missing/invalid token
```json
{
  "detail": "Missing or invalid authorization header"
}
```

---

## Security & Authorization

### Admin-Only Endpoints
All tag-related endpoints require admin authentication:
- ✅ `POST /api/admin/users/bulk-create`
- ✅ `GET /api/admin/users`
- ✅ `GET /api/admin/users/{user_id}`
- ✅ `PUT /api/admin/users/{user_id}/tags`
- ✅ `GET /api/admin/users/tags/all`

### Admin-User Relationship Checks
For user-specific operations, the system verifies:
1. Admin is authenticated
2. Admin manages the target user
3. User exists

```python
# Check if admin can manage this user
if not UserManager.can_admin_manage_user(admin_user.id, user_id):
    raise HTTPException(
        status_code=status.HTTP_403_FORBIDDEN,
        detail="You don't have permission to update this user's tags",
    )
```

---

## Tag Normalization

### Backend Processing
- Tags are **case-insensitive**
- Automatically **lowercased** and **trimmed**
- **Duplicates removed**
- Stored as **unique** per user (database constraint)

**Example:**
```python
# Input
request.tags = ["Course", "  Team-A  ", "course", "PREMIUM"]

# After UserManager.set_user_tags()
# Stored as: ["course", "team-a", "premium"]
```

---

## Database Schema

### `user_tags` Table
```sql
CREATE TABLE user_tags (
    id TEXT PRIMARY KEY,
    user_id TEXT NOT NULL,
    tag TEXT NOT NULL,
    created_at TEXT NOT NULL,
    FOREIGN KEY (user_id) REFERENCES users(id) ON DELETE CASCADE,
    UNIQUE(user_id, tag)
);

CREATE INDEX idx_user_tags_user_id ON user_tags(user_id);
CREATE INDEX idx_user_tags_tag ON user_tags(tag);
```

### Constraints
- **UNIQUE(user_id, tag)**: Prevents duplicate tags for the same user
- **CASCADE DELETE**: Removes all tags when user is deleted

---

## Performance Considerations

### Indexing
- `idx_user_tags_user_id`: Fast lookup of user's tags
- `idx_user_tags_tag`: Fast tag-based filtering (future feature)

### N+1 Query Considerations
Current implementation makes one query per user for tags in list endpoints. For large user lists, consider:

**Option 1: Batch Loading (Future Optimization)**
```python
# Get all users first
user_ids = [user.id for user in users]

# Get all tags in one query
with get_connection() as conn:
    rows = conn.execute(
        f"SELECT user_id, tag FROM user_tags WHERE user_id IN ({','.join('?' * len(user_ids))})",
        user_ids
    ).fetchall()
    
# Group by user_id
tags_by_user = {}
for row in rows:
    tags_by_user.setdefault(row['user_id'], []).append(row['tag'])
```

**Current Performance:**
- ✅ Simple and clear code
- ✅ Acceptable for <100 users
- ⚠️ May need optimization for >1000 users

---

## Testing Checklist

### Manual Testing

- [ ] **Create users with tags**
  - With tags
  - Without tags
  - With empty tags list

- [ ] **List users**
  - Verify tags appear
  - Verify empty list for users without tags

- [ ] **Get specific user**
  - Verify tags appear
  - Verify quotas still work

- [ ] **Update user tags**
  - Add new tags
  - Replace existing tags
  - Remove all tags (empty list)
  - Try as non-managing admin (should fail)

- [ ] **Get all tags**
  - Verify all unique tags returned
  - Verify sorted alphabetically
  - Verify empty list when no tags exist

### Automated Testing (Future)

```python
# Test tag creation
def test_create_user_with_tags():
    response = client.post("/api/admin/users/bulk-create", json={
        "emails": ["test@example.com"],
        "defaultTags": ["test-tag"]
    })
    assert response.status_code == 200
    assert "test-tag" in response.json()["data"]["created"][0]["tags"]

# Test tag update
def test_update_user_tags():
    response = client.put("/api/admin/users/user-123/tags", json={
        "tags": ["new-tag"]
    })
    assert response.status_code == 200
    assert response.json()["data"]["tags"] == ["new-tag"]
```

---

## Migration Path

### For Existing Deployments

1. **Database migration runs automatically** on startup
   - Creates `user_tags` table
   - No data loss

2. **Existing users have no tags**
   - `tags: []` returned by default
   - Can be added later

3. **Backward compatible**
   - All existing endpoints work unchanged
   - Tags are optional

4. **Gradual rollout**
   - Start using tags for new users
   - Backfill existing users as needed

---

## Files Modified

- ✅ `backend/routers/users.py` - All endpoints updated
- ✅ `backend/models.py` - Pydantic models
- ✅ `backend/utils/user_manager.py` - Tag management
- ✅ `backend/utils/database.py` - Migration #6

---

## Next Steps

### Frontend Integration (TODO)
1. Update TypeScript interfaces
2. Add tag input in bulk creation form
3. Display tags as badges in user table
4. Add inline tag editing
5. Implement tag autocomplete using `/api/admin/users/tags/all`

### Future Enhancements
- [ ] Tag-based filtering/search
- [ ] Tag categories (e.g., course tags, team tags)
- [ ] Tag analytics (most used tags)
- [ ] Bulk tag operations (add/remove tag from multiple users)
- [ ] Tag-based permissions

---

**Backend API endpoints are complete!** 🚀

Version: 3.3.0
Date: 2025-11-11
Status: ✅ Backend Complete
Next: Frontend Implementation

