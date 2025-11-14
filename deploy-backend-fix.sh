#!/bin/bash
set -e

echo "🔧 Backend Fix Deployment Script"
echo "=================================="
echo ""

# Colors for output
RED='\033[0;31m'
GREEN='\033[0;32m'
YELLOW='\033[1;33m'
NC='\033[0m' # No Color

echo -e "${YELLOW}Step 1: Verifying local files are correct...${NC}"

# Check that local files have the correct imports
if grep -q "from utils.user_manager import.*LoginUser" backend/routers/templates.py 2>/dev/null; then
    echo -e "${RED}❌ ERROR: templates.py still has old import!${NC}"
    echo "Please ensure you have the latest code."
    exit 1
fi

if grep -q "from utils.user_manager import.*LoginUser" backend/routers/system_prompts.py 2>/dev/null; then
    echo -e "${RED}❌ ERROR: system_prompts.py still has old import!${NC}"
    echo "Please ensure you have the latest code."
    exit 1
fi

if grep -q "from utils.user_manager import.*LoginUser" backend/routers/text_generation.py 2>/dev/null; then
    echo -e "${RED}❌ ERROR: text_generation.py still has old import!${NC}"
    echo "Please ensure you have the latest code."
    exit 1
fi

echo -e "${GREEN}✅ Local files are correct${NC}"
echo ""

echo -e "${YELLOW}Step 2: Creating list of changed files...${NC}"
cat > /tmp/backend-files-to-sync.txt << EOF
backend/routers/templates.py
backend/routers/system_prompts.py
backend/routers/text_generation.py
backend/utils/text_generation_manager.py
backend/utils/chat_session_manager.py
backend/requirements.txt
EOF

echo "Files to sync:"
cat /tmp/backend-files-to-sync.txt
echo ""

echo -e "${YELLOW}Step 3: Instructions for deployment${NC}"
echo ""
echo "You need to run these commands ON YOUR SERVER (via SSH):"
echo ""
echo -e "${GREEN}# Option A: If using git (recommended)${NC}"
echo "cd /path/to/GeminiImageVideoGen"
echo "git pull origin main"
echo "docker-compose stop backend"
echo "docker-compose build --no-cache backend"
echo "docker-compose up -d backend"
echo "docker-compose logs -f backend"
echo ""
echo -e "${GREEN}# Option B: Manual file sync (if not using git)${NC}"
echo "# On your LOCAL machine, run:"
echo "rsync -avz --files-from=/tmp/backend-files-to-sync.txt . user@server:/path/to/GeminiImageVideoGen/"
echo ""
echo "# Then on your SERVER, run:"
echo "cd /path/to/GeminiImageVideoGen"
echo "docker-compose stop backend"
echo "docker-compose build --no-cache backend"
echo "docker-compose up -d backend"
echo "docker-compose logs -f backend"
echo ""

echo -e "${YELLOW}Step 4: Quick verification command${NC}"
echo "After rebuild, run this on your server to verify the fix:"
echo ""
echo "docker-compose exec backend grep -n 'from models import' /app/routers/templates.py | grep LoginUser"
echo ""
echo "Expected output should show LoginUser being imported from models, not user_manager"
echo ""

echo -e "${YELLOW}Step 5: Files that changed (for manual verification)${NC}"
echo ""
echo "1. backend/routers/templates.py"
echo "   - Changed: LoginUser import moved from user_manager to models"
echo ""
echo "2. backend/routers/system_prompts.py"
echo "   - Changed: LoginUser import moved from user_manager to models"
echo ""
echo "3. backend/routers/text_generation.py"
echo "   - Changed: LoginUser import moved from user_manager to models"
echo ""
echo "4. backend/utils/text_generation_manager.py"
echo "   - Changed: Updated to use new google-genai SDK (1.49.0)"
echo "   - Changed: Lazy client initialization with get_client()"
echo ""
echo "5. backend/utils/chat_session_manager.py"
echo "   - Changed: Updated to use new google-genai SDK (1.49.0)"
echo "   - Changed: Lazy client initialization with get_client()"
echo ""

echo -e "${GREEN}✅ Verification complete. Follow the instructions above.${NC}"

