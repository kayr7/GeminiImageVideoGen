#!/usr/bin/env python3
"""
Quick fix script to ensure admin user from .env exists and is properly configured.
Run this if admin login is not working.

Usage:
    cd backend
    python fix_admin.py
"""

import os
import sys
from dotenv import load_dotenv

# Add current directory to path
sys.path.insert(0, os.path.dirname(__file__))

from utils.database import initialize_database
from utils.user_manager import UserManager


def main():
    print("=" * 70)
    print("ADMIN USER FIX SCRIPT")
    print("=" * 70)

    # Load environment variables
    load_dotenv()

    # Get admin credentials from .env
    admin_email = None
    admin_password = None

    # Check various env var names
    for key in ("ADMIN_USERNAME", "APP_USERNAME", "LOGIN_USERNAME"):
        admin_email = os.getenv(key)
        if admin_email:
            print(f"\n✓ Found admin email from {key}: {admin_email}")
            break

    for key in ("ADMIN_PASSWORD", "APP_PASSWORD", "LOGIN_PASSWORD"):
        admin_password = os.getenv(key)
        if admin_password:
            print(f"✓ Found admin password from {key}: {'*' * len(admin_password)}")
            break

    if not admin_email or not admin_password:
        print("\n✗ ERROR: Could not find admin credentials in .env")
        print("\nPlease ensure your backend/.env contains:")
        print("  ADMIN_USERNAME=admin@example.com")
        print("  ADMIN_PASSWORD=your_secure_password")
        return 1

    # Initialize database
    print("\n1. Initializing database...")
    initialize_database()
    print("   ✓ Database initialized")

    # Check if user exists
    print(f"\n2. Checking for existing user: {admin_email}")
    existing_user = UserManager.get_user_by_email(admin_email)

    if existing_user:
        print(f"   ✓ User found: {existing_user.email}")
        print(f"     - is_admin: {existing_user.is_admin}")
        print(f"     - is_active: {existing_user.is_active}")
        print(f"     - require_password_reset: {existing_user.require_password_reset}")
        print(f"     - has_password: {bool(existing_user.password_hash)}")

        # Update the user
        print("\n3. Updating admin user...")
        UserManager.update_user(
            existing_user.id,
            password=admin_password,
            is_active=True,
            require_password_reset=False,
        )
        print("   ✓ Admin user updated successfully")
        
        # Note: is_admin cannot be changed via update_user (by design)

    else:
        print("   → User does not exist, creating new admin user...")

        print("\n3. Creating admin user...")
        new_user = UserManager.create_user(
            email=admin_email, password=admin_password, is_admin=True, is_active=True
        )

        # Ensure password reset is not required
        if new_user.require_password_reset:
            UserManager.update_user(new_user.id, require_password_reset=False)

        print(f"   ✓ Admin user created: {new_user.email}")

    # Verify
    print("\n4. Verifying admin user...")
    user = UserManager.get_user_by_email(admin_email)

    if user:
        print(f"   ✓ Admin user verified:")
        print(f"     Email: {user.email}")
        print(f"     Is Admin: {user.is_admin}")
        print(f"     Is Active: {user.is_active}")
        print(f"     Requires Password Reset: {user.require_password_reset}")
        print(f"     Has Password: {bool(user.password_hash)}")

        # Test password
        if user.password_hash and UserManager.verify_password(
            admin_password, user.password_hash
        ):
            print(f"     Password Verification: ✓ CORRECT")
        else:
            print(f"     Password Verification: ✗ FAILED")
            return 1

        print("\n" + "=" * 70)
        print("SUCCESS! Admin user is ready.")
        print("=" * 70)
        print(f"\nYou can now login with:")
        print(f"  Email: {admin_email}")
        print(f"  Password: [from your .env file]")
        print("\nRestart your backend if it's already running:")
        print("  docker-compose restart backend")
        print("  # or")
        print("  python -m uvicorn main:app --reload")
        print("=" * 70)
        return 0
    else:
        print("   ✗ ERROR: Could not verify admin user")
        return 1


if __name__ == "__main__":
    sys.exit(main())
