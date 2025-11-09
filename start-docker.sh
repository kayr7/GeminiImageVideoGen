#!/bin/bash
# Docker deployment startup script

echo "🐳 Starting Gemini Platform with Docker Compose"
echo ""

# Check if .env file exists in backend
if [ ! -f "backend/.env" ]; then
    echo "⚠️  backend/.env not found. Creating from example..."
    cp backend/.env.example backend/.env
    echo "⚠️  Please edit backend/.env and add your GEMINI_API_KEY"
    exit 1
fi

# Check if Docker is running
if ! docker info > /dev/null 2>&1; then
    echo "❌ Docker is not running. Please start Docker and try again."
    exit 1
fi

echo "📦 Building and starting containers..."
docker-compose up --build -d

echo ""
echo "⏳ Waiting for services to be ready..."
sleep 10

echo ""
echo "✅ Services are starting!"
echo ""
echo "🌐 Access Points:"
echo "   Frontend: http://localhost:3000/HdMImageVideo"
echo "   Backend API: http://localhost:8000/HdMImageVideo"
echo "   API Docs: http://localhost:8000/HdMImageVideo/docs"
echo "   Health Check: http://localhost:8000/HdMImageVideo/health"
echo ""
echo "📊 View logs:"
echo "   docker-compose logs -f"
echo ""
echo "🛑 Stop services:"
echo "   docker-compose down"

