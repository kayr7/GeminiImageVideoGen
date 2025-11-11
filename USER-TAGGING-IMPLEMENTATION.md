# 🏷️ User Tagging System - Implementation Plan

## Overview

Adding a tagging system to organize users into groups (e.g., "course", "team", "department").

---

## Features

1. **Create users with tags** - Admins can assign tags when creating users
2. **View tags in table** - Tags displayed as badges in user list
3. **Edit tags inline** - Click to edit tags for existing users
4. **Filter by tags** - (Future) Filter user list by tag
5. **Tag autocomplete** - Suggest existing tags when adding new ones

---

## Database Schema

### Migration #6: `user_tags` Table

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

---

## Backend Changes

### 1. UserManager Methods (✅ Complete)

```python
# In backend/utils/user_manager.py

@staticmethod
def add_tag(user_id: str, tag: str) -> bool
    """Add a tag to a user (case-insensitive, lowercased)"""

@staticmethod
def remove_tag(user_id: str, tag: str) -> bool
    """Remove a tag from a user"""

@staticmethod
def get_user_tags(user_id: str) -> List[str]
    """Get all tags for a user (sorted)"""

@staticmethod
def set_user_tags(user_id: str, tags: List[str]) -> None
    """Replace all tags for a user"""

@staticmethod
def get_all_tags() -> List[str]
    """Get all unique tags across all users"""
```

### 2. API Endpoints (TODO)

```python
# Update existing endpoints

POST /api/admin/users/bulk-create
  - Add optional "defaultTags" field
  - Apply tags to all created users

GET /api/admin/users
  - Include "tags" array in each user response

# New endpoints

PUT /api/admin/users/{user_id}/tags
  - Update tags for a user
  - Body: { "tags": ["course", "team-a"] }

GET /api/admin/tags
  - Get all unique tags
  - Returns: { "tags": ["course", "team-a", "team-b"] }
```

### 3. Response Models (TODO)

```python
# In backend/models.py

class UserResponse(BaseModel):
    # ... existing fields ...
    tags: List[str] = []  # Add this

class BulkCreateUsersRequest(BaseModel):
    emails: List[str]
    defaultQuotas: Optional[Dict[str, Dict[str, Any]]] = None
    defaultTags: Optional[List[str]] = None  # Add this
```

---

## Frontend Changes (TODO)

### 1. Bulk Creation Form

**Add tags input:**
```typescript
const [defaultTags, setDefaultTags] = useState<string>('');

<Textarea
  label="Default Tags (one per line or comma-separated)"
  value={defaultTags}
  onChange={(e) => setDefaultTags(e.target.value)}
  placeholder="course&#10;team-a&#10;department-engineering"
  rows={3}
/>
```

### 2. User Table - Display Tags

**Show tags as badges:**
```typescript
{user.tags && user.tags.length > 0 && (
  <div className="flex flex-wrap gap-1 mt-1">
    {user.tags.map((tag) => (
      <span 
        key={tag}
        className="px-2 py-0.5 text-xs bg-purple-100 text-purple-700 dark:bg-purple-900/30 dark:text-purple-300 rounded-full"
      >
        {tag}
      </span>
    ))}
  </div>
)}
```

### 3. Inline Tag Editing

**Click to edit tags:**
```typescript
const [editingTags, setEditingTags] = useState<Record<string, string>>({});

// Click "Edit Tags" button
<button onClick={() => startEditingTags(user.id, user.tags)}>
  Edit Tags
</button>

// Show input when editing
{isEditingTags && (
  <input
    value={editingTags[user.id] || ''}
    onChange={(e) => updateEditingTags(user.id, e.target.value)}
    placeholder="tag1, tag2, tag3"
  />
  <button onClick={() => saveTags(user.id)}>Save</button>
  <button onClick={() => cancelEditTags(user.id)}>Cancel</button>
)}
```

### 4. Tag Autocomplete (Optional)

