#!/bin/bash
# Run this script ON YOUR SERVER to check what code is actually in the Docker container

echo "🔍 Checking what code is in the Docker container..."
echo ""

echo "1. Checking templates.py imports in container:"
docker-compose exec backend cat /app/routers/templates.py | grep -A 5 "^from models import" || echo "NOT FOUND"
echo ""

echo "2. Checking if LoginUser is being imported from user_manager (BAD):"
if docker-compose exec backend grep -q "from utils.user_manager import.*LoginUser" /app/routers/templates.py; then
    echo "❌ ERROR: Container has OLD code! LoginUser is imported from user_manager"
else
    echo "✅ GOOD: LoginUser is not imported from user_manager"
fi
echo ""

echo "3. Checking if LoginUser is being imported from models (GOOD):"
if docker-compose exec backend grep -q "from models import.*LoginUser" /app/routers/templates.py; then
    echo "✅ GOOD: Container has NEW code! LoginUser is imported from models"
else
    echo "❌ ERROR: LoginUser is not imported from models"
fi
echo ""

echo "4. Checking text_generation_manager.py for new SDK:"
if docker-compose exec backend grep -q "from google import genai" /app/utils/text_generation_manager.py; then
    echo "✅ GOOD: Using new SDK import"
else
    echo "❌ ERROR: Not using new SDK import"
fi
echo ""

echo "5. Checking for lazy client initialization:"
if docker-compose exec backend grep -q "def get_client" /app/utils/text_generation_manager.py; then
    echo "✅ GOOD: Has lazy client initialization"
else
    echo "❌ ERROR: Missing lazy client initialization"
fi
echo ""

echo "6. Checking host files (what will be built):"
echo "Host templates.py import:"
grep -A 5 "^from models import" backend/routers/templates.py 2>/dev/null || echo "File not found on host"
echo ""

echo "==================================="
echo "Summary:"
echo "If any checks show ❌ ERROR, you need to:"
echo "1. Make sure your host files are up to date (git pull or sync)"
echo "2. Rebuild the container with --no-cache"
echo "   docker-compose build --no-cache backend"
echo "3. Restart the container"
echo "   docker-compose up -d backend"

