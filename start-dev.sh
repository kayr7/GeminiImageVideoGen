#!/bin/bash
# Development startup script

echo "🚀 Starting Gemini Image/Video Generation Platform (Development Mode)"
echo ""

# Check if .env files exist
if [ ! -f "backend/.env" ]; then
    echo "⚠️  backend/.env not found. Creating from example..."
    cp backend/.env.example backend/.env
    echo "⚠️  Please edit backend/.env and add your GEMINI_API_KEY"
    exit 1
fi

echo "📦 Starting Backend (Python FastAPI)..."
cd backend
python -m venv venv 2>/dev/null || echo "venv already exists"
source venv/bin/activate 2>/dev/null || . venv/Scripts/activate 2>/dev/null

pip install -q -r requirements.txt

# Set ROOT_PATH for subpath deployment
export ROOT_PATH="/HdMImageVideo"

# Start backend in background
uvicorn main:app --reload --port 8000 --root-path /HdMImageVideo &
BACKEND_PID=$!
cd ..

sleep 3
echo "✅ Backend started at http://localhost:8000"
echo "📖 API Docs available at http://localhost:8000/docs"
echo ""

echo "📦 Starting Frontend (Next.js)..."
npm install
npm run dev &
FRONTEND_PID=$!

sleep 3
echo "✅ Frontend started at http://localhost:3000/HdMImageVideo"
echo ""

echo "🎉 All services running!"
echo "   Frontend: http://localhost:3000/HdMImageVideo"
echo "   Backend API: http://localhost:8000/HdMImageVideo"
echo "   API Docs: http://localhost:8000/HdMImageVideo/docs"
echo "   Health Check: http://localhost:8000/HdMImageVideo/health"
echo ""
echo "Press Ctrl+C to stop all services"

# Wait for Ctrl+C
trap "kill $BACKEND_PID $FRONTEND_PID; exit" INT
wait