```typescript
const [allTags, setAllTags] = useState<string[]>([]);

// Load all tags
useEffect(() => {
  const loadTags = async () => {
    const response = await apiFetch('/api/admin/tags');
    const data = await response.json();
    setAllTags(data.data.tags);
  };
  loadTags();
}, []);

// Show suggestions
<datalist id="tag-suggestions">
  {allTags.map((tag) => (
    <option key={tag} value={tag} />
  ))}
</datalist>
```

---

## UI Mockup

### User Table Row

```
┌─────────────────────────────────────────────────────────────┐
│ alice@example.com                                           │
│ Created: 1/1/24  •  Last login: 1/15/24                    │
│ [course] [team-a] [premium]  [Edit Tags]                   │
│                                                             │
│ Status: [Active]  [Shared]                                 │
│                                                             │
│ Image: 45/100  Video: 5/50                                │
│ Actions: [Deactivate] [Reset PWD]                         │
└─────────────────────────────────────────────────────────────┘
```

### Bulk Creation with Tags

```
Add New Users
─────────────────────────────────
Email Addresses (one per line)
[alice@example.com             ]
[bob@example.com               ]
[charlie@example.com           ]

Default Tags (comma or newline)
[course, team-a, Q1-2024       ]

Quota Type: [Limited ▼]
Image: [100]  Video: [50]

[Create Users] [Cancel]
```

---

## Tag Rules

1. **Case-insensitive** - "Course" and "course" are the same
2. **Lowercased** - All tags stored as lowercase
3. **No duplicates** - UNIQUE constraint on (user_id, tag)
4. **Whitespace trimmed** - Leading/trailing spaces removed
5. **Alphanumeric + hyphens** - Recommended format: "team-a", "course-101"

---

## Example Usage

### Create Users with Tags

```bash
curl -X POST /api/admin/users/bulk-create \
  -H "Authorization: Bearer {token}" \
  -d '{
    "emails": ["alice@example.com", "bob@example.com"],
    "defaultTags": ["course", "team-a", "Q1-2024"],
    "defaultQuotas": {
      "image": {"type": "limited", "limit": 100}
    }
  }'
```

### Update User Tags

```bash
curl -X PUT /api/admin/users/{user_id}/tags \
  -H "Authorization: Bearer {token}" \
  -d '{"tags": ["course", "team-b", "premium"]}'
```

### Get All Tags

```bash
curl /api/admin/tags \
  -H "Authorization: Bearer {token}"

# Response:
{
  "success": true,
  "data": {
    "tags": ["course", "premium", "q1-2024", "team-a", "team-b"]
  }
}
```

---

## Benefits

✅ **Organization** - Group users by course, team, department, etc.
✅ **Flexibility** - Multiple tags per user
✅ **Searchability** - Easy to find users with specific tags
✅ **Visual** - Quick identification in admin dashboard
✅ **Reporting** - Can generate reports by tag

---

## Future Enhancements

- [ ] **Filter users by tag** - Show only users with specific tag(s)
- [ ] **Bulk tag operations** - Add/remove tags for multiple users
- [ ] **Tag colors** - Assign colors to tags for visual distinction
- [ ] **Tag management** - Rename/delete tags globally
- [ ] **Tag analytics** - Show user count per tag
- [ ] **Tag-based permissions** - Different quotas per tag

---

## Files to Update

### Backend (TODO)
- [x] `backend/utils/database.py` - Migration #6
- [x] `backend/utils/user_manager.py` - Tag methods
- [ ] `backend/routers/users.py` - Add tag endpoints
- [ ] `backend/models.py` - Update models

### Frontend (TODO)
- [ ] `app/admin/page.tsx` - Add tag display and editing
- [ ] Update TypeScript interfaces

---

## Testing Checklist

- [ ] Create users with tags
- [ ] Tags appear in user list
- [ ] Edit tags for existing user
- [ ] Remove tags from user
- [ ] Multiple users can have same tag
- [ ] Same user can't have duplicate tags
- [ ] Tags are case-insensitive
- [ ] Tags autocomplete from existing tags
- [ ] Filter users by tag (future)

---

**Status: In Progress** 🏗️

- ✅ Database migration created
- ✅ Backend tag methods implemented
- ⏳ API endpoints (next)
- ⏳ Frontend UI (after API)

