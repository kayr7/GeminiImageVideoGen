# Debug Admin Login Issue

## Problem
Admin login with credentials from `.env` is not working.

## Diagnostic Steps

### 1. Check Backend Logs

When you start the backend, you should see:
```
Initializing database...
✓ Database initialized with version 3
Ensuring admin user from .env exists...
✓ Admin user initialized: admin@example.com
```

**If you DON'T see this**, the admin user wasn't created.

### 2. Check Environment Variables

The backend looks for these environment variable names (in order):
- **Username**: `APP_USERNAME`, `ADMIN_USERNAME`, or `LOGIN_USERNAME`
- **Password**: `APP_PASSWORD`, `ADMIN_PASSWORD`, or `LOGIN_PASSWORD`

**Action**: Open `backend/.env` and verify:
```bash
cd backend
cat .env | grep -E "ADMIN_|APP_|LOGIN_"
```

### 3. Check Database

Verify the admin user exists in the database:
```bash
cd backend
sqlite3 .data/media.db "SELECT email, is_admin, is_active, require_password_reset, password_hash IS NOT NULL as has_password FROM users WHERE is_admin = 1;"
```

**Expected output**:
```
admin@example.com|1|1|0|1
```

### 4. Test Login Directly

Try logging in with curl:
```bash
curl -X POST http://localhost:8000/api/auth/login \
  -H "Content-Type: application/json" \
  -d '{"username":"YOUR_ADMIN_EMAIL","password":"YOUR_ADMIN_PASSWORD"}'
```

**Expected**: JSON response with token
**If error**: Check the error message

---

## Quick Fix Options

### Option 1: Recreate Admin User Manually

```python
# Run this in Python in the backend directory
cd backend
python3 << 'EOF'
import os
from utils.database import initialize_database
from utils.user_manager import ensure_env_admin_exists

# Load .env
from dotenv import load_dotenv
load_dotenv()

# Initialize DB
initialize_database()

# Create admin
admin = ensure_env_admin_exists()
if admin:
    print(f"✓ Admin created: {admin.email}")
else:
    print("✗ Failed to create admin")
    print(f"ADMIN_USERNAME: {os.getenv('ADMIN_USERNAME')}")
    print(f"ADMIN_PASSWORD: {os.getenv('ADMIN_PASSWORD')}")
EOF
```

### Option 2: Reset Admin Password Directly

```python
cd backend
python3 << 'EOF'
from utils.database import initialize_database, get_connection
from utils.user_manager import UserManager
from dotenv import load_dotenv
import os

load_dotenv()
initialize_database()

admin_email = os.getenv('ADMIN_USERNAME') or os.getenv('APP_USERNAME')
admin_password = os.getenv('ADMIN_PASSWORD') or os.getenv('APP_PASSWORD')

print(f"Looking for admin: {admin_email}")

user = UserManager.get_user_by_email(admin_email)
if user:
    print(f"Found user: {user.email}, is_admin: {user.is_admin}")
    print(f"Updating password...")
    UserManager.update_user(
        user.id,
        password=admin_password,
        is_active=True,
        require_password_reset=False
    )
    print("✓ Password updated")
else:
    print("✗ User not found. Creating...")
    user = UserManager.create_user(
        email=admin_email,
        password=admin_password,
        is_admin=True,
        is_active=True
    )
    print(f"✓ Admin created: {user.email}")
EOF
```

### Option 3: Check for Database Lock

If the database is locked by Docker:
```bash
# Stop all containers
docker-compose down

# Remove the database lock
rm -f backend/.data/*.db-shm backend/.data/*.db-wal

# Restart
docker-compose up --build
```

---

## Common Issues

### Issue 1: .env Not Loaded
**Symptom**: Backend starts but doesn't log admin creation
**Solution**: Make sure `backend/.env` exists and contains admin credentials

### Issue 2: Wrong Email Format
**Symptom**: "Invalid email or password"
**Solution**: Make sure `ADMIN_USERNAME` is an email address (e.g., `admin@example.com`)

### Issue 3: Password Hash Mismatch
**Symptom**: "Invalid email or password"  
**Solution**: Run Option 2 above to reset the password

### Issue 4: Database Not Migrated
**Symptom**: Backend crashes on startup
**Solution**: Delete `backend/.data/media.db` and restart to rebuild with migrations

---

## What Should Happen

1. **Backend starts** → Initializes database → Creates/updates admin user
2. **Frontend login** → Sends email + password → Backend verifies → Returns token
3. **Authenticated** → User can access all features

---

## Need More Help?

Run this comprehensive diagnostic:

```bash
cd backend
python3 << 'EOF'
import os
import sys
from dotenv import load_dotenv
from utils.database import get_connection

load_dotenv()

print("=" * 60)
print("ADMIN LOGIN DIAGNOSTIC")
print("=" * 60)

# Check .env
print("\n1. Environment Variables:")
admin_user = os.getenv('ADMIN_USERNAME') or os.getenv('APP_USERNAME')
admin_pass = os.getenv('ADMIN_PASSWORD') or os.getenv('APP_PASSWORD')
print(f"   ADMIN_USERNAME: {'✓ Set' if admin_user else '✗ Not set'}")
print(f"   ADMIN_PASSWORD: {'✓ Set' if admin_pass else '✗ Not set'}")
if admin_user:
    print(f"   Email: {admin_user}")

# Check database
print("\n2. Database Check:")
try:
    with get_connection() as conn:
        # Check if users table exists
        tables = conn.execute(
            "SELECT name FROM sqlite_master WHERE type='table' AND name='users'"
        ).fetchall()
        
        if tables:
            print("   ✓ Users table exists")
            
            # Check for admin users
            admins = conn.execute(
                "SELECT email, is_active, require_password_reset, password_hash IS NOT NULL as has_password FROM users WHERE is_admin = 1"
            ).fetchall()
            
            if admins:
                print(f"   ✓ Found {len(admins)} admin user(s):")
                for admin in admins:
                    status = []
                    if not admin['is_active']:
                        status.append('INACTIVE')
                    if admin['require_password_reset']:
                        status.append('NEEDS_PASSWORD_RESET')
                    if not admin['has_password']:
                        status.append('NO_PASSWORD')
                    
                    status_str = ', '.join(status) if status else 'OK'
                    print(f"      - {admin['email']} ({status_str})")
            else:
                print("   ✗ No admin users found in database")
        else:
            print("   ✗ Users table does not exist")
            print("   → Database needs migration")
except Exception as e:
    print(f"   ✗ Database error: {e}")

print("\n" + "=" * 60)
print("RECOMMENDATIONS:")
print("=" * 60)

if not admin_user or not admin_pass:
    print("→ Add ADMIN_USERNAME and ADMIN_PASSWORD to backend/.env")
elif not tables:
    print("→ Run: rm backend/.data/media.db && restart backend")
elif not admins:
    print("→ Restart backend to create admin user")
else:
    print("→ Admin user exists. Try logging in.")
    print(f"   Email: {admin_user}")
    print("   Password: [from .env]")

print("=" * 60)
EOF
```

This will tell you exactly what's wrong!

